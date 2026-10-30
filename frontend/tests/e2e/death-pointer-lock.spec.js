import { test, expect } from './_fixtures.js';
import { devices } from '@playwright/test';
import { bootDev, startPlayActive } from './_boot.js';

// A DEATH RELEASES A HELD POINTER, AND ON A BROWSER WITH NO POINTER LOCK IT SHOWS "YOU DIED", NOT THE CRASH PAGE.
//   - desktop: headless Chromium holds no lock, so the page stands one in before the app loads. pointerLockElement reads
//     the body until exitPointerLock is called, which counts the call and fires `pointerlockchange` as the browser would;
//     Components' listener and everything after it are the game's own. The death must release it, once.
//   - iPad: iOS and iPadOS WebKit define no Pointer Lock API (MDN browser-compat-data: Document.exitPointerLock,
//     Document.pointerLockElement and Element.requestPointerLock are safari_ios version_added false). Chromium has it,
//     so the page deletes all three before the app loads. A death must show the death screen with no page error, and
//     the Respawn button, tapped as a finger would (Playwright's touchscreen tap), must bring the player back.
// The lived proof of the iPad case is a death on a real iPad (DECISIONS item 161); this is what Chromium can show.

const IPAD = devices['iPad Pro 11 landscape'];

/** A lethal hit through the store's own damage path, past the spawn grace. */
const die = (page) => page.evaluate(() => {
  window.useGameStore.setState({ _spawnTime: 0, lastDamageTime: 0 });
  window.useGameStore.getState().damagePlayer(999999, 'e2e-lethal');
});

/** What is on screen, and the gates that decide it, for every failure message. */
const screenState = (page) => page.evaluate(() => ({
  alive: window.useGameStore.getState().isAlive,
  deathScreen: !!document.querySelector('[data-testid="death-screen"]'),
  crashPage: !!document.querySelector('[data-testid="error-boundary"]'),
  locked: document.pointerLockElement ?? null,
}));

test.describe('a death on desktop', () => {
  test('a death while the pointer is locked releases it once and shows the death screen', async ({ page }) => {
    test.setTimeout(240000);
    await page.addInitScript(() => {
      let locked = null;
      const standIn = { exits: 0 };
      Object.defineProperty(Document.prototype, 'pointerLockElement', { configurable: true, get: () => locked });
      Document.prototype.exitPointerLock = function exitPointerLock() {
        standIn.exits += 1;
        if (!locked) return;
        locked = null;
        document.dispatchEvent(new Event('pointerlockchange'));
      };
      standIn.lock = () => {
        locked = document.body;
        document.dispatchEvent(new Event('pointerlockchange'));
      };
      window.__lockStandIn = standIn;
    });
    await bootDev(page);
    await startPlayActive(page);
    await page.evaluate(() => window.__lockStandIn.lock());
    const before = await page.evaluate(() => ({ locked: !!document.pointerLockElement, active: window.__craftyTest.call('readIntents').active }));
    if (!before.locked || !before.active) throw new Error(`SETUP: the stand-in lock did not hold the input gate: ${JSON.stringify(before)}`);

    await die(page);
    let last = null;
    await expect.poll(async () => { last = await screenState(page); return last.deathScreen; },
      { timeout: 15000 }).toBe(true)
      .catch(() => { throw new Error(`the death screen never showed: ${JSON.stringify(last)}`); });
    const after = await page.evaluate(() => ({ exits: window.__lockStandIn.exits, locked: !!document.pointerLockElement }));
    console.log(`death-pointer-lock desktop: ${JSON.stringify({ ...last, ...after })}`);
    expect(last.crashPage, 'the crash page showed').toBe(false);
    expect(after.locked, 'the death left the pointer locked, so the Respawn button cannot be clicked').toBe(false);
    expect(after.exits, 'the death did not release the pointer exactly once').toBe(1);
  });
});

test.describe('a death on an iPad, where there is no Pointer Lock API', () => {
  test.use({ viewport: IPAD.viewport, userAgent: IPAD.userAgent, isMobile: IPAD.isMobile, hasTouch: IPAD.hasTouch, deviceScaleFactor: 1 });

  test('shows the death screen, not the crash page, and a tap on Respawn brings the player back', async ({ page }) => {
    test.setTimeout(240000);
    await page.addInitScript(() => {
      delete Document.prototype.exitPointerLock;
      delete Document.prototype.pointerLockElement;
      delete Element.prototype.requestPointerLock;
    });
    const errors = await bootDev(page, { withErrors: true });
    const api = await page.evaluate(() => ({
      exit: 'exitPointerLock' in document, element: 'pointerLockElement' in document, request: 'requestPointerLock' in document.body,
    }));
    if (api.exit || api.element || api.request) throw new Error(`SETUP: the page still has a Pointer Lock API: ${JSON.stringify(api)}`);
    await startPlayActive(page);

    await die(page);
    let last = null;
    await expect.poll(async () => { last = await screenState(page); return last.deathScreen || last.crashPage; },
      { timeout: 15000 }).toBe(true)
      .catch(() => { throw new Error(`neither the death screen nor the crash page showed: ${JSON.stringify(last)}`); });
    const lockErrors = errors.filter((e) => /pointer ?lock/i.test(e));
    console.log(`death-pointer-lock iPad: ${JSON.stringify(last)} errors ${JSON.stringify(lockErrors)}`);
    expect(last.crashPage, `a death on a browser with no Pointer Lock API showed the crash page: ${JSON.stringify(lockErrors)}`).toBe(false);
    expect(last.deathScreen, 'the death screen did not show').toBe(true);
    expect(lockErrors, 'a page error named the Pointer Lock API').toEqual([]);

    await page.getByTestId('death-respawn').tap({ timeout: 30000 });
    await expect.poll(async () => { last = await screenState(page); return last.alive; },
      { timeout: 10000 }).toBe(true)
      .catch(() => { throw new Error(`the Respawn tap did not bring the player back: ${JSON.stringify(last)}`); });
  });
});
