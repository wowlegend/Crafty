import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';
import { installMotionSampler, judgeMotion } from './_motionSample.js';

// A PANEL STILL ANIMATES AFTER LAZYMOTION (W2-L, reset item 14's remainder; DECISIONS 2026-10-30).
//
// Every animated panel renders `m`, which has no features of its own and takes them from the one LazyMotion provider App
// renders (src/ui/MotionProvider.jsx). If that provider is absent, not reached, or loads nothing, nothing throws and the
// panels sit at their `initial` state for good: invisible, or in place but never moving. The unit gates read the provider
// in jsdom (tests/gates/lazy-motion-strict-gates, app-motion-provider-gates); this is the running game in Chromium.
//
// THE PANEL. Character on Tab, then its Talents tab by a real click: the same walk tests/e2e/panels.spec.js makes. The
// Talents page is a lazy panel (the panel chunk) and its inner card animates scale 0.9 to 1 and y 30 to 0 on a spring.
//
// THE MEASURE. tests/e2e/_motionSample.js: a sampler armed in the page before the click reads the card's inline
// transform at insertion (the initial value) and on every frame the page draws, until the end holds for three frames;
// judgeMotion then wants the end reached AND at least one drawn value strictly between start and end. A card that jumps
// from 0.9 to 1 between two frames, or never leaves 0.9, is red. Scale is the sampled property because framer-motion
// drives it from JavaScript with a per-frame step capped at 40 ms: a frame drawn seconds late advances the spring by a
// bounded step instead of skipping it, which a software-rendered CI runner needs. (Opacity runs on the compositor and
// would finish between two such frames.) tests/gates/motion-sample-gates.test.jsx drives the sampler and the verdict
// in jsdom, including the frozen-card and the jump cases.
//
// A series too short to judge, or an element that never appeared, is a SETUP failure naming what was seen, never a
// verdict on the transition.
//
// WHAT THIS DOES NOT CHECK: the other panels (the strict gate mounts them all, in jsdom), a look (the transition's
// feel is Kevin's), Safari or touch, and the production build: the e2e drives the dev server, where `strict` is live
// but the shipped bundle's size is the bundle budget's.
//
// Mutation-Proof: NOT RUN LOCALLY (no local e2e; CI is the arbiter). Argued mutants:
//   E1 App renders no MotionProvider (src/App.jsx)                              -> RED expected: "never reached its end" (the card sits at 0.9)
//   E2 MotionProvider's features never resolve (features={() => new Promise(() => {})}) -> RED expected: the same
//   E3 the card's spring replaced by a jump (SpellUpgradePanel transition={{ duration: 0 }}) -> RED expected: "no value between them"
//   E0 identity (a comment edit in MotionProvider.jsx)                          -> must SURVIVE
// The same verdict is run locally on the frozen and jump series, and on the real panel with and without the provider,
// by tests/gates/motion-sample-gates.test.jsx (the mutants of that gate are in its commit's trailer).

test('the talents panel animates in: its card takes a drawn value strictly between its initial scale and 1', async ({ page }) => {
  test.setTimeout(240000);
  await bootDev(page);
  await startPlayActive(page);
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('inventory-modal'), 'SETUP: Tab did not open Character').toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('panel-tab-talents'), 'SETUP: Character has no Talents tab').toBeVisible();

  // Armed before the click, so the insertion is seen as it happens.
  await page.evaluate(installMotionSampler, { testid: 'progression-panel', deadlineMs: 60000 });
  await page.getByTestId('panel-tab-talents').click();
  await expect(page.getByTestId('progression-panel'), 'SETUP: the Talents tab did not open the Talents page').toBeVisible({ timeout: 30000 });
  await page.waitForFunction(() => window.__motionSamples?.done === true, null, { timeout: 90000 })
    .catch((e) => { throw new Error(`SETUP: the sampler never finished (the end state was not held for three drawn frames): ${e.message}`); });

  const { frames, target } = await page.evaluate(() => window.__motionSamples);
  const verdict = judgeMotion(frames);
  const seen = JSON.stringify(frames.slice(0, 12).map((f) => [f.t, Math.round(f.scale * 1000) / 1000, Math.round(f.y * 10) / 10]));
  console.log(`lazy-motion: ${verdict.kind}: ${verdict.why}; sampled ${target}; first frames [t ms, scale, y]: ${seen}`);
  if (verdict.kind === 'setup') throw new Error(`SETUP: ${verdict.why}; first frames ${seen}`);
  expect(verdict.kind, `the Talents card does not animate: ${verdict.why}; sampled ${target}; first frames [t ms, scale, y]: ${seen}`).toBe('ok');
});
