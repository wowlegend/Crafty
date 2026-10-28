import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';

// THE HUD TICKS UNDER THE CAP AND UNDER UNLIMITED, ON ONE CLOCK (plan 2026-10-27-crafty-steady-cool, item f; F10).
//
// tests/gates/hud-ticker-gates drives the ticker, FrameCap's claim and the AbilityBar over a hand-cranked rAF. What it
// cannot see: that the in-game Compass and ObjectiveTracker (HUD.jsx) subscribe to it, and the F10 trap in the running
// game — a HUD driven only by FrameCap's loop freezes when the player picks Frame Rate: Unlimited, where that loop does
// not run. So the compass must follow a camera turn in BOTH modes, and under the cap the page must not run a HUD rAF
// loop of its own beside the canvas's (the instrument: requestAnimationFrame wrapped before load, callbacks counted by
// the source file that registered them).
//
// Mutation-Proof: NOT YET RUN — this lane does not run e2e (port 4179 and the browser belong to the command session).
// Intended batch, via scripts/dev/mutate-e2e.sh:
//   E1 FrameCap never claims the ticker (`const release = null;`, FrameCap.jsx)        -> RED expected: "HUD rAF callbacks under the cap"
//   E2 the ticker's release does not restart its rAF (hudTicker.js) — the F10 freeze     -> RED expected: "did not follow the camera under Unlimited"
//   E3 the Compass never subscribes to the ticker (HUD.jsx)                              -> RED expected: "did not follow the camera under the cap"
//   E0 identity (a comment edit in hudTicker.js)                                         -> must SURVIVE
test('the compass follows the camera under the cap and under Unlimited, and the HUD runs no rAF loop of its own under the cap', async ({ page }) => {
  test.setTimeout(300000);
  await page.addInitScript(() => {
    // Count rAF callbacks by the module that registered them (the first app frame in the stack).
    const counts = {};
    window.__rafBySource = counts;
    const orig = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (fn) => {
      const stack = new Error().stack || '';
      const m = stack.split('\n').slice(2).map((l) => (l.match(/\/src\/([\w/.-]+?\.jsx?)/) || [])[1]).find(Boolean) || 'other';
      return orig((t) => { counts[m] = (counts[m] || 0) + 1; fn(t); });
    };
  });
  await bootDev(page);
  await startPlayActive(page);
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="compass-track"]');
    window.__compassWrites = 0;
    window.__compassFound = !!el;
    if (el) new MutationObserver(() => { window.__compassWrites += 1; }).observe(el, { childList: true });
  });
  expect(await page.evaluate(() => window.__compassFound), 'SETUP: no compass strip on screen — the HUD is not mounted').toBe(true);

  const turnAndCount = async () => {
    const before = await page.evaluate(() => window.__compassWrites);
    for (const [dx, dz] of [[10, 0], [0, 10], [-10, 0], [0, -10]]) {
      await page.evaluate(([x, z]) => {
        const cam = window.__threeCamera;
        cam.lookAt(cam.position.x + x, cam.position.y, cam.position.z + z);
      }, [dx, dz]);
      await page.waitForTimeout(600);
    }
    return (await page.evaluate(() => window.__compassWrites)) - before;
  };
  const hudRafOver = async (ms) => {
    const a = await page.evaluate(() => ({ ...window.__rafBySource }));
    await page.waitForTimeout(ms);
    const b = await page.evaluate(() => ({ ...window.__rafBySource }));
    const hud = ['HUD.jsx', 'ui/AbilityBar.jsx', 'ui/hudTicker.js'].reduce((n, k) => n + ((b[k] || 0) - (a[k] || 0)), 0);
    return { hud, all: b };
  };

  // Under the default 60 cap: the compass follows, and no HUD module runs its own rAF (FrameCap ticks it).
  const capped = await page.evaluate(() => window.__craftyTest.call('readFrameloop'));
  expect(capped.loop, `SETUP: the default cap is not on: ${JSON.stringify(capped)}`).toBe('demand');
  const cappedWrites = await turnAndCount();
  const cappedRaf = await hudRafOver(2000);

  // Unlimited: FrameCap's loop stops; the ticker must fall back to its own rAF (F10).
  await page.evaluate(() => window.useGameStore.getState().setFrameCap(0));
  await page.waitForTimeout(800);
  const free = await page.evaluate(() => window.__craftyTest.call('readFrameloop'));
  expect(free.loop, `SETUP: Unlimited did not take: ${JSON.stringify(free)}`).toBe('always');
  const freeWrites = await turnAndCount();
  const freeRaf = await hudRafOver(2000);
  await page.evaluate(() => window.useGameStore.getState().setFrameCap(60));

  const where = JSON.stringify({ cappedWrites, freeWrites, cappedRaf, freeRaf });
  console.log(`hud-ticker: ${where}`);
  expect(cappedWrites, `the compass did not follow the camera under the cap: ${where}`).toBeGreaterThan(0);
  expect(freeWrites, `the compass did not follow the camera under Unlimited — the F10 freeze: ${where}`).toBeGreaterThan(0);
  expect(cappedRaf.hud, `HUD rAF callbacks under the cap (the HUD should tick on the canvas's frames): ${where}`).toBe(0);
  expect(freeRaf.hud, `SETUP: under Unlimited the instrument saw no HUD rAF at all — it cannot attribute callbacks: ${where}`).toBeGreaterThan(0);
});
