// TIER-GOVERNOR.SPEC.JS'S OSCILLATION, ITS VERDICT AND ITS TIME BUDGET (tests/e2e/_governorPhases.js), driven against
// the REAL governor (src/render/tierGovernor.js) on a fake page clock.
//
// The spec's phase B used to send 30 signals one Playwright round trip at a time. On CI's software renderer (PR run
// 40637608377, shard 7, the trace) 28 of its 30 governorSignal evaluates took 2.3-8.1 s and each iteration ~3 s more, so the
// "75 s" oscillation took 316 s, its signals ~10.5 s apart, and phase C's frame wait was still running when the 600 s
// test timeout fired. Phases A and B had passed; behind the title the governor recorded no decline in the 98 s it got.
// The SPEC was wrong, not the game. And its minute-window loop (`w = 20; w + 60 <= 75`) never ran.
//
// What this drives: fireOscillation — the function the spec hands to page.evaluate — with a fake `io`, on a page whose
// timers fire late by phase B's measured evaluate durations (a stand-in: how long that page took to get to a call,
// not a measured timer lateness); the real governorDecline/governorIncline at each signal, from the state phase A
// leaves (one decline already, from med); and phaseBVerdict over the tier changes that produces. A governor that never
// settles (the spec's E1, never run in a browser) must FAIL that verdict on that schedule; the real one must pass.
//
// WHAT THIS DOES NOT CHECK: that the spec passes fireOscillation to page.evaluate whole and reads the tier log from its
// t0, or that Playwright's serialisation of the function runs in the page — the spec-to-helper seam, unverified until
// CI runs the pushed sha; how late CI's timers really fire (only a CI run measures that); phase A's and C's verdicts
// (the spec, and tests/gates/tier-governor-gates for the pure rules).
//
// Mutation-Proof: (2026-10-28) through scripts/dev/mutate.sh against tests/e2e/_governorPhases.js, 11 tests collected
//   each run, every RED confirmed against a green baseline, the subject byte-identical afterwards. Identity (a comment
//   edit), first and last in the batch, SURVIVED both times. All 21 of these went RED:
//   THE OLD DEFECTS — G1 the old window bound (`w + 60 <= 75`: no window) -> RED "always one to check" and both
//   real-governor cases (no window, so no pass); G2 the old relative schedule (2.5 s after each signal, whenever it
//   fired) -> RED "ABSOLUTE schedule"; G4 the old 30 signals -> RED "far enough past the re-incline block", "E1 ... 15 s
//   late"; G14 B_CAP_MS 320000 (what the old phase B cost) -> RED "caps fit its timeout"; G12 cFramesFor returns the old
//   fixed 60 -> RED "as many frames as phase A needed".
//   THE SCHEDULE — G5 32 signals; G10 incline first; G11 period 5000 ms; G18 signals up to 2 s early; G19 fired times
//   from the page epoch; G3 the cap check removed.
//   THE VERDICT — G6 a 30 s window (two changes 35 s apart unseen); G7 a change AT 60 s not late; G8 B_SETTLE_S 0 (the
//   governor's own declines counted, the real governor fails); G9 B_SETTLE_S 30.
//   THE BUDGET — G13 C_FRAMES_MIN 40; G15 B_CAP_MS 90000 (one stall cuts the schedule); G16 A_CAP_MS 240000; G20
//   C_CAP_MS 200000; G17 TEST_TIMEOUT_MS 540000.
import { describe, it, expect } from 'vitest';
import {
  B_PERIOD_MS, B_SIGNALS, B_SETTLE_S, B_QUIET_S, B_CAP_MS, A_CAP_MS, C_PACE_MS, C_FRAMES_MIN, C_CAP_MS, TEST_TIMEOUT_MS,
  oscillation, fireOscillation, phaseBVerdict, cFramesFor,
} from '../e2e/_governorPhases.js';
import { createGovernor, governorDecline, governorIncline, REINCLINE_BLOCK_MS } from '../../src/render/tierGovernor.js';

// Phase B's 30 governorSignal evaluate durations in run 40637608377 (s), used as each timer's lateness, cycled.
const CI_LATE_S = [0.1, 3.9, 7.7, 6.8, 4.4, 5.4, 3.6, 4.6, 5.2, 6.3, 0.0, 4.7, 3.1, 5.2, 4.8, 6.2, 8.1, 5.5, 5.3, 4.5,
  7.5, 4.8, 4.0, 4.2, 5.4, 5.3, 4.5, 2.3, 4.1, 6.0];
const ciLate = (k) => CI_LATE_S[k % CI_LATE_S.length] * 1000;
// performance.now() at phase B in that run: ~185 s into the page's life.
const PAGE_T = 185000;

/**
 * Run the oscillation on a fake page. `late(k)` is how late the timer before signal k fires (ms). `step(kind, now)` is
 * the governor's step; it returns the tier to change to, or null. Returns what fireOscillation returned, the tier
 * changes ([{ s, from, to }], s since the phase began), and how many waits it made.
 */
async function runPhaseB({ late = () => 0, step, tier = 'high', capMs = B_CAP_MS }) {
  let clock = PAGE_T;
  let k = 0;
  let waits = 0;
  const changes = [];
  const io = {
    now: () => clock,
    wait: async (ms) => { waits++; if (waits > 10 * B_SIGNALS) throw new Error('the oscillation never ended'); clock += ms + late(k); },
    signal: (kind) => {
      k++;
      const next = step(kind, clock, tier);
      if (next) { changes.push({ t: clock, from: tier, to: next }); tier = next; }
    },
  };
  const out = await fireOscillation({ schedule: oscillation(), capMs }, io);
  return { ...out, waits, changes: changes.map((c) => ({ s: (c.t - out.t0) / 1000, from: c.from, to: c.to })) };
}

// The real governor as GameScene's governorStep calls it, after phase A: one decline (med -> low) ~130 s earlier.
const realGovernor = ({ afterPhaseA = true } = {}) => {
  const g = createGovernor();
  if (afterPhaseA) governorDecline(g, 'med', PAGE_T - 130000);
  return (kind, now, tier) => (kind === 'decline' ? governorDecline(g, tier, now) : governorIncline(g, tier, now));
};
// E1: the settle removed — the governor forgets it settled after every decline.
const neverSettles = ({ afterPhaseA = true } = {}) => {
  const g = createGovernor();
  if (afterPhaseA) { governorDecline(g, 'med', PAGE_T - 130000); g.settled = false; }
  return (kind, now, tier) => {
    if (kind !== 'decline') return governorIncline(g, tier, now);
    const next = governorDecline(g, tier, now);
    g.settled = false;
    return next;
  };
};
const passes = ({ windows, late }) => windows.length > 0 && windows.every((w) => w.n <= 1) && late.length === 0;
const lastS = (r) => (r.fired.length ? r.fired[r.fired.length - 1].s : 0);

let scenarios = 0;

describe('tier-governor phase B: the oscillation, its verdict, and the spec budget', () => {
  it('the schedule: decline first, every 2.5 s, its last incline far enough past the re-incline block to catch a governor that never settled', () => {
    scenarios++;
    const s = oscillation();
    expect(s.length).toBe(B_SIGNALS);
    expect(s.every((e, i) => e.at === i * 2500 && e.kind === (i % 2 === 0 ? 'decline' : 'incline')), 'not decline/incline every 2.5 s').toBe(true);
    const secondDecline = s.filter((e) => e.kind === 'decline')[1].at;
    const lastIncline = s.filter((e) => e.kind === 'incline').at(-1).at;
    // The block runs from the second decline; 15 s of slack for that decline to fire late on a stalled page.
    expect(lastIncline - secondDecline, 'the schedule ends before an unsettled governor could re-incline')
      .toBeGreaterThan(REINCLINE_BLOCK_MS + 15000);
  });

  it("the page fires on an ABSOLUTE schedule: on CI's stalled page every signal fires, none early, the last within one stall of 82.5 s", async () => {
    scenarios++;
    const r = await runPhaseB({ late: ciLate, step: () => null });
    expect(r.fired.length, 'signals were dropped').toBe(B_SIGNALS);
    expect(r.fired.map((f) => f.kind)).toEqual(oscillation().map((e) => e.kind));
    expect(r.fired.every((f, i) => f.s * 1000 >= i * B_PERIOD_MS), 'a signal fired before its offset').toBe(true);
    // A relative schedule (2.5 s after each signal) would add every lateness up: ~250 s here, cut off at the cap.
    expect(lastS(r), 'the lateness accumulated: the schedule is relative, not absolute')
      .toBeLessThanOrEqual(((B_SIGNALS - 1) * B_PERIOD_MS + Math.max(...CI_LATE_S) * 1000) / 1000);
  });

  it('a page too stalled to fire the schedule stops at B_CAP_MS, so the spec can say how many it fired', async () => {
    scenarios++;
    // Every timer a minute late: overdue signals fire together on each wake (the schedule is absolute), until a wake
    // lands past the cap.
    const r = await runPhaseB({ late: () => 60000, step: () => null });
    expect(r.fired.length, 'the cap never stopped it').toBeLessThan(B_SIGNALS);
    expect(r.fired.length, 'stopped before the first signal').toBeGreaterThan(0);
    expect(lastS(r) * 1000).toBeLessThanOrEqual(B_CAP_MS);
  });

  it("the real governor, after phase A, on CI's stalled page: two declines, then settled — the verdict passes", async () => {
    scenarios++;
    const r = await runPhaseB({ late: ciLate, step: realGovernor() });
    expect(r.changes.map((c) => `${c.from}->${c.to}`), 'not the two declines a settling governor makes').toEqual(['high->med', 'med->low']);
    const v = phaseBVerdict(r.changes, lastS(r));
    expect(v.windows.length, 'no minute-window was checked').toBeGreaterThan(0);
    expect(passes(v), `the real governor failed the verdict: ${JSON.stringify(r.changes)}`).toBe(true);
  });

  it('the real governor, fresh, with no lateness: the verdict passes', async () => {
    scenarios++;
    const r = await runPhaseB({ step: realGovernor({ afterPhaseA: false }) });
    expect(passes(phaseBVerdict(r.changes, lastS(r))), JSON.stringify(r.changes)).toBe(true);
  });

  it("E1, a governor that never settles, FAILS the verdict on CI's stalled page", async () => {
    scenarios++;
    const r = await runPhaseB({ late: ciLate, step: neverSettles() });
    const v = phaseBVerdict(r.changes, lastS(r));
    expect(passes(v), `an unsettled governor passed: ${JSON.stringify(r.changes)}`).toBe(false);
  });

  it('E1 still FAILS the verdict with its second decline fired 15 s late, fresh or after phase A', async () => {
    scenarios++;
    for (const afterPhaseA of [true, false]) {
      const r = await runPhaseB({ late: (k) => (k === 2 ? 15000 : 0), step: neverSettles({ afterPhaseA }) });
      expect(passes(phaseBVerdict(r.changes, lastS(r))), `afterPhaseA ${afterPhaseA}: ${JSON.stringify(r.changes)}`).toBe(false);
    }
  });

  it('the minute-windows start at 20 s and run to the last signal, so there is always one to check', () => {
    scenarios++;
    const quiet = phaseBVerdict([], 82.5);
    expect(quiet.windows.length, 'windows from 20 s to 82.5 s every 2.5 s').toBe(26);
    expect(quiet.windows[0].from).toBe(B_SETTLE_S);
    // Two changes 35 s apart after the settle, both before 60 s: only a 60 s window sees them together.
    const two = phaseBVerdict([{ s: 21 }, { s: 56 }], 82.5);
    expect(two.late, 'neither change is after 60 s').toEqual([]);
    expect(Math.max(...two.windows.map((w) => w.n)), 'two changes inside one minute were not seen').toBe(2);
    expect(phaseBVerdict([{ s: 0.1 }, { s: 5 }, { s: 25 }], 82.5).windows.every((w) => w.n <= 1), 'the governor\'s own first 20 s counted').toBe(true);
    expect(phaseBVerdict([{ s: B_QUIET_S }], 82.5).late.length, 'a change at 60 s is late').toBe(1);
    expect(phaseBVerdict([{ s: 59.9 }], 82.5).late.length).toBe(0);
  });

  it('phase C watches as many frames as phase A needed to see its decline, never fewer than its floor', () => {
    scenarios++;
    expect(cFramesFor(46), 'the local decline (46 frames)').toBe(C_FRAMES_MIN);
    expect(cFramesFor(70), "CI's decline (70 frames, run 40637608377): 60 would be fewer than a decline needs").toBe(70);
  });

  it("the spec's caps fit its timeout, so a slow phase fails naming itself and not as 'Test timeout exceeded'", () => {
    scenarios++;
    // The boot: CI's measured 42 s (run 40637608377), rounded up to 90 s as mob-floor's budget does; teardown 10 s.
    // NOT every boot wait at its own cap (bootDev 30 s + the world 90 s + the input gate), which would exceed this.
    expect(90000 + A_CAP_MS + B_CAP_MS + C_PACE_MS + C_CAP_MS + 10000, 'the phase caps overrun the test timeout')
      .toBeLessThanOrEqual(TEST_TIMEOUT_MS);
    // And phase B's cap leaves its last signal room for one CI-sized stall (10.7 s, that run's longest in phase B).
    expect(B_CAP_MS, 'the cap can cut the schedule short on one stall').toBeGreaterThanOrEqual((B_SIGNALS - 1) * B_PERIOD_MS + 10700);
  });

  it('every scenario ran', () => {
    expect(scenarios, 'a scenario above was skipped').toBe(10);
  });
});
