import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';
import { installWorldHold } from './_worldHold.js';
import { xpForLevel } from '../../src/game/progression.js';
import { killXP } from '../../src/game/killReward.js';
import { FORM_DURATION_SEC, ENDURANCE_SEC_PER_RANK } from '../../src/game/beastTransform.js';
import { ROAR_COST } from '../../src/game/ember.js';
import { SWING_APEX_OVER_BODY_M } from '../../src/combat/swingOrigin.js';
import { TALENT_LIMITS } from '../../src/game/talentTree.js';

// TALENTS THAT CHANGE VERBS, IN THE BOOTED GAME (W2-F step 4; DECISIONS 2026-10-28 W1-H item 6; plan
// docs/superpowers/plans/2026-10-29-crafty-w2f-talents.md, S8). A level-1 player one Husk short of level 2, with the roar
// unlocked: (1) the Inventory (E) has no allocate button and no Core Attributes block, and has the Relic slot; the
// Talents page (U) has no Spell Mastery; (2) the roar's beast form, entered on the real R key, ends at FORM_DURATION_SEC;
// (3) a real left click kills a staged 1-HP zombie, its XP orbs reach the player, and the player is level 2 with exactly
// one talent point and no attribute points; (4) on the Talents page real clicks on Primal Endurance spend that point and
// two seeded beside it, up to the rank's limit, and the store's verb numbers say the roar now lasts
// ENDURANCE_SEC_PER_RANK x the limit longer; (5) the form entered the same way is still on past FORM_DURATION_SEC and
// ends by the longer length; (6) the save the store writes holds the talents and no attributes or spellLevels.
//
// Each form is timed in the page, frame by frame, on the GAME's clock: R3F's, the clock the transform's timer compares
// (Components.jsx decideTransform, `now: state.clock.getElapsedTime()`), read with the count of frames drawn
// (readFrameloop), so each reading is the clock of the frame whose state it saw. A wall clock started when the page
// first saw the form on starts after that frame's render, which a software renderer can stretch by seconds, and every
// length it reads is short by that much. The base form's last frame on must read under FORM_DURATION_SEC + 1 s; the
// talented form must have a frame on at FORM_DURATION_SEC + 1 s or later. A frame drawn between there and its end is
// needed to see it, and a beast form on CI's software renderer draws its frames up to 10 s apart, so the rank is taken to
// its limit: the window is then ENDURANCE_SEC_PER_RANK x the limit - 1 s wide (8 s), not 2 s. A run that draws no frame
// in it is SETUP, not a verdict.
//
// THE CLICK'S AIM IS SET ON ITS OWN MOUSEDOWN, by a capture listener on window, which runs before the game's handler.
// Under pointer lock a mouse move IS a look (src/input/pointerLook.js), the lock can be held here, and Playwright's
// synthetic mouse delivers moves this spec never makes: between an aim and the next mousedown the camera turns by
// multiples of 640 x 400 px (1.28 rad and 0.80 rad at 0.002 rad/px), with the cursor already where the click lands. So an
// aim set before the click does not survive to it; the listener records the facing it found, turns the camera to the
// zombie, and reads the swing's gates and cone, so the click is judged with the view it is made with.
//
// The XP is the kill's own: the zombie's orbs are collected by the XP orb system, which holds them still through a held
// world, so the world is let go after the kill and held again once the level is reached.
//
// WHAT THIS DOES NOT CHECK: the grab's second throw, the wider snare, the chained imbue, Apex Predator and the relics in
// the running game (unit-proven at their reducers, src/game/{voidhand,elementZones,beasts,verbMods}.test.js and
// tests/store/relicSlot.test.js); a relic dropping from a real kill; the pre-cut save's refund in a browser
// (tests/store/preCutSave.test.js); touch.
//
// Mutation-Proof: see the commit trailer. These cases need a browser, so CI runs them.

const ZOMBIE_XP = killXP('zombie');
const ENDURANCE_RANKS = TALENT_LIMITS.wildheart_endurance;
const LONGER_SEC = FORM_DURATION_SEC + ENDURANCE_SEC_PER_RANK * ENDURANCE_RANKS;

/** In the page: a zombie 2.5 m ahead at 1 HP, the camera turned to it. */
async function stageZombie() {
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  while (Date.now() - (window.useGameStore.getState()._spawnTime || 0) < 5500) await frame();
  const s = window.useGameStore.getState();
  const cam = window.__threeCamera;
  cam.rotation.order = 'YXZ'; cam.rotation.x = 0; cam.updateMatrixWorld();
  const d = new cam.position.constructor();
  cam.getWorldDirection(d); d.y = 0; d.normalize();
  const gx = cam.position.x + d.x * 2.5, gz = cam.position.z + d.z * 2.5;
  const before = new Set(window.__craftyTest.call('readMobs').map((m) => m.id));
  s.spawnMob(gx, gz, 'zombie', s.getMobFloor(gx, gz, cam.position.y - 1.6));
  const m = window.__craftyTest.call('readMobs').find((e) => !before.has(e.id));
  if (!m) return { why: 'SETUP: spawnMob added no zombie' };
  window.GameMethods.damageMob(m.id, m.health - 1, 'physical', 'ally');
  const left = window.__craftyTest.call('readMobs').find((e) => e.id === m.id)?.health;
  if (left !== 1) return { why: `SETUP: the staged zombie has ${left} HP, not 1` };
  cam.lookAt(m.x, m.y + 0.8, m.z);
  return { id: m.id };
}

/** In the page: arm the next mousedown (a capture listener on window, so it runs before the game's handler) to turn the
 *  camera to the staged zombie, as stageZombie does, and read the light swing's gates against it into
 *  window.__clickAim.atDown: input live, alive, no form, no voidhand, the string's cooldown, and whether the zombie stands
 *  in the cone the swing tests (apex over the body, the camera's flattened facing, 4.5 m, 90 degrees). `found` is the
 *  facing and pitch the listener found before it turned the camera. */
function armClickAim({ id, apexM }) {
  const call = (n) => window.__craftyTest.call(n);
  const r = (v) => Math.round(v * 100) / 100;
  const cam = window.__threeCamera;
  const view = () => {
    const d = new cam.position.constructor();
    cam.getWorldDirection(d);
    const pitch = r(Math.asin(d.y));
    d.y = 0; d.normalize();
    return { d, facing: [r(d.x), r(d.z)], pitch };
  };
  window.__clickAim = { atDown: null };
  window.addEventListener('mousedown', () => {
    const found = view();
    const m = call('readMobs').find((e) => e.id === id);
    if (m) cam.lookAt(m.x, m.y + 0.8, m.z);
    cam.rotation.y += Math.PI / 2; // MUTANT T-away
    const st = window.useGameStore.getState();
    const b = st.playerRigidBodyRef?.current?.translation?.();
    const v = view();
    const apex = b ? { x: b.x, y: b.y + apexM, z: b.z } : null;
    const cone = apex ? window.GameMethods.checkMobsInMeleeCone(apex, v.d, 4.5, Math.PI / 2) : [];
    window.__clickAim.atDown = {
      hp: m ? m.health : null, inCone: cone.some((e) => e.id === id), active: call('readIntents').active, alive: st.isAlive,
      form: st.beastFormActive, held: !!st.voidhandHeld, readyInMs: Math.round(call('readString').readyAt - performance.now()),
      facing: v.facing, pitch: v.pitch, found: { facing: found.facing, pitch: found.pitch },
      body: b ? [r(b.x), r(b.y), r(b.z)] : null, mob: m ? [r(m.x), r(m.y), r(m.z)] : null,
    };
  }, { capture: true, once: true });
}

/** In the page: set the time of day and let the frames the day/night hooks run on go by. */
async function setTime(t) {
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  window.useGameStore.getState().setTimeOfDay(t);
  for (let i = 0; i < 8; i++) await frame();
  return window.useGameStore.getState().isDay;
}

/** In the page: `n` drawn frames, so a key held across them reaches the frame loop. */
async function frames(n) {
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  for (let i = 0; i < n; i++) await frame();
}

/** In the page: the beast form timed on the game's clock, one reading per frame drawn, from the first frame it is on to
 *  the first frame it is off, or until `limitMs` of wall time after it came on. Returns, in game seconds since the first
 *  frame on: the last frame on, the first frame off, whether a frame at or past `probeS` was on, and every gap between
 *  drawn frames over a second as [start, length]. */
async function timeForm({ limitMs, probeS }) {
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const on = () => window.useGameStore.getState().beastFormActive;
  const loop = () => window.__craftyTest.call('readFrameloop');
  if (!loop()) return { why: 'SETUP: readFrameloop is not registered, so there is no game clock to time the form on' };
  const t0w = performance.now();
  while (!on()) {
    if (performance.now() - t0w > 30000) return { why: 'SETUP: the form never came on' };
    await frame();
  }
  const first = loop();
  const r2 = (v) => Math.round(v * 100) / 100;
  let seen = first.frames, prev = first.clock, lastOnS = 0, endedS = null, onAtProbe = false;
  const gaps = [];
  const tw = performance.now();
  while (performance.now() - tw < limitMs) {
    await frame();
    const f = loop();
    if (f.frames === seen) continue; // no frame drawn since the last reading: the same clock and the same state
    seen = f.frames;
    if (f.clock - prev > 1) gaps.push([r2(prev - first.clock), r2(f.clock - prev)]);
    prev = f.clock;
    const s = f.clock - first.clock;
    if (!on()) { endedS = s; break; }
    lastOnS = s;
    if (s >= probeS) onAtProbe = true;
  }
  return { lastOnS: r2(lastOnS), endedS: endedS === null ? null : r2(endedS), onAtProbe, gaps };
}

/** In the page: true once the camera has sat at the player's head for two frames (the roar's reveal camera hands it
 *  back), false after 45 s. A zombie staged before that is placed in front of the reveal camera, not the player. */
async function backAtHead() {
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const cam = window.__threeCamera;
  const t0 = performance.now();
  let streak = 0;
  while (streak < 2) {
    if (performance.now() - t0 > 45000) return false;
    await frame();
    const b = window.useGameStore.getState().playerRigidBodyRef?.current?.translation?.();
    const ok = b && Math.hypot(cam.position.x - b.x, cam.position.z - b.z) < 1 && Math.abs(cam.position.y - b.y - 1.2) < 0.6;
    streak = ok ? streak + 1 : 0;
  }
  return true;
}

/** A key released, then frames drawn, so the frame loop sees the release before the next press. */
async function release(page, key) {
  await page.keyboard.up(key);
  await page.evaluate(frames, 3);
}

/** The roar on the real R key, timed in the page from the first frame its form is on (timeForm), so no round trip sits
 *  between the commit and the start of the clock. R stays down through the form: a held key makes no new edge, and only
 *  an edge ends a form by hand. The bar is refilled first, since the roar takes it all. */
async function roarAndTime(page, probeS) {
  await page.evaluate((v) => window.useGameStore.setState({ ember: v }), ROAR_COST);
  await page.keyboard.down('r');
  const timed = await page.evaluate(timeForm, { limitMs: (LONGER_SEC + 10) * 1000, probeS });
  await release(page, 'r');
  return timed;
}

test.describe('talents', () => {
  test.setTimeout(300000);

  test('a level pays one talent point, and Primal Endurance lengthens the roar in the running game', async ({ page }) => {
    await page.addInitScript(installWorldHold);
    await bootDev(page);
    await startPlayActive(page);
    await page.waitForFunction(() => window.__craftyTest?.call('readMobs') && window.__threeCamera && window.GameMethods?.damageMob
      && window.useGameStore.getState().spawnMob && window.useGameStore.getState().getMobFloor, null, { timeout: 60000 })
      .catch((e) => { throw new Error(`SETUP: the mob hooks and camera never came up — ${e.message}`); });
    const S = () => page.evaluate(() => {
      const s = window.useGameStore.getState();
      return { level: s.level, currentXP: s.currentXP, talentPoints: s.talentPoints, talents: s.unlockedTalents,
        roarSec: s.getVerbMods().roarSec, hasAttributes: 'attributes' in s, hasAllocate: 'allocateAttribute' in s,
        form: s.beastFormActive, alive: s.isAlive, active: window.__craftyTest.call('readIntents').active };
    });

    // Noon, no mob within 40 m, the world held, level 1 one Husk short of level 2, the roar unlocked and no other rank.
    expect(await page.evaluate(setTime, 0.5), 'SETUP: noon did not read as day').toBe(true);
    const staged = await page.evaluate(({ xp, capMs }) => {
      const cam = window.__threeCamera;
      for (const m of window.__craftyTest.call('readMobs')) {
        if (m.health > 0 && Math.hypot(m.x - cam.position.x, m.z - cam.position.z) < 40) window.GameMethods.damageMob(m.id, 99999, 'physical', 'ally');
      }
      if (!window.__e2eHoldWorld) return { why: 'SETUP: the world hold was never installed (page.addInitScript(installWorldHold))' };
      window.__e2eHoldWorld({ capMs });
      window.useGameStore.setState({ level: 1, currentXP: xp, totalXP: xp, talentPoints: 0, unlockedTalents: { wildheart_roar: 1 } });
      return {};
    }, { xp: xpForLevel(1) - 1, capMs: test.info().timeout || 300000 });
    expect(staged.why, staged.why).toBeUndefined();
    const start = await S();
    expect(start, 'SETUP: the seeded player is not level 1 with the roar alone').toMatchObject({ level: 1, talentPoints: 0, talents: { wildheart_roar: 1 } });
    expect(start.roarSec, 'SETUP: the roar is not at its base length').toBe(FORM_DURATION_SEC);

    // 1. THE REMOVED SURFACES ARE GONE. The Inventory on E, the Talents page on U, each closed the way it opened.
    await page.keyboard.press('e');
    await expect(page.getByTestId('inventory-modal'), 'E did not open the Inventory').toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('relic-slot'), 'the Inventory has no relic slot').toBeVisible();
    await expect(page.getByTestId('alloc-strength'), 'the Inventory still offers to allocate a point').toHaveCount(0);
    await expect(page.getByText(/Core Attributes/i)).toHaveCount(0);
    await page.keyboard.press('e');
    await expect(page.getByTestId('inventory-modal')).toHaveCount(0);
    await startPlayActive(page);
    await page.keyboard.press('u');
    await expect(page.getByTestId('progression-panel'), 'U did not open the Talents page').toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Spell Mastery/i), 'the Talents page still has Spell Mastery').toHaveCount(0);
    await expect(page.getByTestId('talent-take-wildheart_endurance'), 'SETUP: Primal Endurance offers no button').toBeVisible();
    await expect(page.getByTestId('talent-take-wildheart_endurance'), 'Primal Endurance can be taken with no point').toBeDisabled();
    await page.keyboard.press('u');
    await expect(page.getByTestId('progression-panel')).toHaveCount(0);
    await startPlayActive(page);

    // 2. THE BASE ROAR: the form entered on R ends at FORM_DURATION_SEC (the instrument sees an end, and the base length).
    const base = await roarAndTime(page, FORM_DURATION_SEC + 1);
    expect(base.why, base.why).toBeUndefined();
    console.log(`[talents] base form, game seconds: ${JSON.stringify(base)}`);
    expect(base.endedS, `the base form never ended: ${JSON.stringify(base)}`).not.toBeNull();
    expect(base.lastOnS, `the base form was on ${base.lastOnS} s into it on the game clock, past its ${FORM_DURATION_SEC} s: ${JSON.stringify(base)}`)
      .toBeLessThan(FORM_DURATION_SEC + 1);
    expect(await page.evaluate(backAtHead), 'SETUP: the camera never came back to the head after the base form').toBe(true);
    await page.waitForTimeout(1600); // the roar's cooldown (COOLDOWN_SEC 1.5 s) before the next press can charge

    // 3. A LEVEL PAYS ONE TALENT POINT, from a real kill's own XP.
    const z = await page.evaluate(stageZombie);
    expect(z.why, z.why).toBeUndefined();
    await page.evaluate(armClickAim, { id: z.id, apexM: SWING_APEX_OVER_BODY_M });
    await page.mouse.click(640, 400);
    const atDown = await page.evaluate(() => window.__clickAim.atDown);
    expect(atDown, 'SETUP: the click\'s mousedown never reached the window').not.toBeNull();
    const swingCan = atDown.inCone && atDown.active && atDown.alive && !atDown.form && !atDown.held && atDown.readyInMs <= 0;
    expect(swingCan, `SETUP: on the click's own mousedown, aimed at the staged zombie, a light swing could not reach it: ${JSON.stringify(atDown)}`).toBe(true);
    await expect.poll(() => page.evaluate((id) => {
      const m = window.__craftyTest.call('readMobs').find((e) => e.id === id);
      return !m || m.health <= 0;
    }, z.id), { message: `the click did not kill the staged zombie, in the swing's cone with every gate open at its mousedown (${JSON.stringify(atDown)}; ${JSON.stringify(await S())})`, timeout: 20000 }).toBe(true);
    const held = await page.evaluate(() => window.__e2eWorldHold.release());
    await expect.poll(async () => (await S()).level, { message: `the kill's ${ZOMBIE_XP} XP did not reach level 2 (hold ${JSON.stringify(held)})`, timeout: 30000 }).toBe(2);
    await page.evaluate((capMs) => window.__e2eHoldWorld({ capMs }), test.info().timeout || 300000);
    const two = await S();
    expect(two.talentPoints, 'level 2 paid other than exactly one talent point').toBe(1);
    expect(two.hasAttributes, 'the store holds attribute points again').toBe(false);
    expect(two.hasAllocate, 'hand allocation is back in the store').toBe(false);
    await startPlayActive(page);

    // 4. THE POINTS ON A VERB TALENT, by real clicks on the Talents page: the level's point, then the two seeded beside it
    // that take the rank to its limit (the header says why the limit).
    await page.keyboard.press('u');
    await expect(page.getByTestId('progression-panel'), 'U did not reopen the Talents page').toBeVisible({ timeout: 15000 });
    const take = page.getByTestId('talent-take-wildheart_endurance');
    await expect(take, 'Primal Endurance cannot be taken with the point').toBeEnabled();
    await take.click();
    await expect.poll(async () => (await S()).talents.wildheart_endurance, { message: 'the click did not rank Primal Endurance' }).toBe(1);
    const spent = await S();
    expect(spent.talentPoints, 'the rank did not cost the point').toBe(0);
    expect(spent.roarSec, 'the store does not say the roar got longer').toBe(FORM_DURATION_SEC + ENDURANCE_SEC_PER_RANK);
    await page.evaluate((n) => window.useGameStore.setState((s) => ({ talentPoints: s.talentPoints + n })), ENDURANCE_RANKS - 1);
    for (let rank = 2; rank <= ENDURANCE_RANKS; rank++) {
      await expect(take, `Primal Endurance cannot be taken to rank ${rank} with a point`).toBeEnabled();
      await take.click();
      await expect.poll(async () => (await S()).talents.wildheart_endurance, { message: `the click did not rank Primal Endurance to ${rank}` }).toBe(rank);
    }
    const maxed = await S();
    expect(maxed.talentPoints, 'the ranks did not cost a point each').toBe(0);
    expect(maxed.roarSec, `the store does not say the roar lasts ${LONGER_SEC} s at rank ${ENDURANCE_RANKS}`).toBe(LONGER_SEC);
    await page.keyboard.press('u');
    await expect(page.getByTestId('progression-panel')).toHaveCount(0);
    await startPlayActive(page);

    // 5. THE VERB CHANGED: the same roar outlasts FORM_DURATION_SEC and ends by the longer length.
    const probeS = FORM_DURATION_SEC + 1;
    const longer = await roarAndTime(page, probeS);
    expect(longer.why, longer.why).toBeUndefined();
    console.log(`[talents] talented form, game seconds: ${JSON.stringify(longer)}`);
    expect(!longer.onAtProbe && longer.endedS !== null && longer.endedS >= probeS,
      `SETUP: no frame was drawn from ${longer.lastOnS} s to ${longer.endedS} s of the talented form, across the ${probeS} s probe, so whether it was on there is unseen: ${JSON.stringify(longer)} (base ${JSON.stringify(base)})`).toBe(false);
    expect(longer.onAtProbe, `the talented form was off by ${probeS} s of the game clock: ${JSON.stringify(longer)} (base ${JSON.stringify(base)})`).toBe(true);
    expect(longer.endedS, `the talented form never ended: ${JSON.stringify(longer)}`).not.toBeNull();
    expect(longer.lastOnS, `the talented form was on ${longer.lastOnS} s into it on the game clock, past its ${LONGER_SEC} s: ${JSON.stringify(longer)}`)
      .toBeLessThan(LONGER_SEC + 1);

    // 6. IT SAVES, through the autosave's action and localStorage: the talent, and no attributes or spell levels.
    const saved = await page.evaluate(() => {
      window.useGameStore.getState().saveActiveWorld({ x: 0, y: 18, z: 0 });
      const id = localStorage.getItem('crafty_active_world');
      const blob = id ? JSON.parse(localStorage.getItem('crafty_world_save_' + id) || 'null') : null;
      return blob && { talents: blob.progression?.unlockedTalents, points: blob.progression?.talentPoints, level: blob.progression?.level,
        hasAttributes: 'attributes' in (blob.progression || {}), hasSpellLevels: 'spellLevels' in (blob.progression || {}) };
    });
    expect(saved, 'SETUP: saveActiveWorld wrote no world blob').not.toBeNull();
    expect(saved).toEqual({ talents: { wildheart_roar: 1, wildheart_endurance: ENDURANCE_RANKS }, points: 0, level: 2, hasAttributes: false, hasSpellLevels: false });
    await page.evaluate(() => window.__e2eWorldHold.release());
  });
});
