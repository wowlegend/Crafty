import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';
import { installWorldHold } from './_worldHold.js';

// QUESTS NAME THE CREATURE ON SCREEN, IN THE BOOTED GAME (W2-F step 7; reset-plan row 24; DECISIONS 2026-10-29 items
// 75-78). src/game/questText.test.js proves the words and tests/gates/quest-text-gates.test.jsx the tracker in jsdom;
// this proves them in the HUD a player sees, through the real save path and a real kill.
//
// A save written before the change (the frozen pre-cut fixture, its quest state replaced by Zombie Slayer at 9 of 10
// under its old words, nine zombies in the kill counter) is loaded the way the World Manager loads it. The HUD's quest
// tracker must read "Husk Slayer" and "Defeat 10 Husks" with the 9/10 kept; a real left click on a staged 1-HP zombie,
// aimed on the click's own mousedown, must finish the hunt; in zh-CN the tracker must read the Chinese; and the
// autosave's blob must hold the hunt complete under the same id with kills_by_type.zombie one higher.
//
// WHAT THIS DOES NOT CHECK: the quest log panel (jsdom only), a hunt other than the zombie's, or the language switch
// itself: the game has no in-play locale control, so the spec sets the store's locale as the title's control would.
//
// Mutation-Proof: see the commit trailers (the unit mutants, run against src/game/questText.test.js,
// tests/store/questKeyMap.test.js and tests/gates/quest-text-gates.test.jsx). CI runs this spec; no local browser run.

const HERE = dirname(fileURLToPath(import.meta.url));
const PRE_CUT = JSON.parse(readFileSync(resolve(HERE, '../fixtures/pre-cut-save.json'), 'utf8'));

/** The fixture with a hunt nine kills in, as a build before this change wrote it. */
function preChangeSave() {
  const save = structuredClone(PRE_CUT);
  save.questState = {
    quests: [
      { id: 'first_blood', title: 'First Blood', description: 'Cut down the first horror at the gate', icon: 'sword', type: 'kill', target: 1, xpReward: 30, tier: 1, progress: 1, completed: true, claimed: true },
      { id: 'zombie_slayer', title: 'Zombie Slayer', description: 'Defeat 10 zombies', icon: 'zombie', type: 'kill_type', mobType: 'zombie', target: 10, xpReward: 120, tier: 2, progress: 9, completed: false, claimed: false },
    ],
    completedQuestIds: ['first_blood'],
    stats: { kills: 9, kills_by_type: { zombie: 9 }, spells: 0, blocks_placed: 0, blocks_broken: 0, chests: 0, distance: 0, deaths: 0, level: 5 },
    unlockedAchievements: ['first_step'],
  };
  return save;
}

/** In the page: the hunt as the store's mirror holds it. */
function readHunt() {
  const qs = window.useGameStore.getState().questState;
  const q = (qs?.quests || []).find((e) => e && e.id === 'zombie_slayer');
  return q ? { progress: q.progress, completed: q.completed, title: q.title, zombies: qs.stats?.kills_by_type?.zombie ?? null } : null;
}

test('a hunt names the creature on screen: a saved Zombie Slayer reads "Defeat 10 Husks", a real kill finishes it, zh-CN reads Chinese, the save keeps the count', async ({ page }) => {
  test.setTimeout(240000);
  await page.addInitScript(installWorldHold);
  await bootDev(page);
  await startPlayActive(page);
  await page.waitForFunction(() => window.__craftyTest?.call('readMobs') && window.__threeCamera && window.GameMethods?.damageMob
    && window.useGameStore.getState().spawnMob && window.useGameStore.getState().getMobFloor, null, { timeout: 60000 })
    .catch((e) => { throw new Error(`SETUP: the mob hooks and camera never came up — ${e.message}`); });

  // 1. THE SAVE FROM BEFORE THE CHANGE LOADS, AND THE TRACKER NAMES THE HUSK.
  const level = await page.evaluate((save) => { window.useGameStore.getState().loadWorldData(save); return window.useGameStore.getState().level; }, preChangeSave());
  expect(level, 'SETUP: the save did not load').toBe(5);
  const tracker = page.getByTestId('quest-tracker');
  await expect(tracker, 'SETUP: the HUD quest tracker never rendered').toBeVisible();
  await expect(tracker, 'the tracker does not show the saved hunt\'s nine kills').toContainText('9/10');
  await expect(tracker, 'the tracker does not name the hunt by the Husk').toContainText('Husk Slayer');
  await expect(tracker, 'the tracker\'s objective does not read "Defeat 10 Husks"').toContainText('Defeat 10 Husks');
  expect(await tracker.textContent(), 'the saved words reached the tracker').not.toMatch(/Zombie Slayer|zombies/);

  // 2. A REAL KILL FINISHES IT. The world is held (no mob moves or strikes) until the last read; a zombie 2.5 m ahead
  // is brought to 1 HP by an ally's hit, and the aim is set on the click's own mousedown.
  const z = await page.evaluate(async (capMs) => {
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    while (Date.now() - (window.useGameStore.getState()._spawnTime || 0) < 5500) await frame();
    const s = window.useGameStore.getState();
    s.setTimeOfDay?.(0.5);
    const cam = window.__threeCamera;
    for (const m of window.__craftyTest.call('readMobs')) {
      if (!m.passive && m.health > 0 && Math.hypot(m.x - cam.position.x, m.z - cam.position.z) < 40) window.GameMethods.damageMob(m.id, 99999, 'physical', 'ally');
    }
    window.__e2eHoldWorld({ capMs });
    cam.rotation.x = 0; cam.updateMatrixWorld();
    const d = new cam.position.constructor();
    cam.getWorldDirection(d); d.y = 0; d.normalize();
    const gx = cam.position.x + d.x * 2.5, gz = cam.position.z + d.z * 2.5;
    const before = new Set(window.__craftyTest.call('readMobs').map((m) => m.id));
    s.spawnMob(gx, gz, 'zombie', s.getMobFloor(gx, gz, cam.position.y - 1.6));
    const m = window.__craftyTest.call('readMobs').find((e) => !before.has(e.id));
    if (!m) return { why: 'SETUP: spawnMob added no zombie' };
    if (m.health > 1) window.GameMethods.damageMob(m.id, m.health - 1, 'physical', 'ally');
    const hp = window.__craftyTest.call('readMobs').find((e) => e.id === m.id)?.health ?? null;
    if (hp !== 1) return { why: `SETUP: the staged zombie stands at ${hp} HP, not 1` };
    window.__clickAim = { atDown: null };
    window.addEventListener('mousedown', () => {
      const live = window.__craftyTest.call('readMobs').find((e) => e.id === m.id);
      if (live) cam.lookAt(live.x, live.y + 0.8, live.z);
      const st = window.useGameStore.getState();
      window.__clickAim.atDown = { hp: live ? live.health : null, active: window.__craftyTest.call('readIntents').active, alive: st.isAlive };
    }, { capture: true, once: true });
    return { id: m.id };
  }, test.info().timeout || 240000);
  expect(z.why, z.why).toBeUndefined();
  expect(await page.evaluate(readHunt), 'SETUP: the kill counter did not hold the save\'s nine zombies before the kill')
    .toEqual({ progress: 9, completed: false, title: 'Husk Slayer', zombies: 9 });
  await page.mouse.click(640, 400);
  const atDown = await page.evaluate(() => window.__clickAim.atDown);
  expect(atDown, 'SETUP: the click\'s mousedown never reached the window').not.toBeNull();
  expect({ active: atDown.active, alive: atDown.alive }, `SETUP: on the click's own mousedown a swing could not land (${JSON.stringify(atDown)})`).toEqual({ active: true, alive: true });
  await expect.poll(() => page.evaluate((id) => {
    const m = window.__craftyTest.call('readMobs').find((e) => e.id === id);
    return !m || m.health <= 0;
  }, z.id), { message: `the click did not kill the 1-HP zombie (${JSON.stringify(atDown)})`, timeout: 20000 }).toBe(true);
  await expect.poll(() => page.evaluate(readHunt), { message: 'the kill did not finish the saved hunt under its own id and counter key', timeout: 20000 })
    .toEqual({ progress: 10, completed: true, title: 'Husk Slayer', zombies: 10 });
  await expect(tracker, 'the tracker does not show the finished hunt').toContainText('10/10');

  // 3. zh-CN: the same tracker reads the hunt in Chinese.
  await page.evaluate(() => window.useGameStore.getState().setLocale('zh-CN'));
  await expect(tracker, 'the tracker\'s zh-CN objective is not "击败 10 个尸傀"').toContainText('击败 10 个尸傀');
  await expect(tracker, 'the tracker\'s zh-CN title is not "尸傀杀手"').toContainText('尸傀杀手');
  await page.evaluate(() => window.useGameStore.getState().setLocale('en'));

  // 4. IT SAVES, through the autosave's action and localStorage, under the same keys.
  const saved = await page.evaluate(() => {
    window.useGameStore.getState().saveActiveWorld({ x: 0, y: 18, z: 0 });
    const id = localStorage.getItem('crafty_active_world');
    const blob = id ? JSON.parse(localStorage.getItem('crafty_world_save_' + id) || 'null') : null;
    const q = (blob?.questState?.quests || []).find((e) => e && e.id === 'zombie_slayer');
    return blob && { level: blob.progression?.level, hunt: q && { progress: q.progress, completed: q.completed, title: q.title, mobType: q.mobType }, zombies: blob.questState?.stats?.kills_by_type?.zombie };
  });
  expect(saved, 'SETUP: saveActiveWorld wrote no world blob').not.toBeNull();
  expect(saved.level, 'the save lost its level').toBe(5);
  expect(saved.hunt, 'the save lost the hunt or moved its keys').toEqual({ progress: 10, completed: true, title: 'Husk Slayer', mobType: 'zombie' });
  expect(saved.zombies, 'the save\'s kill counter moved to another key').toBe(10);

  // Every read is taken: the hold is released, and its span is the denominator of every reading above.
  const hold = await page.evaluate(() => window.__e2eWorldHold.release());
  console.log(`[quest-text] world held ${hold.heldMs} ms over ${hold.frames} drawn frames (longest ${hold.longestFrameMs} ms, cap ${hold.capMs}, lapsed ${hold.lapsed})`);
  expect(hold.lapsed, `SETUP: the world hold ran out before the last read: ${JSON.stringify(hold)}`).toBe(false);
  expect(hold.frames, `SETUP: the game drew no frame while the world was held: ${JSON.stringify(hold)}`).toBeGreaterThan(0);
});
