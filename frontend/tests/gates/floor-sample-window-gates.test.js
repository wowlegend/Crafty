// HOW LONG THE MOB-FLOOR ZOMBIE IS WATCHED (tests/e2e/_floorSamples.js), and what counts as evidence.
//
// mob-floor.spec.js spawns a zombie under a placed roof and judges every sample after the first worker reply: the snap
// must keep it on the ground, never on the roof. It used to watch for a flat 10 s of wall clock and then demand a reply
// and 2 post-reply samples under the roof, a FRAME count read inside a TIME window. What CI measured (run 40637608377,
// shard 5, both traces): the old in-page loop, one sample per requestAnimationFrame callback, ran 10.04 s and 10.05 s and
// returned 2 samples and 1. So in the ~10 s after spawnMob the page ran at most ONE rAF callback, while in the retry the
// screencast shows compositor frames at +0.44-0.51 s after the spawn: an episodic main-thread stall (inferred: rAF
// stopped and the compositor did not), not a slow steady frame rate. Its cause is unmeasured. main failed the same way
// on a first attempt and passed on a retry (995f1da2 run 40615332358, d5375ac1 run 40637429575). No pacing rule was
// involved: the slowest pace a title, panel or blur rule sets is 10 fps (render/canvasPace.js), a 100 ms frame, against
// the ~10 s measured; a pace skips canvas draws and never the page's own rAF callbacks, which are what the spec samples;
// and the trace shows the page in play with no panel up.
//
// THE WHOLE WATCH IS DRIVEN HERE, not only its stop rule: watchUntilEvidence, the poll loop the spec calls, runs on a fake
// clock that starts at a Date.now()-sized epoch, with a fake recorder that returns the samples taken by each read's
// time. The two CI scenarios are the MEASURED shapes — one rAF callback ~10 s after the spawn (the retry), or one early
// and the next ~10 s later (the first attempt) — and each is checked to reproduce its CI message under the old flat
// window. What came AFTER the stall was not measured: those scenarios continue on the screencast's later timestamps,
// which are compositor frames standing in for an unmeasured rAF cadence. The rest are synthetic by construction: a
// machine that renders at 60 fps, a stall twice as long, a renderer that never runs again, a mob that leaves.
//
// WHAT THIS DOES NOT CHECK: that the spec supplies the watch's I/O right — t0 taken right after the spawn, this test's
// own site, the recorder it installed. That spec-to-helper seam is unverified until CI runs the pushed sha. Nor whether
// the snap is right (tests/gates/mob-floor-gates and the spec's verdict), how often CI runs rAF callbacks (only a CI run
// measures that), or whether a sample is a DRAWN frame (it is a rAF callback; under a 30 or 10 fps pace several
// callbacks can share one drawn frame).
//
// Mutation-Proof: (2026-10-28) through scripts/dev/mutate.sh against tests/e2e/_floorSamples.js, 16 tests collected
//   each time, every RED confirmed against a green baseline, the subject byte-identical afterwards. Identity (a comment
//   edit), run first and last in the batch, SURVIVED both times. All 26 of these went RED:
//   THE WATCH LOOP — L1 THE OLD RULE back in the loop (`elapsedMs >= 10000 || rec.gone`) -> RED in 7 tests incl. both
//   CI scenarios; L2 every sample counted (`under: rec.samples.length`); L3 elapsed from the epoch, not the watch's
//   start; L4 a gone mob ignored; L5 sleeps 4x the poll; L6 never sleeps.
//   THE RULE — M1 the old rule in keepSampling (`return false` past the window); M2 the window floor dropped; M3 the cap
//   out of reach; N2 a gone mob honoured only with complete evidence; N2b a gone mob honoured only inside the window;
//   M9 one sample past the evidence (`<=`); M7 MIN_UNDER 1; M8 WINDOW_MS 5000; M11 CAP_MS 20000; M12 CAP_MS 150000
//   (the budget fit); N32 TEST_BUDGET_MS 600000 and N32b 300000 (the upper bound).
//   THE EVIDENCE — M5 pre-reply samples counted; N1 a y-only change counted as the reply (the Math.hypot gains y); M14
//   the reply threshold 0.001 m; colOf inlined with a 0.2 jitter (N27), a 0.12 one (N28: only the sweep against cellOf
//   sees it, the .85/.92 pins do not), no jitter (M6), and x read for the z column (M10).
//   SURVIVED, by design: M13 CAP_MS 60000 -> 30000. The criterion is a margin over the measured shapes (evidence at
//   ~14 s, or ~29 s for a stall twice as long) and a fit inside TEST_BUDGET_MS; any cap from ~29 s to 110 s meets both,
//   so 60 s is a choice, not a fact.
import { describe, it, expect } from 'vitest';
import {
  WINDOW_MS, CAP_MS, MIN_UNDER, TEST_BUDGET_MS, POLL_MS, colOf, floorEvidence, keepSampling, watchUntilEvidence,
} from '../e2e/_floorSamples.js';
import { cellOf } from '../../src/game/localPath.js';

// A roofed 7x7 patch centred on an off-origin column, as the spec's site scan returns it.
const SITE = { cx: 17, cz: -9, grounds: {} };
for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) SITE.grounds[`${i},${j}`] = 52;
const SPAWN = { x: SITE.cx + 0.4, y: 52.5, z: SITE.cz + 0.4 }; // where the spec spawns it

// The fake clock starts where Date.now() does, so a watch that measured from the epoch instead of its own start would
// read ~1.7e12 ms elapsed and stop on its first read.
const EPOCH = 1761600000000;
// Reads after which the harness calls the watch hung: ten caps' worth at the poll interval.
const READ_LIMIT = Math.ceil((10 * CAP_MS) / POLL_MS);

/**
 * watchUntilEvidence over a synthetic timeline. `frames` are [{ t, x, y, z }] (a rAF callback's sample, t in ms since
 * the spawn) or { t, gone: true } (the mob left the world: the recorder stops there). Returns where the watch stopped
 * (its own elapsedMs, and the fake clock's), what it last read, and how many reads it made; { stoppedAt: null } if it
 * never stops within READ_LIMIT reads.
 */
async function watch(frames) {
  let clock = EPOCH;
  let reads = 0;
  const read = async () => {
    reads++;
    if (reads > READ_LIMIT) throw new Error('NEVER_STOPPED');
    const samples = [];
    let gone = false;
    for (const f of frames) {
      if (EPOCH + f.t > clock) break;
      if (f.gone) { gone = true; break; }
      samples.push({ x: f.x, y: f.y, z: f.z });
    }
    return { samples, gone };
  };
  const now = () => clock;
  const sleep = async (ms) => { clock += ms; };
  try {
    const { rec, elapsedMs } = await watchUntilEvidence({ read, now, sleep, site: SITE });
    return { stoppedAt: elapsedMs, clockAt: clock - EPOCH, reads, samples: rec.samples, gone: rec.gone, ...floorEvidence(rec.samples, SITE) };
  } catch (e) {
    if (e.message === 'NEVER_STOPPED') return { stoppedAt: null, reads };
    throw e;
  }
}

// The OLD spec's in-page loop, `while (now - t0 < 10000) { await frame(); push }`: every sample up to and including the
// first one taken at or after 10 s. The 10 s is the old spec's literal, not WINDOW_MS: this models history.
const oldFlatWindow = (frames) => {
  const out = [];
  for (const f of frames) {
    if (f.gone) break;
    out.push({ x: f.x, y: f.y, z: f.z });
    if (f.t >= 10000) break;
  }
  return out;
};

// A zombie at the spawn point until `replyAt`, then walking toward a player off the patch's -x edge at `stepM` a sample.
const walking = (times, replyAt, stepM) => times.map((t) => {
  const k = t < replyAt ? 0 : times.filter((u) => u >= replyAt && u <= t).length;
  return { t, x: SPAWN.x - stepM * k, y: SPAWN.y, z: SPAWN.z };
});

// What .github/workflows/ci.yml gives one e2e shard (`timeout-minutes: 25`) and how many attempts playwright.config.js
// grants a failing test on CI (`retries: process.env.CI ? 2 : 0`). Copied, not read: a gate here that reads a file
// joins the frozen source-grep population (tests/gates/.source-grep-ledger.json), which may only fall.
const SHARD_TIMEOUT_MS = 25 * 60000;
const CI_ATTEMPTS = 3;

let scenarios = 0;

describe('the mob-floor zombie: how long it is watched', () => {
  it("CI's retry (run 40637608377): the first rAF callback ~10 s after the spawn — watched on until the evidence exists", async () => {
    scenarios++;
    // Measured: one sample, at the spawn point, from a loop that ran 10.05 s. After it, the screencast's frames stand in.
    const frames = walking([10040, 12983, 14278, 21198], 12983, 0.5);
    const old = floorEvidence(oldFlatWindow(frames), SITE);
    expect([oldFlatWindow(frames).length, old.replied], 'the scenario does not reproduce "the zombie never moved in 1 frames"').toEqual([1, -1]);
    const r = await watch(frames);
    expect(r.stoppedAt, 'stopped before the second post-reply sample arrived').toBeGreaterThanOrEqual(14278);
    expect(r.under.length, 'the verdict would have too few post-reply samples under the roof').toBeGreaterThanOrEqual(MIN_UNDER);
    // ...and it stops at the first read after that sample: it does not wait out the cap on a renderer this slow.
    expect(r.stoppedAt, 'went on reading after the evidence existed').toBeLessThan(14278 + 250);
  });

  it("CI's first attempt: one rAF callback early, the next ~10 s later — watched on until the evidence exists", async () => {
    scenarios++;
    // Measured: two samples from a loop that ran 10.04 s, the second moved (x 5.4 -> 4.65). When the first came inside
    // those 10 s is not measured (400 ms here); after them, that attempt's screencast frames stand in.
    const frames = walking([400, 10040, 12743, 14037, 22332], 10040, 0.75);
    const old = floorEvidence(oldFlatWindow(frames), SITE);
    expect([oldFlatWindow(frames).length, old.replied, old.under.length],
      'the scenario does not reproduce "only 1 post-reply samples under the roof, of 2 frames"').toEqual([2, 1, 1]);
    const r = await watch(frames);
    expect(r.stoppedAt, 'stopped before the second post-reply sample arrived').toBeGreaterThanOrEqual(12743);
    expect(r.under.length).toBeGreaterThanOrEqual(MIN_UNDER);
    expect(r.stoppedAt, 'went on reading after the evidence existed').toBeLessThan(12743 + 250);
  });

  it('a machine that renders (60 fps) is watched for the whole old window, as before — never less', async () => {
    scenarios++;
    const times = Array.from({ length: Math.ceil((CAP_MS + 1000) / 16.7) }, (_, i) => Math.round(i * 16.7));
    const r = await watch(walking(times, 100, 0.002));
    expect(r.under.length, 'SETUP: the evidence never existed on a 60 fps timeline').toBeGreaterThanOrEqual(MIN_UNDER);
    expect(r.stoppedAt, 'stopped before the 10 s window was out: fewer frames judged than the spec always had').toBeGreaterThanOrEqual(10000);
    expect(r.stoppedAt, 'a machine that has the evidence went on past the window').toBeLessThan(10000 + 250);
    expect(r.samples.length, 'fewer frames judged than 10 s at 60 fps').toBeGreaterThan(590);
    expect(r.stoppedAt, 'the watch reported a different elapsed time than its own clock ran').toBe(r.clockAt);
  });

  it("a stall twice as long as CI's still reaches the evidence before the cap", async () => {
    scenarios++;
    const r = await watch(walking([20080, 25966, 28556, 42396], 25966, 0.5));
    expect(r.stoppedAt, 'gave up before the evidence of a 2x-longer stall could arrive').toBeGreaterThanOrEqual(28556);
    expect(r.under.length).toBeGreaterThanOrEqual(MIN_UNDER);
  });

  it("the cap fits the test budget after CI's observed pre-spawn time (53-61 s, rounded up to a 90 s boot + 30 s roof)", () => {
    scenarios++;
    // Run 40637608377's traces: 53-61 s from page open to the spawn; ~6 s of coverage teardown, rounded up to 10.
    // NOT the worst case: every pre-spawn wait at its own cap (bootDev 30 s, the world 90 s, GameMethods 60 s, the roof
    // 30 s, ...) sums past TEST_BUDGET_MS, and then Playwright reports a timeout instead of the missing evidence.
    expect(90000 + 30000 + CAP_MS + 10000, 'the cap no longer fits the test budget').toBeLessThanOrEqual(TEST_BUDGET_MS);
  });

  it("the test budget is bounded above: CI's three attempts fit in half a 25-minute shard", () => {
    scenarios++;
    // Half, because the spec's other test (the fireball, 240 s) can take its own three attempts in the same shard. Past
    // the shard's timeout the job ends `cancelled` and every verdict in it is lost.
    expect(CI_ATTEMPTS * TEST_BUDGET_MS, `${CI_ATTEMPTS} attempts of ${TEST_BUDGET_MS} ms overrun half the shard`)
      .toBeLessThanOrEqual(SHARD_TIMEOUT_MS / 2);
  });

  it('a renderer that never runs again is given up at the cap, so the spec can say what is missing', async () => {
    scenarios++;
    const r = await watch([{ t: 436, ...SPAWN }]);
    expect(r.stoppedAt, 'never stopped: the spec would hang to its test timeout').not.toBeNull();
    expect(r.stoppedAt).toBeGreaterThanOrEqual(CAP_MS);
    expect(r.stoppedAt).toBeLessThan(CAP_MS + 250);
    expect(r.replied, 'a single sample read as a reply').toBe(-1);
  });

  it('the mob is gone with its evidence complete: stop at the next read, inside the window', async () => {
    scenarios++;
    const r = await watch([...walking([400, 800, 1200], 800, 0.3), { t: 3000, gone: true }, { t: 3500, ...SPAWN }]);
    expect(r.stoppedAt, 'went on reading a mob that left the world').toBe(3000);
    expect(r.samples.length).toBe(3);
    expect(r.reads, 'the watch did not read the recorder every 250 ms').toBe(3000 / 250 + 1);
  });

  it('the mob is gone before any reply: stop at the next read, not at the cap', async () => {
    scenarios++;
    const r = await watch([{ t: 400, ...SPAWN }, { t: 3000, gone: true }]);
    expect(r.stoppedAt, 'a mob that left with no evidence was watched on').toBe(3000);
    expect([r.gone, r.replied, r.under.length]).toEqual([true, -1, 0]);
  });

  it('the mob is gone past the window with one post-reply sample: stop at the next read, not at the cap', async () => {
    scenarios++;
    const r = await watch([...walking([400, 10040], 10040, 0.5), { t: 12000, gone: true }]);
    expect(r.stoppedAt, 'a mob that left after the window, evidence partial, was watched on').toBe(12000);
    expect([r.gone, r.under.length]).toEqual([true, 1]);
  });

  it('samples before the first reply are not evidence, however many lie under the roof', async () => {
    scenarios++;
    // No reply for 12 s on a renderer running every 2 s: six samples at the spawn point, all over the roof.
    const times = [400, 2400, 4400, 6400, 8400, 10400, 12400, 14400, 16400];
    const r = await watch(walking(times, 12400, 0.4));
    expect(r.replied, 'the first reply is the 7th sample').toBe(6);
    expect(r.stoppedAt, 'pre-reply samples were counted as evidence: it stopped before the replies came').toBeGreaterThanOrEqual(14400);
    expect(r.under.length).toBe(MIN_UNDER);
  });

  it('a change in y alone is not a reply: the zombie settling at the spawn point is not evidence', async () => {
    scenarios++;
    // Settled 52.5 -> 52.0 before any worker reply moved it in x/z.
    const settled = { ...SPAWN, y: 52.0 };
    const ev = floorEvidence([SPAWN, settled, settled], SITE);
    expect([ev.replied, ev.under.length], 'a y-only change read as the reply').toEqual([-1, 0]);
    expect(floorEvidence([SPAWN, settled, settled, { ...settled, x: settled.x - 0.3 }], SITE).replied).toBe(3);
    // Over the watch: settled from 2.4 s, never moved in x/z — it must run to the cap, never stop at the window.
    const times = [400, 2400, 4400, 6400, 8400, 10400, 12400];
    const r = await watch(times.map((t) => ({ t, ...(t < 2400 ? SPAWN : settled) })));
    expect(r.stoppedAt, 'a y-only settle stopped the watch as if it were evidence').toBeGreaterThanOrEqual(CAP_MS);
  });

  it("a column is read with the game's own column function (src/game/localPath.js cellOf), on both axes", () => {
    scenarios++;
    // x = cx + 3.95: floor(x + 0.1) is column cx + 4, off the patch. z likewise, with x on the patch.
    const offX = { x: SITE.cx + 3.95, y: 52.5, z: SITE.cz + 0.4 };
    const offZ = { x: SITE.cx + 0.4, y: 52.5, z: SITE.cz + 3.95 };
    expect(colOf(offX, SITE)).toBe('4,0');
    expect(colOf(offZ, SITE)).toBe('0,4');
    expect(colOf({ x: SITE.cx - 2.95, y: 0, z: SITE.cz + 1.5 }, SITE)).toBe('-3,1');
    // The jitter's size, pinned: at fraction .85 a 0.1 jitter keeps the column (a 0.2 one would not); at .92 it moves
    // to the next (no jitter would not).
    expect(colOf({ x: SITE.cx + 0.85, y: 0, z: SITE.cz + 0.92 }, SITE)).toBe('0,1');
    expect(colOf({ x: SITE.cx + 0.92, y: 0, z: SITE.cz + 0.85 }, SITE)).toBe('1,0');
    // Tied to the game: every hundredth of a block across two columns, on both axes, agrees with cellOf.
    let swept = 0;
    for (let k = -100; k < 100; k++) {
      const f = k / 100;
      const m = { x: SITE.cx + f, y: 0, z: SITE.cz - f };
      expect(colOf(m, SITE), `fraction ${f}`).toBe(`${cellOf(m.x, SITE.cx)},${cellOf(m.z, SITE.cz)}`);
      swept++;
    }
    expect(swept).toBe(200);
    const ev = floorEvidence([SPAWN, offX, offZ, { ...SPAWN, x: SPAWN.x + 0.5 }], SITE);
    expect(ev.replied).toBe(1);
    expect(ev.under.length, 'a sample off the patch counted as under the roof').toBe(1);
  });

  it('one post-reply sample under the roof is not enough: past the window it keeps watching', () => {
    scenarios++;
    expect(keepSampling({ elapsedMs: WINDOW_MS + 5000, gone: false, under: 1 })).toBe(true);
    expect(keepSampling({ elapsedMs: WINDOW_MS + 5000, gone: false, under: 0 })).toBe(true);
    expect(keepSampling({ elapsedMs: WINDOW_MS + 5000, gone: false, under: 2 })).toBe(false);
  });

  it('a move under 1 cm is not a reply (jitter)', () => {
    scenarios++;
    const ev = floorEvidence([SPAWN, { ...SPAWN, x: SPAWN.x + 0.005 }, { ...SPAWN, z: SPAWN.z + 0.02 }], SITE);
    expect(ev.replied).toBe(2);
  });

  it('every scenario ran', () => {
    expect(scenarios, 'a scenario above was skipped').toBe(15);
  });
});
