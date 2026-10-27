import { test, expect } from './_fixtures.js';
import { bootDev, startPlay } from './_boot.js';

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
//   E1 PostFX given the tier again (`withAO={q.ao}` in GameScene.jsx: N8AO unmounts at low)      -> RED expected: "n8ao constructions rose"
//   E2 the GodRays mount gated on the horizon again (`withGodRays && sunMesh && useGameStore...`)  -> RED expected: "godRays constructions rose"
//   E3 useGodRaysOnce disposes nothing (its unmount effect removed) + E1                          -> RED expected: "textures grew"
//   E0 identity (a comment edit in postFx.jsx)                                                    -> must SURVIVE
const TIERS = ['low', 'med', 'high'];

test('after a warm-up, 20 tier steps and 4 horizon flips construct no effect and grow no GPU textures', async ({ page }) => {
  test.setTimeout(300000);
  await bootDev(page);
  await startPlay(page);
  await page.waitForTimeout(3000);
  const read = () => page.evaluate(() => window.__craftyTest.call('readPostFx'));
  const setTier = (t) => page.evaluate((x) => window.__craftyTest.call('setQualityTier', x), t);
  const setTime = (f) => page.evaluate((x) => window.useGameStore.getState().setTimeOfDay(x), f);
  const noon = 0.5, midnight = 0.0;

  // WARM-UP: every tier and both sides of the horizon once, so every first-need mount and first compile has happened.
  for (const t of [...TIERS, 'low', 'high']) { await setTier(t); await page.waitForTimeout(1200); }
  await setTime(midnight); await page.waitForTimeout(1500);
  await setTime(noon); await page.waitForTimeout(1500);
  const warm = await read();
  expect(warm, 'SETUP: readPostFx is not registered — the driver never mounted').toBeTruthy();
  expect([warm.builds.bloom, warm.builds.n8ao, warm.builds.godRays].every((n) => n >= 1), `SETUP: an effect was never built during the warm-up: ${JSON.stringify(warm)}`).toBe(true);

  const toggles = [];
  for (let i = 0; i < 20; i++) {
    await setTier(TIERS[i % 3]);
    await page.waitForTimeout(700);
    if (i % 5 === 4) { await setTime(i % 10 === 4 ? midnight : noon); await page.waitForTimeout(900); }
    const r = await read();
    toggles.push(`${TIERS[i % 3]}:ao=${r.n8ao},rays=${r.godRays},mip=${r.bloomMipmap}`);
  }
  await setTime(noon); await setTier('high'); await page.waitForTimeout(2500);
  const after = await read();
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
