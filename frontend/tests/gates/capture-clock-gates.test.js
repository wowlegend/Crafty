import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { enterCaptureMode, exitCaptureMode } from '../../src/devtest/captureMode.js';
import {
  CAPTURE_DT,
  advanceCaptureFrame,
  resetCaptureClock,
  captureNow,
  captureElapsed,
  captureFrameIndex,
  stepCaptureFrames,
  setCaptureFrame,
  frameElapsed,
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

// STEP-THEN-SHOOT. A frame-indexed clock gives determinism but NOT motion: probed live, 2 seconds of
// wall time under capture advanced the world by 2 frames (SwiftShader renders at ~1 fps), i.e. 33 ms of
// virtual time. An un-suppressed animation captured that way sits at its start pose — reproducible, and
// exactly as uninformative as the suppression it replaced.
//
// So the harness must DRIVE the clock to a declared frame index and then shoot. That makes the captured
// phase an explicit reviewable constant instead of an emergent property of how fast the machine rendered.
// It is also what the SOTA audit predicted: it found frameloop='never' + advance() inert precisely
// BECAUSE the guards skip rather than substitute, so stepping 120 frames yielded the same scene graph as
// stepping one. Stepping only becomes meaningful once something reads the clock.
describe('stepCaptureFrames — drive the clock to a declared phase', () => {
  beforeEach(() => {
    exitCaptureMode();
    resetCaptureClock();
  });

  it('advances the virtual clock by exactly N frames', () => {
    enterCaptureMode();
    stepCaptureFrames(90);
    expect(captureFrameIndex()).toBe(90);
    expect(captureElapsed()).toBeCloseTo(90 / 60, 10);
  });

  it('is ADDITIVE, so two steps compose into a declared total', () => {
    enterCaptureMode();
    stepCaptureFrames(30);
    stepCaptureFrames(30);
    expect(captureFrameIndex()).toBe(60);
  });

  it('is a NO-OP outside capture — it must never move a real session forward', () => {
    // Re-enter capture before READING. captureFrameIndex() returns 0 outside capture regardless of the
    // underlying counter, so asserting it while still outside is satisfied by construction — this test
    // passed with the guard deleted until a mutation exposed it. A vacuous assertion is the defect this
    // repo keeps shipping, and writing one inside the gate that guards against it is worth the comment.
    stepCaptureFrames(500);
    enterCaptureMode();
    expect(captureFrameIndex()).toBe(0);
  });

  it('rejects a negative or non-finite step instead of corrupting the counter', () => {
    // Time running backwards would make a "declared phase" unreproducible in the worst way: silently,
    // and only for the frames captured after whichever call passed the bad value.
    enterCaptureMode();
    stepCaptureFrames(10);
    for (const bad of [-5, NaN, Infinity, undefined, null, '30']) stepCaptureFrames(bad);
    expect(captureFrameIndex()).toBe(10);
  });

  // A test asserting that stepCaptureFrames clears the dedupe token used to live here. It was deleted
  // along with the line it guarded: a mutation removing that line left this GREEN, and no real failure
  // path exists — a stale token only swallows a tick when the next animation frame reports an IDENTICAL
  // currentTime, which cannot follow a step. Keeping an assertion that cannot fail, next to a line that
  // cannot matter, is two decorations pretending to be a guard. resetCaptureClock's clear is different
  // and stays: reset runs mid-session from enterCapture, so the very next tick genuinely can carry the
  // token from before it.
});

// A STEP COUNT NOBODY COULD TRUST.
//
// stepCaptureFrames returned undefined, and the test-bridge hook that wraps it invented an answer from a
// DIFFERENT flag -- the store mirror rather than this module's. Those two provably diverge: eleven fixture
// hooks in App.jsx call enterCaptureMode() without touching the mirror, so after any of them the clock
// steps while the bridge reports 0. And `stepCaptureFrames(-5)` echoed -5 although this function had
// already discarded it. That return value is exactly the number a reviewer reads to decide a frame was
// posed before it was shot.
describe('stepCaptureFrames — reports what it actually did', () => {
  beforeEach(() => { exitCaptureMode(); resetCaptureClock(); });
  afterEach(() => exitCaptureMode());

  it('returns the frames it advanced', () => {
    enterCaptureMode();
    expect(stepCaptureFrames(30)).toBe(30);
    expect(captureFrameIndex()).toBe(30);
  });

  it('returns 0 for every input it REJECTS, instead of echoing it back', () => {
    enterCaptureMode();
    for (const bad of [-5, NaN, Infinity, undefined, null, '30', {}]) {
      expect(stepCaptureFrames(bad), `${String(bad)} was echoed back as if it had been applied`).toBe(0);
    }
    expect(captureFrameIndex(), 'a rejected input still moved the clock').toBe(0);
  });

  it('returns 0 outside capture, where it does nothing', () => {
    expect(stepCaptureFrames(10)).toBe(0);
  });

  it('floors a fractional step and says so', () => {
    enterCaptureMode();
    expect(stepCaptureFrames(2.9)).toBe(2);
    expect(captureFrameIndex()).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// setCaptureFrame — A COMMANDED CLOCK, because a free-running one does not deliver a declared phase.
//
// THE DEFECT THIS FIXES, MEASURED RATHER THAN REASONED. advanceCaptureFrame runs from CaptureClockTicker
// inside every <Canvas>, so under capture the clock ticks once per RENDERED frame. The harness then waits
// wall-clock time before each shot, and SwiftShader renders at roughly 1 fps -- so the phase a frame is
// captured at is however many frames the machine happened to draw, not a number anyone declared. Probed
// on ONE machine, identical code, identical schedule, five sample points, two runs:
//
//     run 1: [6, 10, 13, 15, 16]
//     run 2: [6, 11, 13, 14, 16]
//
// Two of five diverge on the same box; across machines of different speed the spread is unbounded. That
// is precisely the run-dependent phase the clock was built to remove, reproduced one level up. It is
// LATENT today only because nothing reads the clock yet -- and it goes live with the first subsystem
// converted from suppression to substitution, which is the next unit of work.
//
// AND THE SECOND REASON, which is the one that makes freezing necessary rather than merely tidy: the
// harness photographs a frame only after waitForStableFrame reports two consecutive identical frames. A
// world animating off a free-running clock never produces two identical frames, so a stability wait and
// a free-running clock cannot both be satisfied. The world must be STILL at the declared phase to be
// photographable at all.
describe('setCaptureFrame — the phase is declared, not emergent', () => {
  beforeEach(() => { exitCaptureMode(); resetCaptureClock(); });
  afterEach(() => exitCaptureMode());

  it('sets an ABSOLUTE index, not a relative one', () => {
    enterCaptureMode();
    stepCaptureFrames(7);
    expect(setCaptureFrame(90), 'it returned something other than the frame it set').toBe(90);
    expect(captureFrameIndex(), 'setCaptureFrame ADDED to the clock instead of setting it').toBe(90);
    // Idempotent by construction: calling it twice must land on the same phase, which a relative
    // implementation cannot do.
    setCaptureFrame(90);
    expect(captureFrameIndex()).toBe(90);
  });

  it('FREEZES the clock, so the declared phase survives every frame rendered after it', () => {
    enterCaptureMode();
    setCaptureFrame(90);
    for (let i = 0; i < 5; i++) advanceCaptureFrame({ currentTime: 1000 + i });
    expect(
      captureFrameIndex(),
      'the ticker walked the clock off the declared phase -- the shot would be taken somewhere else'
    ).toBe(90);
    expect(captureElapsed()).toBeCloseTo(90 * CAPTURE_DT, 10);
  });

  it('resetCaptureClock THAWS it — a later state must be free to tick again', () => {
    enterCaptureMode();
    setCaptureFrame(90);
    resetCaptureClock();
    expect(captureFrameIndex(), 'the reset did not return to frame 0').toBe(0);
    advanceCaptureFrame({ currentTime: 5000 });
    expect(captureFrameIndex(), 'the clock stayed frozen through a reset — every later state would be stuck').toBe(1);
  });

  it('rejects a negative or non-finite phase instead of corrupting the counter', () => {
    enterCaptureMode();
    setCaptureFrame(40);
    for (const bad of [-1, NaN, Infinity, undefined, null, '90', {}]) {
      expect(setCaptureFrame(bad), `${String(bad)} was accepted as a phase`).toBe(-1);
    }
    expect(captureFrameIndex(), 'a rejected phase still moved the clock').toBe(40);
  });

  it('is a NO-OP outside capture, checked from INSIDE capture so the assertion can fail', () => {
    // The vacuity trap this file has already been bitten by once: captureFrameIndex() returns 0 outside
    // capture whatever the counter holds, so asserting 0 out here passes with the guard deleted. Re-enter
    // capture to read the real counter.
    expect(setCaptureFrame(90)).toBe(-1);
    enterCaptureMode();
    expect(captureFrameIndex(), 'it moved the clock while capture was off').toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// frameElapsed — THE SEAM EVERY SUPPRESSION->SUBSTITUTION CONVERSION GOES THROUGH.
//
// The conversion is always the same shape: a useFrame reads `state.clock.elapsedTime`, and under capture
// the site either freezes it to a constant or early-returns. Both make the gated frame depict a world
// that is not moving. Substituting means reading the DECLARED phase instead — and doing that inline at
// each site would spread `isCaptureMode() ? ... : ...` across dozens of files, where each copy is one
// more place to write the ternary backwards.
//
// One function, one test, and every converted site inherits both.
describe('frameElapsed — a drop-in for state.clock.elapsedTime', () => {
  beforeEach(() => { exitCaptureMode(); resetCaptureClock(); });
  afterEach(() => exitCaptureMode());

  it('passes real clock time straight through outside capture', () => {
    // The direction that matters most: a converted site must be EXACTLY as it was during real play.
    expect(frameElapsed(12.5)).toBe(12.5);
    expect(frameElapsed(0)).toBe(0);
  });

  it('returns the DECLARED phase under capture, ignoring the real clock entirely', () => {
    enterCaptureMode();
    setCaptureFrame(90);
    expect(frameElapsed(12.5), 'it let the real clock through under capture').toBeCloseTo(90 * CAPTURE_DT, 10);
    // And it must not be reading its own argument as a fallback when the phase happens to be 0.
    resetCaptureClock();
    expect(frameElapsed(12.5)).toBe(0);
  });

  it('holds still once the phase is pinned — the property the screenshot depends on', () => {
    enterCaptureMode();
    setCaptureFrame(90);
    const a = frameElapsed(1);
    for (let i = 0; i < 5; i++) advanceCaptureFrame({ currentTime: 2000 + i });
    expect(frameElapsed(99), 'the time moved between two rendered frames, so no two frames can match').toBe(a);
  });
});
