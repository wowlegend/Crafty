import React, { Suspense, useMemo, useEffect, useRef, useState } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { useGameStore } from './store/useGameStore';
import { Stats, Preload, PerformanceMonitor, AdaptiveDpr } from '@react-three/drei';
import { PointerLook } from './render/PointerLook';
import { SpatialAudioController } from './render/SpatialAudioController';
import { WeatherSystem } from './render/WeatherSystem';
import { Physics } from '@react-three/rapier';
import { EffectComposer, Bloom, Noise, Vignette, N8AO, SMAA, HueSaturation, BrightnessContrast, GodRays, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { TIERS } from './render/quality';
import { Atmosphere } from './render/Atmosphere.jsx';
import { Ocean } from './render/Ocean.jsx';
import { LightMotes } from './render/LightMotes.jsx';
import { moodRef, sampleMood } from './render/mood';
import { Sun } from './render/Sun';
import { MoodGradeDriver } from './render/MoodGradeDriver';
import { BloomSpikeDriver } from './render/BloomSpikeDriver';
import { Player } from './Components';
import { PositionTracker } from './systems/PositionTracker';
import { MinecraftWorld } from './world/Terrain';
import { EnhancedMagicSystem } from './EnhancedMagicSystem';
import { NPCSystem } from './SimplifiedNPCSystem';
import { Nametags } from './render/Nametags';
import { BossEntity } from './render/BossEntity';
import { GPUSparkSystem } from './world/GPUSparkSystem';
import { ElementZoneRenderSystem } from './world/ElementZoneRenderSystem';
import { isCaptureMode } from './devtest/captureMode';
import { isPerfProbe } from './devtest/perfProbe';
import { PROBE_DPR } from './devtest/perfScenarios';
import { PerfProbeSystem } from './devtest/PerfProbeSystem';
// particleProbe/weatherGate/stormBed/audioBridge/climate imports moved with WeatherSystem -> src/render/WeatherSystem.jsx (A2.5).

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
// BLOOM_BASE/PEAK moved with BloomSpikeDriver -> src/render/BloomSpikeDriver.jsx (v6 de-monolith A2.3).
// per-frame scratch (_audioDir/_rayStart/_weatherDummy) hoisted -> src/render/_sceneScratch.js (v6 de-monolith A2.0).
// BloomSpikeDriver extracted -> src/render/BloomSpikeDriver.jsx (v6 de-monolith A2.3).

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
// SpatialAudioController extracted -> src/render/SpatialAudioController.jsx (v6 de-monolith A2.6).

// Weather materials + WeatherSystem extracted -> src/render/WeatherSystem.jsx (v6 de-monolith A2.5).

// Desktop mouse-look: attach our own pointer-lock look handler to the live R3F camera (replaces drei's
// pointer-lock controls). Suppressed in capture mode (the harness pins the camera). Renders nothing.
// PointerLook extracted -> src/render/PointerLook.jsx (v6 de-monolith A2.4).

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
