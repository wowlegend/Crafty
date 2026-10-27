import { test, expect } from './_fixtures.js';
import { bootDev, startPlay } from './_boot.js';
import { pixelBudgetDpr } from '../../src/render/pixelBudget.js';

// THE CANVAS SPENDS ITS PIXEL BUDGET, AND THE COMPOSER FOLLOWS IT (plan 2026-10-27-crafty-steady-cool, items a and b).
//
// tests/gates/pixel-budget-gates drives the budget function and tests/gates/composer-dpr-sync drives the composer sync
// over a renderer stand-in. What neither can see: that GameScene feeds the budget to the live Canvas, that R3F applies
// it as the renderer's pixel ratio, and that the LIVE composer's buffers follow that ratio after a tier step at the same
// CSS size — the case @react-three/postprocessing 3.0.4 never handles (it resizes on a CSS size change only).
//
// WHY deviceScaleFactor 2. At Playwright's default of 1 the budget clamps every tier to dpr 1 (never above native), so
// a tier step changes nothing and a missing sync is invisible. At 2 on a 1200x800 window the tiers land on their caps
// (1.25 / 1.5 / 1.75), so every step changes the ratio while the CSS size stays put.
//
// Mutation-Proof: NOT YET RUN — this lane does not run e2e (port 4179 and the browser belong to the command session).
// Intended batch, via scripts/dev/mutate-e2e.sh:
//   E1 <ComposerPixelRatioSync /> removed from PostFX (GameScene.jsx)  -> RED expected: "the composer buffer is ... the canvas is ..."
//   E2 the Canvas dpr back to [1, q.dprCap] (GameScene.jsx)            -> RED expected: "the renderer's pixel ratio is not the budget"
//   E0 identity (a comment edit in postFx.js)                          -> must SURVIVE
// BLIND SPOT: a sync that resizes EVERY frame passes here (the buffer is always right); that is the unit gate's in-sync case.
test.use({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 });

test('after every tier step the renderer runs at the budget dpr and the composer buffer matches the canvas', async ({ page }) => {
  test.setTimeout(240000);
  await bootDev(page);
  await startPlay(page);
  await page.waitForTimeout(3000); // the first compiles and the world's first meshes

  const read = () => page.evaluate(() => ({ ...window.__craftyTest.call('readComposerSize'), tier: window.useGameStore.getState().qualityTier }));
  const first = await read();
  expect(first.input, `SETUP: the composer never mounted (readComposerSize returned no buffer): ${JSON.stringify(first)}`).not.toBeNull();
  expect(first.devicePixelRatio, `SETUP: the page is not at deviceScaleFactor 2 — no tier step would change the ratio: ${JSON.stringify(first)}`).toBe(2);

  const seen = [];
  for (const tier of ['high', 'low', 'med', 'high', 'low']) {
    await page.evaluate((t) => window.__craftyTest.call('setQualityTier', t), tier);
    await page.waitForTimeout(2500); // the tier change re-renders the Canvas; a few frames to apply the dpr and resize
    const r = await read();
    seen.push(r);
    const where = JSON.stringify(r);
    const budget = pixelBudgetDpr({ tier, devicePixelRatio: r.devicePixelRatio, cssWidth: r.css[0], cssHeight: r.css[1] });
    expect(r.tier, `SETUP: the tier did not take (${tier}): ${where}`).toBe(tier);
    expect(r.pixelRatio, `at ${tier} the renderer's pixel ratio is not the budget ${budget}: ${where}`).toBeCloseTo(budget, 5);
    expect(r.input, `at ${tier} the composer buffer is ${r.input} while the canvas is ${r.canvas} — the composer did not follow the pixel ratio: ${where}`).toEqual(r.canvas);
  }
  // The denominator: the steps must actually have changed the ratio, or the equality above was never tested.
  const ratios = new Set(seen.map((r) => r.pixelRatio));
  console.log(`composer-dpr: ${seen.map((r) => `${r.tier} dpr ${r.pixelRatio} canvas ${r.canvas.join('x')} composer ${r.input.join('x')}`).join(' · ')}`);
  expect(ratios.size, `SETUP: the tier steps never changed the pixel ratio — nothing about the sync was exercised: ${JSON.stringify(seen)}`).toBeGreaterThanOrEqual(3);
});
