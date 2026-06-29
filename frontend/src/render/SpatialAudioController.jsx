import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useRapier } from '@react-three/rapier';
import { useSounds } from '../SoundManager';
import { useGameStore } from '../store/useGameStore';
import { _audioDir, _rayStart } from './_sceneScratch';

// SpatialAudioController -- bridges the SoundProvider buffers to THREE.PositionalAudio with a cavern
// reverb delay-feedback network + recursive raycast audio-OCCLUSION (countVoxelIntersections) and an
// underground low-pass muffle. Registers store.playSpatialSound. Returns null (NO visual render) ->
// pixel-irrelevant. Extracted VERBATIM from GameScene.jsx (v6 de-monolith A2.6); behavior unchanged.
// _audioDir/_rayStart are the shared zero-alloc scratch (./_sceneScratch, A2.0).
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

export { SpatialAudioController };
