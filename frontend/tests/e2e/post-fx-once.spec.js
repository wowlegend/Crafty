import { test, expect } from './_fixtures.js';
import { bootDev, startPlay } from './_boot.js';
import { STEP_FRAMES, WAKE_MS, WALK_CAP_MS, TEST_TIMEOUT_MS, TIER_CYCLE, postFxPlan, walkPostFx } from './_postFxWalk.js';

// THE POST CHAIN IS BUILT ONCE: TIER STEPS AND HORIZON FLIPS CONSTRUCT NOTHING AND LEAK NOTHING
// (plan 2026-10-27-crafty-steady-cool, item c; refute F8).
//
// tests/gates/post-fx-once-gates drives the built-once hooks, the toggles and the drivers over the real postprocessing
// classes. What it cannot see is GameScene's wiring: that PostFX no longer re-renders on a tier step or a horizon flip
// (its props), that the sticky mounts happen once, and that the GPU's resident texture count stops growing — the
// package's GodRays left its render targets allocated at every sunrise and every tier step.
//
// THE READ PATH is DEV-only (readPostFx: construction counts from render/postFx.jsx, three's renderer.info). F7: a
// production read path is the Diagnostics readout (Phase 0d), not this spec.
//
// Mutation-Proof: NOT YET RUN — this lane does not run e2e (port 4179 and the browser belong to the command session).
// Intended batch, via scripts/dev/mutate-e2e.sh:
//   E1 PostFX given the tier again (`withAO={withAO}` -> `withAO={q.ao}`, GameScene.jsx: N8AO remounts per step) -> RED expected: "n8ao constructions rose"
//   E2 the same for GodRays (`withGodRays={withGodRays}` -> `withGodRays={q.godRays}`)                             -> RED expected: "godRays constructions rose"
//   E0 identity (a comment edit in postFx.jsx)                                                                      -> must SURVIVE
// BLIND SPOT: the textures ceiling is not killed by a single-site mutant (a missing dispose leaks only when the effect
// unmounts, which the built-once wiring no longer does); the unit gate's unmount-dispose case owns that.
//
// THE STEPS RUN IN THE PAGE, IN ONE EVALUATE, EACH WAITING FOR FRAMES DRAWN (PR CI run 40652010997, shard 6, the
// traces; 2026-10-28). The spec used to take every step as Playwright round trips — setQualityTier, waitForTimeout(700),
// readPostFx — and on CI's software renderer those cost seconds each (readPostFx 7.5-8.8 s mean, up to 14.0 s), so a
// step took ~14 s and the 300 s timeout fired with 11 or 12 of the 20 steps read, three attempts of three. Every
// read it did get showed the builds flat, the textures at 50 and N8AO following the tier: the SPEC ran out of time, the
// game did nothing wrong that the run could see. Now tests/e2e/_postFxWalk.js holds the plan (the old sequence, step
// for step) and walkPostFx, which the page runs: each step waits until the game canvas has drawn STEP_FRAMES frames
// since it AND its old floor (700-2500 ms) has passed, so a step is read only once it has been drawn, on any runner. The
// walk stops at its own cap and says how far it got; the cap fits the test timeout, and three attempts fit the e2e
// job's 35 minutes (tests/gates/post-fx-walk-gates, which also shows E1 fails the spec's assertions through this walk
// on a CI-slow page and a fast one). Every assertion below is unchanged; one SETUP check is new, that the walk drew
// every step of its plan, so a runner too slow for the plan fails naming how far it got.

test('after a warm-up, 20 tier steps and 4 horizon flips construct no effect and grow no GPU textures', async ({ page }) => {
  // Boot (38.6-53.3 s on CI, run 40652010997) + the walk (capped at WALK_CAP_MS) + the fixture's teardown: the gate.
  test.setTimeout(TEST_TIMEOUT_MS);
  await bootDev(page);
  await startPlay(page);
  await page.waitForTimeout(3000);

  // THE WALK: the warm-up (every tier and both sides of the horizon once, so every first-need mount and first compile
  // has happened), the warm read, the 20 tier steps with a flip after every fifth and a read after each, then noon at
  // high and the final read.
  const plan = postFxPlan();
  const w = await page.evaluate(walkPostFx, { plan, frames: STEP_FRAMES, capMs: WALK_CAP_MS, wakeMs: WAKE_MS });
  const stepFrames = w.steps.map((s) => s.frames);
  const slowest = Math.max(0, ...w.steps.map((s) => s.ms));
  console.log(`post-fx-once: walk ${w.done}/${plan.length} steps in ${(w.ms / 1000).toFixed(1)} s, ` +
    `frames per step ${Math.min(...stepFrames)}-${Math.max(...stepFrames)}, slowest step ${(slowest / 1000).toFixed(1)} s`); // the denominator
  expect(w.done, `SETUP: the walk drew ${w.done} of ${plan.length} steps within its ${WALK_CAP_MS} ms cap — the runner ` +
    `is too slow for this plan, and nothing after the last drawn step was measured: ${JSON.stringify(w.steps)}`).toBe(plan.length);
  const warm = w.reads.find((x) => x.kind === 'warm').r;
  expect(warm, 'SETUP: readPostFx is not registered — the driver never mounted').toBeTruthy();
  expect([warm.builds.bloom, warm.builds.n8ao, warm.builds.godRays].every((n) => n >= 1), `SETUP: an effect was never built during the warm-up: ${JSON.stringify(warm)}`).toBe(true);

  const toggles = w.reads.filter((x) => x.kind === 'step')
    .map(({ i, r }) => `${TIER_CYCLE[i % 3]}:ao=${r.n8ao},rays=${r.godRays},mip=${r.bloomMipmap}`);
  const after = w.reads.find((x) => x.kind === 'after').r;
  const where = JSON.stringify({ warm, after, toggles });
  console.log(`post-fx-once: builds ${JSON.stringify(warm.builds)} -> ${JSON.stringify(after.builds)}, textures ${warm.textures} -> ${after.textures}, programs ${warm.programs} -> ${after.programs}`);

  // PRESENCE: the toggles really followed the tier (the steps were not no-ops), or nothing here was exercised.
  expect(toggles.some((t) => t.startsWith('low:ao=false')), `SETUP: N8AO was never disabled at low: ${where}`).toBe(true);
  expect(toggles.some((t) => t.startsWith('med:ao=true')), `SETUP: N8AO was never enabled at med: ${where}`).toBe(true);

  expect(after.builds.bloom - warm.builds.bloom, `bloom constructions rose across 20 tier steps: ${where}`).toBe(0);
  expect(after.builds.n8ao - warm.builds.n8ao, `n8ao constructions rose across 20 tier steps: ${where}`).toBe(0);
  expect(after.builds.godRays - warm.builds.godRays, `godRays constructions rose across 20 tier steps and 4 horizon flips: ${where}`).toBe(0);
  // The world streams around a standing player (chunk textures are shared atlases, labels are canvas textures), so a
  // small slack; a leaked GodRays set is 3 textures per rebuild and 24 rebuilds would be ~72.
  expect(after.textures - warm.textures, `GPU textures grew across the steps: ${where}`).toBeLessThanOrEqual(6);
});
