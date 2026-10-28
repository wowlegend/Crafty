// tier-governor.spec.js's oscillation (phase B), its verdict, phase C's frame budget and the spec's time budget, kept
// out of the spec so a unit gate (tests/gates/governor-phases-gates.test.js) can drive them against the REAL governor
// (src/render/tierGovernor.js) on a fake clock — the same split as _floorSamples.js for mob-floor. The spec runs only
// in a browser, where what decides these (how late a stalled page fires a timer) is a matter of the runner's load.
//
// THE DEFECT THIS REPLACES (2026-10-28, PR CI run 40637608377, shard 7, the trace). Phase B sent its 30 signals one
// Playwright round trip at a time: an evaluate of governorSignal, then waitForTimeout(2500). On CI's software renderer
// 28 of the 30 evaluates took 2.3-8.1 s and each iteration paid ~3 s more between the wait and the next call, so the "75 s"
// oscillation took 316 s, with its signals ~10.5 s apart instead of 2.5. Phases A (a decline by 70 frames, 132.1 s)
// and B (two changes, at 0.1 s and 23.1 s, then settled) had passed, so phase C's frame wait began at 502 s of the
// 600 s test timeout, with its own cap at 180 s. The timeout fired inside it, naming nothing ("Test timeout of 600000ms
// exceeded"), and the retry was cut off by the shard's 25 minutes. The governor did nothing wrong that the run could
// see: behind the title it recorded no decline in the 98 s it was given. And the minute-window check,
// `for (let w = 20; w + 60 <= 75; ...)`, never ran an iteration (20 + 60 > 75), so only "no change after 60 s" was ever
// asserted.
//
// NOW: the page fires the whole schedule in ONE evaluate (fireOscillation), each signal at its own offset from the
// phase's start — an absolute schedule, so a late timer delays one signal and never the rest — and the verdict's
// minute-windows run from B_SETTLE_S to the last signal fired, so there is always one to check. The schedule runs
// 82.5 s, long enough past the re-incline block (60 s after the second decline at ~5 s) for a governor that never
// settled to step back up inside it, even with that decline fired 15 s late.

/** drei PerformanceMonitor decides every 2.5 s (10 samples of 250 ms); the oscillation signals at the same rate. */
export const B_PERIOD_MS = 2500;
/** Decline, incline, ... : 34 signals, the last at 82.5 s. */
export const B_SIGNALS = 34;
/** The first 20 s are the governor's to move in (its two declines); after that, at most 1 change in any minute. */
export const B_SETTLE_S = 20;
/** And no change at all after 60 s. */
export const B_QUIET_S = 60;
/** The page stops firing past this: the last signal's 82.5 s, plus more than the longest gap between screencast frames
 *  in that run's phase B (10.7 s), so one CI-sized stall at the end cannot cut the schedule short. */
export const B_CAP_MS = 100000;

// Phase A (the real monitor must decline, from med, under a 70 ms frame stall) and phase C (behind the title, it must
// not), each bounded in frames drawn AND a minimum time, under a cap. See the spec for why frames, not seconds.
export const A_FRAMES = 80;
export const A_MIN_MS = 12000;
export const A_CAP_MS = 180000;
/** How long the title's 10 fps pace may take to apply: it is a React render of the Canvas, behind a long frame. */
export const C_PACE_MS = 30000;
/** The least phase C watches behind the title (a decline needs 44-46 frames on a local software renderer). */
export const C_FRAMES_MIN = 60;
export const C_MIN_MS = 12000;
export const C_CAP_MS = 180000;

/** The spec's own timeout. Its waits' caps must fit inside it, so a slow phase fails naming itself (the gate). */
export const TEST_TIMEOUT_MS = 600000;

/** The oscillation: [{ at, kind }], `at` ms from the phase's start, decline first. */
export function oscillation() {
  return Array.from({ length: B_SIGNALS }, (_, i) => ({ at: i * B_PERIOD_MS, kind: i % 2 === 0 ? 'decline' : 'incline' }));
}

/**
 * Fires `schedule` at its offsets from this call's start, then returns { t0, fired: [{ kind, s }] } (s since t0). It
 * stops firing past `capMs`. PASSED TO page.evaluate, so it must stay self-contained: with no `io` it uses the page's
 * own clock, timers and the DEV governorSignal hook; the gate passes a fake `io`.
 * @param {{ schedule: {at:number, kind:string}[], capMs: number }} arg
 * @param {{ now: () => number, wait: (ms:number) => Promise<unknown>, signal: (kind:string) => unknown }} [io]
 */
export async function fireOscillation({ schedule, capMs }, io) {
  const { now, wait, signal } = io || {
    now: () => performance.now(),
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    signal: (kind) => window.__craftyTest.call('governorSignal', kind),
  };
  const t0 = now();
  const fired = [];
  for (const { at, kind } of schedule) {
    const ahead = t0 + at - now();
    if (ahead > 0) await wait(ahead);
    if (now() - t0 > capMs) break;
    signal(kind);
    fired.push({ kind, s: (now() - t0) / 1000 });
  }
  return { t0, fired };
}

/**
 * PURE. Phase B's verdict over the tier changes ([{ s, from, to }], s since the phase began) and the last signal's time
 * `endS`: every minute-window starting from B_SETTLE_S, every 2.5 s, up to endS, with the number of changes inside it;
 * and the changes at or after B_QUIET_S.
 */
export function phaseBVerdict(changes, endS) {
  const windows = [];
  for (let w = B_SETTLE_S; w <= endS; w += B_PERIOD_MS / 1000) {
    windows.push({ from: w, n: changes.filter((e) => e.s >= w && e.s < w + 60).length });
  }
  return { windows, late: changes.filter((e) => e.s >= B_QUIET_S) };
}

/** PURE. The frames phase C watches behind the title: as many as phase A needed to see its decline, and never fewer than C_FRAMES_MIN. */
export function cFramesFor(drawnA) {
  return Math.max(C_FRAMES_MIN, drawnA);
}
