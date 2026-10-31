import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';

// THE CANVAS PACES DOWN BEHIND A PANEL AND IN AN UNFOCUSED WINDOW, NEVER UNDER CAPTURE
// (plan 2026-10-27-crafty-steady-cool, item g).
//
// tests/gates/canvas-pace-gates drives paceFor and the focus hook. What they cannot see: that MenuSystem publishes
// panelCovering from the REAL panel flags (three of them React-local), that GameScene feeds it and the window's focus to
// the live Canvas, and that capture still wins. The read is the frame cap's own DEV hook (readFrameloop: loop + fps).
//
// FOCUS IN A HEADLESS PAGE: Playwright emulates page focus, so document.hasFocus() reads true at boot; the blur here is a
// dispatched window `blur` event, which is exactly what useWindowFocused listens to. If this spec ever reads 10 fps
// BEFORE the blur, the emulation is off on that runner and every other spec is being paced too — the SETUP check says so.
//
// Mutation-Proof: NOT YET RUN — this lane does not run e2e (port 4179 and the browser belong to the command session).
// Intended batch, via scripts/dev/mutate-e2e.sh:
//   E1 MenuSystem never publishes panelCovering (its effect removed)            -> RED expected: "not paced behind the inventory"
//   E2 GameScene passes no `unfocused` to paceFor                               -> RED expected: "not paced in an unfocused window"
//   E3 plausible-wrong: panelCovering derived from the store flags only (the React-local achievements panel missed)
//                                                                              -> RED expected: "not paced behind the achievements panel"
//   E4 Show Stats counted as covering (MenuSystem: `isAnyPanelOpen(...) || showStats`, the shipped defect of review
//      2026-10-27 HIGH 1)                                                     -> RED expected: "Show Stats (F3) paced the canvas"
//   E5 the pause-on-unlock reads the readout as a panel (App.jsx: `shouldOpenPauseOnUnlock(...) && !showStats`, the
//      stranding)                                                             -> RED expected: "F3 on, ESC: no pause panel"
//   E0 identity (a comment edit in canvasPace.js)                              -> must SURVIVE
// RUN 2026-10-27 for E0/E4/E5 only (one batch, a throwaway config on port 4307, E2E_WORLD_TIMEOUT=240000): E0 PASSED,
// E4 RED "Show Stats (F3) paced the canvas" (stats 30), E5 RED "F3 on, ESC: no pause panel" (paused false). E1-E3 not run.
// The unit halves: tests/gates/canvas-pace-gates (the pace), src/ui/panelState.test.js (the pause and the invariant).
test('30 fps behind a panel, 10 unfocused, 60 otherwise, and never paced under capture', async ({ page }) => {
  test.setTimeout(240000);
  await bootDev(page);
  await startPlayActive(page);
  const loop = () => page.evaluate(() => {
    const r = window.__craftyTest.call('readFrameloop');
    return { loop: r.loop, fps: r.fps };
  });
  const settle = () => page.waitForTimeout(600);

  const open = await loop();
  expect(open, `SETUP: in play, focused, no panel, the canvas is not at the 60 cap — focus emulation off, or the title is up: ${JSON.stringify(open)}`).toEqual({ loop: 'demand', fps: 60 });

  await page.evaluate(() => window.useGameStore.getState().setShowInventory(true));
  await settle();
  const inventory = await loop();
  await page.evaluate(() => window.useGameStore.getState().setShowInventory(false));
  await settle();
  const closed = await loop();

  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await settle();
  const blurred = await loop();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await settle();
  const refocused = await loop();

  // Show Stats (F3) draws its readout inside the canvas and covers nothing — it is not a panel (ui/panelState.js): the
  // canvas must stay at its play pace, or the readout reports the pace instead of the game. Presence first: it is up.
  await page.keyboard.press('F3');
  await settle();
  const stats = await loop();
  const statsShown = await page.evaluate(() => !!document.querySelector('[data-testid="frame-stats"]'));
  // F3 on, then ESC — the stranding (2026-10-27): with the readout counted as a panel, the unlock opened no pause panel and
  // the resume overlay stayed suppressed. A headless page cannot hold a real pointer lock, so the unlock is the
  // `pointerlockchange` the browser fires after the player's ESC; Components' handler reads pointerLockElement (null),
  // drops the active gate, and App decides on that transition — the same path a real ESC takes from there. App opens the
  // pause panel only once the game has started, which the harness's forcePlay deliberately does not mark.
  await page.evaluate(() => window.useGameStore.getState().markGameStarted());
  await page.evaluate(() => document.dispatchEvent(new Event('pointerlockchange')));
  const paused = await page.waitForFunction(() => !!document.querySelector('[role="dialog"][aria-label="Settings"]'), null, { timeout: 10000 })
    .then(() => true, () => false);
  const unlockedActive = await page.evaluate(() => window.__craftyTest.call('readIntents').active);
  // Back to play for the rest: close the pause panel, re-open the gate, readout off.
  await page.evaluate(() => window.useGameStore.getState().setShowSettings(false));
  await page.evaluate(() => window.__craftyTest.call('forcePlay'));
  await page.keyboard.press('F3');
  await settle();

  // The Journal's feats tab, opened by J and a click on the tab (the HUD lane folded the Tab achievements panel into the
  // Journal), a flag App hands MenuSystem as a prop. Last before capture, because closing it asks
  // for the pointer lock back, which a headless page refuses.
  await page.keyboard.press('KeyJ');
  await page.getByTestId('panel-tab-feats').click();
  await settle();
  const achievements = await loop();
  const achievementsOpen = await page.evaluate(() => !!document.querySelector('[role="dialog"][aria-label="Achievements"]'));

  await page.evaluate(() => window.__craftyTest.call('enterCapture'));
  await page.evaluate(() => window.useGameStore.getState().setShowInventory(true));
  await settle();
  const capture = await loop();

  const where = JSON.stringify({ open, inventory, closed, achievements, achievementsOpen, blurred, refocused, stats, statsShown, unlockedActive, paused, capture });
  console.log(`canvas-pace-panels: ${where}`);
  expect(inventory, `not paced behind the inventory: ${where}`).toEqual({ loop: 'demand', fps: 30 });
  expect(closed, `still paced after the inventory closed: ${where}`).toEqual({ loop: 'demand', fps: 60 });
  expect(achievementsOpen, `SETUP: J and the feats tab did not open the achievements panel — the React-local case was not exercised: ${where}`).toBe(true);
  expect(achievements, `not paced behind the achievements panel: ${where}`).toEqual({ loop: 'demand', fps: 30 });
  expect(blurred, `not paced in an unfocused window: ${where}`).toEqual({ loop: 'demand', fps: 10 });
  expect(refocused, `still paced after the window regained focus: ${where}`).toEqual({ loop: 'demand', fps: 60 });
  expect(statsShown, `SETUP: F3 did not show the Show Stats readout — the stats case was not exercised: ${where}`).toBe(true);
  expect(stats, `Show Stats (F3) paced the canvas it is measuring: ${where}`).toEqual({ loop: 'demand', fps: 60 });
  expect(unlockedActive, `SETUP: the dispatched unlock did not drop the active gate — the ESC case was not exercised: ${where}`).toBe(false);
  expect(paused, `F3 on, ESC: no pause panel — the player is stranded with no way back: ${where}`).toBe(true);
  expect(capture, `the capture harness was paced behind a panel: ${where}`).toEqual({ loop: 'always', fps: 0 });
});
