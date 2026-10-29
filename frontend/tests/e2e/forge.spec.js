import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';
import { installWorldHold } from './_worldHold.js';
import { HUB_NPC_ANCHORS } from '../../src/world/hubLayout.js';
import { TALK_RANGE } from '../../src/input/talk.js';
import { getWeaponBaseDamage } from '../../src/game/equipment.js';
import { SWING_APEX_OVER_BODY_M } from '../../src/combat/swingOrigin.js';

// MARA'S FORGE, IN THE BOOTED GAME (W2-F step 5; DECISIONS 2026-10-28 W1-H item 7, 2026-10-29 items 60-68; plan
// docs/superpowers/plans/2026-10-29-crafty-w2f-forge.md, step 4). A fresh profile at noon with a Stone Sword in hand and
// the coins for the Iron Sword: (1) G pressed 9 m or more from Mara opens nothing (the talk is range-gated, and the
// instrument below sees the card when it opens); (2) W held, the camera steered at her live position each drawn frame
// (she walks a 2 m circle round her post by day), walks the player into reach; (3) G opens the Forge card; (4) a real click on the weapon line's Buy puts the Iron Sword in hand, the hand's
// base damage rises from the Stone Sword's, and the price is spent; (5) a click on the next blade's Buy, with nothing
// left to pay, says what is short and changes nothing; (6) Esc closes the card, and C opens no panel; (7) a real T
// press still kills a staged 1-HP zombie; (8) the save the autosave's action writes holds the Iron Sword in hand.
//
// Every wait after a key release is counted in drawn frames, never wall time: a CI frame can last seconds. The card's
// refusal is a line in the card itself (data-testid forge-message), not a short-lived toast. The world is held
// (_worldHold.js) twice: from the frame the walk reaches Mara until the card is up, and from the zombie's staging until
// the kill is read.
//
// WHAT THIS DOES NOT CHECK: the touch tray's Talk button in a browser (tests/gates/forge-panel-gates.test.jsx drives
// activateTrayRow against the real store), the relic line and the goods in a browser (the same gate, and
// tests/store/forge.test.js), a real iPad, or the e2e's browser mutants (CI runs this spec; no local browser run).
//
// Mutation-Proof: see the commit trailer.

// Mara's post. By day she walks a small circle around it (game/npcRoutine.js), so every distance below is read from her
// live entity (the readMobs hook's `role`), and the post only places the start of the walk.
const MARA_POST = HUB_NPC_ANCHORS.find((a) => a.role === 'smith').pos;
// Straight south of her post, clear of the forge behind her and of the Hearth at the origin.
const START = { x: MARA_POST[0], z: MARA_POST[1] + 11 };

/** In the page: every living hostile within `r` m of the camera killed, so nothing fights the player between steps. */
function clearHostiles(r) {
  const cam = window.__threeCamera;
  let n = 0;
  for (const m of window.__craftyTest.call('readMobs')) {
    if (m.health > 0 && !m.passive && Math.hypot(m.x - cam.position.x, m.z - cam.position.z) < r) {
      window.GameMethods.damageMob(m.id, 99999, 'physical', 'ally');
      n++;
    }
  }
  return n;
}

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
async function stage({ start }) {
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const s = window.useGameStore.getState();
  s.setTimeOfDay?.(0.5);
  const mara = () => window.__craftyTest.call('readMobs').find((e) => e.role === 'smith' && e.health > 0);
  const t0 = performance.now();
  while (!mara()) {
    if (performance.now() - t0 > 60000) return { why: 'SETUP: Mara never spawned (the hub NPCs)' };
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
  const m = mara();
  return {
    dist: Math.hypot(cam.position.x - m.x, cam.position.z - m.z),
    weapon: g.equipment.weapon, coins: g.coins, iron: g.inventory.blocks.iron, sword: g.inventory.blocks['Stone Sword'] || 0,
  };
}

/** In the page: turn the camera level and toward Mara where she stands now; returns the distance to her. */
function faceMara() {
  const cam = window.__threeCamera;
  const m = window.__craftyTest.call('readMobs').find((e) => e.role === 'smith' && e.health > 0);
  if (!m) return null;
  const dx = m.x - cam.position.x, dz = m.z - cam.position.z;
  cam.rotation.order = 'YXZ'; cam.rotation.x = 0; cam.rotation.y = Math.atan2(-dx, -dz); cam.updateMatrixWorld();
  return Math.hypot(dx, dz);
}

/** In the page, with W held: steer at Mara where she stands every drawn frame until the camera is within `stopAt`, then
 *  in that same frame let W go and hold the world (_worldHold.js), which stops the player's own motion from the next
 *  frame, Mara's circle with it, and every hostile, until the spec releases it once G has opened the card. The press is
 *  the real key. Its release is dispatched here (the game's own keyup handler takes it, as heavy-melee.spec.js's
 *  in-page T and R are taken) and the hold is here because a CI frame is up to a 0.25 s step of a 14 m/s walk: run
 *  40857037845 measured the player carried 4.5-5.4 m past her by the round trip back to Playwright, and run
 *  40859622498 measured 4.3 m after an in-page keyup alone. */
async function walkTo({ stopAt, maxFrames, capMs }) {
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const cam = window.__threeCamera;
  const face = () => {
    const m = window.__craftyTest.call('readMobs').find((e) => e.role === 'smith' && e.health > 0);
    if (!m) return Infinity;
    const dx = m.x - cam.position.x, dz = m.z - cam.position.z;
    cam.rotation.order = 'YXZ'; cam.rotation.x = 0; cam.rotation.y = Math.atan2(-dx, -dz); cam.updateMatrixWorld();
    return Math.hypot(dx, dz);
  };
  const from = face();
  let d = from, n = 0;
  while (d > stopAt && n < maxFrames) { await frame(); d = face(); n++; }
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true }));
  if (!window.__e2eHoldWorld) return { why: 'SETUP: the world hold was never installed (page.addInitScript(installWorldHold))' };
  window.__e2eHoldWorld({ capMs });
  for (let i = 0; i < 3; i++) await frame();
  return { from, to: d, settled: face(), frames: n, active: window.__craftyTest.call('readIntents').active, alive: window.useGameStore.getState().isAlive };
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
    await page.addInitScript(installWorldHold);
    await bootDev(page);
    await startPlayActive(page);
    await page.waitForFunction(() => window.__craftyTest?.call('readMobs') && window.__threeCamera && window.GameMethods?.damageMob
      && window.useGameStore.getState().getMobGroundLevel && window.useGameStore.getState().spawnMob
      && window.useGameStore.getState().getMobFloor, null, { timeout: 60000 })
      .catch((e) => { throw new Error(`SETUP: the mob hooks and camera never came up — ${e.message}`); });

    const staged = await page.evaluate(stage, { start: START });
    expect(staged.why, staged.why).toBeUndefined();
    expect(staged, 'SETUP: the profile is not a Stone Sword in hand, 30 coins and 4 iron').toMatchObject({ weapon: 'Stone Sword', coins: 30, iron: 4 });
    expect(staged.dist, `SETUP: the walk does not start out of talk range (${staged.dist} m)`).toBeGreaterThan(TALK_RANGE + 3);

    // 1. OUT OF REACH, G OPENS NOTHING.
    const far = await page.evaluate(faceMara);
    await page.keyboard.press('g');
    await page.evaluate(frames, 10);
    expect((await read(page)).forge, `G opened the Forge from ${far} m away`).toBe(false);

    // 2. WALK INTO REACH on a held W, steering at Mara where she stands (she walks a small circle by day).
    await page.evaluate(clearHostiles, 80);
    await startPlayActive(page);
    await page.keyboard.down('w');
    const walk = await page.evaluate(walkTo, { stopAt: TALK_RANGE - 1.5, maxFrames: 900, capMs: test.info().timeout || 240000 });
    await release(page, 'w');
    expect(walk.why, walk.why).toBeUndefined();
    expect(walk.to, `W held did not walk the player to Mara: ${JSON.stringify(walk)}`).toBeLessThanOrEqual(TALK_RANGE - 1.5);
    expect(walk.from - walk.to, `the player did not move: ${JSON.stringify(walk)}`).toBeGreaterThan(3);
    expect(walk.settled, `SETUP: the player did not stop in reach when W was let go: ${JSON.stringify(walk)}`).toBeLessThan(TALK_RANGE);

    // 3. G OPENS THE FORGE CARD.
    await page.evaluate(clearHostiles, 80);
    const reach = await page.evaluate(faceMara);
    expect(reach, `SETUP: Mara or the player moved out of reach after the walk (${reach} m)`).toBeLessThan(TALK_RANGE);
    await page.keyboard.press('g');
    await expect(page.getByTestId('forge-panel'), 'G beside Mara did not open the Forge').toBeVisible({ timeout: 20000 });
    // The walk's hold has done its job (the player stood in reach for G); the card's steps run with the world going.
    const walkHold = await page.evaluate(() => window.__e2eWorldHold.release());
    expect(walkHold.lapsed, `SETUP: the walk's world hold ran out before G (${JSON.stringify(walkHold)})`).toBe(false);
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
    // The card's flag drops on the key; its exit tween runs on drawn frames, which on CI have lasted 8 s each (run
    // 40867682586), so the DOM's removal is waited for in frames, not seconds.
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await read(page)).forge, { message: 'Esc did not close the Forge', timeout: 15000 }).toBe(false);
    const gone = await page.evaluate(async () => {
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      let n = 0;
      while (document.querySelector('[data-testid="forge-panel"]') && n < 600) { await frame(); n++; }
      return { gone: !document.querySelector('[data-testid="forge-panel"]'), frames: n };
    });
    expect(gone.gone, `the Forge card stayed in the page ${gone.frames} drawn frames after Esc`).toBe(true);
    await page.evaluate(clearHostiles, 80);
    await startPlayActive(page);
    await page.keyboard.press('c');
    await page.evaluate(frames, 10);
    expect((await read(page)).panels, 'C opened a panel').toEqual([]);

    // 7. IT STILL FIGHTS: a real T press (the melee key) kills a staged 1-HP zombie, with the world held from the staging
    // so neither it nor anything else moves or strikes before the press (tests/e2e/talents.spec.js stages its kill so).
    // The zombie stands 2.5 m from the player on the player's own floor, in a heading clear of Mara, and the staging
    // checks the game's own melee cone (GameMethods.checkMobsInMeleeCone, from the swing's apex) holds it before the
    // press: the hub's raised grade put a zombie staged at a fixed quarter turn on another level, outside the cone's
    // vertical reach, and a left click there mined the ground instead (run 40853867973: the page's Stone 17).
    const z = await page.evaluate(({ capMs, apex }) => {
      const s = window.useGameStore.getState();
      const cam = window.__threeCamera;
      const body = s.playerRigidBodyRef?.current?.translation();
      if (!body) return { why: 'SETUP: no player body' };
      window.__e2eHoldWorld({ capMs });
      const origin = { x: body.x, y: body.y + apex, z: body.z };
      const feet = cam.position.y - 1.6; // as talents.spec.js stages its zombie
      const own = s.getMobFloor(body.x, body.z, feet);
      const floor = Number.isFinite(own) ? own : feet;
      const mara = window.__craftyTest.call('readMobs').find((e) => e.role === 'smith');
      const tried = [];
      for (let k = 0; k < 12; k++) {
        const yaw = (k * Math.PI) / 6;
        const dir = { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) };
        if (mara) {
          const mx = mara.x - body.x, mz = mara.z - body.z, ml = Math.hypot(mx, mz) || 1;
          if ((dir.x * mx + dir.z * mz) / ml > 0.5) { tried.push(`${k}: toward Mara`); continue; }
        }
        const gx = body.x + dir.x * 2.5, gz = body.z + dir.z * 2.5;
        const f = s.getMobFloor(gx, gz, feet);
        if (!Number.isFinite(f) || Math.abs(f - floor) > 0.6) { tried.push(`${k}: floor ${f} vs ${floor}`); continue; }
        const before = new Set(window.__craftyTest.call('readMobs').map((m) => m.id));
        s.spawnMob(gx, gz, 'zombie', f);
        const m = window.__craftyTest.call('readMobs').find((e) => !before.has(e.id));
        if (!m) return { why: 'SETUP: spawnMob added no zombie' };
        window.GameMethods.damageMob(m.id, m.health - 1, 'physical', 'ally');
        cam.rotation.order = 'YXZ'; cam.rotation.x = 0; cam.rotation.y = yaw; cam.updateMatrixWorld();
        const inCone = window.GameMethods.checkMobsInMeleeCone(origin, dir, 4.5, Math.PI / 2).some((e) => e.id === m.id);
        if (inCone) return { id: m.id, k };
        tried.push(`${k}: outside the melee cone`);
        window.GameMethods.damageMob(m.id, 99999, 'physical', 'ally');
      }
      return { why: `SETUP: no heading near the player holds a zombie in the melee cone (${tried.join('; ')})` };
    }, { capMs: test.info().timeout || 240000, apex: SWING_APEX_OVER_BODY_M });
    expect(z.why, z.why).toBeUndefined();
    await page.keyboard.press('t');
    await page.evaluate(frames, 3);
    await expect.poll(() => page.evaluate((id) => {
      const m = window.__craftyTest.call('readMobs').find((e) => e.id === id);
      return !m || m.health <= 0;
    }, z.id), { message: 'a T press with the Iron Sword did not kill a 1-HP zombie in the melee cone', timeout: 20000 }).toBe(true);
    const hold = await page.evaluate(() => window.__e2eWorldHold.release());
    console.log(`[forge] world held ${hold.heldMs} ms over ${hold.frames} drawn frames for the kill (longest ${hold.longestFrameMs} ms, lapsed ${hold.lapsed})`);
    expect(hold.lapsed, 'SETUP: the world hold ran out before the kill was read').toBe(false);

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
