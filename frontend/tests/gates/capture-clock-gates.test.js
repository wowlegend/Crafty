import { describe, it, expect, beforeEach } from 'vitest';
import { enterCaptureMode, exitCaptureMode } from '../../src/devtest/captureMode.js';
import {
  CAPTURE_DT,
  advanceCaptureFrame,
  resetCaptureClock,
  captureNow,
  captureElapsed,
  captureFrameIndex,
} from '../../src/devtest/captureClock.js';

// PHASE C — the missing half of capture determinism.
//
// Determinism today is achieved by SUPPRESSION: 116 isCaptureMode() sites across 61 files, 31 of them
// early-returns, turning weather, mob AI, NPC routines, particles and spawning OFF. So the 31 gated
// frames depict a build nobody plays, and the gate is structurally incapable of regressing anything that
// only manifests in motion. AGENTS.md states this outright.
//
// Suppression was chosen because the alternative needs two primitives and only one existed:
// `captureRandom` (seeded per-key streams) shipped; a deterministic CLOCK never did. Against 72 clock
// reads, an animated system left running would advance by WALL TIME, and boot length varies 1.68–10.43 s
// per process — so the frame would sample a run-dependent phase. That is the same defect the phase-reset
// fix cured, one layer down.
//
// A frame-indexed clock removes the reason for the suppression: under capture, time is a pure function of
// how many frames have been rendered, so a system that runs still lands in the same state every run.
describe('captureClock — time as a function of FRAME INDEX, not wall time', () => {
  beforeEach(() => {
    exitCaptureMode();
    resetCaptureClock();
  });

  it('is INERT outside capture — returns real time and never a frame count', () => {
    // The whole layer must vanish in normal play. A clock that returns frame*dt to a real player would
    // make the game run at a speed determined by frame rate, which is the classic version of this bug.
    const a = captureNow();
    const b = performance.now();
    expect(Math.abs(a - b)).toBeLessThan(50);
    expect(a).toBeGreaterThan(1); // frame 0 would be exactly 0
  });

  it('under capture, advances by exactly CAPTURE_DT per frame', () => {
    enterCaptureMode();
    expect(captureElapsed()).toBe(0);
    advanceCaptureFrame();
    expect(captureElapsed()).toBeCloseTo(CAPTURE_DT, 10);
    advanceCaptureFrame();
    expect(captureElapsed()).toBeCloseTo(2 * CAPTURE_DT, 10);
  });

  it('under capture, is IDENTICAL for the same frame count regardless of wall time', () => {
    // The load-bearing property. Two processes that reach frame 90 by different routes — a fast boot and
    // a slow one — must read the same clock. This is exactly what varies 1.68-10.43s between runs.
    enterCaptureMode();
    for (let i = 0; i < 90; i++) advanceCaptureFrame();
    const first = captureNow();
    resetCaptureClock();
    for (let i = 0; i < 90; i++) advanceCaptureFrame();
    expect(captureNow()).toBe(first);
  });

  it('reports milliseconds from captureNow and seconds from captureElapsed', () => {
    // 72 call sites read a clock; some want performance.now()-style ms, some want R3F elapsed seconds.
    // One of them silently getting the other unit is a 1000x error that still looks like a number.
    enterCaptureMode();
    for (let i = 0; i < 60; i++) advanceCaptureFrame();
    expect(captureElapsed()).toBeCloseTo(1, 10);
    expect(captureNow()).toBeCloseTo(1000, 6);
  });

  it('does NOT advance while capture is off, so a real session cannot poison the counter', () => {
    advanceCaptureFrame();
    advanceCaptureFrame();
    expect(captureFrameIndex()).toBe(0);
    enterCaptureMode();
    advanceCaptureFrame();
    expect(captureFrameIndex()).toBe(1);
  });

  it('resets to frame 0, so each captured state starts from the same phase', () => {
    // The harness captures ~31 states in ONE browser session. Without a reset between them, state N's
    // phase depends on how many frames states 0..N-1 happened to take — reintroducing exactly the
    // run-dependent phase this exists to remove, just at a coarser grain.
    enterCaptureMode();
    for (let i = 0; i < 40; i++) advanceCaptureFrame();
    expect(captureFrameIndex()).toBe(40);
    resetCaptureClock();
    expect(captureFrameIndex()).toBe(0);
    expect(captureElapsed()).toBe(0);
  });

  it('CAPTURE_DT is a fixed 1/60 constant, not read from the display', () => {
    // Reading the real refresh rate would make the captured build depend on the machine — Kevin's
    // ProMotion 120Hz screen and a CI runner would produce different frames from identical code.
    expect(CAPTURE_DT).toBeCloseTo(1 / 60, 10);
  });
});

// TWO CANVASES, ONE CLOCK. This app mounts more than one R3F Canvas — TitleDiorama drives the `menu`
// frame, GameScene the world frames — and each runs its own render loop with its own useFrame callbacks.
// If both advance the counter, a frame costs 2 ticks; worse, if one MOUNTS PART-WAY THROUGH (the diorama
// is React.lazy), the rate changes mid-run and the clock becomes run-dependent again — reintroducing
// precisely the defect it exists to remove, by way of the fix.
//
// The dedupe token is `document.timeline.currentTime`, which by spec advances exactly once per animation
// frame and reads identically for every callback within that frame. Under jsdom there is no timeline, so
// the guard falls through and every call advances — which is what the unit tests above depend on.
describe('captureClock — one tick per ANIMATION FRAME, not per canvas', () => {
  beforeEach(() => {
    exitCaptureMode();
    resetCaptureClock();
    enterCaptureMode();
  });

  it('counts two advances in the SAME animation frame as one', () => {
    let now = 100;
    const timeline = { get currentTime() { return now; } };
    advanceCaptureFrame(timeline); // GameScene
    advanceCaptureFrame(timeline); // TitleDiorama, same rAF
    expect(captureFrameIndex()).toBe(1);
    now = 116.6; // next animation frame
    advanceCaptureFrame(timeline);
    advanceCaptureFrame(timeline);
    expect(captureFrameIndex()).toBe(2);
  });

  it('a canvas that mounts LATE does not change the rate', () => {
    // The failure this prevents: frames 0-30 tick once (one canvas), 31+ tick twice (diorama mounted).
    // Elapsed time would then depend on WHEN the lazy chunk resolved, which is exactly the 1.68-10.43 s
    // boot variance the clock was built to defeat.
    let now = 0;
    const timeline = { get currentTime() { return now; } };
    for (let f = 0; f < 5; f++) { now = f * 16.6; advanceCaptureFrame(timeline); }
    expect(captureFrameIndex()).toBe(5);
    for (let f = 5; f < 10; f++) { now = f * 16.6; advanceCaptureFrame(timeline); advanceCaptureFrame(timeline); }
    expect(captureFrameIndex()).toBe(10);
  });

  it('still advances when no timeline is available, so jsdom and old engines are not frozen', () => {
    advanceCaptureFrame();
    advanceCaptureFrame();
    expect(captureFrameIndex()).toBe(2);
  });
});
