import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from './_fixtures.js';
import { bootDev, startPlay, startPlayActive } from './_boot.js';
import { installWorldHold } from './_worldHold.js';

// THE CUT, IN THE BOOTED GAME (W2-F brief; DECISIONS 2026-10-28 W1-H items 4-7 and 10). One case per landed step.
// Ember (step 3) has its own spec, tests/e2e/ember.spec.js; the fixture case here checks its migration through the browser.
//
// tests/store/preCutSave.test.js proves the pass-through against the store in jsdom. This proves it through the real
// browser's localStorage and the real save path: the frozen pre-cut world blob (tests/fixtures/pre-cut-save.json, see
// that test's header for how it was written) is loaded the way the World Manager's Load button loads it
// (MenuSystem.jsx -> loadWorldData), saved by the autosave's own action, and read back from localStorage.
//
// One costed mode (step 2, W1-H item 4) through real input: the mouse wheel picks the block, a right-click on the canvas
// places it through the real window listener, the verb router and Terrain's place(), and the count is read off the
// hotbar's DOM. The empty stack's refusal must show its notice. A left click on a staged zombie shows the game still
// fights; the autosave's action shows it still saves.
//
// WHAT THIS DOES NOT CHECK: the Load button's click (the World Manager UI), a reload of the page between a save and its
// read, touch placement (the overlay's cast button reaches the same performVerb), or the Building Tools' multi-block
// footprint (tests/e2e/build-placement.spec.js).
//
// Mutation-Proof: see the commit trailers (the unit mutants, run against tests/store/preCutSave.test.js and
// tests/gates/free-placement-gates.test.js). These cases need a browser, so CI runs them; no local mutation run.

// Stage the build: a mob-free world at noon, held still until the spec's last read (_worldHold.js: a window sized in
// advance is what a slow CI shard outlives), and `want` aims whose build ray hits plain terrain within reach and whose
// placed cell is not the body's own. `aimAt` turns the camera to one and returns the cell its ray now targets, the
// cell place() itself computes (hitPoint + 0.01 x normal), so a block an earlier press placed in the way is accounted for.
function stageBuild({ want, capMs }) {
  const s = window.useGameStore.getState();
  s.setTimeOfDay?.(0.5);
  const cam = window.__threeCamera;
  for (const m of window.__craftyTest.call('readMobs')) {
    if (m.health > 0 && Math.hypot(m.x - cam.position.x, m.z - cam.position.z) < 40) window.GameMethods.damageMob(m.id, 99999, 'physical', 'ally');
  }
  if (!window.__e2eHoldWorld) return { why: 'SETUP: the world hold was never installed (page.addInitScript(installWorldHold))' };
  window.__e2eHoldWorld({ capMs });
  const V = cam.position.constructor;
  const body = s.playerRigidBodyRef?.current?.translation();
  if (!body) return { why: 'SETUP: no player body to stage from' };
  const bodyCells = new Set([0, 1].map((dy) => `${Math.floor(body.x)}_${Math.floor(body.y) + dy}_${Math.floor(body.z)}`));
  const aims = [];
  const used = new Set();
  // Six headings 60 degrees apart first, so no placed block stands in a later aim's ray; then the 30-degree in-betweens.
  for (const [pitch, step, from] of [[-0.8, 2, 0], [-0.6, 2, 0], [-0.8, 2, 1], [-1.0, 1, 0]]) {
    for (let k = from; k < 12 && aims.length < want; k += step) {
      const yaw = (k * Math.PI) / 6;
      cam.rotation.order = 'YXZ'; cam.rotation.y = yaw; cam.rotation.x = pitch; cam.updateMatrixWorld();
      const hit = window.GameMethods.castBuildRay();
      if (!hit || !hit.normal || hit.chestTargeted) continue;
      const p = hit.hitPoint.clone().add(new V(hit.normal.x, hit.normal.y, hit.normal.z).multiplyScalar(0.01));
      const cell = `${Math.floor(p.x)}_${Math.floor(p.y)}_${Math.floor(p.z)}`;
      if (bodyCells.has(cell) || used.has(cell) || s.worldBlocks.has(cell)) continue;
      used.add(cell);
      aims.push({ yaw, pitch, cell });
    }
  }
  if (aims.length < want) return { why: `SETUP: found ${aims.length} of ${want} build aims onto plain terrain within reach` };
  return { aims };
}

function aimAt({ yaw, pitch }) {
  const cam = window.__threeCamera;
  cam.rotation.order = 'YXZ'; cam.rotation.y = yaw; cam.rotation.x = pitch; cam.updateMatrixWorld();
  const hit = window.GameMethods.castBuildRay();
  if (!hit || !hit.normal) return null;
  const p = hit.hitPoint.clone().add(new cam.position.constructor(hit.normal.x, hit.normal.y, hit.normal.z).multiplyScalar(0.01));
  return `${Math.floor(p.x)}_${Math.floor(p.y)}_${Math.floor(p.z)}`;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const PRE_CUT = JSON.parse(readFileSync(resolve(HERE, '../fixtures/pre-cut-save.json'), 'utf8'));

test.describe('the Cut', () => {
  test.setTimeout(180000);

  test('a pre-cut save loads, keeps its level, and writes back the keys this build does not know', async ({ page }) => {
    await bootDev(page);
    await startPlay(page);
    const r = await page.evaluate((save) => {
      const g = () => window.useGameStore.getState();
      save.progression.futureField = { nested: [1, 2], word: 'kept' };
      save.game_state.futureFlag = 'kept';
      g().loadWorldData(save);
      const loaded = { level: g().level, maxHealth: g().maxHealth, ember: g().ember, talentPoints: g().talentPoints,
        talents: g().unlockedTalents, hasAttributes: 'attributes' in g(), liveBag: g().inventory.blocks };
      const storeHasMode = 'gameMode' in g();
      const liveQuestIds = (g().questState?.quests || []).map((q) => q && q.id);
      g().saveActiveWorld({ x: 3, y: 21, z: 6 });
      const id = localStorage.getItem('crafty_active_world');
      const raw = id ? localStorage.getItem('crafty_world_save_' + id) : null;
      const blob = raw ? JSON.parse(raw) : null;
      return { loaded, storeHasMode, liveQuestIds, id, wroteOwnSlot: id === save.id, blob };
    }, structuredClone(PRE_CUT));

    expect(r.blob, 'SETUP: saveActiveWorld wrote no localStorage world blob').not.toBeNull();
    expect(r.wroteOwnSlot, `the autosave wrote slot ${r.id}, not the loaded world's ${PRE_CUT.id}`).toBe(true);
    expect(r.loaded.level, 'the pre-cut save lost its level on load').toBe(5);
    expect(Number.isFinite(r.loaded.maxHealth) && r.loaded.maxHealth > 0, `maxHealth ${r.loaded.maxHealth}`).toBe(true);
    expect(r.blob.progression.level, 'the saved level is not the loaded one').toBe(5);
    expect(r.blob.progression.futureField, 'an unknown progression key did not survive load and save').toEqual({ nested: [1, 2], word: 'kept' });
    expect(r.blob.game_state.futureFlag, 'an unknown game_state key did not survive load and save').toBe('kept');
    // Step 2: this build reads no game mode, and writes the pre-cut one back; the retired Builder quest rides along.
    expect(r.storeHasMode, 'loading a pre-cut save put a gameMode into the store').toBe(false);
    expect(r.blob.game_state.gameMode, 'the pre-cut gameMode was not written back').toBe('survival');
    expect(r.liveQuestIds, 'a retired quest reached the live quest feed').not.toContain('builder');
    expect(r.blob.questState.quests.find((q) => q.id === 'builder')?.progress, 'the held Builder quest lost its progress').toBe(4);
    // Step 3 (Ember, W1-H item 5): the four banks (30 + 20 + 15 + 10) load as one bar of 75, which the save writes, and
    // the banks themselves ride the tombstone back unchanged.
    expect(r.loaded.ember, 'the pre-cut banks were not summed into the ember bar on load').toBe(75);
    expect(r.blob.progression.ember, 'the save did not write the migrated ember').toBe(75);
    expect([r.blob.progression.ferocityBanked, r.blob.progression.kineticBanked, r.blob.progression.soulBanked, r.blob.progression.resonanceBanked],
      'a retired bank was not written back as the pre-cut save had it').toEqual([30, 20, 15, 10]);
    // Step 4 (talents and relics, W1-H item 6; the rule is tests/store/preCutSave.test.js's): 20 attribute points / 5 = 4
    // talent points, plus the 3 unspent and the 1 rank refunded, is 8 and no ranks. attributes, spellLevels, the crystals
    // and the wand leave the live game and ride the save back unchanged.
    expect(r.loaded.talentPoints, 'the pre-cut attribute points were not refunded as talent points by the rule').toBe(8);
    expect(r.loaded.talents, 'a pre-cut talent rank survived the refund').toEqual({});
    expect(r.loaded.hasAttributes, 'the store took the attributes back').toBe(false);
    expect('crystals' in r.loaded.liveBag || 'wand' in r.loaded.liveBag, 'a retired currency is in the live bag').toBe(false);
    expect(r.blob.progression.attributes, 'the pre-cut attributes were not written back').toEqual(PRE_CUT.progression.attributes);
    expect(r.blob.progression.spellLevels, 'the pre-cut spell levels were not written back').toEqual(PRE_CUT.progression.spellLevels);
    expect([r.blob.player_data.inventory.blocks.crystals, r.blob.player_data.inventory.blocks.wand], 'the crystals and wand were not written back')
      .toEqual([PRE_CUT.player_data.inventory.blocks.crystals, PRE_CUT.player_data.inventory.blocks.wand]);
    expect(r.blob.migrated, 'the refund was not recorded').toContain('talents.cut');
  });

  test('one costed mode: no Mode chip or toggle; a right-click spends one block, an empty stack refuses; it fights and saves', async ({ page }) => {
    await page.addInitScript(installWorldHold);
    await bootDev(page);
    await startPlayActive(page);
    await page.waitForFunction(() => window.__craftyTest?.call('readMobs') && window.__threeCamera && window.GameMethods?.damageMob
      && window.GameMethods?.castBuildRay && window.useGameStore.getState().spawnMob && window.useGameStore.getState().getMobFloor, null, { timeout: 60000 })
      .catch((e) => { throw new Error(`SETUP: the mob hooks, build ray and camera never came up — ${e.message}`); });

    // 1. THE SURFACE IS GONE. Presence first: the gear that shares the chip's row renders.
    const gear = page.getByTestId('hud-settings');
    await expect(gear, 'SETUP: the HUD top row never rendered').toBeVisible();
    const row = await gear.evaluate((el) => {
      const r = el.parentElement.parentElement;
      return { text: r.textContent, children: r.children.length };
    });
    expect(row.text, 'the Mode chip is back in the HUD').not.toMatch(/Mode|creative|survival/i);
    expect(row.children, 'the HUD top row holds more than the gear group').toBe(1);
    expect(await page.evaluate(() => 'gameMode' in window.useGameStore.getState()), 'the store still carries a gameMode').toBe(false);
    await page.evaluate(() => window.useGameStore.getState().setShowSettings(true));
    const settings = page.locator('[role="dialog"][aria-label="Settings"]');
    await expect(settings.getByTestId('frame-cap-toggle'), 'SETUP: the Settings panel never rendered its rows').toBeVisible();
    expect(await settings.textContent(), 'the Settings panel still offers a game mode').not.toMatch(/Game Mode|creative|survival/i);
    await page.evaluate(() => window.useGameStore.getState().setShowSettings(false));
    await startPlayActive(page); // closing a panel asks for the pointer lock back, which a headless page refuses

    // 2. IT BUILDS, AT A COST. The wheel picks dirt (grass -> dirt), the stack is set to 3, and four right-clicks follow.
    await page.mouse.move(640, 400);
    await page.mouse.wheel(0, 120);
    await expect.poll(() => page.evaluate(() => window.useGameStore.getState().selectedBlock), { message: 'the wheel did not select dirt' }).toBe('dirt');
    // The cap is the running test's budget, read after boot (_boot.js extends it for a slow world build).
    const stage = await page.evaluate(stageBuild, { want: 4, capMs: test.info().timeout || 180000 });
    expect(stage.why, stage.why).toBeUndefined();
    await page.evaluate(() => window.useGameStore.setState((st) => ({ inventory: { ...st.inventory, blocks: { ...st.inventory.blocks, dirt: 3 } } })));
    const slotCount = () => page.evaluate(() => {
      const t = document.querySelector('[data-hotbar-block="dirt"]')?.getAttribute('title') || '';
      const m = t.match(/\((\d+)\)\s*$/);
      return m ? Number(m[1]) : null;
    });
    await expect.poll(slotCount, { message: 'SETUP: the hotbar never showed the staged stack of 3' }).toBe(3);
    const presses = [];
    for (const [i, aim] of stage.aims.entries()) {
      const cell = await page.evaluate(aimAt, aim);
      expect(cell, `SETUP: aim ${i + 1} no longer reaches terrain`).not.toBeNull();
      const before = await page.evaluate((c) => ({ size: window.useGameStore.getState().worldBlocks.size, at: window.useGameStore.getState().worldBlocks.get(c) ?? null }), cell);
      expect(before.at, `SETUP: aim ${i + 1} targets a cell that already holds a placed block`).toBeNull();
      await page.mouse.click(640, 400, { button: 'right' });
      const want = Math.max(0, 2 - i);
      if (i < 3) await expect.poll(slotCount, { message: `right-click ${i + 1} did not lower the hotbar's dirt to ${want}` }).toBe(want);
      // The refusal and its notice come from the same place() call, so the notice showing means a wrong placement had
      // its chance to land.
      else await expect(page.getByText('No Dirt left').first(), 'the refused right-click told the player nothing').toBeVisible({ timeout: 15000 });
      const after = await page.evaluate((c) => ({
        size: window.useGameStore.getState().worldBlocks.size, at: window.useGameStore.getState().worldBlocks.get(c) ?? null,
        active: window.__craftyTest.call('readIntents').active, alive: window.useGameStore.getState().isAlive,
        frozen: performance.now() < window.useGameStore.getState().hitstopUntil,
      }), cell);
      presses.push({ i, cell, before, after, count: await slotCount() });
    }
    const gates = JSON.stringify(presses.map((p) => ({ i: p.i, active: p.after.active, alive: p.after.alive, frozen: p.after.frozen })));
    for (const p of presses) expect(p.after.frozen, `SETUP: the world hold ended by right-click ${p.i + 1} (input gates ${gates})`).toBe(true);
    for (const p of presses.slice(0, 3)) {
      expect(p.after.at, `right-click ${p.i + 1} placed nothing at the aimed cell (input gates ${gates})`).not.toBeNull();
      expect(p.after.size - p.before.size, `right-click ${p.i + 1} placed more or less than one block`).toBe(1);
    }
    const refused = presses[3];
    expect(refused.count, 'the empty stack went negative or refilled').toBe(0);
    expect(refused.after.at, 'a right-click with no dirt left placed a block anyway').toBeNull();
    expect(refused.after.size, 'a right-click with no dirt left changed the world').toBe(refused.before.size);

    // 3. IT FIGHTS. A zombie 2.5 m ahead, a real left click, a finite hit.
    const z = await page.evaluate(async () => {
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      while (Date.now() - (window.useGameStore.getState()._spawnTime || 0) < 5500) await frame();
      const s = window.useGameStore.getState();
      const cam = window.__threeCamera;
      cam.rotation.x = 0; cam.updateMatrixWorld();
      const d = new cam.position.constructor();
      cam.getWorldDirection(d); d.y = 0; d.normalize();
      const gx = cam.position.x + d.x * 2.5, gz = cam.position.z + d.z * 2.5;
      const before = new Set(window.__craftyTest.call('readMobs').map((m) => m.id));
      s.spawnMob(gx, gz, 'zombie', s.getMobFloor(gx, gz, cam.position.y - 1.6));
      const m = window.__craftyTest.call('readMobs').find((e) => !before.has(e.id));
      if (!m) return { why: 'SETUP: spawnMob added no zombie' };
      cam.lookAt(m.x, m.y + 0.8, m.z);
      return { id: m.id, hp: m.health };
    });
    expect(z.why, z.why).toBeUndefined();
    await page.mouse.click(640, 400);
    const hpAfter = () => page.evaluate((id) => window.__craftyTest.call('readMobs').find((e) => e.id === id)?.health ?? null, z.id);
    await expect.poll(async () => { const h = await hpAfter(); return h !== null && h < z.hp; }, { message: 'a left click on the zombie dealt nothing' }).toBe(true);
    const hit = z.hp - (await hpAfter());
    expect(Number.isFinite(hit) && hit > 0, `the hit dealt ${hit}`).toBe(true);

    // 4. IT SAVES, through the autosave's action and localStorage, with the spent stack and the placed blocks.
    const saved = await page.evaluate((cells) => {
      const g = window.useGameStore.getState();
      g.saveActiveWorld({ x: 0, y: 18, z: 0 });
      const id = localStorage.getItem('crafty_active_world');
      const blob = id ? JSON.parse(localStorage.getItem('crafty_world_save_' + id) || 'null') : null;
      const keys = new Set((blob?.world_data?.blocks || []).map(([k]) => k));
      return blob && { dirt: blob.player_data.inventory.blocks.dirt, placed: cells.filter((c) => keys.has(c)).length, hasMode: 'gameMode' in blob.game_state, version: blob.version };
    }, presses.slice(0, 3).map((p) => p.cell));
    expect(saved, 'SETUP: saveActiveWorld wrote no world blob').not.toBeNull();
    expect(saved.dirt, 'the save holds a different dirt stack than the hotbar').toBe(0);
    expect(saved.placed, 'the save lost blocks the player placed').toBe(3);
    expect(saved.hasMode, 'a fresh profile wrote a gameMode').toBe(false);

    // Every read is taken: the hold is released, and its span is the denominator of every reading above.
    const hold = await page.evaluate(() => window.__e2eWorldHold.release());
    console.log(`[the-cut] world held ${hold.heldMs} ms over ${hold.frames} drawn frames (longest ${hold.longestFrameMs} ms, cap ${hold.capMs}, lapsed ${hold.lapsed})`);
    expect(hold.lapsed, `SETUP: the world hold ran out before the last read: ${JSON.stringify(hold)}`).toBe(false);
    expect(hold.frames, `SETUP: the game drew no frame while the world was held: ${JSON.stringify(hold)}`).toBeGreaterThan(0);
  });
});
