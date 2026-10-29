import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';
import { installWorldHold } from './_worldHold.js';
import { bankForKill } from '../../src/game/mobBank.js';
import { EMBER_MAX, ROAR_COST, GRAB_COST, SNARE_COST, FUSE_COST, IMBUE_COST } from '../../src/game/ember.js';
import { ANTICIPATION_SEC } from '../../src/game/beastTransform.js';
import { FUSE_CHANNEL_SEC } from '../../src/game/soulbind.js';
import { MAX_HOLD_SEC } from '../../src/game/voidhand.js';
import { KIND_BY_SPELL } from '../../src/game/elemancer.js';
import { EYE_HEIGHT_M, EYE_BOB_M } from '../../src/combat/swingOrigin.js';

// EMBER, IN THE BOOTED GAME (W2-F step 3; DECISIONS 2026-10-28 W1-H item 5; plan
// docs/superpowers/plans/2026-10-28-crafty-w2f-ember.md). One bar in the HUD's stat stack, filled by a day kill made with
// a real left click, spent by a roar held on the real R key and by a grab on the real V key, and not filled by a night
// kill made the same way. "Not enough ember" is the frame loop's, from each Aspect reducer's 'short' (a press only the
// price refused) or 'unpaid' (a started verb whose price was spent before it landed), so every press here is a key held
// across frames, and each verb's notice is read: R one kill short, R whose full bar is drained while it charges, V one
// short. The second case spends the bar on the X key: a snare and a fuse it cannot pay for say so; a bind and a fuse
// take their price; a fuse whose nearest pair changes while it channels breaks and takes nothing; a pair with no recipe
// says nothing at any bar, below the snare's price included. The third spends it on Z and F: an imbue it cannot arm says
// so, an imbued cast takes its price and carries its element, and a cast refused for mana takes nothing, keeps the
// stance armed and leaves no element for a later cast.
//
// The bar is read off the DOM (the value the player sees) and the store; the kills are real clicks on staged zombies left
// at 1 HP by an ally-sourced hit (ally kills bank nothing, so only the click's kill can pay). The world is held still for
// the whole spec (_worldHold.js), so no mob or ally moves and the clock never reaches dawn, which would empty the bar.
//
// The drained roar's bar is emptied by a store write standing for another verb's spend: what the reducer reads at the
// commit is the bar, whoever emptied it. The fuse's pair is changed by binding a third ally nearer than one of the two.
//
// A CI runner can take seconds over a single frame, and two things follow. A key released and pressed again with no
// frame drawn between reads to the frame loop as one hold, with no new edge, so every release here draws frames before
// anything else happens (release()). And a notice is a toast that lives 4 s of wall time (QuestSystem addNotification),
// which can be added and removed inside one frame while no poll can run, so notices are read from a log of the notice
// text the page adds to its DOM (installNoticeLog), not polled on screen. Each press whose notice is judged first waits
// out denyToast's 1 s throttle, so a notice it should raise is not swallowed, and a silence is not the throttle's.
//
// WHAT THIS DOES NOT CHECK: building's accrual and its daily cap (tests/store/ember.test.js and
// tests/gates/place-executor-gates.test.jsx), a grab, bind or fuse whose bar is drained mid-charge or mid-channel (the
// reducers' 'unpaid' is src/game/voidhand.test.js and soulbind.test.js; the call site's routing of it is the roar's, read
// here), an armed imbue whose bar is drained before the cast (src/game/elemancer.test.js), the dawn bleed
// (tests/store/ember.test.js), a save's migration (tests/e2e/the-cut.spec.js and tests/store/preCutSave.test.js), or
// touch, whose ring writes the same intents the keys do (tests/gates/ember-denied-gates.test.jsx).
//
// Mutation-Proof: see the commit trailer. These cases need a browser, so CI runs them.

const ZOMBIE = bankForKill('zombie');
const SEED = ROAR_COST - ZOMBIE; // one day kill short of the roar
const NIGHT_SEED = 50;

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
  return { id: m.id, isDay: s.isDay };
}

/** In the page: set the time of day and let the frames the day/night hooks run on go by. */
async function setTime(t) {
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  window.useGameStore.getState().setTimeOfDay(t);
  for (let i = 0; i < 8; i++) await frame();
  return window.useGameStore.getState().isDay;
}

/** In the page: a `type` spawned `dist` m to the player's side at full health and bound straight into the squad. */
function bindBeside({ type, side, dist = 2 }) {
  const s = window.useGameStore.getState();
  const cam = window.__threeCamera;
  const d = new cam.position.constructor();
  cam.getWorldDirection(d); d.y = 0; d.normalize();
  const gx = cam.position.x - d.z * dist * side, gz = cam.position.z + d.x * dist * side;
  const before = new Set(window.__craftyTest.call('readMobs').map((m) => m.id));
  s.spawnMob(gx, gz, type, s.getMobFloor(gx, gz, cam.position.y - 1.6));
  const m = window.__craftyTest.call('readMobs').find((e) => !before.has(e.id));
  if (!m) return { why: `SETUP: spawnMob added no ${type}` };
  if (!window.GameMethods.captureMob(m.id)) return { why: `SETUP: captureMob refused the ${type}` };
  return { id: m.id };
}

/** In the page: the camera turned to the sky, so no weakened hostile is in the snare's aim and X goes to the fuse. */
function lookUp() {
  const cam = window.__threeCamera;
  cam.rotation.order = 'YXZ'; cam.rotation.x = 1.2; cam.updateMatrixWorld();
}

/** In the page: `n` drawn frames, so a key held across them reaches the frame loop. */
async function frames(n) {
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  for (let i = 0; i < n; i++) await frame();
}

/** In the page: true once the camera has sat at the player's head (`eyeM` over the body's centre, within the walk bob's
 *  `bobM`) for two frames (the roar's reveal camera hands it back), false after 45 s. The bound is the follow's own: a
 *  follow that puts the eye elsewhere never comes back to the head. */
async function backAtHead({ eyeM, bobM }) {
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const cam = window.__threeCamera;
  const t0 = performance.now();
  let streak = 0;
  while (streak < 2) {
    if (performance.now() - t0 > 45000) return false;
    await frame();
    const b = window.useGameStore.getState().playerRigidBodyRef?.current?.translation?.();
    const ok = b && Math.hypot(cam.position.x - b.x, cam.position.z - b.z) < 1 && Math.abs(cam.position.y - b.y - eyeM) <= bobM;
    streak = ok ? streak + 1 : 0;
  }
  return true;
}

/** In the page: once the roar's charge is seen, the bar is drained to `left` (another verb's spend), and the frames run
 *  on past the charge window. Returns what the charge did. */
async function drainDuringCharge({ left, ms }) {
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const S = () => window.useGameStore.getState();
  const t0 = performance.now();
  while (!S().beastCharging && !S().beastFormActive) {
    if (performance.now() - t0 > 30000) return { why: 'SETUP: R held on a full bar never started the charge' };
    await frame();
  }
  if (S().beastFormActive) return { why: 'SETUP: the form committed before the drain (one frame outlasted the charge window)' };
  window.useGameStore.setState({ ember: left });
  const t1 = performance.now();
  let n = 0, form = false;
  while (performance.now() - t1 < ms || n < 10) {
    await frame();
    n += 1;
    if (S().beastFormActive) form = true;
  }
  return { frames: n, form, charging: S().beastCharging, ember: S().ember };
}

const EMBER_NOTICE = 'Not enough ember';
const MANA_NOTICE = 'Not enough mana';

/** Installed before boot (page.addInitScript): every watched notice the page adds to its DOM, in order. A MutationObserver
 *  callback runs right after the DOM change, so a toast removed before any poll could see it is still recorded. */
const installNoticeLog = () => {
  window.__e2eNotices = [];
  const watched = /Not enough (?:ember|mana)/;
  new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.addedNodes) {
        const hit = (n.textContent || '').match(watched);
        if (hit) window.__e2eNotices.push(hit[0]);
      }
    }
  }).observe(document, { childList: true, subtree: true });
};

/** How many `text` notices the page has added so far. */
const noticesOf = (page, text) => page.evaluate((t) => (window.__e2eNotices || []).filter((n) => n === t).length, text);

/** A key released, then frames drawn, so the frame loop sees the release before the next press. */
async function release(page, key) {
  await page.keyboard.up(key);
  await page.evaluate(frames, 3);
}

/** A key held across `n` drawn frames, then released. */
async function press(page, key, n = 5) {
  await page.keyboard.down(key);
  await page.evaluate(frames, n);
  await release(page, key);
}

/** Past denyToast's 1 s throttle, the count of `text` notices so far: the mark a judged press is read against. */
async function noticeMark(page, text = EMBER_NOTICE) {
  await page.waitForTimeout(1100);
  return noticesOf(page, text);
}

/** A notice raised since `mark`, waited for. */
async function expectNotice(page, mark, message, text = EMBER_NOTICE) {
  await expect.poll(() => noticesOf(page, text), { message, timeout: 30000 }).toBeGreaterThan(mark);
}

/** No notice raised since `mark`, read after frames and wall time for one to have shown. */
async function expectNoNotice(page, mark, message, text = EMBER_NOTICE) {
  await page.evaluate(frames, 3);
  await page.waitForTimeout(1500);
  expect(await noticesOf(page, text), message).toBe(mark);
}

test.describe('ember', () => {
  test.setTimeout(240000);

  test('one bar: a day kill fills it, the roar and a grab spend it, a short press says so, a night kill adds nothing', async ({ page }) => {
    await page.addInitScript(installWorldHold);
    await page.addInitScript(installNoticeLog);
    await bootDev(page);
    await startPlayActive(page);
    await page.waitForFunction(() => window.__craftyTest?.call('readMobs') && window.__threeCamera && window.GameMethods?.damageMob
      && window.useGameStore.getState().spawnMob && window.useGameStore.getState().getMobFloor, null, { timeout: 60000 })
      .catch((e) => { throw new Error(`SETUP: the mob hooks and camera never came up — ${e.message}`); });
    expect(await page.evaluate(() => Array.isArray(window.__e2eNotices)), 'SETUP: the notice log was never installed').toBe(true);

    const S = () => page.evaluate(() => {
      const s = window.useGameStore.getState();
      return { ember: s.ember, isDay: s.isDay, form: s.beastFormActive, charging: s.beastCharging, held: s.voidhandHeld,
        alive: s.isAlive, active: window.__craftyTest.call('readIntents').active };
    });
    const bar = page.getByTestId('ember-bar');

    // Noon, no mob within 40 m, the world held, the roar and the grab unlocked, the bar one Husk short of the roar.
    expect(await page.evaluate(setTime, 0.5), 'SETUP: noon did not read as day').toBe(true);
    const staged = await page.evaluate(({ seed, capMs }) => {
      const s = window.useGameStore.getState();
      const cam = window.__threeCamera;
      for (const m of window.__craftyTest.call('readMobs')) {
        if (m.health > 0 && Math.hypot(m.x - cam.position.x, m.z - cam.position.z) < 40) window.GameMethods.damageMob(m.id, 99999, 'physical', 'ally');
      }
      if (!window.__e2eHoldWorld) return { why: 'SETUP: the world hold was never installed (page.addInitScript(installWorldHold))' };
      window.__e2eHoldWorld({ capMs });
      window.useGameStore.setState({ ember: seed, unlockedTalents: { ...s.unlockedTalents, wildheart_roar: 1, voidhand_grasp: 1 } });
      return {};
    }, { seed: SEED, capMs: test.info().timeout || 240000 });
    expect(staged.why, staged.why).toBeUndefined();

    // 1. ONE BAR. The stack the four meters sat in holds the ember bar, at the seeded value, and none of their labels.
    await expect(page.getByTestId('stat-stack'), 'SETUP: the HUD stat stack never rendered').toBeVisible();
    await expect(bar, 'the stat stack does not hold exactly one ember bar').toHaveCount(1);
    await expect(bar).toContainText(`${SEED}/${EMBER_MAX}`);
    expect(await page.getByTestId('stat-stack').textContent(), 'a retired meter is still on the HUD').not.toMatch(/ROAR!|GRAB!|SNARE!|IMBUE!/);

    // 2. A SHORT PRESS SAYS SO. R on a bar the roar cannot pay for: the notice, no charge, nothing taken.
    let mark = await noticeMark(page);
    await press(page, 'r');
    await expectNotice(page, mark, 'a roar the bar cannot pay for was refused in silence');
    const refused = await S();
    expect(refused.charging || refused.form, `a short roar started anyway: ${JSON.stringify(refused)}`).toBe(false);
    expect(refused.ember, 'a refused roar took ember').toBe(SEED);

    // 2b. THE ROAR'S GATE IS THE FULL BAR. R held past the charge window one kill short starts no charge and no form
    // (step 4 holds R the same way on a full bar and sees the form, so this reading is not a dead instrument).
    await page.keyboard.down('r');
    const heldShort = await page.evaluate(async (ms) => {
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const t0 = performance.now();
      let n = 0, started = false, intent = false;
      while (performance.now() - t0 < ms || n < 10) {
        await frame();
        n += 1;
        const s = window.useGameStore.getState();
        if (s.beastCharging || s.beastFormActive) started = true;
        if (window.__craftyTest.call('readIntents').roar) intent = true;
      }
      return { frames: n, started, intent, ember: window.useGameStore.getState().ember };
    }, Math.round(ANTICIPATION_SEC * 1000) + 800);
    await release(page, 'r');
    expect(heldShort.intent, `SETUP: R held never reached the roar intent: ${JSON.stringify(heldShort)}`).toBe(true);
    expect(heldShort.started, `R held on ${SEED} ember started the roar: ${JSON.stringify(heldShort)}`).toBe(false);
    expect(heldShort.ember, 'a held short roar took ember').toBe(SEED);

    // 2c. A ROAR WHOSE BAR IS DRAINED WHILE IT CHARGES SAYS SO. R held on a full bar starts the charge; the bar drops to
    // one short before the commit: no form, nothing taken, and the notice.
    await page.evaluate((v) => window.useGameStore.setState({ ember: v }), ROAR_COST);
    mark = await noticeMark(page);
    await page.keyboard.down('r');
    const drained = await page.evaluate(drainDuringCharge, { left: ROAR_COST - 1, ms: Math.round(ANTICIPATION_SEC * 1000) + 800 });
    await release(page, 'r');
    expect(drained.why, drained.why).toBeUndefined();
    expect(drained.form, `a roar whose bar was drained during its charge still transformed: ${JSON.stringify(drained)}`).toBe(false);
    expect(drained.ember, 'a roar whose bar was drained took ember').toBe(ROAR_COST - 1);
    await expectNotice(page, mark, `a roar whose bar was drained during its charge was refused in silence: ${JSON.stringify(drained)}`);
    expect(await page.evaluate(backAtHead, { eyeM: EYE_HEIGHT_M, bobM: EYE_BOB_M }), 'SETUP: the camera never came back to the head after the drained charge').toBe(true);
    await page.evaluate((v) => window.useGameStore.setState({ ember: v }), SEED);

    // 3. A DAY KILL FILLS IT, by a real left click on a 1-HP zombie.
    const day = await page.evaluate(stageZombie);
    expect(day.why, day.why).toBeUndefined();
    expect(day.isDay, 'SETUP: the day kill is not by day').toBe(true);
    await page.mouse.move(640, 400);
    await page.mouse.click(640, 400);
    const dead = (id) => page.evaluate((mid) => {
      const m = window.__craftyTest.call('readMobs').find((e) => e.id === mid);
      return !m || m.health <= 0;
    }, id);
    await expect.poll(() => dead(day.id), { message: `the click did not kill the staged zombie (gates ${JSON.stringify(refused)})`, timeout: 20000 }).toBe(true);
    await expect.poll(async () => (await S()).ember, { message: 'a day kill by the player did not fill the bar by the Husk\'s bank' }).toBe(SEED + ZOMBIE);
    await expect(bar, 'the bar on the HUD did not rise with the kill').toContainText(`${ROAR_COST}/${EMBER_MAX}`);

    // 4. THE ROAR SPENDS IT. R held until the form commits (the charge must see the key down across frames).
    await page.keyboard.down('r');
    await expect.poll(async () => (await S()).form, { message: 'R held on a full bar never committed the beast form', timeout: 30000 }).toBe(true);
    await release(page, 'r');
    const roared = await S();
    expect(roared.ember, 'the roar did not spend the full bar').toBe(0);
    await expect(bar, 'the emptied bar is still drawn').toHaveCount(0);
    // End the form the same way (a fresh press in a form ends it), and let the reveal camera hand the head back.
    await page.waitForTimeout(1500);
    await page.keyboard.down('r');
    await expect.poll(async () => (await S()).form, { message: 'R in the form did not end it', timeout: 30000 }).toBe(false);
    await release(page, 'r');
    expect(await page.evaluate(backAtHead, { eyeM: EYE_HEIGHT_M, bobM: EYE_BOB_M }), 'SETUP: the camera never came back to the head after the form').toBe(true);

    // 5. A NIGHT KILL ADDS NOTHING, by the same click on the same kind of zombie, onto a bar that could show a gain.
    expect(await page.evaluate(setTime, 0.0), 'SETUP: midnight did not read as night').toBe(false);
    await page.evaluate((v) => window.useGameStore.setState({ ember: v }), NIGHT_SEED);
    await expect(bar).toContainText(`${NIGHT_SEED}/${EMBER_MAX}`);
    const night = await page.evaluate(stageZombie);
    expect(night.why, night.why).toBeUndefined();
    expect(night.isDay, 'SETUP: the night kill is not at night').toBe(false);
    await page.mouse.click(640, 400);
    await expect.poll(() => dead(night.id), { message: `the click did not kill the night zombie (gates ${JSON.stringify(await S())})`, timeout: 20000 }).toBe(true);
    await page.waitForTimeout(500);
    expect((await S()).ember, 'a night kill filled the bar').toBe(NIGHT_SEED);
    await expect(bar).toContainText(`${NIGHT_SEED}/${EMBER_MAX}`);

    // 6. A GRAB SPENDS ITS PRICE, on V held until the phantom block is held.
    await page.keyboard.down('v');
    await expect.poll(async () => (await S()).held, { message: 'V held with the bar paid for never grabbed', timeout: 30000 }).toBe(true);
    await release(page, 'v');
    expect((await S()).ember, 'the grab did not spend its price').toBe(NIGHT_SEED - GRAB_COST);
    await expect(bar).toContainText(`${NIGHT_SEED - GRAB_COST}/${EMBER_MAX}`);

    // 7. A GRAB THE BAR CANNOT PAY FOR SAYS SO. The block leaves the hands first (a V press drops it, or MAX_HOLD_SEC, which
    // a slow runner can reach first, already has); past the grab's cooldown, V on a bar one short raises the notice and
    // grabs nothing.
    if ((await S()).held) await press(page, 'v');
    await expect.poll(async () => (await S()).held, { message: `SETUP: the block never left the hands (MAX_HOLD_SEC is ${MAX_HOLD_SEC} s)`, timeout: 30000 }).toBe(false);
    await page.evaluate((v) => window.useGameStore.setState({ ember: v }), GRAB_COST - 1);
    mark = await noticeMark(page);
    await press(page, 'v');
    await expectNotice(page, mark, `a grab the bar cannot pay for was refused in silence (gates ${JSON.stringify(await S())})`);
    const shortGrab = await S();
    expect(shortGrab.held, 'a grab the bar cannot pay for grabbed').toBe(false);
    expect(shortGrab.ember, 'a refused grab took ember').toBe(GRAB_COST - 1);

    const hold = await page.evaluate(() => window.__e2eWorldHold.release());
    console.log(`[ember] world held ${hold.heldMs} ms over ${hold.frames} drawn frames (longest ${hold.longestFrameMs} ms, cap ${hold.capMs}, lapsed ${hold.lapsed})`);
    expect(hold.lapsed, `SETUP: the world hold ran out before the last read: ${JSON.stringify(hold)}`).toBe(false);
    expect(hold.frames, `SETUP: the game drew no frame while the world was held: ${JSON.stringify(hold)}`).toBeGreaterThan(0);
  });

  test('X spends it: a bind and a fuse take their price, a fuse the bar cannot pay for says so, a pair with no recipe does not', async ({ page }) => {
    await page.addInitScript(installWorldHold);
    await page.addInitScript(installNoticeLog);
    await bootDev(page);
    await startPlayActive(page);
    await page.waitForFunction(() => Array.isArray(window.__craftyTest?.call('readAllies')) && window.__craftyTest.call('readMobs')
      && window.__threeCamera && window.GameMethods?.damageMob && window.GameMethods?.captureMob
      && window.useGameStore.getState().spawnMob && window.useGameStore.getState().getMobFloor, null, { timeout: 60000 })
      .catch((e) => { throw new Error(`SETUP: the mob and squad hooks and camera never came up — ${e.message}`); });
    expect(await page.evaluate(() => Array.isArray(window.__e2eNotices)), 'SETUP: the notice log was never installed').toBe(true);

    const S = () => page.evaluate(() => {
      const s = window.useGameStore.getState();
      return { ember: s.ember, alive: s.isAlive, active: window.__craftyTest.call('readIntents').active,
        allies: window.__craftyTest.call('readAllies') };
    });
    const BIND_SEED = SNARE_COST + 5; // pays a bind, not a fuse
    const FUSE_SEED = FUSE_COST + 10;

    // Noon, no mob within 40 m, the world held, the snare and Pack Warden unlocked, a bar one short of the snare.
    expect(await page.evaluate(setTime, 0.5), 'SETUP: noon did not read as day').toBe(true);
    const staged = await page.evaluate(({ seed, capMs }) => {
      const s = window.useGameStore.getState();
      const cam = window.__threeCamera;
      for (const m of window.__craftyTest.call('readMobs')) {
        if (m.health > 0 && Math.hypot(m.x - cam.position.x, m.z - cam.position.z) < 40) window.GameMethods.damageMob(m.id, 99999, 'physical', 'ally');
      }
      if (!window.__e2eHoldWorld) return { why: 'SETUP: the world hold was never installed (page.addInitScript(installWorldHold))' };
      window.__e2eHoldWorld({ capMs });
      // Pack Warden: room for three, so step 3 can bind a third ally beside a pair.
      window.useGameStore.setState({ ember: seed, unlockedTalents: { ...s.unlockedTalents, soulbind_snare: 1, soulbind_pack: 1 } });
      return {};
    }, { seed: SNARE_COST - 1, capMs: test.info().timeout || 240000 });
    expect(staged.why, staged.why).toBeUndefined();
    expect((await S()).allies, 'SETUP: the squad is not empty at the start').toEqual([]);

    // 0. A SNARE THE BAR CANNOT PAY FOR SAYS SO. A staged 1-HP zombie in the aim, room in the squad, a bar one short of
    // the snare: X held across frames raises the notice, starts no channel and takes nothing.
    const z = await page.evaluate(stageZombie);
    expect(z.why, z.why).toBeUndefined();
    let mark = await noticeMark(page);
    await press(page, 'x');
    await expectNotice(page, mark, `a snare the bar cannot pay for was refused in silence (gates ${JSON.stringify(await S())})`);
    const shortSnare = await S();
    expect(shortSnare.allies, 'a snare the bar cannot pay for bound').toEqual([]);
    expect(shortSnare.ember, 'a refused snare took ember').toBe(SNARE_COST - 1);

    // 1. A BIND SPENDS THE SNARE'S PRICE: X held on the same zombie, the bar now paying a bind, until it joins the squad.
    await page.evaluate((v) => window.useGameStore.setState({ ember: v }), BIND_SEED);
    await page.keyboard.down('x');
    await expect.poll(async () => (await S()).allies.map((a) => a.id), {
      message: `X held on a weakened zombie never bound it (gates ${JSON.stringify(await S())})`, timeout: 30000,
    }).toEqual([z.id]);
    await release(page, 'x');
    expect((await S()).ember, 'the bind did not spend the snare\'s price').toBe(BIND_SEED - SNARE_COST);

    // 2. A FUSE THE BAR CANNOT PAY FOR SAYS SO. A spider bound beside the zombie (spider + zombie has a recipe), the aim on
    // the sky, a bar that pays a bind and not a fuse: X held across frames raises the notice and starts nothing.
    const spider = await page.evaluate(bindBeside, { type: 'spider', side: 1 });
    expect(spider.why, spider.why).toBeUndefined();
    await page.evaluate(lookUp);
    await page.evaluate((v) => window.useGameStore.setState({ ember: v }), BIND_SEED);
    mark = await noticeMark(page);
    await press(page, 'x');
    await expectNotice(page, mark, `a fuse the bar cannot pay for was refused in silence (gates ${JSON.stringify(await S())})`);
    const short = await S();
    expect(short.ember, 'a refused fuse took ember').toBe(BIND_SEED);
    expect(short.allies.map((a) => a.id).sort(), 'a refused fuse changed the squad').toEqual([z.id, spider.id].sort());

    // 3. A FUSE HOLDS THE PAIR IT STARTED ON. The bar pays a fuse; X held starts the channel on the spider and the zombie;
    // while it runs, a third zombie is bound nearer than either, so the nearest pair is now the new zombie and the spider.
    // The channel breaks: no hybrid, nothing taken, though X stays held past the channel's length.
    await page.evaluate((v) => window.useGameStore.setState({ ember: v }), FUSE_SEED);
    await page.keyboard.down('x');
    const started = await page.evaluate(async () => {
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const t0 = performance.now();
      while (!window.__craftyTest.call('readSnareState').channeling) {
        if (performance.now() - t0 > 30000) return false;
        await frame();
      }
      return true;
    });
    expect(started, `SETUP: X held beside a pair with a recipe never started the fuse channel (gates ${JSON.stringify(await S())})`).toBe(true);
    const third = await page.evaluate(bindBeside, { type: 'zombie', side: -1, dist: 1.2 });
    expect(third.why, third.why).toBeUndefined();
    await page.evaluate(frames, 5);
    await page.waitForTimeout(Math.round(FUSE_CHANNEL_SEC * 1000) + 600);
    await release(page, 'x');
    const kept = await S();
    expect(kept.allies.map((a) => a.hybridId), `a fuse completed on a pair it did not start on (gates ${JSON.stringify(kept)})`)
      .toEqual([null, null, null]);
    expect(kept.ember, 'a fuse whose pair changed took ember').toBe(FUSE_SEED);

    // 4. A FUSE SPENDS ITS PRICE: X pressed afresh beside the nearest pair (the new zombie and the spider, a recipe), held
    // until one hybrid stands for both.
    await page.keyboard.down('x');
    await expect.poll(async () => (await S()).allies.map((a) => a.hybridId).sort(), {
      message: `X held beside a pair with a recipe never fused it (gates ${JSON.stringify(await S())})`, timeout: 30000,
    }).toEqual(['dreadweaver', null]);
    await release(page, 'x');
    expect((await S()).ember, 'the fuse did not spend its price').toBe(FUSE_SEED - FUSE_COST);

    // 5. A PAIR WITH NO RECIPE SAYS NOTHING, AT ANY BAR. The hybrid and the first zombie are the pair near the player and no
    // recipe pairs them; nothing is in the aim. X held the same way, after the notices above showed this instrument can see
    // one, raises none: on a bar that pays a bind, and on one below the snare's price, where no bar would start anything.
    await page.evaluate(lookUp);
    for (const ember of [BIND_SEED, SNARE_COST - 1]) {
      await page.evaluate((v) => window.useGameStore.setState({ ember: v }), ember);
      mark = await noticeMark(page);
      await press(page, 'x');
      await expectNoNotice(page, mark, `a press with nothing to start blamed the ember bar at ${ember}`);
      const none = await S();
      expect(none.ember, `a press with nothing to start took ember at ${ember}`).toBe(ember);
      expect(none.allies.length, `a pair with no recipe fused at ${ember} (gates ${JSON.stringify(none)})`).toBe(2);
    }

    const hold = await page.evaluate(() => window.__e2eWorldHold.release());
    console.log(`[ember-x] world held ${hold.heldMs} ms over ${hold.frames} drawn frames (longest ${hold.longestFrameMs} ms, cap ${hold.capMs}, lapsed ${hold.lapsed})`);
    expect(hold.lapsed, `SETUP: the world hold ran out before the last read: ${JSON.stringify(hold)}`).toBe(false);
    expect(hold.frames, `SETUP: the game drew no frame while the world was held: ${JSON.stringify(hold)}`).toBeGreaterThan(0);
  });

  test('Z and F spend it: an imbue the bar cannot arm says so; a cast refused for mana takes nothing and leaves no element', async ({ page }) => {
    await page.addInitScript(installWorldHold);
    await page.addInitScript(installNoticeLog);
    await bootDev(page);
    await startPlayActive(page);
    await page.waitForFunction(() => Array.isArray(window.__craftyTest?.call('readProjectiles'))
      && typeof window.useGameStore.getState().castSpell === 'function', null, { timeout: 60000 })
      .catch((e) => { throw new Error(`SETUP: the projectile hook and castSpell never came up — ${e.message}`); });
    expect(await page.evaluate(() => Array.isArray(window.__e2eNotices)), 'SETUP: the notice log was never installed').toBe(true);

    const S = () => page.evaluate(() => {
      const s = window.useGameStore.getState();
      return { ember: s.ember, armed: s.imbueArmed, mana: s.mana, alive: s.isAlive,
        active: window.__craftyTest.call('readIntents').active };
    });
    const KIND = KIND_BY_SPELL.fireball;
    const ARMED_SEED = 2 * IMBUE_COST + 10;
    // In the page: F pressed as a synthetic keydown, so the listener, the latch, the spawn and the spend all run inside
    // this call and nothing can come between them; returns what it made.
    const castF = (mana) => page.evaluate((m) => {
      const s = () => window.useGameStore.getState();
      window.useGameStore.setState({ mana: m === 'full' ? s().maxMana : m });
      const before = new Set(window.__craftyTest.call('readProjectiles').map((p) => p.id));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', bubbles: true }));
      const made = window.__craftyTest.call('readProjectiles').filter((p) => !before.has(p.id));
      return { made: made.map((p) => ({ type: p.type, imbueKind: p.imbueKind })), ember: s().ember, armed: s().imbueArmed };
    }, mana);
    const armedIs = (want, message) => expect.poll(async () => (await S()).armed, { message, timeout: 30000 }).toBe(want);

    // Noon, no mob within 40 m, the world held (no dawn can empty the bar), the imbue unlocked, fireball loaded, a bar one
    // short of the imbue.
    expect(await page.evaluate(setTime, 0.5), 'SETUP: noon did not read as day').toBe(true);
    const staged = await page.evaluate(({ seed, capMs }) => {
      const s = window.useGameStore.getState();
      const cam = window.__threeCamera;
      for (const m of window.__craftyTest.call('readMobs')) {
        if (m.health > 0 && Math.hypot(m.x - cam.position.x, m.z - cam.position.z) < 40) window.GameMethods.damageMob(m.id, 99999, 'physical', 'ally');
      }
      if (!window.__e2eHoldWorld) return { why: 'SETUP: the world hold was never installed (page.addInitScript(installWorldHold))' };
      window.__e2eHoldWorld({ capMs });
      window.useGameStore.setState({ ember: seed, activeSpell: 'fireball', unlockedTalents: { ...s.unlockedTalents, elemancer_imbue: 1 } });
      return {};
    }, { seed: IMBUE_COST - 1, capMs: test.info().timeout || 240000 });
    expect(staged.why, staged.why).toBeUndefined();

    // 1. AN IMBUE THE BAR CANNOT ARM SAYS SO. Z held across frames on a bar one short: the notice, no stance, nothing taken.
    let mark = await noticeMark(page);
    await press(page, 'z');
    await expectNotice(page, mark, `an imbue the bar cannot pay for was refused in silence (gates ${JSON.stringify(await S())})`);
    const shortZ = await S();
    expect(shortZ.armed, 'an imbue the bar cannot pay for armed').toBe(false);
    expect(shortZ.ember, 'a refused imbue took ember').toBe(IMBUE_COST - 1);

    // 2. AN IMBUED CAST TAKES ITS PRICE AND CARRIES ITS ELEMENT. Z arms on a bar that pays two imbues; F with the mana for
    // it casts a projectile carrying the fireball's element, takes the price and ends the stance. This is the reading the
    // later steps' "no element" is judged against.
    await page.evaluate((v) => window.useGameStore.setState({ ember: v }), ARMED_SEED);
    await press(page, 'z');
    await armedIs(true, 'Z on a bar that pays the imbue never armed it');
    const imbued = await castF('full');
    expect(imbued.made, `SETUP: the armed cast made no single projectile: ${JSON.stringify(imbued)}`).toHaveLength(1);
    expect(imbued.made[0].imbueKind, 'the armed cast did not carry its element').toBe(KIND);
    expect(imbued.ember, 'the armed cast did not take the imbue\'s price').toBe(ARMED_SEED - IMBUE_COST);
    expect(imbued.armed, 'the armed cast left the stance armed').toBe(false);

    // 3. A CAST REFUSED FOR MANA TAKES NOTHING AND KEEPS THE STANCE. Z arms again; F with no mana: "Not enough mana", no
    // projectile, the bar untouched, the stance still armed.
    await press(page, 'z');
    await armedIs(true, 'Z did not arm the stance a second time');
    mark = await noticeMark(page, MANA_NOTICE); // also past the cast cooldown (333 ms), so the press is not swallowed
    const refused = await castF(0);
    expect(refused.made, 'a cast with no mana made a projectile').toEqual([]);
    expect(refused.ember, 'a cast refused for mana took the imbue\'s ember').toBe(ARMED_SEED - IMBUE_COST);
    expect(refused.armed, 'a cast refused for mana dropped the armed stance').toBe(true);
    await expectNotice(page, mark, 'the refused cast did not say why', MANA_NOTICE);

    // 4. THE REFUSED CAST LEAVES NO ELEMENT FOR A LATER ONE. Z disarms (a release, nothing to pay); F with mana casts a
    // plain fireball: no element, nothing taken.
    await press(page, 'z');
    await armedIs(false, 'Z did not disarm the stance');
    await page.waitForTimeout(400); // the cast cooldown is 333 ms
    const plain = await castF('full');
    expect(plain.made, `SETUP: the plain cast made no single projectile: ${JSON.stringify(plain)}`).toHaveLength(1);
    expect(plain.made[0].imbueKind, 'a plain cast carried the element parked for a refused one').toBeNull();
    expect(plain.ember, 'a plain cast took ember').toBe(ARMED_SEED - IMBUE_COST);

    const hold = await page.evaluate(() => window.__e2eWorldHold.release());
    console.log(`[ember-z] world held ${hold.heldMs} ms over ${hold.frames} drawn frames (longest ${hold.longestFrameMs} ms, cap ${hold.capMs}, lapsed ${hold.lapsed})`);
    expect(hold.lapsed, `SETUP: the world hold ran out before the last read: ${JSON.stringify(hold)}`).toBe(false);
    expect(hold.frames, `SETUP: the game drew no frame while the world was held: ${JSON.stringify(hold)}`).toBeGreaterThan(0);
  });
});
