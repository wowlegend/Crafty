// POST-FX-ONCE.SPEC.JS'S STEP WALK AND ITS TIME BUDGET (tests/e2e/_postFxWalk.js), driven on a fake page.
//
// THE DEFECT THIS REPLACES (PR CI run 40652010997, shard 6, the three traces). The spec took every step as Playwright
// round trips: an evaluate of setQualityTier, waitForTimeout(700), an evaluate of readPostFx. On CI's software renderer
// those cost seconds (setTier 2.9-3.5 s mean, the 700 ms wait 3.1-3.5 s, readPostFx 7.5-8.8 s mean and up to 14.0 s), so
// a measured step took ~14 s, the warm-up ended at 132-146 s, and the 300 s timeout fired with 11 or 12 of the 20 steps
// read, three attempts of three, naming nothing. Every read those attempts did get (37, the three warm reads among them) showed the
// constructions flat and the GPU textures at 50, with N8AO off at `low` and on at `med`/`high`: the game did nothing
// wrong that the run could see. The SPEC ran out of time.
//
// What this drives: walkPostFx — the function the spec hands to page.evaluate — with a fake `io`, on a page whose R3F
// frames take a given time, the REAL tier table (src/render/quality.js) deciding what the driver applies. Two pages:
// the built-once wiring (nothing constructed), and E1 (`withAO={q.ao}` in GameScene: N8AO built again at every rise of
// `ao`). In the fake, React commits the R3F root `commitFrames` frames after a tier change, rendering the store as it
// is THEN (steps applied faster than that coalesce, as React's would), the construction is visible from that commit, and
// its render targets are allocated by the frame after it. The walk covers a commit up to STEP_FRAMES frames late. The walk must let E1 show on a CI-slow page AND a fast one,
// or the spec's assertions could pass on a walk that never let a step be drawn.
//
// WHAT THIS DOES NOT CHECK: that the spec hands walkPostFx to page.evaluate whole and reads `warm`, `toggles` and `after`
// from what it returns — the spec-to-helper seam, unverified until CI runs the pushed sha; that readFrameloop's count is
// one per R3F frame (FrameCap.jsx says so; tier-governor's phase A reads the same count); how many frames React really
// takes to commit after a tier step (the model's 1-2 is an assumption, read from how R3F schedules its root — a task
// after the store change — not measured); how long CI's frames are during THIS walk (the CI-shaped page is a stand-in from tier-governor's phase A in
// run 40652010997, 68 frames in 122.9 s at med, and the 3 s added to a tier step's first frame is unmeasured); E1 in a
// browser (the spec's own header lists it as not yet run).
//
// Mutation-Proof: (2026-10-28) through scripts/dev/mutate.sh against tests/e2e/_postFxWalk.js, 8 tests collected each
//   run, every RED confirmed against a green baseline, the subject byte-identical afterwards. Identity (a comment edit)
//   SURVIVED four times: first and last in the batch, and either side of W18's re-run. All 20 of these went RED:
//   THE OLD DEFECT — W1 the wait wall-clock only, the old waitForTimeout's shape -> RED (CI-slow page, E1 on it, the
//   frame-less page); W13 TEST_TIMEOUT_MS 300000, the old value -> RED ("the walk cap overruns").
//   THE FRAMES — W2 counted from the page's epoch; W3 STEP_FRAMES 1; W4 one frame short in the loop -> RED (E1 on the
//   CI-slow page: its rise coalesces away or its targets are read before they are drawn).
//   THE FLOORS AND THE CAP — W5 the time floor dropped; W6 the wait loop's cap removed; W7 a capped step counted done;
//   W8 the SETUP refusal removed; W9 the cap measured per step -> RED; W10 WALK_CAP_MS 600000, W11 300000, W12
//   TEST_TIMEOUT_MS 600000 -> RED (the budget).
//   THE PLAN — W14 a flip every fourth step; W15 midnight and noon swapped; W16 the final at med; W17 the warm-up's last
//   high dropped; W19 19 measured steps; W20 the step floor halved; W18 a read labelled with the plan index -> RED.
//   W18's first run returned COULD NOT CHECK (its baseline went red once, cause not captured: mutate.sh deletes its
//   output, at load ~200-300); the clean gate then passed 6 of 6, and W18's re-run went RED on a green baseline.
import { describe, it, expect } from 'vitest';
import {
  STEP_FRAMES, WALK_CAP_MS, WAKE_MS, TEST_TIMEOUT_MS, MEASURED_STEPS, NOON, MIDNIGHT, TIER_CYCLE,
  postFxPlan, walkPostFx,
} from '../e2e/_postFxWalk.js';
import { TIERS } from '../../src/render/quality.js';

// performance.now() when the walk starts on CI: ~55 s into the page's life (the boot and the 3 s settle, run 40652010997).
const PAGE_T = 55000;
// tier-governor's phase A in run 40652010997: 68 frames in 122.9 s at `med`.
const CI_FRAME_MS = 1800;
// A tier step's first frame re-sizes the shadow map and the composer at the new pixel ratio: unmeasured, so generous.
const CI_STEP_COST_MS = 3000;
// THE REQUIREMENT, stated here and not read from the helper (a gate that asserts the helper's own constant agrees with
// any value of it): a step's effect must be read even when its commit lands two frames after it — frame 1 draws the
// step, React commits the R3F root in a task after it, frame 2 draws what that commit mounted.
const COMMIT_WITHIN = 2;
const sunUp = (time) => time > 0.25 && time < 0.75;

/**
 * A fake page. R3F frames are drawn back to back, `frameMs` each, plus `stepCostMs` on the first frame after a tier
 * change. Each frame draws the store's tier (PostTierDriver) and the horizon as published by the frame before
 * (Atmosphere publishes it from its own frame). With `e1`, React commits `commitFrames` frames after a tier change,
 * rendering the store's tier at that moment, and builds N8AO again whenever that rendering turns `ao` on. wake(ms) returns
 * at the next frame's end or after `ms`, whichever is first — the page's wake races a requestAnimationFrame with a timeout.
 */
function fakePage({ frameMs = 16, stepCostMs = 0, e1 = false, commitFrames = 1, noFrames = false, onApply } = {}) {
  let clock = PAGE_T;
  let frames = 0;
  let nextFrameAt = clock + frameMs;
  const store = { tier: 'low', time: NOON };
  let horizonUp = sunUp(store.time);
  let horizonDue = null;
  const drawn = { ao: TIERS.low.ao, rays: false, mip: TIERS.low.bloomMipmap };
  let commitsDue = [];
  let committedAo = TIERS.low.ao;
  const rebuilds = []; // the frame count at each E1 construction
  let wakes = 0; // a walk that never ends must fail here, not spin the microtask queue forever
  const drawFrame = () => {
    frames += 1;
    const q = TIERS[store.tier];
    drawn.ao = q.ao;
    drawn.rays = q.godRays && horizonUp;
    drawn.mip = q.bloomMipmap;
    if (horizonDue !== null) { horizonUp = horizonDue; horizonDue = null; }
    if (commitsDue.some((d) => d <= frames)) {
      commitsDue = commitsDue.filter((d) => d > frames);
      const ao = TIERS[store.tier].ao;
      if (ao && !committedAo) rebuilds.push(frames);
      committedAo = ao;
    }
  };
  return {
    now: () => clock,
    wake: async (ms) => {
      if (++wakes > 100000) throw new Error('the walk never ended');
      if (noFrames || nextFrameAt > clock + ms) { clock += ms; return; }
      clock = nextFrameAt;
      drawFrame();
      nextFrameAt = clock + frameMs;
    },
    frames: () => frames,
    apply: (step) => {
      if (onApply) onApply(step, { clock, frames });
      if (step.time !== undefined && sunUp(step.time) !== sunUp(store.time)) horizonDue = sunUp(step.time);
      if (step.time !== undefined) store.time = step.time;
      if (step.tier !== undefined) {
        if (e1) commitsDue.push(frames + commitFrames);
        if (step.tier !== store.tier) nextFrameAt += stepCostMs; // the frame after the step pays for it
        store.tier = step.tier;
      }
    },
    read: () => ({
      builds: { bloom: 2, godRays: 1, n8ao: 2 + rebuilds.length },
      n8ao: drawn.ao, godRays: drawn.rays, bloomMipmap: drawn.mip,
      textures: 50 + 3 * rebuilds.filter((f) => frames >= f + 1).length,
      programs: 117,
    }),
  };
}

const walk = (page, capMs = WALK_CAP_MS) => walkPostFx({ plan: postFxPlan(), frames: STEP_FRAMES, capMs, wakeMs: WAKE_MS }, page);

/** What the spec derives from the walk, as it derives it: warm, the per-step toggles, after. */
function specView(w) {
  const warm = w.reads.find((x) => x.kind === 'warm').r;
  const after = w.reads.find((x) => x.kind === 'after').r;
  const toggles = w.reads.filter((x) => x.kind === 'step')
    .map(({ i, r }) => `${TIER_CYCLE[i % 3]}:ao=${r.n8ao},rays=${r.godRays},mip=${r.bloomMipmap}`);
  return { warm, after, toggles };
}
/** The spec's own assertions, as a verdict: true when every one of them would pass. */
function specPasses({ warm, after, toggles }) {
  return toggles.some((t) => t.startsWith('low:ao=false')) && toggles.some((t) => t.startsWith('med:ao=true'))
    && after.builds.bloom === warm.builds.bloom && after.builds.n8ao === warm.builds.n8ao
    && after.builds.godRays === warm.builds.godRays && after.textures - warm.textures <= 6;
}

let scenarios = 0;

describe('post-fx-once: the step walk, what it lets the page draw, and the spec budget', () => {
  it("the plan is the old spec's sequence: a 5-step, 2-flip warm-up, 20 tier steps with 4 flips, then noon at high", () => {
    scenarios++;
    const want = [];
    for (const tier of ['low', 'med', 'high', 'low', 'high']) want.push({ tier, minMs: 1200 });
    want.push({ time: 0, minMs: 1500 });
    want.push({ time: 0.5, minMs: 1500, read: 'warm' });
    for (let i = 0; i < 20; i++) {
      const tier = ['low', 'med', 'high'][i % 3];
      if (i % 5 === 4) {
        want.push({ tier, minMs: 700 });
        want.push({ time: i % 10 === 4 ? 0 : 0.5, minMs: 900, read: 'step', i });
      } else {
        want.push({ tier, minMs: 700, read: 'step', i });
      }
    }
    want.push({ time: 0.5, tier: 'high', minMs: 2500, read: 'after' });
    expect(postFxPlan()).toEqual(want);
    expect([MEASURED_STEPS, MIDNIGHT, NOON], 'the title says 20; setTimeOfDay: midnight 0, noon 0.5').toEqual([20, 0, 0.5]);
    expect(TIER_CYCLE).toEqual(['low', 'med', 'high']);
  });

  it('on a CI-slow page every step is applied, each waits for its frames and its floor, and the walk ends inside the cap', async () => {
    scenarios++;
    const applied = [];
    const page = fakePage({ frameMs: CI_FRAME_MS, stepCostMs: CI_STEP_COST_MS, onApply: (s, at) => applied.push(at) });
    const w = await walk(page);
    const plan = postFxPlan();
    expect(w.capped, 'the cap stopped a walk the CI-slow page can finish').toBe(false);
    expect([w.done, w.steps.length, applied.length], 'steps not applied').toEqual([plan.length, plan.length, plan.length]);
    for (const s of w.steps) {
      expect(s.frames, `step ${s.k} was read after ${s.frames} frames`).toBeGreaterThanOrEqual(COMMIT_WITHIN);
      expect(s.ms, `step ${s.k} lasted ${s.ms} ms, under its ${plan[s.k].minMs}`).toBeGreaterThanOrEqual(plan[s.k].minMs);
    }
    // Each step is applied only once the one before has had its frames: counted on the page, from that step.
    for (let k = 1; k < applied.length; k++) {
      expect(applied[k].frames - applied[k - 1].frames, `step ${k} came too soon after step ${k - 1}`).toBeGreaterThanOrEqual(COMMIT_WITHIN);
    }
    // ~190 s here: 25 tier changes at 2 frames plus the 3 s, 7 steps at 2 frames.
    expect(w.ms, 'the CI-slow walk ran past its cap').toBeLessThanOrEqual(WALK_CAP_MS);
    const v = specView(w);
    expect(specPasses(v), `the built-once page failed the spec's assertions: ${JSON.stringify(v)}`).toBe(true);
    expect(v.toggles.filter((t) => t.startsWith('low:ao=false')).length, 'a low step was read before it was drawn').toBe(7);
    expect(v.toggles.filter((t) => t.startsWith('med:ao=true')).length, 'a med step was read before it was drawn').toBe(7);
    expect(w.reads.map((x) => x.kind).join(','), 'the reads').toBe(['warm', ...Array(20).fill('step'), 'after'].join(','));
  });

  // THE LIMIT: a commit later than STEP_FRAMES frames renders the NEXT step's tier, so a step lasting STEP_FRAMES
  // frames can coalesce away (the `low` before a `med`, and with it the rise). That is the bound STEP_FRAMES sets; it is
  // stated here, not gated, since a larger STEP_FRAMES is slower and not wrong.
  it('E1 (N8AO rebuilt at every rise of ao) FAILS the spec on a CI-slow page, its commit 1 or 2 frames after the step', async () => {
    scenarios++;
    for (const commitFrames of [1, COMMIT_WITHIN]) {
      const w = await walk(fakePage({ frameMs: CI_FRAME_MS, stepCostMs: CI_STEP_COST_MS, e1: true, commitFrames }));
      const v = specView(w);
      // 7 rises in the measured steps (low -> med at i = 1, 4, ..., 19), none in the final step (med -> high).
      expect(v.after.builds.n8ao - v.warm.builds.n8ao, `commit ${commitFrames} frames late: E1's rebuilds were not read`).toBe(7);
      expect(v.after.textures - v.warm.textures, `commit ${commitFrames} frames late: E1's render targets were not read`).toBe(21);
      expect(specPasses(v), `E1 passed: ${JSON.stringify(v)}`).toBe(false);
    }
  });

  it('E1 FAILS the spec on a fast page too, and the built-once page passes there with every old floor kept', async () => {
    scenarios++;
    const w = await walk(fakePage({ frameMs: 16, e1: true, commitFrames: 3 }));
    const v = specView(w);
    expect(w.done).toBe(postFxPlan().length);
    expect(v.after.builds.n8ao - v.warm.builds.n8ao).toBe(7);
    expect(specPasses(v)).toBe(false);
    const ok = await walk(fakePage({ frameMs: 16 }));
    expect(specPasses(specView(ok))).toBe(true);
    expect(ok.ms, 'the floors were not kept').toBeGreaterThanOrEqual(postFxPlan().reduce((n, s) => n + s.minMs, 0));
  });

  it('a page that draws nothing stops at the cap, so the spec can say how far the walk got', async () => {
    scenarios++;
    const w = await walk(fakePage({ noFrames: true }));
    expect(w.capped, 'the cap never stopped it').toBe(true);
    expect(w.done, 'a step was counted done with no frame drawn').toBe(0);
    expect(w.ms, 'it overran its cap by more than one wake').toBeLessThanOrEqual(WALK_CAP_MS + WAKE_MS);
    // One frame a minute: a few steps, then the cap — and no step it reports done was cut short.
    const slow = await walk(fakePage({ frameMs: 60000 }));
    expect(slow.capped).toBe(true);
    expect(slow.done).toBeGreaterThan(0);
    expect(slow.done).toBeLessThan(postFxPlan().length);
    expect(slow.steps.every((s) => s.frames >= COMMIT_WITHIN), 'a capped walk counted an unfinished step').toBe(true);
  });

  it('with no frame count to wait on, the walk refuses to start (SETUP) and applies nothing', async () => {
    scenarios++;
    let applied = 0;
    const page = { ...fakePage({ onApply: () => { applied++; } }), frames: () => undefined };
    await expect(walk(page)).rejects.toThrow(/^SETUP: /);
    expect(applied).toBe(0);
  });

  it("the spec's budget: the cap fits its timeout, and three attempts fit the e2e job's 35 minutes", () => {
    scenarios++;
    // The boot and the 3 s settle took 38.6-53.3 s in run 40652010997's three attempts; 90 s, as the other walks budget.
    // The page fixture's teardown stopped JS coverage in 11.7 s there; 20 s.
    expect(90000 + WALK_CAP_MS + 20000, 'the walk cap overruns the test timeout').toBeLessThanOrEqual(TEST_TIMEOUT_MS);
    // The CI-slow page's walk (~190 s) inside the cap with room for frames ~1.8x as long.
    expect(WALK_CAP_MS, 'no room for a runner slower than the stand-in').toBeGreaterThanOrEqual(1.8 * 190000);
    // ci.yml's e2e job (`timeout-minutes: 35`) and playwright.config.js's `retries: 2` on CI, copied, not read: a gate
    // here that reads a file joins the frozen source-grep population. Shard 6 in that run: 45 s from the job's start to
    // the first test, and its other six tests 7.6 min (save-load, shadow-tier, smoke, soft-death x3).
    expect(45000 + 3 * TEST_TIMEOUT_MS + 7.6 * 60000, 'three attempts overrun the e2e job').toBeLessThanOrEqual(35 * 60000);
  });

  it('every scenario ran', () => {
    expect(scenarios, 'a scenario above was skipped').toBe(7);
  });
});
