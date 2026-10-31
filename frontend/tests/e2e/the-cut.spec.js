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
// Hunger (step 6) is gone through the HUD's own stat stack and ten minutes of the page's clock: see FOOD below.
//
// WHAT THIS DOES NOT CHECK: the Load button's click (the World Manager UI), a reload of the page between a save and its
// read, touch placement (the overlay's cast button reaches the same performVerb), or the Building Tools' multi-block
// footprint (tests/e2e/build-placement.spec.js). In the hunger window: a timer faster than JUMP_MS at its real rate
// (it fires once a jump), the world's motion over ten minutes (about one capped frame step a jump), and the AI worker's
// own timers, which run in a worker thread the page clock does not reach. A starvation interval at the old rate (0.1
// hunger per 5 s) starves at 83.3 minutes, past the ten-minute window, so only the 84-minute case in
// tests/gates/pause-holds-timers-gates.test.jsx can see it; this window is built to see one fast enough to starve
// inside ten, and no browser mutant has shown that (registry TRIAGE:e2e-browser-mutants-unrun).
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

// A placement rebuilds its chunk's trimesh collider, and the build ray is a Rapier scene query (@dimforge/rapier3d-compat
// 0.19.2), which sees a collider only once a physics step has put it in the broad phase (rapier.rs, "Simulation
// structures": queries use the state at the end of the last step). So the aim right after a press can miss terrain for a frame; it is cast again after each
// frame the game draws (FrameCap's counter: the R3F frames, whose useFrame steps the physics), up to AIM_FRAMES, before
// the aim is called lost.
const AIM_FRAMES = 30;

async function aimAt({ yaw, pitch, frames }) {
  const cam = window.__threeCamera;
  const drawn = () => window.__craftyTest.call('readFrameloop')?.frames ?? 0;
  for (let k = 0; ; k += 1) {
    cam.rotation.order = 'YXZ'; cam.rotation.y = yaw; cam.rotation.x = pitch; cam.updateMatrixWorld();
    const hit = window.GameMethods.castBuildRay();
    if (hit && hit.normal) {
      const p = hit.hitPoint.clone().add(new cam.position.constructor(hit.normal.x, hit.normal.y, hit.normal.z).multiplyScalar(0.01));
      return `${Math.floor(p.x)}_${Math.floor(p.y)}_${Math.floor(p.z)}`;
    }
    if (k >= frames) return null;
    const from = drawn();
    for (let polls = 0; drawn() === from && polls < 600; polls += 1) await new Promise((r) => requestAnimationFrame(r));
  }
}

const HERE = dirname(fileURLToPath(import.meta.url));
const PRE_CUT = JSON.parse(readFileSync(resolve(HERE, '../fixtures/pre-cut-save.json'), 'utf8'));

// Step 6, hunger (DECISIONS 2026-10-29 items 70-73). The world clock is the page's own: Playwright's clock is installed
// before boot, so every timer the game makes is the fake clock's, and once play is live the clock is paused and moved
// in JUMPS jumps of JUMP_MS (page.clock.fastForward fires each due timer at most once a jump). A timer JUMP_MS or more
// apart therefore fires at its real rate, and the deleted hunger interval was exactly that far apart; a faster one
// (mana regen, the day clock: 1 s) fires once a jump, and the frame loop draws about one frame a jump, its step capped
// at MAX_FRAME_STEP_SEC. Hostiles are swept after every jump, so no mob is what the health read measures.
const FOOD = ['Raw Porkchop', 'Raw Beef', 'Cooked Porkchop', 'Cooked Beef', 'Rotten Flesh'];
const HUNGER_KEYS = ['hunger', 'setHunger', 'consumeHunger', 'feedPlayer'];
const JUMP_MS = 5000;
const JUMPS = 120; // ten minutes
const DAY_UNITS_PER_TICK = 2.5; // GAME_UNITS_PER_SECOND (src/game/dayNight.js), a literal so the yardstick holds still

/** In the page: kill every hostile within 80 m and read the player's health with the gates the world runs on. */
function sweepAndRead() {
  const s = window.useGameStore.getState();
  const cam = window.__threeCamera.position;
  let swept = 0;
  for (const m of window.__craftyTest.call('readMobs')) {
    if (!m.passive && m.health > 0 && Math.hypot(m.x - cam.x, m.z - cam.z) < 80) {
      window.GameMethods.damageMob(m.id, 99999, 'physical', 'ally');
      swept += 1;
    }
  }
  return { health: s.playerHealth, max: s.maxHealth, alive: s.isAlive, active: window.__craftyTest.call('readIntents').active, swept };
}

/** In the page: the readings the window is judged against (the clocks, the frames drawn, the regen it drove). */
function readClocks() {
  const s = window.useGameStore.getState();
  return { now: performance.now(), wall: Date.now(), gameTime: s.gameTime, frames: window.__craftyTest.call('readFrameloop')?.frames ?? null,
    mana: s.mana, maxMana: s.maxMana, health: s.playerHealth, maxHealth: s.maxHealth, hits: window.__e2eHits || [] };
}

test.describe('the Cut', () => {
  test.setTimeout(180000);

  test('a pre-cut save loads, keeps its level, and writes back the keys this build does not know', async ({ page }) => {
    await bootDev(page);
    await startPlay(page);
    const r = await page.evaluate((save) => {
      const g = () => window.useGameStore.getState();
      save.progression.futureField = { nested: [1, 2], word: 'kept' };
      save.game_state.futureFlag = 'kept';
      // Step 6: an empty stomach and a stack of meat, as a save could hold them (tests/store/hungerCut.test.js states the rule).
      save.progression.hunger = 0;
      save.player_data.inventory.blocks['Raw Beef'] = 4;
      g().loadWorldData(save);
      const loaded = { level: g().level, maxHealth: g().maxHealth, ember: g().ember, talentPoints: g().talentPoints,
        talents: g().unlockedTalents, hasAttributes: 'attributes' in g(), liveBag: g().inventory.blocks,
        hasHunger: 'hunger' in g(), health: g().playerHealth };
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
    // Step 6 (hunger, DECISIONS 2026-10-29 item 72): the store reads no hunger and the meat leaves the live bag; both
    // ride the save back unchanged.
    expect(r.loaded.hasHunger, 'the store took the save\'s hunger').toBe(false);
    // The fixture holds no health, and a save holding none loads at the maximum (store loadWorldData, saveSchema.js
    // loadedVital), so this reads the load path, not hunger's absence. The hasHunger check above is what fails when the
    // store takes the save's hunger.
    expect(r.loaded.health, 'loading an empty stomach cost health').toBe(r.loaded.maxHealth);
    expect('Raw Beef' in r.loaded.liveBag, 'a retired food is in the live bag').toBe(false);
    expect(r.blob.progression.hunger, 'the held hunger key was not written back').toBe(0);
    expect(r.blob.player_data.inventory.blocks['Raw Beef'], 'the held meat was not written back').toBe(4);
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
      const cell = await page.evaluate(aimAt, { ...aim, frames: AIM_FRAMES });
      expect(cell, `SETUP: aim ${i + 1} no longer reaches terrain after ${AIM_FRAMES} drawn frames`).not.toBeNull();
      const before = await page.evaluate((c) => ({ size: window.useGameStore.getState().worldBlocks.size, at: window.useGameStore.getState().worldBlocks.get(c) ?? null }), cell);
      expect(before.at, `SETUP: aim ${i + 1} targets a cell that already holds a placed block`).toBeNull();
      await page.mouse.click(640, 400, { button: 'right' });
      const want = Math.max(0, 2 - i);
      if (i < 3) {
        await expect.poll(slotCount, { message: `right-click ${i + 1} did not lower the hotbar's dirt to ${want}` }).toBe(want);
        // The store records the cell once the worker has answered that it filled it (world/placeAtHit.js).
        await expect.poll(() => page.evaluate((c) => window.useGameStore.getState().worldBlocks.get(c) ?? null, cell),
          { message: `right-click ${i + 1}'s cell ${cell} was never recorded as placed` }).not.toBeNull();
      }
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

  test('hunger is gone: no bar, no food, and ten minutes of world clock cost no health; it fights and saves', async ({ page }) => {
    // Boot, ten minutes of jumps (each a drawn frame, about 227 ms on CI's software renderer) and the fight: the
    // describe's 180 s is sized for one boot and a few seconds of play.
    test.setTimeout(360000);
    await page.clock.install(); // before boot, so the game's timers are the fake clock's
    await bootDev(page);
    await startPlayActive(page);
    await page.waitForFunction(() => window.__craftyTest?.call('readMobs') && window.__craftyTest?.call('readFrameloop') && window.__threeCamera
      && window.GameMethods?.damageMob && window.useGameStore.getState().spawnMob && window.useGameStore.getState().getMobFloor, null, { timeout: 60000 })
      .catch((e) => { throw new Error(`SETUP: the mob hooks, frame counter and camera never came up — ${e.message}`); });

    // 1. THE SURFACE IS GONE. Presence first: the stack renders its health bar, and the ember bar once ember is held.
    const fresh = await page.evaluate(({ keys, food }) => {
      const s = window.useGameStore.getState();
      window.useGameStore.setState({ ember: 20 });
      const bagFood = Object.entries(s.inventory).flatMap(([bag, items]) => food.filter((k) => items && k in items).map((k) => `${bag}:${k}`));
      return { storeKeys: keys.filter((k) => k in s), bagFood, bags: Object.keys(s.inventory).length };
    }, { keys: HUNGER_KEYS, food: FOOD });
    expect(fresh.bags, 'SETUP: the fresh profile has no inventory to read').toBeGreaterThan(0);
    expect(fresh.storeKeys, 'the store still carries hunger').toEqual([]);
    expect(fresh.bagFood, 'a fresh profile starts with food').toEqual([]);
    const stack = page.getByTestId('stat-stack');
    await expect(stack.getByTestId('stat-health'), 'SETUP: the HUD stat stack never rendered its health bar').toBeVisible();
    await expect(stack.getByTestId('ember-bar'), 'SETUP: the ember bar did not show with ember held').toBeVisible();
    const bars = await stack.evaluate((el) => [...el.children].map((c) => c.getAttribute('data-testid')));
    expect(bars, 'the HUD stat stack holds a bar beyond health, mana and ember').toEqual(['stat-health', 'stat-mana', 'ember-bar']);

    // 2. TEN MINUTES OF WORLD CLOCK WITH NOTHING TO EAT. Noon, no hostile near, full health, empty mana; every hit the
    // player takes from here is logged with its source, so a failure names what hurt.
    const staged = await page.evaluate(async () => {
      const store = window.useGameStore;
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      while (Date.now() - (store.getState()._spawnTime || 0) < 5500) await frame();
      const s = store.getState();
      s.setTimeOfDay?.(0.5);
      store.setState({ playerHealth: s.maxHealth, mana: 0 });
      window.__e2eHits = [];
      const hit = s.damagePlayer;
      store.setState({ damagePlayer: (amount, source, ...rest) => {
        window.__e2eHits.push({ amount, source: String(source), at: Math.round(performance.now()) });
        return hit(amount, source, ...rest);
      } });
      return { active: window.__craftyTest.call('readIntents').active, alive: store.getState().isAlive };
    });
    expect(staged, 'SETUP: the input gate or life was down at the window\'s start, so the world would be paused').toEqual({ active: true, alive: true });
    await page.evaluate(sweepAndRead);
    const before = await page.evaluate(readClocks);
    await page.clock.pauseAt(before.wall + 1000);
    const readings = [];
    for (let i = 0; i < JUMPS; i += 1) {
      await page.clock.fastForward(JUMP_MS);
      readings.push(await page.evaluate(sweepAndRead));
    }
    const after = await page.evaluate(readClocks);
    await page.clock.resume();

    const fell = readings.findIndex((r) => r.health < r.max);
    const gatesDown = readings.filter((r) => !r.active || !r.alive).length;
    const swept = readings.reduce((n, r) => n + r.swept, 0);
    const window10 = { advancedMs: Math.round(after.now - before.now), frames: after.frames - before.frames, dayUnits: after.gameTime - before.gameTime,
      mana: [after.mana, after.maxMana], gatesDown, swept };
    console.log(`[the-cut] hunger window: ${JSON.stringify(window10)}`);
    expect(fell, `health fell at jump ${fell + 1} of ${JUMPS} with nothing to eat and every hostile swept (reading ${JSON.stringify(readings[fell])}; hits ${JSON.stringify(after.hits)}; window ${JSON.stringify(window10)})`).toBe(-1);
    expect(after.hits, 'something hit the player during the window').toEqual([]);
    expect(after.health, 'the player ended the window short of full health').toBe(after.maxHealth);
    // The denominator, read after the subject so a starved player is scored as a defect, not as a broken setup.
    expect(window10.advancedMs, `SETUP: the page clock moved ${window10.advancedMs} ms, not ten minutes`).toBeGreaterThanOrEqual(JUMPS * JUMP_MS);
    expect(gatesDown, `SETUP: the input gate or life dropped during the window, so the world was paused (${JSON.stringify(window10)})`).toBe(0);
    expect(window10.frames, `SETUP: the game drew ${window10.frames} frames over ${JUMPS} jumps`).toBeGreaterThanOrEqual(JUMPS / 2);
    expect(after.mana, `SETUP: mana emptied before the window was not refilled, so the provider's timers did not run (${JSON.stringify(window10)})`).toBe(after.maxMana);
    expect(window10.dayUnits, `SETUP: the day clock fired on too few jumps (${JSON.stringify(window10)})`).toBeGreaterThanOrEqual(JUMPS * DAY_UNITS_PER_TICK * 0.9);
    // The instrument is live: a staged hit after the window lowers the same health reading.
    const probe = await page.evaluate(() => {
      const store = window.useGameStore;
      const was = store.getState().playerHealth;
      store.getState().damagePlayer(10, 'e2e-probe');
      const now = store.getState().playerHealth;
      store.setState({ playerHealth: store.getState().maxHealth });
      return { was, now };
    });
    expect(probe.now, `SETUP: a staged hit after the window did not lower health, so the reading above is no instrument (${JSON.stringify(probe)})`).toBeLessThan(probe.was);

    // 3. IT FIGHTS. A zombie 2.5 m ahead and a real left click; the aim is set on the click's own mousedown, so a view
    // the headless page turns between the aim and the press cannot carry the swing off it.
    await startPlayActive(page); // the paused clock held the page; ask for the input gate again as play resumes
    const z = await page.evaluate(() => {
      const s = window.useGameStore.getState();
      s.setTimeOfDay?.(0.5);
      const cam = window.__threeCamera;
      cam.rotation.x = 0; cam.updateMatrixWorld();
      const d = new cam.position.constructor();
      cam.getWorldDirection(d); d.y = 0; d.normalize();
      const gx = cam.position.x + d.x * 2.5, gz = cam.position.z + d.z * 2.5;
      const before = new Set(window.__craftyTest.call('readMobs').map((m) => m.id));
      s.spawnMob(gx, gz, 'zombie', s.getMobFloor(gx, gz, cam.position.y - 1.6));
      const m = window.__craftyTest.call('readMobs').find((e) => !before.has(e.id));
      if (!m) return { why: 'SETUP: spawnMob added no zombie' };
      window.__clickAim = { atDown: null };
      window.addEventListener('mousedown', () => {
        const live = window.__craftyTest.call('readMobs').find((e) => e.id === m.id);
        if (live) cam.lookAt(live.x, live.y + 0.8, live.z);
        const st = window.useGameStore.getState();
        window.__clickAim.atDown = { hp: live ? live.health : null, active: window.__craftyTest.call('readIntents').active, alive: st.isAlive };
      }, { capture: true, once: true });
      return { id: m.id, hp: m.health };
    });
    expect(z.why, z.why).toBeUndefined();
    await page.mouse.click(640, 400);
    const atDown = await page.evaluate(() => window.__clickAim.atDown);
    expect(atDown, 'SETUP: the click\'s mousedown never reached the window').not.toBeNull();
    expect({ active: atDown.active, alive: atDown.alive }, `SETUP: on the click's own mousedown a swing could not land (${JSON.stringify(atDown)})`).toEqual({ active: true, alive: true });
    const hpAfter = () => page.evaluate((id) => window.__craftyTest.call('readMobs').find((e) => e.id === id)?.health ?? null, z.id);
    await expect.poll(async () => { const h = await hpAfter(); return h === null || h < z.hp; }, { message: `a left click on the zombie dealt nothing (${JSON.stringify(atDown)})` }).toBe(true);

    // 4. IT SAVES, through the autosave's action and localStorage: no hunger anywhere in the blob, and no food.
    const saved = await page.evaluate((food) => {
      window.useGameStore.getState().saveActiveWorld({ x: 0, y: 18, z: 0 });
      const id = localStorage.getItem('crafty_active_world');
      const blob = id ? JSON.parse(localStorage.getItem('crafty_world_save_' + id) || 'null') : null;
      if (!blob) return null;
      const slices = { progression: blob.progression, game_state: blob.game_state, player_data: blob.player_data };
      return { version: blob.version, level: blob.progression?.level,
        hunger: Object.entries(slices).filter(([, v]) => v && 'hunger' in v).map(([k]) => k),
        food: Object.entries(blob.player_data?.inventory || {}).flatMap(([bag, items]) => food.filter((k) => items && k in items).map((k) => `${bag}:${k}`)) };
    }, FOOD);
    expect(saved, 'SETUP: saveActiveWorld wrote no world blob').not.toBeNull();
    expect(Number.isFinite(saved.level), `SETUP: the blob holds no level (${JSON.stringify(saved)})`).toBe(true);
    expect(saved.hunger, 'the save wrote a hunger field').toEqual([]);
    expect(saved.food, 'the save holds food').toEqual([]);
  });
});
