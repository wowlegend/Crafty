// Dev-only deterministic CLOCK for the visual-regression capture — the missing half of capture
// determinism, and the thing that lets suppression be replaced by substitution.
//
// WHY THIS EXISTS. Until now the capture achieved determinism by turning systems OFF: 116
// `isCaptureMode()` sites across 61 files, 31 of them early-`return`s, suppressing weather, mob AI, NPC
// routines, particles and spawning. `AGENTS.md` states the consequence plainly — the gated frames depict
// a build nobody plays, structurally incapable of regressing anything that only manifests in motion.
//
// Suppression was the only option because substitution needs TWO primitives and only one existed.
// `captureMode.js` shipped seeded per-key PRNG streams; nothing ever substituted TIME. Against 72 clock
// reads, a system left running under capture advances by WALL TIME — and boot length varies 1.68-10.43 s
// between processes, so the frame samples a run-dependent phase. That is precisely the defect the
// animated-phase reset cured at the leaf; this is the same defect at the root.
//
// THE FIX: under capture, time is a pure function of HOW MANY FRAMES HAVE BEEN RENDERED. Two processes
// that reach frame 90 by different routes read the same clock, so a system that keeps running still
// lands in the same state. Outside capture this module is completely inert and returns real time —
// a frame-indexed clock in a real session would tie game speed to frame rate, which is the classic bug.
import { isCaptureMode } from './captureMode.js';

/**
 * Fixed 1/60 s. Deliberately a CONSTANT and never the display's real refresh rate: reading the monitor
 * would make the captured build depend on the machine, so Kevin's 120 Hz ProMotion screen and a CI
 * runner would render different frames from identical code — a baseline that cannot be shared.
 */
export const CAPTURE_DT = 1 / 60;

let _frame = 0;
let _lastTick = null; // last animation-frame token seen — see advanceCaptureFrame

/**
 * Advance one frame. Call EXACTLY ONCE per rendered frame, from the root of the render loop, before any
 * consumer reads the clock. A no-op outside capture so a real session can never poison the counter.
 */
export function advanceCaptureFrame(timeline = typeof document !== 'undefined' ? document.timeline : null) {
  if (!isCaptureMode()) return;
  // ONE TICK PER ANIMATION FRAME, NOT PER CANVAS. This app mounts more than one R3F Canvas —
  // TitleDiorama for the `menu` frame, GameScene for the world — each with its own render loop. Letting
  // both advance would cost 2 ticks per frame, and because the diorama is `React.lazy`, the RATE would
  // change the moment its chunk resolved. Elapsed time would then depend on when a network-ish event
  // landed: the same run-dependent phase this clock exists to remove, reintroduced by its own fix.
  //
  // `document.timeline.currentTime` advances exactly once per animation frame and reads identically for
  // every callback within it, so it is the natural token. Absent (jsdom, older engines) the guard falls
  // through and every call counts, which keeps the unit tests meaningful.
  const t = timeline ? timeline.currentTime : null;
  if (t != null) {
    if (t === _lastTick) return;
    _lastTick = t;
  }
  _frame++;
}

/**
 * Reset to frame 0. The harness captures ~31 states in ONE browser session; without a reset between
 * them, state N's phase depends on how many frames states 0..N-1 happened to take — which reintroduces
 * run-dependent phase at a coarser grain, the very thing this removes.
 */
export function resetCaptureClock() {
  _frame = 0;
  _lastTick = null; // else the first advance after a reset is swallowed as a duplicate
}

/** Frames rendered since the last reset. 0 outside capture. */
export function captureFrameIndex() {
  return isCaptureMode() ? _frame : 0;
}

/**
 * MILLISECONDS, as a drop-in for `performance.now()` / `Date.now()`-style deltas.
 * Note the unit: `captureElapsed` returns SECONDS. A site that takes the wrong one is a 1000x error
 * that still looks like a plausible number, which is why they are named differently rather than
 * overloaded on an argument.
 */
export function captureNow() {
  return isCaptureMode() ? _frame * CAPTURE_DT * 1000 : performance.now();
}

/** SECONDS, as a drop-in for R3F's `state.clock.elapsedTime`. */
export function captureElapsed() {
  return isCaptureMode() ? _frame * CAPTURE_DT : performance.now() / 1000;
}
