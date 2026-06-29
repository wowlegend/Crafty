import { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore';
import { TIERS } from './quality';
import { captureRandom, isCaptureMode } from '../devtest/captureMode';
import { shouldProbeGround } from '../game/particleProbe.js';
import { stormMoodBoost, allowedPrecip } from '../game/weatherGate.js';
import { createStormBed } from '../audio/stormBed.js';
import { getAudioBridge } from '../audio/audioBridge.js';
import { surfaceBlockAt } from '../world/climate.js';
import { _weatherDummy } from './_sceneScratch';

// WeatherSystem -- volumetric rain/snow/firefly instanced-particle cycles + the storm sky-darken mood
// boost + the storm ambience bed. Extracted VERBATIM from GameScene.jsx (v6 de-monolith A2.5 -- the last
// GameScene driver); behavior unchanged. Carries its 3 instanced materials; uses the shared _weatherDummy
// scratch (./_sceneScratch, A2.0). RENDERS (capture-relevant) -- particle counts are forced-high in capture
// so the frames stay byte-identical.

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
export const WeatherSystem = () => {
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
