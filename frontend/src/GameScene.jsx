import React, { Suspense, useMemo, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
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
import { isPerfProbe } from './devtest/perfProbe';
import { PROBE_DPR } from './devtest/perfScenarios';
import { PerfProbeSystem } from './devtest/PerfProbeSystem';
import { CaptureClockTicker } from './devtest/CaptureClockTicker.jsx';
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
// intended glowier base real (matches the <Bloom intensity={0.95}> prop below).
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
  isWorldBuilt,
  bossSystem,
  showStats
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
  // A real subscription, deliberately: this must trigger a React render to mount/unmount the GodRays
  // pass. <Atmosphere> writes it edge-triggered (twice per day/night cycle), so this is not a per-frame
  // binding and does not violate Game-Loop-Isolation.
  const sunAboveHorizon = useGameStore((s) => s.sunAboveHorizon);
  const q = TIERS[qualityTier] || TIERS.low;
  const [sunMesh, setSunMesh] = useState(null);

  useEffect(() => {
    // Lock the CANVAS directly (a transient-activation-gated browser call; every caller is inside a real
    // click/key gesture). Our own attachPointerLook (lenient gate) then drives the camera while locked.
    useGameStore.setState({
      requestPointerLock: () => {
        // requestPointerLock reports a DENIAL by rejecting its Promise, not by throwing -- per MDN the
        // modern signature is Promise-returning, and a denial right after the user's own ESC is
        // GUARANTEED. So this try/catch could never fire the warn it exists for, and the rejection went
        // unhandled instead. Both paths are handled now, because older engines still return undefined.
        try {
          const p = canvasRef.current?.requestPointerLock?.();
          if (p && typeof p.catch === 'function') p.catch((e) => console.warn('pointer lock denied', e));
        } catch (e) {
          console.warn('pointer lock denied', e);
        }
      }
    });
    return () => {
      useGameStore.setState({ requestPointerLock: null });
    };
  }, []);

  // SHADOW FRUSTUM — DERIVED from renderDistance, 2026-09-22 (was a hardcoded +/-100 box).
  //
  // The old box was world-anchored and 200 units wide, while the sun sat at a constant [50,100,50] with no
  // `target` — so three.js aimed it at the world ORIGIN and the shadowed region was a fixed 200x200 patch
  // around spawn. The world streams around the player indefinitely (CHUNK_SIZE 16, renderDistance 2/3/4,
  // no position clamp found), so past ~100 units from spawn the entire world silently lost its sun
  // shadows — while still paying to render a 2048^2 shadow map every frame for a region the player had
  // left. <Atmosphere> now moves the light and its target with the player, which is what makes an extent
  // this tight correct rather than a downgrade.
  //
  // The extent now covers exactly what is LOADED and no more: renderDistance chunks in each direction,
  // plus half a chunk of margin so geometry at the edge still casts. That makes the shadow map denser at
  // the same byte cost — at high, 2048px over 144 units is ~14 px per world unit against the old ~10, so
  // voxel shadows get SHARPER while the wasted coverage goes away. Deriving it also means a tier that
  // lowers renderDistance automatically tightens its shadows instead of spreading the same pixels wider.
  const shadowConfig = useMemo(() => {
    const CHUNK = 16; // src/world/terrain.worker.js CHUNK_SIZE
    const extent = (q.renderDistance + 0.5) * CHUNK;
    return {
      mapSize: [q.shadowMapSize, q.shadowMapSize],
      // The frustum the light looks THROUGH; <Atmosphere> keeps it centred on the player.
      extent,
      camera: {
        left: -extent,
        right: extent,
        top: extent,
        bottom: -extent,
        near: 0.1,
        // The light rides SUN_OFFSET above the player, so `far` only has to span that offset plus the
        // depth of the world below — not a fixed world distance.
        far: 400,
      },
    };
  }, [q.shadowMapSize, q.renderDistance]);

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
        <CaptureClockTicker />
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
          // flipflops REMOVED 2026-09-22 (was 3), restoring drei's own default of Infinity.
          // Read from the installed drei source: `flipflops = Infinity` IS the default, and the sampler opens
          // with `if (api.fallback) return;` under the comment "If the fallback has been reached do not continue
          // running samples". So exceeding it does not merely stop reacting — it stops SAMPLING, permanently,
          // for the rest of the session.
          //
          // The residue note above already had the arithmetic: a normal warm-up climb (low->med->high = 2
          // inclines) plus one dip is 3, so adaptation froze almost immediately and every later thermal or load
          // change was invisible. Oscillation is already prevented by the `bounds` dead zone — that is the
          // mechanism whose job it is; a transition budget was doing it by switching the instrument off.
          //
          // WHAT THIS STILL DOES NOT FIX, and it is the important half: PerformanceMonitor samples FRAME RATE,
          // and frame rate is not a measure of COST. A machine pinned at 100% GPU while holding a comfortable
          // 60 fps sits inside the [50, 90] dead zone forever and never declines — which is exactly the case
          // that spins the fans on a high-refresh laptop. No rate-based governor can see it. The answer is to
          // make `high` cheap enough to be safe rather than to tune the monitor, which is why the MSAA and
          // god-ray changes alongside this matter more than this line does.
          <PerformanceMonitor
            bounds={(refreshrate) => (refreshrate > 90 ? [50, 90] : [40, 55])}
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

          {/* multisampling={0} — MEASURED-COST CHANGE, 2026-09-22.
              @react-three/postprocessing defaults `multisampling` to 8 and `frameBufferType` to
              HalfFloatType (both read from the installed dist, not from memory). Passing no prop therefore
              allocated an 8x multisampled RGBA16F render target at full canvas resolution and resolved it
              with blitFramebuffer EVERY FRAME. MEASURED CORRECTION 2026-09-22: the GPU grants 4, not 8.
              `MAX_SAMPLES` reads 4 on a real ANGLE Metal / Apple M3 Max context, so the requested 8 was
              always CLAMPED. The cost is 8 bytes per sample x 4 samples x canvas px = ~236 MB at
              1728x1117 dpr2, not the ~471 MB first written here from the REQUESTED count. Half the
              figure, same verdict: a redundant multisampled buffer, reallocated on every canvas resize.

              And <SMAA/> is four lines below, doing shader-based antialiasing on the resolved image. So the
              chain paid for hardware 8x MSAA AND a full AA pass. SMAA is the standard substitute and its
              presence here is what makes 0 the right value rather than a lower one; this is not "AA off".

              THE GL-STORM HYPOTHESIS THAT LIVED HERE IS REFUTED — by controlled
              measurement, not by doubt. This comment named the per-frame MSAA resolve as the prime suspect
              for the `GL_INVALID_OPERATION: glBlitFramebuffer` storm. It is not the cause. Measured on real
              ANGLE Metal, production build, full chain: 0 errors over 1672 frames with multisampling={0},
              and 0 over 1783 frames with the package default. Identical, so the MSAA path is uninvolved.
              The fix was upstream — postprocessing 6.39.5 (078a6d1) stopped EffectComposer building its
              stable depth texture with DepthTexture.clone(), which on three r172 shares one GPU image
              between a texture and its clones. Confirmed for r172 at pmndrs/postprocessing#750.
              This prop stays on its own merits: a redundant buffer is still redundant.

              To revert: delete the prop. Tests/scripts/effect-chain-cost pins it and will red. */}
          <EffectComposer multisampling={0}>
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
            {/* HORIZON GATE (2026-09-22, with the sun arc). GodRays is a screen-space effect whose light
                source is the sun BILLBOARD, and three.js#18446 records the official godrays example
                flipping its shaft downwards when "the signs of the sun's screen space position vector
                components change" — which an arcing sun crosses at every dawn and dusk by construction.
                Casting sun shafts at night is also just wrong. Gated on the store flag rather than solved
                in the shader: the pass simply is not mounted while the sun is down. */}
            {q.godRays && sunMesh && sunAboveHorizon && (
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
