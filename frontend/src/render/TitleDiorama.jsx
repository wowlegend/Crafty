// W2 cinematic title VISTA — a full-bleed live 3D Hearth diorama behind the menu, replacing the
// flat purple radial gradient + 2D confetti. Reuses the toon character look + the warm magic-hour
// light palette (Task 1) + drifting light motes. Slow camera drift in gameplay; FROZEN in capture
// (isCaptureMode) so the `menu` baseline is byte-stable. Lazy-friendly (caller Suspense-wraps it).
//
// PERF: a persistent menu canvas, deliberately lightweight (no EffectComposer/Bloom — the gem +
// motes read bright via emissive/additive + toneMapped=false), dpr capped, frameloop switched to
// "demand" in capture so the frozen frame costs nothing. The motes are a small inline additive
// field (the LightMotes signature, scaled to the diorama box) rather than the full GPU pool — the
// diorama frames only ~28 of them and never moves the camera box, so a per-mesh group is cheap and
// keeps the canvas free of the gameplay mood/quality dependencies.
import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MascotCraftyHero } from './mascots/MascotCraftyHero';
import { isCaptureMode } from '../devtest/captureMode';
import { CaptureClockTicker } from '../devtest/CaptureClockTicker.jsx';

const SUN = '#FFE9C2', SKY = '#7FC9E0', GROUND = '#4A7A4A'; // warm magic-hour bounce

const MOTE_SPIN_RATE = 0.02; // rad/s

/**
 * PURE. The mote ring's Y rotation on this frame.
 *
 * Under capture this is 0 — the spin ORIGIN — not "whatever the spin had reached". The old form was
 * `if (!isCaptureMode()) ref.rotation.y = elapsed * RATE`, which stops ASSIGNING and therefore freezes
 * the last assigned value. Capture is enabled after boot, boot length varies per process, so that value
 * was run-dependent: 28 motes each landing a different fraction of their own width apart between runs.
 * That is the "motes appear as PAIRS" signature in the menu diff.
 *
 * @param {boolean} capture  isCaptureMode()
 * @param {number} elapsed   clock.elapsedTime
 * @returns {number} rotation.y in radians
 */
export function dioramaMoteSpin(capture, elapsed) {
  return capture ? 0 : elapsed * MOTE_SPIN_RATE;
}

export const MOTE_COUNT = 28;

/**
 * PURE. The mote field's authored layout — a deterministic ring of MOTE_COUNT positions derived from
 * the index, with NO randomness, which is the property that lets the menu frame be byte-stable.
 *
 * Exported for the same reason `dioramaMoteSpin` and `titleCameraPose` are: R3F hooks refuse to run
 * outside a Canvas, so anything left inside the component body can only be reached by a source-grep —
 * and the grep that used to guard this matched the word "motes" in a COMMENT.
 */
export function dioramaMotePositions() {
  return Array.from({ length: MOTE_COUNT }, (_, i) => [Math.sin(i * 2.4) * 6, 1 + (i % 7) * 0.7, Math.cos(i * 1.7) * 6]);
}

function DioramaMotes() {
  // a small additive mote field (the light-motes signature) — RESET to zero rotation under capture.
  const ref = useRef();
  useFrame((s) => {
    if (ref.current) ref.current.rotation.y = dioramaMoteSpin(isCaptureMode(), s.clock.elapsedTime);
  });
  const motes = dioramaMotePositions();
  return (
    <group ref={ref}>
      {motes.map((p, i) => (
        <mesh key={i} position={p}>
          <planeGeometry args={[0.10, 0.10]} />
          <meshBasicMaterial color="#FFE6B0" transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

// The hero is composed in the UPPER-CENTRE of the frame so the lower third stays clear for the
// wordmark + CTA lockup (MenuSystem anchors the text stack to the bottom). The camera looks at the
// hero's hat/chest height (LOOK_Y) from a pulled-back, slightly elevated 3/4 pose, leaving the warm
// plinth + ground filling the foreground below the lockup.
// LOOK_Y aims at the hero's mid-hat. Camera is pulled WELL back + elevated so the whole figure
// rides in the UPPER ~55% of the frame, leaving the bottom ~45% as clear warm plinth/ground for
// the wordmark + tagline + CTA + controls lockup (MenuSystem anchors the text stack to the bottom).
const LOOK_Y = 2.15;

// The canonical capture pose, shared with the <Canvas camera> prop below so the two cannot drift apart.
// It is also the drift's own centre (a = 0), so freezing here is the pose the animation orbits.
export const CAPTURE_CAM = Object.freeze([2.6, 4.0, 10.8]);

/**
 * PURE. Where the title camera belongs on this frame. Split out from the useFrame so the rule that
 * actually matters — capture RESETS to a canonical pose rather than freezing wherever the drift got to —
 * is testable without mounting a Canvas (R3F hooks refuse to run outside one).
 *
 * @param {boolean} capture  isCaptureMode()
 * @param {number} elapsed   clock.elapsedTime
 * @returns {[number, number, number]} camera position
 */
export function titleCameraPose(capture, elapsed) {
  if (capture) return [...CAPTURE_CAM];
  const a = elapsed * 0.06;
  return [Math.sin(a) * 0.7 + 2.6, 4.0 + Math.sin(a * 0.7) * 0.15, CAPTURE_CAM[2]];
}

function DriftCamera() {
  useFrame((s) => {
    if (isCaptureMode()) {
      // RESET to the canonical pose — do NOT merely stop.
      //
      // This used to `return`, which freezes the camera WHEREVER THE DRIFT LEFT IT. Capture mode is
      // enabled by the harness AFTER the page has booted and this diorama has been animating
      // (capture.mjs calls enterCapture only once __craftyTest.ready() resolves), and boot takes a
      // different length of time in every process. So the camera settled on a RUN-DEPENDENT pose and
      // capture faithfully locked it there.
      //
      // A sub-pixel camera difference re-rasterises every edge in the frame. That is precisely the
      // diff signature this cost us: hairline outlines tracing the whole tower, and motes appearing
      // as PAIRS — the same mote a fraction of a pixel apart — while nothing had actually moved.
      //
      // Proof it is cross-run and not the renderer: three shots from ONE page are byte-identical
      // (0 px), while two separate processes differ by 0.359-0.557%.
      //
      // AGENTS.md already says the capture check must live INSIDE the callback because the harness
      // flips the flag after mount. It did. The gap is that "stop animating" is not the same as
      // "return to a known pose" — freezing an animation still leaves you wherever it had got to.
      s.camera.position.set(...titleCameraPose(true, 0));
      s.camera.lookAt(0, LOOK_Y, 0);
      return;
    }
    const [px, py] = titleCameraPose(false, s.clock.elapsedTime);
    s.camera.position.x = px;
    s.camera.position.y = py;
    s.camera.lookAt(0, LOOK_Y, 0);
  });
  return null;
}

export function TitleDiorama() {
  return (
    <div data-testid="title-diorama" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <Canvas
        shadows={false}
        // PIN THE DEVICE PIXEL RATIO IN CAPTURE. `[1, 2]` is an adaptive RANGE, so the canvas can
        // rasterise at a different ratio between runs and every edge in the frame re-antialiases --
        // which is precisely what menu.png's 0.984% run-to-run diff looked like: outlines tracing
        // every edge of the geometry plus the borders of motes that never moved. The main canvas
        // already does this (GameScene.jsx disables AdaptiveDpr under isCaptureMode and pins
        // PROBE_DPR for the perf probe); this canvas never got the same treatment.
        //
        // Note what this is NOT: waitForStableFrame already guarantees the frame stopped changing,
        // and it was satisfied in both runs. A frame can settle at a DIFFERENT state each time.
        // Stable is not deterministic.
        dpr={isCaptureMode() ? 1 : [1, 2]}
        // `demand` in capture, and NOT for the reason you might assume. Switching this to `always` was
        // tried on 2026-08-08 as a determinism fix -- the theory being that a timing-dependent
        // invalidation count left the frame on an arbitrary pose -- and it did NOT work: menu.png's
        // run-to-run self-diff went 0.359% -> 0.557%. Reverted. Note the honest limit: menu has measured
        // 0.984 / 0.359 / 0.557 across three rounds, so the metric is itself noisy and one A/B cannot
        // rank the two modes. What IS established is that `always` does not fix it, so the residual is
        // not the render-scheduling mode. Do not retry this without a new reason.
        frameloop={isCaptureMode() ? 'demand' : 'always'}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ fov: 34, near: 0.1, far: 100, position: CAPTURE_CAM }}
        onCreated={({ camera }) => camera.lookAt(0, LOOK_Y, 0)}
      >
        <CaptureClockTicker />
        <DriftCamera />
        <hemisphereLight color={SKY} groundColor={GROUND} intensity={0.65} />
        <ambientLight color={SKY} intensity={0.5} />
        <directionalLight color={SUN} position={[-5, 6, 4]} intensity={2.0} />
        <DioramaMotes />
        <group scale={0.95} position={[0, 0.9, 0]}>
          <MascotCraftyHero />
        </group>
        {/* a simple warm ground plinth so the hero stands on the Hearth, not in a void */}
        <mesh position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[4.2, 32]} />
          <meshStandardMaterial color="#6B5440" roughness={0.9} />
        </mesh>
      </Canvas>
    </div>
  );
}
