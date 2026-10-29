import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';
import { installWorldHold } from './_worldHold.js';
import { stageMeleeZombie } from './_meleeTarget.js';
import { SWING_APEX_OVER_BODY_M } from '../../src/combat/swingOrigin.js';
import { xpForLevel } from '../../src/game/progression.js';
import { killXP } from '../../src/game/killReward.js';
import { FORM_DURATION_SEC, ENDURANCE_SEC_PER_RANK } from '../../src/game/beastTransform.js';
import { ROAR_COST } from '../../src/game/ember.js';

// TALENTS THAT CHANGE VERBS, IN THE BOOTED GAME (W2-F step 4; DECISIONS 2026-10-28 W1-H item 6; plan
// docs/superpowers/plans/2026-10-29-crafty-w2f-talents.md, S8). A level-1 player one Husk short of level 2, with the roar
// unlocked: (1) the Inventory (E) has no allocate button and no Core Attributes block, and has the Relic slot; the
// Talents page (U) has no Spell Mastery; (2) the roar's beast form, entered on the real R key, ends at FORM_DURATION_SEC;
// (3) a real left click kills a staged 1-HP zombie, its XP orbs reach the player, and the player is level 2 with exactly
// one talent point and no attribute points; (4) on the Talents page a real click on Primal Endurance spends it, and the
// store's verb numbers say the roar now lasts ENDURANCE_SEC_PER_RANK longer; (5) the form entered the same way is still
// on past FORM_DURATION_SEC and ends by the longer length; (6) the save the store writes holds the talent and no
// attributes or spellLevels.
//
// Each form is timed in the page, frame by frame, from the first frame it is seen on to the first frame it is seen off,
// inside the same evaluate that waits for it, so the clock starts within a frame of the commit. A CI frame can last
// seconds, so the length read is the form's own plus up to one frame each side: the base form must
// be off by FORM_DURATION_SEC + the longest frame + 1 s, and the talented form must still be on at FORM_DURATION_SEC +
// 1 s (a frame boundary between there and its end is needed to see it, and the gap is ENDURANCE_SEC_PER_RANK - 1 s).
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
const LONGER_SEC = FORM_DURATION_SEC + ENDURANCE_SEC_PER_RANK;

/** In the page: wait out the player's spawn grace (5 s from `_spawnTime`) before a zombie is staged. */
async function afterSpawnGrace() {
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  while (Date.now() - (window.useGameStore.getState()._spawnTime || 0) < 5500) await frame();
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

/** In the page: the beast form timed frame by frame, from the first frame it is on to the first it is off, or until
 *  `limitMs` after it came on. Returns the span, whether it was still on at `probeMs` after the start, and the longest
 *  frame seen. */
async function timeForm({ limitMs, probeMs }) {
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const S = () => window.useGameStore.getState();
  const t0w = performance.now();
  while (!S().beastFormActive) {
    if (performance.now() - t0w > 30000) return { why: 'SETUP: the form never came on' };
    await frame();
  }
  const t0 = performance.now();
  let prev = t0, longest = 0, onAtProbe = null, endedAt = null;
  while (performance.now() - t0 < limitMs) {
    await frame();
    const t = performance.now();
    longest = Math.max(longest, t - prev);
    prev = t;
    const on = S().beastFormActive;
    if (on && t - t0 >= probeMs) onAtProbe = true;
    if (!on) { endedAt = t - t0; if (onAtProbe === null) onAtProbe = false; break; }
  }
  return { endedMs: endedAt === null ? null : Math.round(endedAt), onAtProbe, longestFrameMs: Math.round(longest) };
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
async function roarAndTime(page, probeMs) {
  await page.evaluate((v) => window.useGameStore.setState({ ember: v }), ROAR_COST);
  await page.keyboard.down('r');
  const timed = await page.evaluate(timeForm, { limitMs: (LONGER_SEC + 10) * 1000, probeMs });
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
    const base = await roarAndTime(page, (FORM_DURATION_SEC + 1) * 1000);
    expect(base.why, base.why).toBeUndefined();
    expect(base.endedMs, `the base form never ended: ${JSON.stringify(base)}`).not.toBeNull();
    expect(base.endedMs, `the base form outlasted ${FORM_DURATION_SEC} s by more than a frame: ${JSON.stringify(base)}`)
      .toBeLessThanOrEqual(FORM_DURATION_SEC * 1000 + base.longestFrameMs + 1000);
    expect(await page.evaluate(backAtHead), 'SETUP: the camera never came back to the head after the base form').toBe(true);
    await page.waitForTimeout(1600); // the roar's cooldown (COOLDOWN_SEC 1.5 s) before the next press can charge

    // 3. A LEVEL PAYS ONE TALENT POINT, from a real kill's own XP.
    await page.evaluate(afterSpawnGrace);
    const z = await page.evaluate(stageMeleeZombie, { apex: SWING_APEX_OVER_BODY_M });
    expect(z.why, z.why).toBeUndefined();
    await page.mouse.move(640, 400);
    await page.mouse.click(640, 400);
    await expect.poll(() => page.evaluate((id) => {
      const m = window.__craftyTest.call('readMobs').find((e) => e.id === id);
      return !m || m.health <= 0;
    }, z.id), { message: `the click did not kill the staged zombie (${JSON.stringify(await S())})`, timeout: 20000 }).toBe(true);
    const held = await page.evaluate(() => window.__e2eWorldHold.release());
    await expect.poll(async () => (await S()).level, { message: `the kill's ${ZOMBIE_XP} XP did not reach level 2 (hold ${JSON.stringify(held)})`, timeout: 30000 }).toBe(2);
    await page.evaluate((capMs) => window.__e2eHoldWorld({ capMs }), test.info().timeout || 300000);
    const two = await S();
    expect(two.talentPoints, 'level 2 paid other than exactly one talent point').toBe(1);
    expect(two.hasAttributes, 'the store holds attribute points again').toBe(false);
    expect(two.hasAllocate, 'hand allocation is back in the store').toBe(false);
    await startPlayActive(page);

    // 4. THE POINT ON A VERB TALENT, by a real click on the Talents page.
    await page.keyboard.press('u');
    await expect(page.getByTestId('progression-panel'), 'U did not reopen the Talents page').toBeVisible({ timeout: 15000 });
    const take = page.getByTestId('talent-take-wildheart_endurance');
    await expect(take, 'Primal Endurance cannot be taken with the point').toBeEnabled();
    await take.click();
    await expect.poll(async () => (await S()).talents.wildheart_endurance, { message: 'the click did not rank Primal Endurance' }).toBe(1);
    const spent = await S();
    expect(spent.talentPoints, 'the rank did not cost the point').toBe(0);
    expect(spent.roarSec, 'the store does not say the roar got longer').toBe(LONGER_SEC);
    await page.keyboard.press('u');
    await expect(page.getByTestId('progression-panel')).toHaveCount(0);
    await startPlayActive(page);

    // 5. THE VERB CHANGED: the same roar outlasts FORM_DURATION_SEC and ends by the longer length.
    const longer = await roarAndTime(page, (FORM_DURATION_SEC + 1) * 1000);
    expect(longer.why, longer.why).toBeUndefined();
    expect(longer.onAtProbe, `the talented form was off by ${FORM_DURATION_SEC + 1} s: ${JSON.stringify(longer)} (base ${JSON.stringify(base)})`).toBe(true);
    expect(longer.endedMs, `the talented form never ended: ${JSON.stringify(longer)}`).not.toBeNull();
    expect(longer.endedMs, `the talented form outlasted ${LONGER_SEC} s by more than a frame: ${JSON.stringify(longer)}`)
      .toBeLessThanOrEqual(LONGER_SEC * 1000 + longer.longestFrameMs + 1000);

    // 6. IT SAVES, through the autosave's action and localStorage: the talent, and no attributes or spell levels.
    const saved = await page.evaluate(() => {
      window.useGameStore.getState().saveActiveWorld({ x: 0, y: 18, z: 0 });
      const id = localStorage.getItem('crafty_active_world');
      const blob = id ? JSON.parse(localStorage.getItem('crafty_world_save_' + id) || 'null') : null;
      return blob && { talents: blob.progression?.unlockedTalents, points: blob.progression?.talentPoints, level: blob.progression?.level,
        hasAttributes: 'attributes' in (blob.progression || {}), hasSpellLevels: 'spellLevels' in (blob.progression || {}) };
    });
    expect(saved, 'SETUP: saveActiveWorld wrote no world blob').not.toBeNull();
    expect(saved).toEqual({ talents: { wildheart_roar: 1, wildheart_endurance: 1 }, points: 0, level: 2, hasAttributes: false, hasSpellLevels: false });
    await page.evaluate(() => window.__e2eWorldHold.release());
  });
});
