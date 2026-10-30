import { test, expect } from './_fixtures.js';
import { devices } from '@playwright/test';
import { bootDev, startPlayActive } from './_boot.js';

// A SURFACE OVER THE GAME TAKES THE INPUT, WHICHEVER WAY IT OPENED (lane L5 of the 2026-10-30 deep audit). Two surfaces
// that dropped no input gate, in the running game: VICTORY on desktop, and a chest opened from the world on touch.
// The jsdom gate tests/gates/input-live-gates.test.jsx holds every surface and opener; this is the click, the walk and
// the clock in a browser.
//
// THE VICTORY SCREEN TAKES THE INPUT: the pointer comes back, the world holds, and a click is not a verb.
//
// At the first dragon kill (world/bossSystem.js 'victory'), VICTORY went up under a held pointer lock. Its only control,
// Keep exploring, could not be clicked (under a lock every mouse event goes to the lock target), each click mined or
// placed behind the 80% scrim, and the world kept running behind it (audit row AUDIT:input:victory-under-pointer-lock).
//
// Headless Chromium holds no pointer lock, so the page stands one in before the app loads, as death-pointer-lock.spec.js
// does: pointerLockElement reads the body until exitPointerLock is called, which counts the call and fires
// `pointerlockchange` as the browser would. Components' listener and everything after it are the game's own. The raise is
// the store write bossSystem makes; the clicks are real Playwright mouse clicks, through the game's own window listener,
// aimed down at the ground by a capture listener that turns the camera before the game's handler casts the build ray.
//
// The control comes first: the same aimed click with no victory up mines (the instrument can see a verb and an edit).

/** In the page: arm the next mousedown. The capture listener turns the camera to look down at the ground and records
 *  the cell the build ray would mine; the bubble listener, after the game's own, records what the press became. */
function armClick({ pitch }) {
  const call = (n) => window.__craftyTest.call(n);
  const cam = window.__threeCamera;
  const rec = { pitch };
  window.__e2eClick = rec;
  let before = null;
  window.addEventListener('mousedown', () => {
    before = call('readCompatMouse') ?? null;
    cam.rotation.order = 'YXZ'; cam.rotation.x = pitch; cam.updateMatrixWorld();
    const s = window.useGameStore.getState();
    const hit = window.GameMethods.castBuildRay();
    rec.cell = hit ? `${hit.targetedX}_${hit.targetedY}_${hit.targetedZ}` : null;
    rec.cellBefore = rec.cell ? (s.worldBlocks.get(rec.cell) ?? null) : null;
    rec.sizeBefore = s.worldBlocks.size;
  }, { capture: true, once: true });
  window.addEventListener('mousedown', () => {
    const after = call('readCompatMouse');
    const s = window.useGameStore.getState();
    rec.pressed = !!(before && after && after.presses.mouse > before.presses.mouse);
    rec.verb = after?.verbs?.mouse ?? null;
    rec.cellAfter = rec.cell ? (s.worldBlocks.get(rec.cell) ?? null) : null;
    rec.sizeAfter = s.worldBlocks.size;
  }, { once: true });
}

/** One aimed left click at (x, y); what it became. */
async function aimedClick(page, x, y) {
  await page.evaluate(armClick, { pitch: -0.9 });
  await page.mouse.click(x, y, { button: 'left' });
  return page.evaluate(() => window.__e2eClick);
}

const readState = (page) => page.evaluate(() => {
  const s = window.useGameStore.getState();
  return {
    victoryPending: s.victoryPending,
    overlay: !!document.querySelector('[data-testid="victory-overlay"]'),
    locked: !!document.pointerLockElement,
    exits: window.__lockStandIn.exits,
    active: window.__craftyTest.call('readIntents').active,
    showSettings: s.showSettings,
    worldNow: window.__craftyTest.call('worldNow'),
  };
});

test.describe('the victory screen on desktop', () => {
  test('releases the held pointer, holds the world, opens no pause panel, and a click on the scrim edits nothing', async ({ page }) => {
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
    await page.waitForFunction(() => window.GameMethods?.castBuildRay && window.__threeCamera, null, { timeout: 60000 })
      .catch((e) => { throw new Error(`SETUP: the build ray and camera never came up — ${e.message}`); });
    await page.evaluate(() => window.__lockStandIn.lock());
    const held = await readState(page);
    if (!held.locked || !held.active) throw new Error(`SETUP: the stand-in lock did not hold the input gate: ${JSON.stringify(held)}`);

    // PRESENCE: with nothing up, the same aimed click is a verb and edits the world.
    const control = await aimedClick(page, 640, 400);
    console.log(`[victory-input] control click: ${JSON.stringify(control)}`);
    expect(control.cell, `SETUP: the aimed build ray hit nothing (${JSON.stringify(control)})`).not.toBeNull();
    expect({ pressed: control.pressed, verb: control.verb },
      `SETUP: the control click was not a mine, so the instrument cannot see one (${JSON.stringify(control)})`)
      .toEqual({ pressed: true, verb: 'mine' });
    expect(control.cellAfter, `SETUP: the control mine did not edit its cell (${JSON.stringify(control)})`).not.toBe(control.cellBefore);

    // The raise bossSystem makes at the tier-0 kill.
    const exitsBefore = (await readState(page)).exits;
    await page.evaluate(() => window.useGameStore.setState({ victoryPending: true }));
    let last = null;
    await expect.poll(async () => { last = await readState(page); return last.overlay; }, { timeout: 15000 }).toBe(true)
      .catch(() => { throw new Error(`SETUP: the victory overlay never showed: ${JSON.stringify(last)}`); });
    await expect.poll(async () => { last = await readState(page); return last.locked; }, { timeout: 5000 }).toBe(false)
      .catch(() => { throw new Error(`victory left the pointer locked, so Keep exploring cannot be clicked: ${JSON.stringify(last)}`); });
    expect(last.exits - exitsBefore, 'victory did not release the pointer').toBeGreaterThanOrEqual(1);
    expect(last.showSettings, 'the release under victory opened the pause panel under it').toBe(false);

    // The world holds behind the scrim.
    const t0 = (await readState(page)).worldNow;
    await page.waitForTimeout(600);
    const t1 = (await readState(page)).worldNow;
    console.log(`[victory-input] world clock under victory: ${t0} -> ${t1}`);
    expect(t1 - t0, 'the world clock ran on behind the victory screen').toBe(0);

    // A click on the scrim, aimed at the ground, reaches the game and is no verb; the world is not edited.
    const under = await aimedClick(page, 60, 60);
    console.log(`[victory-input] click under victory: ${JSON.stringify(under)}`);
    expect(under.pressed, `SETUP: the click never reached the game's mouse listener (${JSON.stringify(under)})`).toBe(true);
    expect(under.verb, `a click on the victory scrim was routed to a verb (${JSON.stringify(under)})`).toBeNull();
    expect({ cell: under.cellAfter, size: under.sizeAfter }, `a click on the victory scrim edited the world (${JSON.stringify(under)})`)
      .toEqual({ cell: under.cellBefore, size: under.sizeBefore });
    expect((await readState(page)).victoryPending, 'a click on the scrim dismissed the victory screen').toBe(true);

    // Keep exploring answers the click.
    await page.getByTestId('victory-keep-exploring').click({ timeout: 15000 });
    await expect.poll(async () => { last = await readState(page); return last.victoryPending; }, { timeout: 10000 }).toBe(false)
      .catch(() => { throw new Error(`Keep exploring did not dismiss the victory screen: ${JSON.stringify(last)}`); });
  });
});

// A CHEST OPENED FROM THE WORLD ON TOUCH HOLDS THE WORLD AND THE PLAYER (AUDIT:input:touch-panel-world-runs).
//
// Touch has no pointer lock, so the world opener (Terrain's open(), reached by the interact verb) drops no input gate:
// the world ran on behind the chest's scrim, mobs kept hitting and the player could die inside the menu. The opener here
// is the store write Terrain's open() makes (the chest's coordinates and its flag; its pointer release is a no-op on
// touch). A held W stands in for an iPad's keyboard: it drives the Player loop's walk, which reads the same gate.
const IPAD = devices['iPad Pro 11 landscape'];

/** In the page: the body's ground-plane travel while W is held for `n` frames. */
async function walkFrames(page, n) {
  const from = await page.evaluate(() => { const t = window.useGameStore.getState().playerRigidBodyRef.current.translation(); return { x: t.x, z: t.z }; });
  await page.keyboard.down('w');
  await page.evaluate((count) => new Promise((resolve) => {
    let left = count;
    const tick = () => { left -= 1; if (left <= 0) resolve(); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }), n);
  await page.keyboard.up('w');
  const to = await page.evaluate(() => { const t = window.useGameStore.getState().playerRigidBodyRef.current.translation(); return { x: t.x, z: t.z }; });
  return Math.round(Math.hypot(to.x - from.x, to.z - from.z) * 100) / 100;
}

const worldClockOver = async (page, ms) => {
  const t0 = await page.evaluate(() => window.__craftyTest.call('worldNow'));
  await page.waitForTimeout(ms);
  const t1 = await page.evaluate(() => window.__craftyTest.call('worldNow'));
  return t1 - t0;
};

test.describe('a chest opened from the world on touch', () => {
  test.use({ viewport: IPAD.viewport, userAgent: IPAD.userAgent, isMobile: IPAD.isMobile, hasTouch: IPAD.hasTouch, deviceScaleFactor: 1 });

  test('holds the world clock and the walk while it is up', async ({ page }) => {
    test.setTimeout(240000);
    await bootDev(page);
    await startPlayActive(page);
    await page.waitForFunction(() => window.useGameStore.getState().playerRigidBodyRef?.current, null, { timeout: 60000 })
      .catch((e) => { throw new Error(`SETUP: the player body never came up — ${e.message}`); });

    // PRESENCE: in play the clock runs and a held W walks.
    const liveClock = await worldClockOver(page, 600);
    const liveWalk = await walkFrames(page, 40);
    console.log(`[input-live] touch, in play: world clock +${liveClock} ms, walk ${liveWalk} m`);
    expect(liveClock, 'SETUP: the world clock does not run in play, so a hold cannot be seen').toBeGreaterThan(200);
    expect(liveWalk, 'SETUP: a held W does not walk in play, so a held walk cannot be seen').toBeGreaterThan(0.3);

    // Terrain's open(): the chest's coordinates and its flag.
    await page.evaluate(() => { const s = window.useGameStore.getState(); s.setActiveChestCoords('0_0_0'); s.setShowChestInterface(true); });
    const active = await page.evaluate(() => window.__craftyTest.call('readIntents').active);
    console.log(`[input-live] touch, chest open: the input gate is ${active ? 'still up' : 'down'}`);

    const heldClock = await worldClockOver(page, 600);
    const heldWalk = await walkFrames(page, 40);
    console.log(`[input-live] touch, chest open: world clock +${heldClock} ms, walk ${heldWalk} m`);
    expect(heldClock, 'the world ran on behind the chest opened from the world').toBe(0);
    expect(heldWalk, 'a held W walked the player behind the chest').toBeLessThan(0.05);
  });
});
