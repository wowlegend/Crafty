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
// Talents page is a lazy panel (the panel chunk). Its dialog fades opacity 0 to 1 (the Web Animations API) and its inner
// card springs scale 0.9 to 1 and y 30 to 0 (framer-motion's JavaScript animation).
//
// THE MEASURE. tests/e2e/_motionSample.js: a sampler armed in the page before the click reads the dialog's opacity and the
// card's scale and y at insertion (the initial values) and on every frame the page draws, until the end holds for three
// frames; judgeMotion then wants the end reached AND at least one drawn value strictly between start and end. A panel that
// jumps from its initial state to its end between two frames, or never leaves it, is red.
//
// WHY THE DOCUMENT TIMELINE IS SLOWED. The first CI attempt of this spec drew its frames at 616, 921, 1539, 1670 and
// 2042 ms after the panel appeared (a software-rendered world: 130 to 620 ms a frame) and read scale 0.9, 0.9, 1, 1, 1:
// framer-motion's spring runs against the wall clock, not per drawn frame, so a 350 ms spring fit in the 618 ms between
// two frames and no value between the ends was ever drawn. The fade is the Web Animations API's, which the browser's
// document timeline paces, so CDP Animation.setPlaybackRate (the DevTools animation-speed control) makes a 300 ms fade
// last 6 s at 0.05, a window in which this runner draws a dozen frames or more. The pace is put back in a finally. The
// slowed timeline is what makes the sampling deterministic; it does not change which transition the app asks for.
//
// A series too short to judge, or an element that never appeared, is a SETUP failure naming what was seen, never a
// verdict on the transition.
//
// WHAT THIS DOES NOT CHECK: the other panels (the strict gate mounts them all, in jsdom), a look (the transition's
// feel is Kevin's), Safari or touch, and the production build: the e2e drives the dev server, where `strict` is live
// but the shipped bundle's size is the bundle budget's.
//
// Mutation-Proof: NOT RUN LOCALLY (no local e2e; CI is the arbiter). Argued mutants:
//   E1 App renders no MotionProvider (src/App.jsx)                              -> RED expected: "never reached its end" (the panel sits at opacity 0, scale 0.9)
//   E2 MotionProvider's features never resolve (features={() => new Promise(() => {})}) -> RED expected: the same
//   E3 the panel's transitions replaced by jumps (transition={{ duration: 0 }} on both elements) -> RED expected: "neither scale nor opacity took a value between its ends"
//   E0 identity (a comment edit in MotionProvider.jsx)                          -> must SURVIVE
// The same verdict is run locally on the frozen and jump series, and on the real panel with and without the provider,
// by tests/gates/motion-sample-gates.test.jsx (the mutants of that gate are in its commit's trailer).

const TIMELINE_RATE = 0.05;

test('the talents panel animates in: its dialog and card take a drawn value strictly between their initial and end state', async ({ page }) => {
  test.setTimeout(240000);
  await bootDev(page);
  await startPlayActive(page);
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('inventory-modal'), 'SETUP: Tab did not open Character').toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('panel-tab-talents'), 'SETUP: Character has no Talents tab').toBeVisible();

  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Animation.enable');
    await cdp.send('Animation.setPlaybackRate', { playbackRate: TIMELINE_RATE });
    // Armed before the click, so the insertion is seen as it happens.
    await page.evaluate(installMotionSampler, { testid: 'progression-panel', deadlineMs: 120000 });
    await page.getByTestId('panel-tab-talents').click();
    await expect(page.getByTestId('progression-panel'), 'SETUP: the Talents tab did not open the Talents page').toBeVisible({ timeout: 30000 });
    await page.waitForFunction(() => window.__motionSamples?.done === true, null, { timeout: 150000 })
      .catch((e) => { throw new Error(`SETUP: the sampler never finished (the end state was not held for three drawn frames): ${e.message}`); });
  } finally {
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 }).catch(() => {});
    await cdp.detach().catch(() => {});
  }

  const { frames, target } = await page.evaluate(() => window.__motionSamples);
  const verdict = judgeMotion(frames);
  const r = (v, k) => Math.round(v * k) / k;
  const seen = JSON.stringify(frames.slice(0, 14).map((f) => [f.t, r(f.scale, 1000), r(f.y, 10), r(f.opacity, 1000)]));
  console.log(`lazy-motion: ${verdict.kind}: ${verdict.why}; sampled ${target}; first frames [t ms, scale, y, opacity]: ${seen}`);
  if (verdict.kind === 'setup') throw new Error(`SETUP: ${verdict.why}; first frames ${seen}`);
  expect(verdict.kind, `the Talents panel does not animate: ${verdict.why}; sampled ${target}; first frames [t ms, scale, y, opacity]: ${seen}`).toBe('ok');
});
