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
// Mutation-Proof: (2026-10-28, run on this spec as it stands: single-spec local runs through a throwaway config on a free
// port, --retries=0):
//   E0  identity (a comment edit in postFx.jsx)                                          -> SURVIVED
//   E1b plausible-wrong: the sync compares but never resizes (`composer.setSize()` removed, postFx.jsx)
//                                                                                        -> SURVIVED: all five steps
//       still matched. So this spec does NOT show the sync is load-bearing: something else brings the composer to the
//       drawing-buffer size on a tier step, or the sync is redundant. OPEN.
//   The lane's E1 (<ComposerPixelRatioSync /> removed) also removes the readComposerSize hook this spec reads, so it
//   fails as SETUP ("the page is not at deviceScaleFactor 2"), not as a kill. E2 not run here.
// BLIND SPOT: a sync that resizes EVERY frame passes here (the buffer is always right); that is the unit gate's in-sync case.
//
// WHY NO e2e PIXEL-RATIO CAP (src/devtest/e2eDpr.js). This spec asserts the renderer's ratio EQUALS the tier's budget and
// that the steps change it; the suite's 0.5 cap would pin every tier to 0.5, so neither could be read.
test.use({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2, e2eDprCap: null });

/** Frames drawn after a tier step before the read: the Canvas re-render, R3F's setDpr, then the sync's resize frame. */
const STEP_FRAMES = 4;

test('after every tier step the renderer runs at the budget dpr and the composer buffer matches the canvas', async ({ page }) => {
  // CI's software renderer ran this at 3.6-4.4 min an attempt (run 40615649137: two attempts out of their 240 s, the third
  // passed at 3.6 min), against 1.6 min locally. Budget for the slow case: a timeout costs a whole retry.
  test.setTimeout(420000);
  await bootDev(page);
  await startPlay(page);
  await page.waitForTimeout(3000); // the first compiles and the world's first meshes

  // The read carries its preconditions (gate rule 4e): frames drawn so far and whether the context was lost — a frame loop
  // that stopped and one that is merely slow fail the same wait, and only these tell them apart.
  const read = () => page.evaluate(() => ({
    ...window.__craftyTest.call('readComposerSize'),
    tier: window.useGameStore.getState().qualityTier,
    frames: window.__craftyTest.call('readFrameloop').frames,
    lost: window.useGameStore.getState().isWebGLContextLost,
  }));
  const first = await read();
  expect(first.input, `SETUP: the composer never mounted (readComposerSize returned no buffer): ${JSON.stringify(first)}`).not.toBeNull();
  expect(first.devicePixelRatio, `SETUP: the page is not at deviceScaleFactor 2 — no tier step would change the ratio: ${JSON.stringify(first)}`).toBe(2);

  const seen = [];
  for (const tier of ['high', 'low', 'med', 'high', 'low']) {
    const f0 = await page.evaluate(() => window.__craftyTest.call('readFrameloop').frames);
    await page.evaluate((t) => window.__craftyTest.call('setQualityTier', t), tier);
    // The tier change re-renders the Canvas, R3F applies the dpr, and the sync resizes on a later frame: wait for
    // FRAMES drawn, not seconds. At DPR 2 on CI's software renderer a frame can outlast the 2.5 s this used to wait.
    const drew = await page.waitForFunction(({ f, n }) => window.__craftyTest.call('readFrameloop').frames >= f + n, { f: f0, n: STEP_FRAMES }, { timeout: 90000, polling: 250 }).then(() => true, () => false);
    const r = await read();
    seen.push(r);
    const where = JSON.stringify(r);
    const budget = pixelBudgetDpr({ tier, devicePixelRatio: r.devicePixelRatio, cssWidth: r.css[0], cssHeight: r.css[1] });
    expect(drew, `SETUP: the renderer drew fewer than ${STEP_FRAMES} frames in 90 s after the step to ${tier} (frames ${f0} -> ${r.frames}): ${where}`).toBe(true);
    expect(r.tier, `SETUP: the tier did not take (${tier}): ${where}`).toBe(tier);
    expect(r.pixelRatio, `at ${tier} the renderer's pixel ratio is not the budget ${budget}: ${where}`).toBeCloseTo(budget, 5);
    expect(r.input, `at ${tier} the composer buffer is ${r.input} while the canvas is ${r.canvas} — the composer did not follow the pixel ratio: ${where}`).toEqual(r.canvas);
  }
  // The denominator: the steps must actually have changed the ratio, or the equality above was never tested.
  const ratios = new Set(seen.map((r) => r.pixelRatio));
  console.log(`composer-dpr: ${seen.map((r) => `${r.tier} dpr ${r.pixelRatio} canvas ${r.canvas.join('x')} composer ${r.input.join('x')}`).join(' · ')}`);
  expect(ratios.size, `SETUP: the tier steps never changed the pixel ratio — nothing about the sync was exercised: ${JSON.stringify(seen)}`).toBeGreaterThanOrEqual(3);
});
