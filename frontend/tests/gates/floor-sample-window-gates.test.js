// HOW LONG THE MOB-FLOOR ZOMBIE IS WATCHED (tests/e2e/_floorSamples.js), and what counts as evidence.
//
// mob-floor.spec.js spawns a zombie under a placed roof and judges every rendered frame after the first worker reply:
// the snap must keep it on the ground, never on the roof. It used to watch for a flat 10 s of wall clock and then demand
// a reply and 2 post-reply samples under the roof, a FRAME count read inside a TIME window. On CI's software renderer
// the page drew nothing for ~9.6 s after the spawn (run 40637608377, shard 5, attempt 2: screencast frames at +0.4 s
// and +10.0 s after the spawn, then +13.0, +14.3, +21.2 s), so the window held 1 or 2 samples and the spec failed
// "the zombie never moved in 1 frames" / "only 1 post-reply samples under the roof, of 2 frames". main failed the same
// way and passed on a retry (995f1da2 run 40615332358, d5375ac1 run 40637429575). No pacing rule was involved: the
// slowest pace a title, panel or blur rule sets is 10 fps (render/canvasPace.js), a 100 ms frame, against the 9.6 s one
// measured (and the player's own cap is the default 60 in the e2e); a pace
// skips canvas draws and never the page's own requestAnimationFrame callbacks, which are what the spec samples; and the
// trace shows the page in play with no panel up.
//
// This drives the rule the way the spec does: a recorder in the page appends one sample per rendered frame, and the
// spec reads what has been recorded every POLL_MS and asks keepSampling whether to go on. The frame timelines are
// synthetic, by construction: CI's (above, to the second), a machine that renders at 60 fps, a renderer that never
// draws again, and a mob that leaves.
//
// WHAT THIS DOES NOT CHECK: that the spec calls these (its own constructed flake does, in its header); whether the snap
// is right (tests/gates/mob-floor-gates and the spec's verdict); how often CI draws (only a CI run measures that).
//
// Mutation-Proof: through scripts/dev/mutate.sh against tests/e2e/_floorSamples.js, 11 tests collected each time,
//   every RED confirmed against a green baseline, the subject byte-identical afterwards. Identity (a comment edit)
//   SURVIVED. All of these went RED:
//   M1 THE OLD RULE — stop at the window whatever was seen (`return under < MIN_UNDER` -> `return false`) -> RED "CI's
//      frame timeline", "twice as slow", "never draws again", "before the first reply", "one post-reply sample"
//   M2 the window floor dropped (stop as soon as the evidence exists) -> RED "a machine that renders", "the mob is gone"
//   M3 the cap dropped -> RED "never draws again"
//   M4 a gone mob ignored -> RED "the mob is gone"
//   M5 pre-reply samples counted as evidence (`samples.slice(replied)` -> `samples`) -> RED "before the first reply"
//   M6 no seam jitter in the column (`Math.floor(m.x + 0.1)` -> `Math.floor(m.x)`) -> RED "seam jitter"
//   M7 MIN_UNDER 2 -> 1 -> RED "one post-reply sample", "CI's frame timeline"
//   M8 WINDOW_MS 10000 -> 5000 -> RED "a machine that renders"
//   M9 one sample past the evidence (`under < MIN_UNDER` -> `under <= MIN_UNDER`) -> RED "CI's frame timeline"
//   M10 colOf reads x for the z column -> RED "seam jitter", "CI's frame timeline"
//   M11 CAP_MS 60000 -> 20000 -> RED "twice as slow"; M12 CAP_MS 60000 -> 150000 -> RED "the cap leaves the spec's own
//      timeout room"
//   M14 the reply threshold 0.01 -> 0.001 m -> RED "a move under 1 cm"
//   SURVIVED, by design: M13 CAP_MS 60000 -> 30000. The criterion is a 2x margin over CI's measured timeline (evidence
//   at 26 s) and a fit inside TEST_BUDGET_MS; any cap from ~26 s to 110 s meets both, so 60 s is a choice, not a fact.
import { describe, it, expect } from 'vitest';
import { WINDOW_MS, CAP_MS, MIN_UNDER, TEST_BUDGET_MS, colOf, floorEvidence, keepSampling } from '../e2e/_floorSamples.js';

const POLL_MS = 250; // what the spec waits between reads of the recorder

// A roofed 7x7 patch centred on an off-origin column, as the spec's site scan returns it.
const SITE = { cx: 17, cz: -9, grounds: {} };
for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) SITE.grounds[`${i},${j}`] = 52;
const SPAWN = { x: SITE.cx + 0.4, y: 52.5, z: SITE.cz + 0.4 }; // where the spec spawns it

/**
 * The spec's loop over a synthetic timeline. `frames` are [{ t, x, y, z }] (a rendered frame's sample, t in ms since the
 * spawn) or { t, gone: true } (the mob left the world: the recorder stops there). Returns when keepSampling first says
 * stop, or { stoppedAt: null } if it never does within `limitMs`.
 */
function watch(frames, limitMs = 10 * CAP_MS) {
  for (let now = 0; now <= limitMs; now += POLL_MS) {
    const samples = [];
    let gone = false;
    for (const f of frames) {
      if (f.t > now) break;
      if (f.gone) { gone = true; break; }
      samples.push({ x: f.x, y: f.y, z: f.z });
    }
    const ev = floorEvidence(samples, SITE);
    if (!keepSampling({ elapsedMs: now, gone, under: ev.under.length })) return { stoppedAt: now, samples, ...ev };
  }
  return { stoppedAt: null };
}

// A zombie at the spawn point until `replyAt`, then walking toward a player off the patch's -x edge at `stepM` a frame.
const walking = (times, replyAt, stepM) => times.map((t) => {
  const k = t < replyAt ? 0 : times.filter((u) => u >= replyAt && u <= t).length;
  return { t, x: SPAWN.x - stepM * k, y: SPAWN.y, z: SPAWN.z };
});

let scenarios = 0;

describe('the mob-floor zombie: how long it is watched', () => {
  it("CI's frame timeline (run 40637608377): watches past the old window until the evidence exists, and no longer", () => {
    scenarios++;
    // The first draw at +0.4 s (at the spawn point, before any reply), then the long frame, then CI's next frames.
    const r = watch(walking([436, 9997, 12983, 14278, 21198], 9997, 0.5));
    // Under the old rule the watch ended at 10 s on 2 samples, 1 of them post-reply: exactly the CI message.
    const old = r.samples.filter((_, i) => [436, 9997, 12983, 14278, 21198][i] < WINDOW_MS);
    expect(floorEvidence(old, SITE).under.length, 'the timeline does not reproduce the CI failure').toBe(1);
    expect(r.stoppedAt, 'stopped before the second post-reply frame arrived').toBeGreaterThanOrEqual(12983);
    expect(r.under.length, 'the verdict would have too few post-reply samples under the roof').toBeGreaterThanOrEqual(MIN_UNDER);
    // ...and it stops at the first read after that frame: it does not wait out the cap on a renderer this slow.
    expect(r.stoppedAt, 'went on reading after the evidence existed').toBeLessThan(12983 + POLL_MS);
  });

  it('a machine that renders (60 fps) is watched for the whole old window, as before — never less', () => {
    scenarios++;
    const times = Array.from({ length: Math.ceil((CAP_MS + 1000) / 16.7) }, (_, i) => Math.round(i * 16.7));
    const r = watch(walking(times, 100, 0.002));
    expect(r.under.length, 'SETUP: the evidence never existed on a 60 fps timeline').toBeGreaterThanOrEqual(MIN_UNDER);
    expect(r.stoppedAt, 'stopped before the 10 s window was out: fewer frames judged than the spec always had').toBeGreaterThanOrEqual(10000);
    expect(r.stoppedAt, 'a machine that has the evidence went on past the window').toBeLessThan(10000 + POLL_MS);
    expect(r.samples.length, 'fewer frames judged than 10 s at 60 fps').toBeGreaterThan(590);
  });

  it("a renderer twice as slow as CI's measured one still reaches the evidence before the cap", () => {
    scenarios++;
    const r = watch(walking([872, 19994, 25966, 28556, 42396], 19994, 0.5));
    expect(r.stoppedAt, 'gave up before a 2x-slower renderer could show the evidence').toBeGreaterThanOrEqual(25966);
    expect(r.under.length).toBeGreaterThanOrEqual(MIN_UNDER);
  });

  it("the cap leaves the spec's own timeout room for a 90 s CI boot, the roof (~30 s) and the teardown (~10 s)", () => {
    scenarios++;
    // The boot figure is the fireball test's (mob-floor.spec.js: "the boot alone can take 90 s on CI"); the roof and
    // teardown are run 40637608377's traces (53-61 s from page open to the spawn, 6 s of coverage teardown), rounded up.
    // Past the timeout Playwright reports a timeout, not the assertion naming the missing evidence.
    expect(90000 + 30000 + CAP_MS + 10000, 'the cap no longer fits the test budget').toBeLessThanOrEqual(TEST_BUDGET_MS);
  });

  it('a renderer that never draws again is given up at the cap, so the spec can say what is missing', () => {
    scenarios++;
    const r = watch([{ t: 436, ...SPAWN }]);
    expect(r.stoppedAt, 'never stopped: the spec would hang to its test timeout').not.toBeNull();
    expect(r.stoppedAt).toBeGreaterThanOrEqual(CAP_MS);
    expect(r.stoppedAt).toBeLessThan(CAP_MS + POLL_MS);
    expect(r.replied, 'a single sample read as a reply').toBe(-1);
  });

  it('the mob is gone: stop at the next read, inside the window', () => {
    scenarios++;
    const r = watch([...walking([400, 800, 1200], 800, 0.3), { t: 3000, gone: true }, { t: 3500, ...SPAWN }]);
    expect(r.stoppedAt, 'went on reading a mob that left the world').toBe(3000);
    expect(r.samples.length).toBe(3);
  });

  it('samples before the first reply are not evidence, however many lie under the roof', () => {
    scenarios++;
    // No reply for 12 s on a renderer drawing every 2 s: six samples at the spawn point, all over the roof.
    const times = [400, 2400, 4400, 6400, 8400, 10400, 12400, 14400, 16400];
    const r = watch(walking(times, 12400, 0.4));
    expect(r.replied, 'the first reply is the 7th sample').toBe(6);
    expect(r.stoppedAt, 'pre-reply samples were counted as evidence: it stopped before the replies came').toBeGreaterThanOrEqual(14400);
    expect(r.under.length).toBe(MIN_UNDER);
  });

  it('a column is read with the probes\' seam jitter, on both axes', () => {
    scenarios++;
    // x = cx + 3.95: floor(x + 0.1) is column cx + 4, off the patch. z likewise, with x on the patch.
    const offX = { x: SITE.cx + 3.95, y: 52.5, z: SITE.cz + 0.4 };
    const offZ = { x: SITE.cx + 0.4, y: 52.5, z: SITE.cz + 3.95 };
    expect(colOf(offX, SITE)).toBe('4,0');
    expect(colOf(offZ, SITE)).toBe('0,4');
    expect(colOf({ x: SITE.cx - 2.95, y: 0, z: SITE.cz + 1.5 }, SITE)).toBe('-3,1');
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
    expect(scenarios, 'a scenario above was skipped').toBe(10);
  });
});
