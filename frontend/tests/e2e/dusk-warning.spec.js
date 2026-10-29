import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';
import { STRINGS } from '../../src/i18n/strings.js';
import { HALF_CYCLE_UNITS } from '../../src/game/dayNight.js';

// THE DUSK WARNING: ONCE PER DUSK, CLEAR OF THE DIAL, IN THE PLAYER'S LANGUAGE (STATUS G-ledger 38/a; the HUD lane's
// task script, A4). The day clock is set just short of the dusk window and left to RUN into it at its real rate (the
// watcher polls once a second); every toast the HUD adds is logged by a MutationObserver from before the edge, so a
// warning that came and went between two reads is still counted. Then the game is taken through a night (which
// re-arms the watcher), switched to zh-CN, and brought to the next dusk.
//   1. exactly one dusk toast in the window, and none of anything else carrying the dusk key;
//   2. the toast's box does not intersect the day-phase dial's;
//   3. in zh-CN the next dusk's toast reads the Chinese string, once.
// NOT RUN LOCALLY (no local e2e): its browser mutants (the dedupe off and the watcher fired twice; the stack back over the
// dial) are argued from tests/gates/notification-channel-gates.test.jsx and the jsdom cases there.

const DUSK_EDGE = HALF_CYCLE_UNITS * 0.82; // dayPhase.isDuskApproaching: the last 18% of the day half

/** Log every toast added to the page from now on: [{ key, text, at }]. */
const installToastLog = (page) => page.evaluate(() => {
  const log = [];
  window.__toastLog = log;
  new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (!(n instanceof Element)) continue;
        const toasts = n.matches('[data-testid="notification"]') ? [n] : [...n.querySelectorAll('[data-testid="notification"]')];
        for (const el of toasts) log.push({ key: el.getAttribute('data-notification-key'), text: el.textContent, at: performance.now() });
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
});

const duskToasts = (page) => page.evaluate(() => window.__toastLog.filter((x) => x.key === 'notice.dusk'));

/** Put the clock `units` before the dusk edge of the day half starting at `dayStart`, then let it run into the window. */
const toDusk = (page, dayStart) => page.evaluate(({ at }) => {
  window.useGameStore.setState({ gameTime: at, isDay: true });
}, { at: dayStart + DUSK_EDGE - 8 });

test('the dusk warning shows once, clear of the dial, and in Chinese with zh-CN selected', async ({ page }) => {
  test.setTimeout(300000);
  await bootDev(page);
  await startPlayActive(page);
  await expect.poll(() => page.evaluate(() => !!document.querySelector('[data-testid="day-phase-dial"]')),
    { timeout: 30000, message: 'SETUP: the HUD (and its dial) is not on screen' }).toBe(true);
  await installToastLog(page);

  await toDusk(page, 0);
  await expect.poll(async () => (await duskToasts(page)).length, { timeout: 20000, message: 'no dusk toast within 20 s of the edge' }).toBeGreaterThan(0);
  const boxes = await page.evaluate(() => {
    const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right, bottom: b.bottom }; };
    return { toast: r('[data-notification-key="notice.dusk"]'), dial: r('[data-testid="day-phase-dial"]'), clock: window.useGameStore.getState().gameTime };
  });
  await page.waitForTimeout(6000); // still inside the window: a second warning would land here
  const en = await duskToasts(page);
  const state = await page.evaluate(() => ({ gameTime: window.useGameStore.getState().gameTime, isDay: window.useGameStore.getState().isDay }));
  console.log(`dusk-warning en: ${en.length} dusk toast(s) ${JSON.stringify(en.map((x) => x.text))}; boxes ${JSON.stringify(boxes)}; clock now ${JSON.stringify(state)}`);
  expect(state.isDay, `SETUP: the clock left the day before the window was watched (${JSON.stringify(state)})`).toBe(true);
  expect(en.map((x) => x.text)).toEqual([STRINGS.en['notice.dusk']]);
  expect(boxes.toast && boxes.dial, `SETUP: the toast or the dial was not on screen: ${JSON.stringify(boxes)}`).toBeTruthy();
  const hit = !(boxes.toast.right <= boxes.dial.x || boxes.dial.right <= boxes.toast.x || boxes.toast.bottom <= boxes.dial.y || boxes.dial.bottom <= boxes.toast.y);
  expect(hit, `the dusk toast covers the day-phase dial: ${JSON.stringify(boxes)}`).toBe(false);

  // A night re-arms the watcher; then zh-CN and the next day's dusk.
  await page.evaluate((night) => window.useGameStore.setState({ gameTime: night, isDay: false }), HALF_CYCLE_UNITS * 1.5);
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.useGameStore.getState().setLocale('zh-CN'));
  await toDusk(page, HALF_CYCLE_UNITS * 2);
  await expect.poll(async () => (await duskToasts(page)).length, { timeout: 20000, message: 'no second dusk toast after a night' }).toBeGreaterThan(1);
  await page.waitForTimeout(6000);
  const all = await duskToasts(page);
  console.log(`dusk-warning zh-CN: ${all.length - en.length} dusk toast(s) ${JSON.stringify(all.slice(en.length).map((x) => x.text))}`);
  expect(all.slice(en.length).map((x) => x.text)).toEqual([STRINGS['zh-CN']['notice.dusk']]);
});
