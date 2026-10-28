// THE TOUCH-HOLD ACTION CASE'S WORLD FREEZE (tests/e2e/_worldHold.js) — held until the spec lets go, never a window
// sized in advance.
//
// tests/e2e/touch-hold.spec.js's action case froze the world with one 120 s triggerHitstop, and on main CI run
// 40642071917 (shard 7/8) its phases outlived it 3 of 3: "SETUP: the world freeze ran out by the late press". The same
// spec passed on PR #25's run 40637517889. The difference is the runner: from the overlay's entry to the log line took
// 59 s there and 129-154 s on main, where each real touch's handled gap ran 12-19 s (the warm-up held 7-10 s on the
// input clock). The helper opens the freeze as one long beat capped at the test's own timeout and ends it on the spec's
// release, so this drives it — through the REAL store action (triggerHitstop / stackHitstop) and the REAL world clock
// (tickWorldClock / worldNow), with performance.now and requestAnimationFrame stood in for the page — over the spec's
// own steps, timed as those runs timed them.
//
// THE TIMELINES. STEPS is the action case from the freeze's opening to its last read, in order (touch-hold.spec.js,
// the action case: every host<->page round trip, every in-page hold, every settle and wait, and the game's own hits,
// which call triggerHitstop inside the freeze). A real touch's span is its handled gap as CI printed it. The round trip
// is ONE number per run, FITTED, not measured: (entry-to-log - the three touches - the fixed waits) / the round trips,
// with the entry-to-log time read off the job log's timestamps. A uniform round trip is an assumption; under it the
// fitted main run reads the late lift within 0.1 s of the old window's end, so nothing here asserts that read either
// way under the old rule. The characterization below checks what the fit can carry: the old window holds PR #25's run
// whole and lapses in main's by the late press — CI's two outcomes — so a timeline edited until no rule could fail
// reds that test, not this gate's verdicts. HARSH is constructed: a 3.5 s round trip (world-hitstop.spec.js measured
// one at load 20) and 10 s frames inside the freeze (its constructed flake drew 12 s ones).
//
// WHAT THIS DOES NOT CHECK: that the spec calls the helper, installs it before boot, passes its own timeout as the cap,
// or releases after its last read (the spec's five `frozen` SETUP reads do, in a browser); that a frame in the page
// is a rAF callback (it is: the R3F loop runs in one); or that the frozen world is still (world-hitstop.spec.js).
//
// Mutation-Proof: RED FIRST — the helper was written with the old rule (one 120 s triggerHitstop) and this gate run
// against it: 5 of 8 RED, main's timeline with CI's own message, "the world freeze ran out by late press", HARSH's by
// the late lift; PR #25's read frozen throughout, as on CI, and failed only on the freeze's end. Then via
// scripts/dev/mutate.sh against tests/e2e/_worldHold.js, one batch from a script file (2026-10-28, load ~200 on 14
// cores), 8 tests collected each time, every RED confirmed against a green baseline, the subject restored byte-identical:
//   M0 identity (a comment edit) -> SURVIVED, first in the batch; M10 identity 2 (another) -> SURVIVED, last
//   M1 THE OLD RULE, a 120 s window whatever the cap -> RED: the three timelines, the release, the cap
//   M2 plausible-wrong, world-hitstop's 90 s default cap -> RED: the three timelines, the release
//   M3 plausible-wrong, world-hitstop's end rule copied (4 frames AND 8 s end the freeze) -> RED: the three timelines,
//      the release
//   M4 the release leaves the freeze in force -> RED: the release
//   M5 frames drawn after the freeze ended are counted -> RED: the cap
//   M6 a lapsed freeze reported as held -> RED: the cap
//   M7 the span read from the release, not from where the freeze ended -> RED: the cap
//   M8 the open bypasses the store's action (hitstopUntil written, no start) -> RED: all six holdWorld cases, the open's
//      "the world clock jumped" among them
//   M9 the longest frame measured from the open, never per frame -> RED: the release, the cap
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installWorldHold } from '../e2e/_worldHold.js';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { worldTimeScale, hitstopForHit } from '../../src/game/hitstop.js';
import { tickWorldClock, worldNow } from '../../src/game/worldClock.js';

/** touch-hold.spec.js's test timeout, which it passes as the cap: the one wall budget the run already has. */
const TEST_MS = 240000;

// [what the spec does, host<->page round trips, fixed wall ms, the real touch whose handled gap it is, the damage of
// each swing that lands at its end (the game's own triggerHitstop), the verdict read it ends with].
const STEPS = [
  { step: 'the setup evaluate returns', rt: 1 },
  { step: 'the health log installed', rt: 1 },
  { step: 'a CDP session', rt: 1 },
  { step: 'aimAt touch-action', rt: 1 },
  { step: 'read: start', rt: 1 },
  { step: 'aim', rt: 1 },
  { step: 'the warm-up: the log cleared, touchStart until the press is handled', rt: 2, hits: [20] },
  { step: 'the warm-up, held to its lift handled', touch: 'warm', hits: [40] },
  { step: 'the warm-up: settle, read', rt: 1, ms: 120 },
  { step: 'the warm-up: the log spliced', rt: 1 },
  { step: 'read: the warm-up stagger; wait', rt: 1, ms: 400 },
  { step: 'a fresh brute; read', rt: 2 },
  { step: 'aim', rt: 1 },
  { step: 'the half-charged CONTROL, held in the page', rt: 1, ms: 492, hits: [20] },
  { step: 'settle; read: the half', rt: 1, ms: 120, verdict: 'half' },
  { step: 'wait; aim; read: before the full hold', rt: 2, ms: 400 },
  { step: 'the full hold: the log cleared, touchStart until the press is handled', rt: 2, hits: [20] },
  { step: 'the full hold, held to its lift handled', touch: 'full', hits: [40] },
  { step: 'settle; read: the full hold', rt: 1, ms: 120, verdict: 'full' },
  { step: 'the log spliced; wait', rt: 1, ms: 400 },
  { step: 'a fresh brute; read; aim', rt: 3 },
  { step: 'the late lift: the log cleared, touchStart until the press is handled', rt: 2, hits: [20] },
  { step: 'the late lift, to its lift handled', touch: 'late' },
  { step: 'settle; read: the late lift', rt: 1, ms: 120, verdict: 'late lift' },
  { step: 'the log spliced; wait', rt: 1, ms: 400 },
  { step: 'aim', rt: 1 },
  { step: 'the late press, in the page (1000 ms stall, 400 ms hold)', rt: 1, ms: 1400, hits: [20, 40] },
  { step: 'settle; read: the late press', rt: 1, ms: 120, verdict: 'late press' },
  { step: 'wait; a fresh brute; read; aim', rt: 3, ms: 400 },
  { step: 'the late press lifted quickly, in the page (1400 ms stall, 100 ms hold)', rt: 1, ms: 1500, hits: [20, 40] },
  { step: 'settle; read: the late press lifted quickly', rt: 1, ms: 120, verdict: 'late press lifted quickly' },
];
const VERDICTS = ['half', 'full', 'late lift', 'late press', 'late press lifted quickly'];
const STEP_RT = STEPS.reduce((n, s) => n + (s.rt || 0), 0);
const FIXED_MS = STEPS.reduce((n, s) => n + (s.ms || 0), 0);
// Round trips outside STEPS but inside entry-to-log: the mob-bridge wait and the setup evaluate up to the freeze
// (1.5), and the release after the last read (1).
const OUTSIDE_RT = 2.5;

// Measured on CI: the entry-to-log time (job log timestamps of the spec's "[touch-hold] entry" and "heavy warm" lines)
// and the three real touches' handled gaps (that line). Frame cadence is assumed (heavy-melee.spec.js: 3-5 fps).
const fitted = ({ entryToLogMs, warm, full, late, frameMs, run }) =>
  ({ run, warm, full, late, frameMs, rtMs: (entryToLogMs - warm - full - late - FIXED_MS) / (STEP_RT + OUTSIDE_RT) });
const MAIN = fitted({ run: 'main 40642071917, shard 7/8, retry #1', entryToLogMs: 152538, warm: 12586, full: 16202, late: 19155, frameMs: 340 });
const PR25 = fitted({ run: 'PR #25 40637517889', entryToLogMs: 59064, warm: 1067, full: 7997, late: 9050, frameMs: 200 });
const HARSH = { run: 'constructed', rtMs: 3500, warm: MAIN.warm, full: MAIN.full, late: MAIN.late, frameMs: 10000 };

let clock;
let queue;
beforeEach(() => {
  clock = 50000; // a page well into its life, so the world clock is far from 0 and a jump in it is visible
  queue = [];
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.stubGlobal('window', { useGameStore });
  vi.stubGlobal('requestAnimationFrame', (cb) => queue.push(cb));
  useGameStore.setState({ hitstopUntil: 0, hitstopStart: 0, hitstopFrozenTotal: 0 });
  tickWorldClock(clock);
  installWorldHold();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Wall time passing in the page with a frame every `frameMs`: each frame runs the rAF callbacks queued before it, then
 *  the world clock's tick (WorldClockTicker runs in the R3F loop's rAF). Returns when the last frame it drew was. */
const pageClock = (frameMs) => {
  let next = clock + frameMs;
  return (ms) => {
    const end = clock + ms;
    let drawnAt = null;
    while (next <= end) {
      clock = next;
      const due = queue.splice(0);
      for (const cb of due) cb(clock);
      tickWorldClock(clock);
      drawnAt = clock;
      next += frameMs;
    }
    clock = end;
    return drawnAt;
  };
};

/** Play the action case from the freeze's opening (`open()`, at the current clock) to its last read. Returns each verdict
 *  read as the spec takes it: is the world frozen (the game's own rule), and where does the world clock stand. */
const play = (tl, open) => {
  const pass = pageClock(tl.frameMs);
  const openedAt = clock;
  open();
  const reads = [];
  for (const s of STEPS) {
    pass((s.rt || 0) * tl.rtMs + (s.ms || 0) + (s.touch ? tl[s.touch] : 0));
    for (const dmg of s.hits || []) useGameStore.getState().triggerHitstop(hitstopForHit(dmg));
    if (s.verdict) {
      reads.push({ verdict: s.verdict, atMs: Math.round(clock - openedAt),
        frozen: worldTimeScale(clock, useGameStore.getState().hitstopUntil) === 0, world: worldNow() });
    }
  }
  return { reads, openedAt, pass, lapsedBy: reads.filter((r) => !r.frozen).map((r) => r.verdict) };
};
const holdWorld = (capMs) => () => window.__e2eHoldWorld({ capMs });

describe('the timelines reproduce what CI saw under the OLD 120 s window (the instrument, before its verdicts)', () => {
  it('the old window held PR #25\'s run whole, and lapsed in main\'s by the late press — the two outcomes CI printed', () => {
    const fast = play(PR25, () => useGameStore.getState().triggerHitstop(120000));
    expect(fast.reads.map((r) => r.verdict)).toEqual(VERDICTS);
    expect(fast.lapsedBy, `PR #25's run: ${JSON.stringify(fast.reads)}`).toEqual([]);
    useGameStore.setState({ hitstopUntil: 0, hitstopStart: 0, hitstopFrozenTotal: 0 });
    const slow = play(MAIN, () => useGameStore.getState().triggerHitstop(120000));
    const at = Object.fromEntries(slow.reads.map((r) => [r.verdict, r]));
    expect(at.half.frozen && at.full.frozen, `main's run: ${JSON.stringify(slow.reads)}`).toBe(true);
    expect(at['late press'].frozen || at['late press lifted quickly'].frozen, `main's run: ${JSON.stringify(slow.reads)}`).toBe(false);
  });

  it('the fitted round trips are what a loaded runner pays, and HARSH fits inside the test\'s own timeout', () => {
    expect(MAIN.rtMs).toBeGreaterThan(2000);
    expect(MAIN.rtMs).toBeLessThan(3000);
    expect(PR25.rtMs).toBeGreaterThan(500);
    expect(PR25.rtMs).toBeLessThan(1200);
    const harshMs = STEP_RT * HARSH.rtMs + FIXED_MS + HARSH.warm + HARSH.full + HARSH.late;
    expect(harshMs).toBeGreaterThan(120000);
    expect(harshMs).toBeLessThan(TEST_MS);
  });
});

describe('holdWorld: the freeze holds until the spec lets go, under the test\'s own timeout', () => {
  for (const tl of [MAIN, PR25, HARSH]) {
    it(`holds through every verdict read of ${tl.run}'s run, the world clock standing where the freeze found it`, () => {
      const { reads, openedAt, lapsedBy } = play(tl, holdWorld(TEST_MS));
      const where = JSON.stringify({ rtMs: Math.round(tl.rtMs), reads });
      expect(reads.map((r) => r.verdict)).toEqual(VERDICTS);
      expect(lapsedBy, `the world freeze ran out by ${lapsedBy[0]} — ${where}`).toEqual([]);
      for (const r of reads) expect(r.world, `the world clock moved by the ${r.verdict} — ${where}`).toBe(openedAt);
      // The game's own hits landed inside it and moved its end nowhere (stackHitstop only extends, and a burst only to
      // start + its cap).
      expect(useGameStore.getState().hitstopUntil).toBe(openedAt + TEST_MS);
    });
  }

  it('release ends it and reports the span and the frames drawn inside it; the world clock carries on from where it stood', () => {
    const { openedAt, pass } = play(MAIN, holdWorld(TEST_MS));
    pass(MAIN.rtMs); // the release's own round trip
    const releasedAt = clock;
    const out = window.__e2eWorldHold.release();
    expect(out).toEqual({ capMs: TEST_MS, heldMs: Math.round(releasedAt - openedAt), lapsed: false,
      frames: Math.floor((releasedAt - openedAt) / MAIN.frameMs), longestFrameMs: MAIN.frameMs });
    const drawnAt = pass(MAIN.frameMs); // the first frame after the release
    expect(drawnAt).toBeGreaterThan(releasedAt);
    expect(worldTimeScale(drawnAt, useGameStore.getState().hitstopUntil), 'the release left the world frozen').toBe(1);
    expect(worldNow(), 'the world clock jumped at the release').toBe(openedAt + (drawnAt - releasedAt));
  });

  it('the cap is real: a freeze that outlives it lapses, and release says so with the span it actually held', () => {
    const pass = pageClock(300);
    const openedAt = clock;
    holdWorld(5000)();
    pass(4900);
    expect(worldTimeScale(clock, useGameStore.getState().hitstopUntil), 'frozen inside the cap').toBe(0);
    pass(100);
    expect(worldTimeScale(clock, useGameStore.getState().hitstopUntil), 'still frozen AT the cap').toBe(1);
    pass(1000);
    // Frames at +300 .. +4800 were drawn inside it (16); the one at +5100, and every one after, outside it.
    expect(window.__e2eWorldHold.release()).toEqual({ capMs: 5000, heldMs: 5000, lapsed: true, frames: 16, longestFrameMs: 300 });
    expect(clock - openedAt).toBe(6000);
  });

  it('opens through the store\'s action: the world clock does not jump when the freeze begins', () => {
    const pass = pageClock(250);
    const openedAt = clock;
    holdWorld(TEST_MS)();
    pass(250);
    expect(worldNow(), 'the world clock jumped at the open (the freeze opened without its start)').toBe(openedAt);
    expect(useGameStore.getState().hitstopStart).toBe(openedAt);
  });
});
