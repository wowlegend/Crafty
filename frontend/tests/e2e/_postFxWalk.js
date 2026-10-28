// post-fx-once.spec.js's walk — its warm-up, its 20 tier steps with 4 horizon flips, and its final settle — and the
// spec's time budget, kept out of the spec so a unit gate (tests/gates/post-fx-walk-gates.test.js) can drive the walk on
// a fake page. The same split as _governorPhases.js for tier-governor and _floorSamples.js for mob-floor.
//
// THE DEFECT THIS REPLACES (PR CI run 40652010997, shard 6, the three traces). The spec took every step as Playwright
// round trips: an evaluate of setQualityTier, waitForTimeout(700), an evaluate of readPostFx. On CI's software renderer
// those cost setTier 2.9-3.5 s mean, the 700 ms wait 3.1-3.5 s and readPostFx 7.5-8.8 s mean (up to 14.0 s), so a
// measured step took ~14 s, the warm-up ended at 132-146 s, and the 300 s timeout fired with 11 or 12 of the 20 steps
// read, on all three attempts, naming nothing. Every read those attempts did get showed the constructions flat, the GPU textures at
// 50 and N8AO following the tier, so the game did nothing wrong that the run could see: the SPEC ran out of time.
//
// NOW: the page runs the whole plan in ONE evaluate (walkPostFx). Each step waits until the game canvas has drawn
// STEP_FRAMES frames since it was applied AND its old time floor has passed. Frames, not seconds, because what a step
// needs is to be DRAWN: frame 1 draws it (PostTierDriver applies the tier in it, and React commits the R3F root — where a
// rebuilt effect would be constructed — in the task before or after it), frame 2 draws whatever that commit mounted,
// which is when its render targets are allocated. On a GPU the floors (700-2500 ms) are dozens of frames, as before; on
// CI's ~0.5 fps the frames decide. The walk's cap is measured from its own start, so a slow step spends the cap and
// cannot push the walk past it, and a capped walk returns how far it got, which the spec reports as SETUP.

/** The tier cycle the measured steps run, step i at TIER_CYCLE[i % 3]. */
export const TIER_CYCLE = ['low', 'med', 'high'];
/** setTimeOfDay's fractions: midnight is 0, noon 0.5 (store/useGameStore.jsx). */
export const MIDNIGHT = 0;
export const NOON = 0.5;
/** The test's title: 20 tier steps (and 4 horizon flips, one after every fifth). */
export const MEASURED_STEPS = 20;
/** Frames the game canvas must draw after a step before the walk reads or moves on (see the header). */
export const STEP_FRAMES = 2;
/** The longest the page waits between looks: a requestAnimationFrame races this, so a page that stops drawing is still
 *  looked at, and the cap still checked. */
export const WAKE_MS = 250;
/** The walk stops past this, measured from its start. On a page drawing CI's ~1.8 s frames (tier-governor's phase A,
 *  run 40652010997: 68 frames in 122.9 s at med) the plan takes ~190 s even with 3 s added to every tier step's first frame. */
export const WALK_CAP_MS = 360000;
/** The spec's own timeout. The boot, the cap and the fixture's teardown must fit inside it, and three attempts inside
 *  the e2e job's 35 minutes (the gate). */
export const TEST_TIMEOUT_MS = 480000;

/**
 * The old spec's sequence, step for step: [{ tier?, time?, minMs, read?, i? }]. `minMs` is the wait the old spec took
 * after that step; `read` names the read taken after it ('warm', 'step' with its index i, 'after').
 */
export function postFxPlan() {
  const plan = [];
  // WARM-UP: every tier and both sides of the horizon once, so every first-need mount and first compile has happened.
  for (const tier of [...TIER_CYCLE, 'low', 'high']) plan.push({ tier, minMs: 1200 });
  plan.push({ time: MIDNIGHT, minMs: 1500 });
  plan.push({ time: NOON, minMs: 1500, read: 'warm' });
  for (let i = 0; i < MEASURED_STEPS; i++) {
    const tier = TIER_CYCLE[i % 3];
    if (i % 5 === 4) {
      plan.push({ tier, minMs: 700 });
      plan.push({ time: i % 10 === 4 ? MIDNIGHT : NOON, minMs: 900, read: 'step', i });
    } else {
      plan.push({ tier, minMs: 700, read: 'step', i });
    }
  }
  // Noon, then high (in that order, as the old spec set them), and the longest settle before the final read.
  plan.push({ time: NOON, tier: 'high', minMs: 2500, read: 'after' });
  return plan;
}

/**
 * Applies each step of `plan`, waits until `frames` frames have been drawn since AND its `minMs` has passed, then takes
 * its read. Stops past `capMs` from its start. Returns { t0, ms, done, capped, steps: [{ k, frames, ms }],
 * reads: [{ k, kind, i, r }] } — `done` counts the steps applied AND drawn. PASSED TO page.evaluate, so it must stay
 * self-contained: with no `io` it uses the page's clock, a requestAnimationFrame raced with a `wakeMs` timeout, the game
 * canvas's frame count (readFrameloop) and the DEV hooks; the gate passes a fake `io`.
 * @param {{ plan: object[], frames: number, capMs: number, wakeMs: number }} arg
 * @param {{ now: () => number, wake: (ms:number) => Promise<unknown>, frames: () => number, apply: (step:object) => void, read: () => object }} [io]
 */
export async function walkPostFx({ plan, frames: need, capMs, wakeMs }, io) {
  const { now, wake, frames, apply, read } = io || {
    now: () => performance.now(),
    wake: (ms) => new Promise((resolve) => {
      let timer = 0;
      const raf = requestAnimationFrame(() => { clearTimeout(timer); resolve(); });
      timer = setTimeout(() => { cancelAnimationFrame(raf); resolve(); }, ms);
    }),
    frames: () => {
      const f = window.__craftyTest.call('readFrameloop');
      return f ? f.frames : undefined;
    },
    apply: (step) => {
      if (step.time !== undefined) window.useGameStore.getState().setTimeOfDay(step.time);
      if (step.tier !== undefined) window.__craftyTest.call('setQualityTier', step.tier);
    },
    read: () => window.__craftyTest.call('readPostFx'),
  };
  if (!Number.isFinite(frames())) {
    throw new Error('SETUP: readFrameloop is not registered — the walk has no frame count to wait on');
  }
  const t0 = now();
  const steps = [];
  const reads = [];
  let capped = false;
  for (let k = 0; k < plan.length; k++) {
    const step = plan[k];
    apply(step);
    const at = { t: now(), f: frames() };
    while (frames() - at.f < need || now() - at.t < step.minMs) {
      if (now() - t0 > capMs) { capped = true; break; }
      await wake(wakeMs);
    }
    if (capped) break;
    steps.push({ k, frames: frames() - at.f, ms: now() - at.t });
    if (step.read) reads.push({ k, kind: step.read, i: step.i, r: read() });
  }
  return { t0, ms: now() - t0, done: steps.length, capped, steps, reads };
}
