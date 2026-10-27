import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';

// A LOST WEBGL CONTEXT HAS A WAY BACK, AND THE WAY BACK LANDS IN THE SAME WORLD (plan 2026-10-27-crafty-steady-cool,
// item e).
//
// tests/gates/context-loss-gates renders the panel against the store and drives the recovery with an injected reload.
// What it cannot see: that GameScene's `webglcontextlost` listener sets the flag when the browser really drops the
// context, that a restore clears it and the canvas draws again, and that the real reload resumes the world.
// The loss is real: WEBGL_lose_context on the game canvas (the DEV `webglContext` hook took the extension at creation).
//
// Mutation-Proof: NOT YET RUN — this lane does not run e2e (port 4179 and the browser belong to the command session).
// Intended batch, via scripts/dev/mutate-e2e.sh:
//   E1 the panel never shows (`if (!lost) return null;` -> `return null;`, ContextLossPanel.jsx) -> RED expected: "no panel after the loss"
//   E2 the boot resume effect removed (ContextLossPanel.jsx)                                    -> RED expected: "the reload did not resume the world"
//   E3 handleContextLost no longer sets the flag (GameScene.jsx)                                -> RED expected: "no panel after the loss"
//   E0 identity (a comment edit in contextRecovery.js)                                          -> must SURVIVE
test('a lost context shows the panel; a restore clears it and draws again; a tap reloads into the same world', async ({ page }) => {
  test.setTimeout(300000);
  await bootDev(page);
  await startPlayActive(page);
  const frames = () => page.evaluate(() => window.__craftyTest.call('readFrameloop').frames);
  const panel = page.getByTestId('context-loss-panel');
  await expect(panel, 'SETUP: the panel is up before any loss').toHaveCount(0);

  // A real loss, then the browser's restore.
  expect(await page.evaluate(() => window.__craftyTest.call('webglContext', 'lose')), 'SETUP: WEBGL_lose_context is unavailable here').toBe(true);
  await expect(panel, 'no panel after the loss').toBeVisible({ timeout: 10000 });
  await expect(panel).toContainText('Graphics were reset by the system');
  await page.evaluate(() => window.__craftyTest.call('webglContext', 'restore'));
  await expect(panel, 'the panel stayed after the context came back').toHaveCount(0, { timeout: 10000 });
  const f0 = await frames();
  await page.waitForTimeout(3000);
  const f1 = await frames();
  expect(f1, `the canvas did not draw after the restore (${f0} -> ${f1} frames)`).toBeGreaterThan(f0);

  // Lose it again and take the way back: the world must be the one that was being played.
  const MARK = 4321;
  await page.evaluate((c) => window.useGameStore.setState({ coins: c }), MARK);
  await page.evaluate(() => window.__craftyTest.call('webglContext', 'lose'));
  await expect(panel).toBeVisible({ timeout: 10000 });
  await Promise.all([page.waitForEvent('load', { timeout: 60000 }), panel.click()]);
  await bootDev(page);
  await page.waitForTimeout(1500); // the boot effect that consumes the breadcrumb
  const after = await page.evaluate(() => ({
    coins: window.useGameStore.getState().coins,
    world: window.useGameStore.getState()._sessionWorldId,
    crumb: window.sessionStorage.getItem('crafty.resumeWorldId'),
    lost: window.useGameStore.getState().isWebGLContextLost,
  }));
  console.log(`context-loss: after the recovery reload ${JSON.stringify(after)}`);
  expect(after.world, `the reload did not resume the world (no session world): ${JSON.stringify(after)}`).toBeTruthy();
  expect(after.coins, `the reload did not resume the world (coins ${after.coins}, saved ${MARK}): ${JSON.stringify(after)}`).toBe(MARK);
  expect(after.crumb, 'the breadcrumb survived its use').toBeNull();
  expect(after.lost, 'the fresh page still believes its context is lost').toBe(false);
});
