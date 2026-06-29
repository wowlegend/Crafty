import React, { Suspense, useMemo, useEffect, useRef, useState, useContext } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSounds } from './SoundManager';
import { useGameStore } from './store/useGameStore';
import { Stats, Preload, PerformanceMonitor, AdaptiveDpr } from '@react-three/drei';
import { attachPointerLook } from './input/pointerLook';
import { Physics, useRapier } from '@react-three/rapier';
import { EffectComposer, EffectComposerContext, Bloom, Noise, Vignette, N8AO, SMAA, HueSaturation, BrightnessContrast, GodRays, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode, BloomEffect, HueSaturationEffect, BrightnessContrastEffect } from 'postprocessing';
import { TIERS } from './render/quality';
import { Atmosphere } from './render/Atmosphere.jsx';
import { Ocean } from './render/Ocean.jsx';
import { LightMotes } from './render/LightMotes.jsx';
import { moodRef, sampleMood } from './render/mood';
import { Sun } from './render/Sun';
import { MoodGradeDriver } from './render/MoodGradeDriver';
import { PositionTracker, Player } from './Components';
import { MinecraftWorld } from './world/Terrain';
import { EnhancedMagicSystem } from './EnhancedMagicSystem';
import { NPCSystem } from './SimplifiedNPCSystem';
import { Nametags } from './render/Nametags';
import { BossEntity } from './render/BossEntity';
import { GPUSparkSystem } from './world/GPUSparkSystem';
import { ElementZoneRenderSystem } from './world/ElementZoneRenderSystem';
import { captureRandom, isCaptureMode } from './devtest/captureMode';
import { isPerfProbe } from './devtest/perfProbe';
import { PROBE_DPR } from './devtest/perfScenarios';
import { PerfProbeSystem } from './devtest/PerfProbeSystem';
import { shouldProbeGround } from './game/particleProbe.js';
import { stormMoodBoost, allowedPrecip } from './game/weatherGate.js';
import { createStormBed } from './audio/stormBed.js';
import { getAudioBridge } from './audio/audioBridge.js';
import { surfaceBlockAt } from './world/climate.js';

// Bright sun disc in the sky — the GodRays light source. Follows the camera at a
// fixed mood-driven direction (reads as infinitely far) and tints with the mood sun colour.
// Sun extracted -> src/render/Sun.jsx (v6 de-monolith A2.1).

// S1-D-M1: Transient bloom-spike on spell impact. Reads `bloomSpikeUntil` from the store
// and drives the Bloom effect's `intensity` (a live setter on the BloomEffect instance,
// reached via the wrapEffect ref) up to a brief peak, then eases it back to the baseline.
// Capture-safe: in capture mode it does nothing and leaves intensity at the baseline so
// the visual-regression frame is byte-stable. Cheap transient ref read — no React state.
//
// IMPORTANT (version gotcha): attaching a React `ref` to <Bloom> in
// @react-three/postprocessing@3.0.4 crashes the canvas tree ("Converting circular
// structure to JSON" — the effect's Textures get serialized on reconciliation). So we do
// NOT ref the component. Instead we reach the live BloomEffect through the composer
// context (`composer.passes[].effects`) — a one-time lookup cached on first frame.
// W2-T1 fix: the warm magic-hour grade bumped <Bloom intensity> 0.8->0.95, but the
// BloomSpikeDriver clamps the LIVE BloomEffect back to BLOOM_BASE every frame (both in
// capture and in live play, once the spike window has elapsed). So the JSX prop alone
// was a dead no-op — the rendered base must be set HERE. Raised 0.8->0.95 to make the
// intended glowier base real (matches the <Bloom intensity={0.95}> prop on line ~906).
const BLOOM_BASE = 0.95;
const BLOOM_PEAK = 2.4;
// reused per-frame scratch (avoid allocating inside the audio-occlusion + weather-instancing useFrames)
const _audioDir = new THREE.Vector3();
const _rayStart = new THREE.Vector3(); // audio-occlusion ray walk scratch (was new'd up to 5x/call/frame)
const _weatherDummy = new THREE.Object3D();
const BloomSpikeDriver = () => {
  const ctx = useContext(EffectComposerContext);
  const fxRef = useRef(null);
  useFrame(() => {
    // Resolve the live BloomEffect once (the composer's EffectPass holds it).
    if (!fxRef.current && ctx && ctx.composer) {
      for (const pass of ctx.composer.passes || []) {
        const effects = pass && pass.effects;
        if (Array.isArray(effects)) {
          const bloom = effects.find((e) => e instanceof BloomEffect);
          if (bloom) { fxRef.current = bloom; break; }
        }
      }
    }
    const fx = fxRef.current;
    if (!fx) return;
    if (isCaptureMode()) {
      // Deterministic baseline in capture — never spike (no spells in capture states).
      if (fx.intensity !== BLOOM_BASE) fx.intensity = BLOOM_BASE;
      return;
    }
    const until = useGameStore.getState().bloomSpikeUntil || 0;
    const remaining = until - performance.now();
    if (remaining > 0) {
      // Ease from peak -> base across the window (window seeded by triggerBloomSpike, ~80ms).
      const t = Math.min(1, remaining / 80);
      fx.intensity = BLOOM_BASE + (BLOOM_PEAK - BLOOM_BASE) * t;
    } else if (fx.intensity !== BLOOM_BASE) {
      // Settle smoothly back to baseline once the window has elapsed.
      fx.intensity = THREE.MathUtils.lerp(fx.intensity, BLOOM_BASE, 0.25);
      if (Math.abs(fx.intensity - BLOOM_BASE) < 0.01) fx.intensity = BLOOM_BASE;
    }
  });
  return null;
};

// S1-D-M3: THE MAGIC-HOUR COLOUR SCRIPT driver. Replaces the old STATIC global grade
// (HueSaturation 0.22 + BrightnessContrast 0.04/0.08) with a per-mood grade lerped on the
// continuous `mood` (saturation/brightness/contrast live in mood.js MOOD_GRADE — the
// tuning knobs). It reaches the live HueSaturationEffect + BrightnessContrastEffect through
// the composer context (same one-time lookup as BloomSpikeDriver; ref-on-effect crashes in
// this pkg version), then writes their uniforms each frame from sampleMood(moodRef).
// Capture-safe: mood is SNAPPED in capture, so the grade is byte-stable. Cheap ref read —
// no React state. NOTE: <HueSaturation>/<BrightnessContrast> below keep their explore-grade
// initial props so the very first frame (before this driver resolves) already reads warm.
// MoodGradeDriver extracted -> src/render/MoodGradeDriver.jsx (v6 de-monolith A2.2).

// Step 2: Spatial Audio Controller — bridges SoundProvider buffers to THREE.PositionalAudio with custom cavern reverb
const SpatialAudioController = () => {
  const { camera, scene } = useThree();
  const { audioContext, sounds, soundEnabled, volume, getMasterBus } = useSounds();
  const { rapier, world } = useRapier();
  const listenerRef = useRef();
  const filterRef = useRef();
  const wetGainRef = useRef();
  const activeSpatialSoundsRef = useRef([]);
  const playerRigidBodyRef = useGameStore(state => state.playerRigidBodyRef);

  const countVoxelIntersections = (start, dir, maxDist) => {
    if (!world || !rapier) return 0;
    let intersections = 0;
    let currentDist = 0.15; // start offset to bypass soundSource emitter collider
    const playerRigidBody = playerRigidBodyRef?.current;
    const playerHandle = playerRigidBody?.handle;
    
    const filterPredicate = (collider) => {
      if (collider.isSensor()) return false;
      const parent = collider.parent();
      if (!parent) return true;
      if (playerHandle !== undefined && parent.handle === playerHandle) return false;
      return parent.bodyType() === rapier.BodyType.Static;
    };

    while (currentDist < maxDist && intersections < 5) {
      const rayStart = _rayStart.copy(start).addScaledVector(dir, currentDist); // == start + dir*currentDist, reused scratch
      const remainingDist = maxDist - currentDist;
      
      if (remainingDist <= 0.02) break;

      const ray = new rapier.Ray(
        { x: rayStart.x, y: rayStart.y, z: rayStart.z },
        { x: dir.x, y: dir.y, z: dir.z }
      );
      
      const hit = world.castRay(
        ray,
        remainingDist,
        true,
        undefined,
        undefined,
        undefined,
        undefined,
        filterPredicate
      );

      if (hit) {
        intersections++;
        // #72 sweep fix: this rapier build exposes `timeOfImpact`; `hit.toi` is undefined ->
        // NaN poisoned the march and ended it after one hit (occlusion under-counted).
        currentDist += hit.timeOfImpact + 0.15;
      } else {
        break;
      }
    }
    
    return intersections;
  };

  useEffect(() => {
    if (!camera || !audioContext) return;

    // Unify Three.js AudioContext with our SoundManager provider context to avoid connection mismatch crashes
    THREE.AudioContext.setContext(audioContext);

    if (typeof window !== 'undefined') {
      window.__threeScene = scene;
      window.__threeCamera = camera;
    }

    // 1. Create and attach listener to camera
    const listener = new THREE.AudioListener();
    camera.add(listener);
    listenerRef.current = listener;

    // 2. Add global low-pass filter for environmental effects (underground)
    const filter = audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(20000, audioContext.currentTime);

    // 3. Construct SOTA Cavern Reverb Delay-Feedback Network
    const delayNode = audioContext.createDelay(1.0);
    delayNode.delayTime.setValueAtTime(0.24, audioContext.currentTime);

    const feedbackGain = audioContext.createGain();
    feedbackGain.gain.setValueAtTime(0.35, audioContext.currentTime); // decay multiplier

    const reverbFilter = audioContext.createBiquadFilter();
    reverbFilter.type = 'lowpass';
    reverbFilter.frequency.setValueAtTime(1200, audioContext.currentTime); // damp echoes

    const wetGain = audioContext.createGain();
    wetGain.gain.setValueAtTime(0.0, audioContext.currentTime); // dry to start

    // Connect routing — W1: route the spatial SFX listener through the SHARED master-bus limiter
    // (SoundManager built it on this same ctx, unified at THREE.AudioContext.setContext above), so
    // the in-game mix is limited AND the SFX-volume slider + Mute-All (which drive the bus gain) work.
    // Fallback to destination only if the bus failed to build (never silence).
    const busInput = (getMasterBus && getMasterBus()) || audioContext.destination;
    listener.gain.disconnect();
    listener.gain.connect(filter);
    filter.connect(busInput);

    // Reverb loop path
    filter.connect(delayNode);
    delayNode.connect(reverbFilter);
    reverbFilter.connect(feedbackGain);
    feedbackGain.connect(delayNode);
    feedbackGain.connect(wetGain);
    wetGain.connect(busInput);

    filterRef.current = filter;
    wetGainRef.current = wetGain;

    // 4. Expose spatial trigger globally with lowpass occlusion node allocation
    useGameStore.setState({ 
      playSpatialSound: (soundName, position, playbackRate = 1, distance = 20, jitter = true) => {
        if (!soundEnabled || !sounds || !sounds[soundName] || !listenerRef.current) return;

        try {
          const sound = new THREE.PositionalAudio(listenerRef.current);
          sound.setBuffer(sounds[soundName]);
          sound.setRefDistance(distance);
          sound.setRolloffFactor(2); // volume falloff roll
          // +/-7% pitch variation kills the "machine-gun" fatigue of repeated combat/footstep SFX. Capture-
          // safe (this fn early-returns when `sounds` is null in capture, so no RNG runs). Stingers/motifs go
          // through non-spatial playSound; a caller can pass jitter=false to pin pitch.
          const rate = jitter ? playbackRate * (0.93 + Math.random() * 0.14) : playbackRate;
          sound.setPlaybackRate(rate);
          sound.setVolume(volume);

          const filterNode = audioContext.createBiquadFilter();
          filterNode.type = 'lowpass';
          filterNode.frequency.setValueAtTime(20000, audioContext.currentTime);
          sound.setFilter(filterNode);
          
          const soundSource = new THREE.Object3D();
          if (Array.isArray(position)) soundSource.position.set(...position);
          else if (position instanceof THREE.Vector3) soundSource.position.copy(position);
          else if (position && position.x !== undefined) soundSource.position.set(position.x, position.y, position.z);
          
          soundSource.add(sound);
          scene.add(soundSource);
          
          sound.play();

          const activeSoundObj = {
            sound,
            filterNode,
            soundSource,
            initialVolume: volume
          };
          activeSpatialSoundsRef.current.push(activeSoundObj);

          sound.onEnded = () => {
            try {
              sound.disconnect();
              soundSource.removeFromParent();
            } catch(e) {}
            activeSpatialSoundsRef.current = activeSpatialSoundsRef.current.filter(item => item.sound !== sound);
          };
        } catch (e) {
          console.warn('Positional Audio failed:', e);
        }
      }
    });

    return () => {
      camera.remove(listener);
      filter.disconnect();
      try {
        delayNode.disconnect();
        reverbFilter.disconnect();
        feedbackGain.disconnect();
        wetGain.disconnect();
      } catch (err) {}
    };
  }, [camera, scene, audioContext, sounds, soundEnabled, volume]);

  // Step 3: Environmental Acoustics Update Loop
  // (Removed a duplicate procedural wind generator that ran here and routed straight to ctx.destination,
  // BYPASSING the master-bus limiter + SFX-volume slider and doubling the SoundManager biome wind bed
  // [SoundManager windBedRef is the single SoT, routed through getMasterBus()].)

  useFrame((state) => {
    if (filterRef.current && camera) {
      const undergroundLimit = 10;
      const y = camera.position.y;
      // Muffle sound as player goes deep underground
      const targetFreq = y < undergroundLimit 
        ? THREE.MathUtils.lerp(1000, 20000, Math.max(0, y / undergroundLimit))
        : 20000;
      
      filterRef.current.frequency.setTargetAtTime(targetFreq, audioContext.currentTime, 0.1);

      // Dynamically modulate cavern echo reverb wetness based on player depth
      if (wetGainRef.current) {
        const targetWet = y < undergroundLimit
          ? THREE.MathUtils.lerp(0.5, 0.0, Math.max(0, y / undergroundLimit)) * volume
          : 0.0;
        wetGainRef.current.gain.setTargetAtTime(targetWet, audioContext.currentTime, 0.1);
      }

      // Dynamic recursive raycasting audio occlusion calculations
      const activeSounds = activeSpatialSoundsRef.current;
      const listenerPos = camera.position;

      // Prune dead spatial sounds
      activeSpatialSoundsRef.current = activeSounds.filter(item => {
        if (!item.sound.isPlaying) {
          try {
            item.sound.disconnect();
            item.soundSource.removeFromParent();
          } catch (e) {}
          return false;
        }
        return true;
      });

      // Update spatial filter frequency and gain muffling dynamically based on block intersections
      for (const item of activeSpatialSoundsRef.current) {
        const soundPos = item.soundSource.position;
        const dir = _audioDir.subVectors(listenerPos, soundPos);
        const dist = dir.length();
        dir.normalize();

        let intersections = 0;
        if (world && rapier) {
          intersections = countVoxelIntersections(soundPos, dir, dist);
        }

        let targetSoundFreq = 20000;
        let targetGainFactor = 1.0;

        if (intersections === 1) {
          targetSoundFreq = 3500;
          targetGainFactor = 0.70;
        } else if (intersections === 2) {
          targetSoundFreq = 1200;
          targetGainFactor = 0.45;
        } else if (intersections >= 3) {
          targetSoundFreq = 350;
          targetGainFactor = 0.25;
        }

        const time = audioContext.currentTime;
        item.filterNode.frequency.setTargetAtTime(targetSoundFreq, time, 0.08);
        
        if (item.sound.gain && item.sound.gain.gain) {
          // W1: per-voice gain carries ONLY the intrinsic loudness x occlusion factor. The master
          // SFX-volume (sfxVolume / Mute-All) is owned by the master-bus input gain this voice routes
          // through (SoundManager:251); re-applying it here would square the slider response.
          const targetVol = item.initialVolume * targetGainFactor;
          item.sound.gain.gain.setTargetAtTime(targetVol, time, 0.08);
        }
      }
    }
  });

  return null;
};

// Volumetric Weather System Materials
const rainMaterial = new THREE.MeshBasicMaterial({
  color: '#A9C6D3',
  transparent: true,
  opacity: 0.45,
  depthWrite: false
});

const snowMaterial = new THREE.MeshBasicMaterial({
  color: '#FFFFFF',
  transparent: true,
  opacity: 0.8,
  depthWrite: false,
  side: THREE.DoubleSide
});

const fireflyMaterial = new THREE.MeshBasicMaterial({
  color: '#CCFF33',
  transparent: true,
  opacity: 0.9,
  depthWrite: false
});

// Step 4: Volumetric Weather & Firefly Cycles Controller
const WeatherSystem = () => {
  const rainMeshRef = useRef();
  const snowMeshRef = useRef();
  const weatherFrameRef = useRef(0);
  const firefliesMeshRef = useRef();
  
  const weatherRef = useRef('clear');
  const stormBedRef = useRef(null); // W4-T9b: lazily-built storm ambience bed (audio/stormBed.js)

  // Weather loop state machine: clear -> rain -> snow -> loop
  useEffect(() => {
    const interval = setInterval(() => {
      const states = ['clear', 'rain', 'snow'];
      const currentIndex = states.indexOf(weatherRef.current);
      const nextWeather = states[(currentIndex + 1) % states.length];
      weatherRef.current = nextWeather;

      const store = useGameStore.getState();
      // W4-T8: drive the storm sky-darken mood boost (0 clear, ~0.85 rain/snow) so the Atmosphere grade
      // reads overcast/moody during a storm (weatherGate.stormMoodBoost MAXed into moodTarget).
      store.setWeatherMoodBoost(stormMoodBoost(nextWeather));
      // W4-T9b: drive the storm ambience bed (rain/snow on, clear off). CAPTURE-GATED -- the interval fires
      // during the >4min capture and audio must not start there (the T8 long-interval lesson). Routes through
      // the shared master-bus via audioBridge so it obeys the SFX slider; no-ops until the AudioContext
      // exists (post user gesture). The bed object persists across stop/start; stop() tears down its nodes.
      if (!isCaptureMode()) {
        const { ctx, busInput } = getAudioBridge();
        if (ctx && busInput) {
          if (!stormBedRef.current) stormBedRef.current = createStormBed(ctx, busInput);
          if (stormBedRef.current) {
            if (nextWeather === 'clear') stormBedRef.current.stop();
            else { stormBedRef.current.start(); stormBedRef.current.setIntensity(0.85); }
          }
        }
      }
      if (store.addNotification) {
        if (nextWeather === 'rain') {
          store.addNotification('Atmospheric shift... Dynamic rain storm has started!', 'info');
        } else if (nextWeather === 'snow') {
          store.addNotification('Cold front moving in... White volumetric snow begins to drift!', 'info');
        } else {
          store.addNotification('The storm passes. Clear skies and warm rays return!', 'success');
        }
      }
    }, 90000); // 90 seconds per cycle

    return () => { clearInterval(interval); if (stormBedRef.current) stormBedRef.current.stop(); };
  }, []);

  // S2-A-M4a: scale the instanced-particle COUNT by the active quality tier's weather
  // multiplier (TIERS.low 0.25 / med 0.6 / high 1.0). W4 fix: read the tier REACTIVELY (a
  // useGameStore selector, NOT a mount-time getState) so a PerformanceMonitor downgrade actually
  // lowers the live particle count -- the S3 "mount-time-only" bug (useMemo([]) froze density at
  // the boot tier). The rain/snow/firefly data useMemos key on their count, so a (rare) tier change
  // regenerates the data + re-sizes the buffers in lockstep. This is a RENDER-time subscription
  // (re-renders WeatherSystem only on a tier change), NOT a useFrame read -> no Game-Loop-Isolation
  // breach (the hot loop still reads via getState). high == 1.0 -> full base density -> the forced-
  // high capture frames stay byte-identical (capture forces 'high').
  const qualityTier = useGameStore((s) => s.qualityTier);
  const weatherDensity = (TIERS[qualityTier] || TIERS.low).weather;

  const rainCountBase = 400;
  const rainCount = Math.round(rainCountBase * weatherDensity);
  const rainData = useMemo(() => {
    const data = [];
    for (let i = 0; i < rainCount; i++) {
      // Per-instance seeded RNG in capture mode (order-independent); native Math.random in gameplay.
      const r = captureRandom(`weather-rain-${i}`);
      data.push({
        x: (r() - 0.5) * 40,
        y: r() * 40,
        z: (r() - 0.5) * 40,
        speed: 15 + r() * 8
      });
    }
    return data;
  }, [rainCount]);

  const snowCountBase = 200;
  const snowCount = Math.round(snowCountBase * weatherDensity);
  const snowData = useMemo(() => {
    const data = [];
    for (let i = 0; i < snowCount; i++) {
      const r = captureRandom(`weather-snow-${i}`);
      data.push({
        x: (r() - 0.5) * 40,
        y: r() * 40,
        z: (r() - 0.5) * 40,
        speed: 3 + r() * 3,
        wobbleSpeed: 1 + r() * 2,
        wobbleScale: 0.1 + r() * 0.2,
        seed: r() * 100
      });
    }
    return data;
  }, [snowCount]);

  const fireflyCountBase = 30;
  const fireflyCount = Math.round(fireflyCountBase * weatherDensity);
  const fireflyData = useMemo(() => {
    const data = [];
    for (let i = 0; i < fireflyCount; i++) {
      const r = captureRandom(`weather-firefly-${i}`);
      data.push({
        x: (r() - 0.5) * 20,
        y: 2 + r() * 8,
        z: (r() - 0.5) * 20,
        wobbleSpeed: 0.5 + r() * 1.0,
        seed: r() * 100
      });
    }
    return data;
  }, [fireflyCount]);

  useFrame((state, frameDelta) => {
    // Dev capture mode: pin the animation clock + delta to fixed constants so all
    // time-driven particle motion renders at a deterministic pose. No-op in gameplay.
    const capture = isCaptureMode();
    const time = capture ? 0 : state.clock.elapsedTime;
    const delta = capture ? 0 : frameDelta;
    const playerPos = useGameStore.getState().playerPosition;
    if (!playerPos) return;

    const px = playerPos.x;
    const py = playerPos.y;
    const pz = playerPos.z;

    const isDay = useGameStore.getState().isDay;
    const activeWeather = weatherRef.current;
    // W4-T9b: gate the precip by the player's biome (desert never snows, the snow biome never rains).
    // Only sample the climate when a storm is active -- surfaceBlockAt's noise calc is cheap but not free,
    // and the common case is 'clear'. (Same main-thread sampler footstep audio uses; no remesh.)
    let isRaining = false, isSnowing = false;
    if (activeWeather !== 'clear') {
      const permitted = allowedPrecip(surfaceBlockAt(px, pz).surfaceBlock);
      isRaining = activeWeather === 'rain' && permitted === 'rain';
      isSnowing = activeWeather === 'snow' && permitted === 'snow';
    }

    const getMobGroundLevel = useGameStore.getState().getMobGroundLevel;
    // S2-B2-pre-M2 perf: stride counter for the rain/snow ground probes (see game/particleProbe.js)
    const probeFrame = weatherFrameRef.current++;

    // 1. Instanced Rain Particle displacement
    if (rainMeshRef.current) {
      const dummy = _weatherDummy;
      rainData.forEach((r, i) => {
        if (isRaining) {
          r.y -= r.speed * delta;
          const worldY = py + r.y;
          
          let groundLevel = null;
          if (getMobGroundLevel && shouldProbeGround(r.y, i, probeFrame)) {
            groundLevel = getMobGroundLevel(px + r.x, pz + r.z);
          }

          // Reset particle if hits bottom or collides with ground level
          if (r.y < -15 || (groundLevel !== null && worldY < groundLevel)) {
            r.y = 25;
            r.x = (Math.random() - 0.5) * 40;
            r.z = (Math.random() - 0.5) * 40;
          }

          dummy.position.set(px + r.x, py + r.y, pz + r.z);
          dummy.scale.set(1, 1, 1);
        } else {
          dummy.scale.set(0, 0, 0); // Hide
        }
        dummy.updateMatrix();
        rainMeshRef.current.setMatrixAt(i, dummy.matrix);
      });
      rainMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    // 2. Instanced Snow Particle drift
    if (snowMeshRef.current) {
      const dummy = _weatherDummy;
      snowData.forEach((s, i) => {
        if (isSnowing) {
          s.y -= s.speed * delta;
          const wobbleX = Math.sin(time * s.wobbleSpeed + s.seed) * s.wobbleScale;
          const wobbleZ = Math.cos(time * s.wobbleSpeed * 0.9 + s.seed) * s.wobbleScale;

          const worldY = py + s.y;
          let groundLevel = null;
          if (getMobGroundLevel && shouldProbeGround(s.y, i, probeFrame)) {
            groundLevel = getMobGroundLevel(px + s.x + wobbleX, pz + s.z + wobbleZ);
          }

          if (s.y < -15 || (groundLevel !== null && worldY < groundLevel)) {
            s.y = 25;
            s.x = (Math.random() - 0.5) * 40;
            s.z = (Math.random() - 0.5) * 40;
          }

          dummy.position.set(px + s.x + wobbleX, py + s.y, pz + s.z + wobbleZ);
          dummy.scale.set(1, 1, 1);
          dummy.rotation.set(s.seed, time * 0.2, 0);
        } else {
          dummy.scale.set(0, 0, 0);
        }
        dummy.updateMatrix();
        snowMeshRef.current.setMatrixAt(i, dummy.matrix);
      });
      snowMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    // 3. Glowing Firefly drift (Night cycles only)
    if (firefliesMeshRef.current) {
      const dummy = _weatherDummy;
      fireflyData.forEach((f, i) => {
        if (!isDay) {
          const wobbleX = Math.sin(time * 0.5 + f.seed) * 0.05;
          const wobbleY = Math.cos(time * 0.8 + f.seed) * 0.03;
          const wobbleZ = Math.sin(time * 0.4 + f.seed * 1.5) * 0.05;

          // In capture mode the per-frame drift accumulation is suppressed so the
          // firefly cloud holds a fixed, repeatable pose (positions stay at seeded base).
          if (!capture) {
            f.x += wobbleX;
            f.y += wobbleY;
            f.z += wobbleZ;
          }

          // Reposition if drifts too far from player
          if (Math.abs(f.x) > 15 || Math.abs(f.y - 5) > 8 || Math.abs(f.z) > 15) {
            f.x = (Math.random() - 0.5) * 20;
            f.y = 2 + Math.random() * 8;
            f.z = (Math.random() - 0.5) * 20;
          }

          dummy.position.set(px + f.x, py + f.y, pz + f.z);
          const pulse = 0.5 + 0.5 * Math.sin(time * f.wobbleSpeed * 2.0 + f.seed);
          dummy.scale.setScalar(pulse * 0.22);
        } else {
          dummy.scale.set(0, 0, 0);
        }
        dummy.updateMatrix();
        firefliesMeshRef.current.setMatrixAt(i, dummy.matrix);
      });
      firefliesMeshRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      <instancedMesh ref={rainMeshRef} args={[null, rainMaterial, rainCount]}>
        <boxGeometry args={[0.02, 1.0, 0.02]} />
      </instancedMesh>
      <instancedMesh ref={snowMeshRef} args={[null, snowMaterial, snowCount]}>
        <planeGeometry args={[0.12, 0.12]} />
      </instancedMesh>
      <instancedMesh ref={firefliesMeshRef} args={[null, fireflyMaterial, fireflyCount]}>
        <sphereGeometry args={[0.1, 4, 4]} />
      </instancedMesh>
    </group>
  );
};

// Desktop mouse-look: attach our own pointer-lock look handler to the live R3F camera (replaces drei's
// pointer-lock controls). Suppressed in capture mode (the harness pins the camera). Renders nothing.
function PointerLook() {
  const camera = useThree((s) => s.camera);
  const isCaptureMode = useGameStore((s) => s.isCaptureMode);
  useEffect(() => {
    if (isCaptureMode || !camera) return undefined;
    return attachPointerLook({ camera, getSensitivity: () => useGameStore.getState().lookSensitivity });
  }, [camera, isCaptureMode]);
  return null;
}

export function GameScene({
  gameState,
  isWorldBuilt,
  bossSystem,
  showStats,
  showAchievements,
  showSpellUpgrades
}) {
  const canvasRef = useRef(null); // the WebGL canvas (set in onCreated) — the element we pointer-lock
  // Dev capture mode: freeze the physics simulation so the scene is byte-stable.
  // Always false in normal gameplay -> Physics runs exactly as before.
  const isCaptureMode = useGameStore(state => state.isCaptureMode);
  // Studio-card captures (character/boss/spell-cast close-ups) suppress the explore-scene
  // motes so the warm cloud doesn't drift across the framed hero. Always false in gameplay
  // (a mount toggle that flips only during capture setup, never in the hot loop).
  const captureStudio = useGameStore((s) => s.captureStudio);
  const qualityTier = useGameStore((s) => s.qualityTier);
  const q = TIERS[qualityTier] || TIERS.low;
  const [sunMesh, setSunMesh] = useState(null);

  useEffect(() => {
    // Lock the CANVAS directly (a transient-activation-gated browser call; every caller is inside a real
    // click/key gesture). Our own attachPointerLook (lenient gate) then drives the camera while locked.
    useGameStore.setState({
      requestPointerLock: () => {
        try { canvasRef.current?.requestPointerLock?.(); } catch (e) { console.warn('pointer lock denied', e); }
      }
    });
    return () => {
      useGameStore.setState({ requestPointerLock: null });
    };
  }, []);

  const shadowConfig = useMemo(() => ({
    mapSize: [q.shadowMapSize, q.shadowMapSize],
    camera: {
      left: -100,
      right: 100,
      top: 100,
      bottom: -100,
      near: 0.1,
      far: 200
    }
  }), [q.shadowMapSize]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, zIndex: 0 }}>
      <Canvas
        shadows
        dpr={isPerfProbe() ? PROBE_DPR : [1, q.dprCap]}
        className="w-full h-full"
        gl={{
          antialias: false, // Post-processing handles AA
          alpha: false,
          depth: true,
          stencil: false,
          powerPreference: "high-performance"
        }}
        camera={{
          fov: 75,
          near: 0.1,
          far: 500,
          position: [0, 30, 0]
        }}
        onCreated={({ gl, camera, scene }) => {
          camera.rotation.order = 'YXZ';
          camera.rotation.set(0, 0, 0);
          camera.lookAt(0, 30, -100);
          // NOTE: tone mapping is controlled by the <ToneMapping> EFFECT in the composer
          // (the EffectComposer overrides gl.toneMapping), so it is intentionally not set here.

          if (typeof window !== 'undefined') {
            window.__threeScene = scene;
            window.__threeCamera = camera;
          }

          const canvasEl = gl.domElement;
          canvasRef.current = canvasEl; // the element requestPointerLock targets (desktop mouse-look)
          const handleContextLost = (e) => {
            e.preventDefault();
            console.error('WebGL context lost detected in GameScene!');
            useGameStore.getState().setIsWebGLContextLost(true);
          };
          const handleContextRestored = () => {
            if (import.meta.env.DEV) console.log('WebGL context successfully restored in GameScene.');
            useGameStore.getState().setIsWebGLContextLost(false);
          };
          
          canvasEl.addEventListener('webglcontextlost', handleContextLost, false);
          canvasEl.addEventListener('webglcontextrestored', handleContextRestored, false);
        }}
      >
        {!isCaptureMode && !isPerfProbe() && (
          // S2-A-M4a: tier recovery. Previously onDecline ratcheted the tier ONE-WAY toward
          // `low` under any transient FPS dip and never recovered. onIncline mirrors it:
          // low->med->high on sustained FPS headroom. Steady-state oscillation is prevented
          // by drei's `bounds` dead-zone (neither incline nor decline fires while avg FPS sits
          // between [lower, upper]); `factor` starts mid (0.5 -> can move either direction).
          // KNOWN RECOVERY RESIDUES -> S3 (real-device tuning; not validatable in CI):
          //  (1) `flipflops={3}` counts TOTAL incline+decline transitions (NOT reversals); once
          //      exceeded drei sets fallback and STOPS sampling, freezing the tier. A normal
          //      warm-up climb (low->med->high = 2 inclines) + one dip already hits 3, so
          //      adaptation can freeze early. S3 must re-tune flipflops/bounds on real devices.
          //  (2) No onFallback handler -> a flipflop-exhausted device strands at its last tier
          //      (the one-way ratchet can RE-EMERGE post-fallback). S3: add onFallback pinning
          //      a safe-middle tier.
          //  (was 3) The weather density lever is now REACTIVE (WeatherSystem reads qualityTier via a
          //      useGameStore selector + count-keyed useMemos) -> it re-thins/restores on a runtime tier
          //      change. RESOLVED; only (1)+(2) remain as real-device S3 tuning residues.
          // So onIncline ADDS recovery (the ratchet is no longer strictly one-way at the happy
          // path) but is not yet bulletproof. The whole monitor stays inside !isCaptureMode so
          // the deterministic forced-high capture path is never perturbed by recovery logic.
          <PerformanceMonitor
            bounds={(refreshrate) => (refreshrate > 90 ? [50, 90] : [40, 55])}
            flipflops={3}
            factor={0.5}
            onDecline={() => {
              const cur = useGameStore.getState().qualityTier;
              const next = cur === 'high' ? 'med' : 'low';
              if (next !== cur) useGameStore.getState().setQualityTier(next);
            }}
            onIncline={() => {
              const cur = useGameStore.getState().qualityTier;
              const next = cur === 'low' ? 'med' : 'high';
              if (next !== cur) useGameStore.getState().setQualityTier(next);
            }}
          />
        )}
        {!isCaptureMode && !isPerfProbe() && <AdaptiveDpr pixelated />}

        <Atmosphere shadowConfig={shadowConfig} />

        {/* W2 ocean: the stylized tropical-toon Gerstner water plane (replaces the old voxel water
            tops -- the mesher no longer emits water faces). Capture-frozen wave phase. */}
        <Ocean />

        {/* S1-D-M3: always-on warm light motes (spec §5① "drifting light motes").
            Tier-gated count; capture-frozen drift; mood-tinted. Suppressed in the
            sky-studio subject cards (captureStudio) so the cloud doesn't bleed across
            the framed hero — it stays on in gameplay + all in-world capture frames. */}
        {!captureStudio && <LightMotes count={q.moteCount} />}

        <WeatherSystem />

        {/* Desktop mouse-look — our own pointer-lock handler (src/input/pointerLook.js), replacing drei's
            pointer-lock controls. drei's PLC only rotated while its EXACT canvas was pointerLockElement
            (element-match-fragile + drei/three version-drift prone) AND was untestable in the headless
            harness, so a dead camera slipped with no gate. Ours is lenient (rotates while ANY lock is held)
            + reuses the tested applyLook math + has a unit test. Lock requests target the canvas
            (requestPointerLock above); lock-state tracking (active/menu) stays in Components' pointerlock
            listeners; the prior drei auto-lock-on-click problem (KEVIN-FIX C4) is gone with drei removed. */}
        <PointerLook />

        <PositionTracker />

        <Suspense fallback={null}>
          <GPUSparkSystem />
          <ElementZoneRenderSystem />
          <Physics gravity={[0, -30, 0]} paused={isCaptureMode}>
            {import.meta.env.DEV && <PerfProbeSystem />}
            <SpatialAudioController />
            <MinecraftWorld />

            <Player isWorldBuilt={isWorldBuilt} />

            <EnhancedMagicSystem />

            <NPCSystem />

            <Nametags />

            <BossEntity
              bossActive={bossSystem.bossActive}
              bossPositionRef={bossSystem.bossPositionRef}
              bossPhase={bossSystem.bossPhase}
              bossHealth={bossSystem.bossHealth}
            />
          </Physics>

          <Sun onReady={setSunMesh} />

          <EffectComposer>
            {q.ao && (
              <N8AO
                halfRes
                aoRadius={1.2}
                distanceFalloff={1.0}
                intensity={2.0}
                quality="medium"
                color="black"
              />
            )}
            {q.godRays && sunMesh && (
              // S1-D-M3: now also ON at med tier with reduced samples (q.godRaySamples:
              // high 100 / med 60) to stay in med's perf envelope.
              <GodRays sun={sunMesh} samples={q.godRaySamples} density={0.97} decay={0.95} weight={1.1} exposure={0.88} clampMax={1} blur />
            )}
            {/* S1-D-M3 MAGIC-HOUR COLOUR SCRIPT: these two effects are now driven PER-MOOD
                by <MoodGradeDriver> (saturation/brightness/contrast lerped on mood — knobs
                in mood.js MOOD_GRADE). The props here are the EXPLORE-grade initial values
                so the first frame already reads warm before the driver resolves the live
                effect instances. Capture-safe (mood snapped in capture). */}
            <HueSaturation saturation={0.30} />
            <BrightnessContrast brightness={0.09} contrast={0.06} />
            <Bloom
              intensity={0.95}
              luminanceThreshold={0.65}
              luminanceSmoothing={0.25}
              mipmapBlur={q.bloomMipmap}
            />
            <SMAA />
            <ToneMapping mode={ToneMappingMode.NEUTRAL} />
            {/* Per-frame random film grain — disabled in dev capture mode because it
                makes every frame pixel-different (defeats the visual-regression diff). */}
            {!isCaptureMode && <Noise opacity={0.01} />}
            <Vignette eskil={false} offset={0.45} darkness={0.35} />
            <BloomSpikeDriver />
            <MoodGradeDriver />
          </EffectComposer>
          <Preload all />
        </Suspense>

        {showStats && <Stats />}
      </Canvas>
    </div>
  );
}
