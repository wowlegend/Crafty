import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';
import { HUB_NPC_ANCHORS } from '../../src/world/hubLayout.js';
import { TALK_RANGE } from '../../src/input/talk.js';
import { getWeaponBaseDamage } from '../../src/game/equipment.js';

// MARA'S FORGE, IN THE BOOTED GAME (W2-F step 5; DECISIONS 2026-10-28 W1-H item 7, 2026-10-29 items 60-68; plan
// docs/superpowers/plans/2026-10-29-crafty-w2f-forge.md, step 4). A fresh profile at noon with a Stone Sword in hand and
// the coins for the Iron Sword: (1) G pressed 9 m from Mara opens nothing (the talk is range-gated, and the instrument
// below sees the card when it opens); (2) W held, the camera steered at her each drawn frame, walks the player into
// reach; (3) G opens the Forge card; (4) a real click on the weapon line's Buy puts the Iron Sword in hand, the hand's
// base damage rises from the Stone Sword's, and the price is spent; (5) a click on the next blade's Buy, with nothing
// left to pay, says what is short and changes nothing; (6) Esc closes the card, and C opens no panel; (7) a real left
// click still kills a staged 1-HP zombie; (8) the save the autosave's action writes holds the Iron Sword in hand.
//
// Every wait after a key release is counted in drawn frames, never wall time: a CI frame can last seconds. The card's
// refusal is a line in the card itself (data-testid forge-message), not a short-lived toast.
//
// WHAT THIS DOES NOT CHECK: the touch tray's Talk button in a browser (tests/gates/forge-panel-gates.test.jsx drives
// activateTrayRow against the real store), the relic line and the goods in a browser (the same gate, and
// tests/store/forge.test.js), a real iPad, or the e2e's browser mutants (CI runs this spec; no local browser run).
//
// Mutation-Proof: see the commit trailer.

const MARA = HUB_NPC_ANCHORS.find((a) => a.role === 'smith').pos;
// Straight south of her, clear of the forge behind her and of the Hearth at the origin.
const START = { x: MARA[0], z: MARA[1] + 9 };

/** In the page: `n` drawn frames. */
async function frames(n) {
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  for (let i = 0; i < n; i++) await frame();
}

/** A key released, then frames drawn, so the frame loop sees the release before anything else happens. */
async function release(page, key) {
  await page.keyboard.up(key);
  await page.evaluate(frames, 3);
}

/** In the page: Mara's entity, the start of the walk staged, and every hostile near killed. */
async function stage({ mara, start }) {
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const s = window.useGameStore.getState();
  s.setTimeOfDay?.(0.5);
  const near = (m) => m.type === 'villager' && Math.hypot(m.x - mara[0], m.z - mara[1]) < 1.5;
  const t0 = performance.now();
  while (!window.__craftyTest.call('readMobs').some(near)) {
    if (performance.now() - t0 > 60000) return { why: 'SETUP: Mara never stood at her anchor (the hub NPCs did not spawn)' };
    await frame();
  }
  const cam = window.__threeCamera;
  for (const m of window.__craftyTest.call('readMobs')) {
    if (m.health > 0 && !m.passive && Math.hypot(m.x - start.x, m.z - start.z) < 80) window.GameMethods.damageMob(m.id, 99999, 'physical', 'ally');
  }
  const ground = s.getMobGroundLevel?.(start.x, start.z);
  if (!Number.isFinite(ground)) return { why: `SETUP: no ground under the start (${ground})` };
  const rb = s.playerRigidBodyRef?.current;
  if (!rb) return { why: 'SETUP: no player body' };
  rb.setTranslation({ x: start.x, y: ground + 1.2, z: start.z }, true);
  rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
  // A fresh profile with its Stone Sword in hand and exactly the coins the Iron Sword costs.
  window.useGameStore.setState({ coins: 30 });
  if (!s.equipItem) return { why: 'SETUP: no equipItem' };
  s.equipItem('weapon', 'Stone Sword');
  for (let i = 0; i < 20; i++) await frame();
  const g = window.useGameStore.getState();
  return {
    dist: Math.hypot(cam.position.x - mara[0], cam.position.z - mara[1]),
    weapon: g.equipment.weapon, coins: g.coins, iron: g.inventory.blocks.iron, sword: g.inventory.blocks['Stone Sword'] || 0,
  };
}

/** In the page: turn the camera level and toward Mara. */
function faceMara(mara) {
  const cam = window.__threeCamera;
  const dx = mara[0] - cam.position.x, dz = mara[1] - cam.position.z;
  cam.rotation.order = 'YXZ'; cam.rotation.x = 0; cam.rotation.y = Math.atan2(-dx, -dz); cam.updateMatrixWorld();
  return Math.hypot(dx, dz);
}

/** In the page, with W held: steer at Mara every drawn frame until the camera is within `stopAt` of her. */
async function walkTo({ mara, stopAt, maxFrames }) {
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const cam = window.__threeCamera;
  const face = () => {
    const dx = mara[0] - cam.position.x, dz = mara[1] - cam.position.z;
    cam.rotation.order = 'YXZ'; cam.rotation.x = 0; cam.rotation.y = Math.atan2(-dx, -dz); cam.updateMatrixWorld();
    return Math.hypot(dx, dz);
  };
  const from = face();
  let d = from, n = 0;
  while (d > stopAt && n < maxFrames) { await frame(); d = face(); n++; }
  return { from, to: d, frames: n, active: window.__craftyTest.call('readIntents').active, alive: window.useGameStore.getState().isAlive };
}

const read = (page) => page.evaluate(() => {
  const s = window.useGameStore.getState();
  return { weapon: s.equipment.weapon, coins: s.coins, iron: s.inventory.blocks.iron ?? 0, diamond: s.inventory.blocks.diamond ?? 0,
    stoneSword: s.inventory.blocks['Stone Sword'] ?? 0, forge: s.showForge,
    panels: ['showInventory', 'showForge', 'showMagic', 'showBuildingTools', 'showSettings', 'showTradingInterface', 'showQuestLog'].filter((k) => s[k]) };
});

test.describe('the Forge', () => {
  test.setTimeout(240000);

  test('walk to Mara, press G, buy the Iron Sword: the hand hits harder; a purchase short of coins says so; C opens nothing', async ({ page }) => {
    await bootDev(page);
    await startPlayActive(page);
    await page.waitForFunction(() => window.__craftyTest?.call('readMobs') && window.__threeCamera && window.GameMethods?.damageMob
      && window.useGameStore.getState().getMobGroundLevel && window.useGameStore.getState().spawnMob
      && window.useGameStore.getState().getMobFloor, null, { timeout: 60000 })
      .catch((e) => { throw new Error(`SETUP: the mob hooks and camera never came up — ${e.message}`); });

    const staged = await page.evaluate(stage, { mara: MARA, start: START });
    expect(staged.why, staged.why).toBeUndefined();
    expect(staged, 'SETUP: the profile is not a Stone Sword in hand, 30 coins and 4 iron').toMatchObject({ weapon: 'Stone Sword', coins: 30, iron: 4 });
    expect(staged.dist, `SETUP: the walk does not start out of talk range (${staged.dist} m)`).toBeGreaterThan(TALK_RANGE + 3);

    // 1. OUT OF REACH, G OPENS NOTHING.
    await page.evaluate(faceMara, MARA);
    await page.keyboard.press('g');
    await page.evaluate(frames, 10);
    expect((await read(page)).forge, 'G opened the Forge from 9 m away').toBe(false);

    // 2. WALK INTO REACH on a held W.
    await startPlayActive(page);
    await page.keyboard.down('w');
    const walk = await page.evaluate(walkTo, { mara: MARA, stopAt: TALK_RANGE - 1, maxFrames: 900 });
    await release(page, 'w');
    expect(walk.to, `W held did not walk the player to Mara: ${JSON.stringify(walk)}`).toBeLessThanOrEqual(TALK_RANGE - 1);
    expect(walk.from - walk.to, `the player did not move: ${JSON.stringify(walk)}`).toBeGreaterThan(3);

    // 3. G OPENS THE FORGE CARD.
    const reach = await page.evaluate(faceMara, MARA);
    expect(reach, `SETUP: the player drifted out of reach after the walk (${reach} m)`).toBeLessThan(TALK_RANGE);
    await page.keyboard.press('g');
    await expect(page.getByTestId('forge-panel'), 'G beside Mara did not open the Forge').toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('forge-price-weapon:Iron Sword-coins')).toHaveText('30 coins (have 30)');

    // 4. A REAL CLICK ON BUY: the Iron Sword in hand, the hand's base damage up, the price spent.
    const before = await read(page);
    await page.getByTestId('forge-buy-weapon:Iron Sword').click();
    await expect.poll(async () => (await read(page)).weapon, { message: 'the click on Buy left the Stone Sword in hand', timeout: 15000 }).toBe('Iron Sword');
    const after = await read(page);
    expect(getWeaponBaseDamage(after.weapon), 'the new blade hits no harder').toBeGreaterThan(getWeaponBaseDamage(before.weapon));
    expect({ coins: after.coins, iron: after.iron, stoneSword: after.stoneSword }, 'the purchase did not spend exactly its price')
      .toEqual({ coins: before.coins - 30, iron: before.iron - 4, stoneSword: before.stoneSword });
    await expect(page.getByTestId('forge-message')).toHaveText('Forged: Iron Sword');

    // 5. A PURCHASE THE PLAYER CANNOT PAY FOR SAYS WHAT IS SHORT AND CHANGES NOTHING.
    await page.getByTestId('forge-buy-weapon:Diamond Sword').click();
    await expect(page.getByTestId('forge-message'), 'a purchase short of its price was not refused in words').toHaveText('Not enough: 4 Diamond Ore (have 0), 80 coins (have 0)');
    const refused = await read(page);
    expect({ weapon: refused.weapon, coins: refused.coins, diamond: refused.diamond }, 'a refused purchase changed the player').toEqual({ weapon: 'Iron Sword', coins: 0, diamond: after.diamond });

    // 6. ESC CLOSES THE CARD; C OPENS NO PANEL.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('forge-panel')).toHaveCount(0, { timeout: 15000 });
    await startPlayActive(page);
    await page.keyboard.press('c');
    await page.evaluate(frames, 10);
    expect((await read(page)).panels, 'C opened a panel').toEqual([]);

    // 7. IT STILL FIGHTS: a real left click kills a staged 1-HP zombie ahead.
    const z = await page.evaluate(() => {
      const s = window.useGameStore.getState();
      const cam = window.__threeCamera;
      cam.rotation.x = 0; cam.updateMatrixWorld();
      const d = new cam.position.constructor();
      cam.getWorldDirection(d); d.y = 0; d.normalize();
      const gx = cam.position.x - d.x * 2.5, gz = cam.position.z - d.z * 2.5; // behind, away from Mara
      const before = new Set(window.__craftyTest.call('readMobs').map((m) => m.id));
      s.spawnMob(gx, gz, 'zombie', s.getMobFloor(gx, gz, cam.position.y - 1.6));
      const m = window.__craftyTest.call('readMobs').find((e) => !before.has(e.id));
      if (!m) return { why: 'SETUP: spawnMob added no zombie' };
      window.GameMethods.damageMob(m.id, m.health - 1, 'physical', 'ally');
      cam.lookAt(m.x, m.y + 0.8, m.z);
      return { id: m.id };
    });
    expect(z.why, z.why).toBeUndefined();
    await page.mouse.move(640, 400);
    await page.mouse.click(640, 400);
    await expect.poll(() => page.evaluate((id) => {
      const m = window.__craftyTest.call('readMobs').find((e) => e.id === id);
      return !m || m.health <= 0;
    }, z.id), { message: 'a left click with the Iron Sword did not kill a 1-HP zombie', timeout: 20000 }).toBe(true);

    // 8. IT SAVES the Iron Sword in hand, through the autosave's action and localStorage.
    const saved = await page.evaluate(() => {
      window.useGameStore.getState().saveActiveWorld({ x: 0, y: 18, z: 0 });
      const id = localStorage.getItem('crafty_active_world');
      const blob = id ? JSON.parse(localStorage.getItem('crafty_world_save_' + id) || 'null') : null;
      return blob && { weapon: blob.progression.equipment.weapon, coins: blob.progression.coins, relicTiers: blob.progression.relicTiers };
    });
    expect(saved, 'SETUP: saveActiveWorld wrote no world blob').not.toBeNull();
    expect(saved).toEqual({ weapon: 'Iron Sword', coins: 0, relicTiers: {} });
  });
});
