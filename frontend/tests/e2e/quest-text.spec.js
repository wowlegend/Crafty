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
  // The fixture's position (3, 21, 6) lies inside the generated ground: the load stands the player on that column's top
  // (game/formFit.js fitLoadedSpot), as it stands any player whose save on disk holds such a position.
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
// A finished quest claims itself (the HUD lane, DECISIONS 2026-10-29 item 96) and leaves the active list for the completed
// one, so the hunt is read in both places.
function readHunt() {
  const qs = window.useGameStore.getState().questState;
  const q = (qs?.quests || []).find((e) => e && e.id === 'zombie_slayer');
  return { active: q ? { progress: q.progress, completed: q.completed, title: q.title } : null,
    claimed: (qs?.completedQuestIds || []).includes('zombie_slayer'), zombies: qs?.stats?.kills_by_type?.zombie ?? null };
}

test('a hunt names the creature on screen: a saved Zombie Slayer reads "Defeat 10 Husks", a real kill finishes it, zh-CN reads Chinese, the save keeps the count', async ({ page }) => {
  // A boot, then a load whose world re-streams two chunks a tick (minutes on CI's software renderer), then the kill.
  // The budget includes the ground wait after the load, which allows up to 150 s. It is a precondition with its own
  // SETUP message, so no assertion is looser for the longer budget.
  test.setTimeout(360000);
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
  // zh-CN, read while the hunt is still on the tracker (once finished it claims itself and leaves it).
  await page.evaluate(() => window.useGameStore.getState().setLocale('zh-CN'));
  await expect(tracker, 'the tracker\'s zh-CN objective is not "击败 10 个尸傀"').toContainText('击败 10 个尸傀');
  await expect(tracker, 'the tracker\'s zh-CN title is not "尸傀杀手"').toContainText('尸傀杀手');
  await page.evaluate(() => window.useGameStore.getState().setLocale('en'));
  // A load wipes the live chunks and re-streams them with the save's edits (tests/e2e/world-rebuild-after-load.spec.js),
  // so until the chunks around the player and their colliders are back the player can fall into the void and there is
  // no floor to stand a zombie on. Wait for one, as a precondition, sweeping hostiles meanwhile so none ends the run.
  await page.waitForFunction(() => {
    const s = window.useGameStore.getState();
    const cam = window.__threeCamera;
    if (!s.getMobFloor || !cam) return false;
    for (const m of window.__craftyTest.call('readMobs')) {
      if (!m.passive && m.health > 0 && Math.hypot(m.x - cam.position.x, m.z - cam.position.z) < 40) window.GameMethods.damageMob(m.id, 99999, 'physical', 'ally');
    }
    for (let k = 0; k < 12; k += 1) {
      const yaw = (k * Math.PI) / 6;
      if (Number.isFinite(s.getMobFloor(cam.position.x - Math.sin(yaw) * 2.5, cam.position.z - Math.cos(yaw) * 2.5, cam.position.y - 1.6))) return true;
    }
    return false;
  }, null, { timeout: 150000, polling: 500 })
    .catch((e) => { throw new Error(`SETUP: no ground came back within 2.5 m of the player after the load — ${e.message}`); });

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
    // The ground 2.5 m ahead can be a wall, a roof or a chunk still re-streaming after the load, and the floor probe is a
    // Rapier cast that sees a rebuilt collider only after a physics step. So the zombie stands on the first heading, 30
    // degrees apart, with a floor at that range (getMobFloor), else where the spawner's own rule allows (spawnMob with no
    // height), and each sweep of headings waits for drawn frames before the next.
    const drawn = () => window.__craftyTest.call('readFrameloop')?.frames ?? 0;
    const tried = [];
    let m = null;
    for (let round = 0; round < 6 && !m; round += 1) {
      for (let k = 0; k < 12 && !m; k += 1) {
        const yaw = (k * Math.PI) / 6;
        const gx = cam.position.x - Math.sin(yaw) * 2.5, gz = cam.position.z - Math.cos(yaw) * 2.5;
        const floor = s.getMobFloor(gx, gz, cam.position.y - 1.6);
        if (round === 0) tried.push(floor === Infinity ? 'wall' : floor);
        const before = new Set(window.__craftyTest.call('readMobs').map((e) => e.id));
        if (Number.isFinite(floor)) s.spawnMob(gx, gz, 'zombie', floor);
        else s.spawnMob(gx, gz, 'zombie');
        m = window.__craftyTest.call('readMobs').find((e) => !before.has(e.id)) || null;
      }
      const from = drawn();
      for (let polls = 0; !m && drawn() < from + 10 && polls < 600; polls += 1) await frame();
    }
    if (!m) {
      return { why: `SETUP: no heading had ground 2.5 m out for a zombie after 6 sweeps 10 drawn frames apart (first sweep's floors ${JSON.stringify(tried)}; `
        + `camera ${[cam.position.x, cam.position.y, cam.position.z].map((v) => v.toFixed(1))}; frames drawn ${drawn()})` };
    }
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
  }, test.info().timeout || 360000);
  expect(z.why, z.why).toBeUndefined();
  expect(await page.evaluate(readHunt), 'SETUP: the kill counter did not hold the save\'s nine zombies before the kill')
    .toEqual({ active: { progress: 9, completed: false, title: 'Husk Slayer' }, claimed: false, zombies: 9 });
  await page.mouse.click(640, 400);
  const atDown = await page.evaluate(() => window.__clickAim.atDown);
  expect(atDown, 'SETUP: the click\'s mousedown never reached the window').not.toBeNull();
  expect({ active: atDown.active, alive: atDown.alive }, `SETUP: on the click's own mousedown a swing could not land (${JSON.stringify(atDown)})`).toEqual({ active: true, alive: true });
  await expect.poll(() => page.evaluate((id) => {
    const m = window.__craftyTest.call('readMobs').find((e) => e.id === id);
    return !m || m.health <= 0;
  }, z.id), { message: `the click did not kill the 1-HP zombie (${JSON.stringify(atDown)})`, timeout: 20000 }).toBe(true);
  await expect.poll(() => page.evaluate(readHunt), { message: 'the kill did not finish the saved hunt (and claim it) under its own id and counter key', timeout: 20000 })
    .toEqual({ active: null, claimed: true, zombies: 10 });

  // 3. IT SAVES, through the autosave's action and localStorage, under the same keys.
  const saved = await page.evaluate(() => {
    window.useGameStore.getState().saveActiveWorld({ x: 0, y: 18, z: 0 });
    const id = localStorage.getItem('crafty_active_world');
    const blob = id ? JSON.parse(localStorage.getItem('crafty_world_save_' + id) || 'null') : null;
    return blob && { level: blob.progression?.level, claimed: (blob.questState?.completedQuestIds || []).includes('zombie_slayer'), zombies: blob.questState?.stats?.kills_by_type?.zombie };
  });
  expect(saved, 'SETUP: saveActiveWorld wrote no world blob').not.toBeNull();
  expect(saved.level, 'the save lost its level (the hunt\'s reward may raise it)').toBeGreaterThanOrEqual(5);
  expect(saved.claimed, 'the save lost the finished hunt or moved its id').toBe(true);
  expect(saved.zombies, 'the save\'s kill counter moved to another key').toBe(10);

  // Every read is taken: the hold is released, and its span is the denominator of every reading above.
  const hold = await page.evaluate(() => window.__e2eWorldHold.release());
  console.log(`[quest-text] world held ${hold.heldMs} ms over ${hold.frames} drawn frames (longest ${hold.longestFrameMs} ms, cap ${hold.capMs}, lapsed ${hold.lapsed})`);
  expect(hold.lapsed, `SETUP: the world hold ran out before the last read: ${JSON.stringify(hold)}`).toBe(false);
  expect(hold.frames, `SETUP: the game drew no frame while the world was held: ${JSON.stringify(hold)}`).toBeGreaterThan(0);
});
