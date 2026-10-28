import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';
import { installWorldHold } from './_worldHold.js';
import { bankForKill } from '../../src/game/mobBank.js';
import { EMBER_MAX, ROAR_COST, GRAB_COST, SNARE_COST, FUSE_COST } from '../../src/game/ember.js';
import { ANTICIPATION_SEC } from '../../src/game/beastTransform.js';

// EMBER, IN THE BOOTED GAME (W2-F step 3; DECISIONS 2026-10-28 W1-H item 5; plan
// docs/superpowers/plans/2026-10-28-crafty-w2f-ember.md). One bar in the HUD's stat stack, filled by a day kill made with
// a real left click, spent by a roar held on the real R key and by a grab on the real V key, refused with its notice on a
// real R press it cannot pay for, held shut on an R held past the charge window one kill short, and not filled by a night
// kill made the same way. The second case spends it on the X key: a bind held on a weakened zombie, a fuse held beside a
// pair with a recipe, and the notice on a fuse the bar cannot pay for, which a pair with no recipe never raises.
//
// The bar is read off the DOM (the value the player sees) and the store; the kills are real clicks on staged zombies left
// at 1 HP by an ally-sourced hit (ally kills bank nothing, so only the click's kill can pay). The world is held still for
// the whole spec (_worldHold.js), so no mob or ally moves and the clock never reaches dawn, which would empty the bar.
//
// WHAT THIS DOES NOT CHECK: building's accrual and its daily cap (tests/store/ember.test.js and
// tests/gates/place-executor-gates.test.jsx), a bind or a fuse refused because another verb emptied the bar during its
// channel (the reducers' refusal is src/game/soulbind.test.js; the notice at that call site is driven by nothing), the
// dawn bleed (tests/store/ember.test.js), a save's migration (tests/e2e/the-cut.spec.js and
// tests/store/preCutSave.test.js), or touch.
//
// Mutation-Proof: see the commit trailer. These cases need a browser, so CI runs them; no local run was allowed.

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

/** In the page: a `type` spawned 2 m to the player's side at full health and bound straight into the squad. */
function bindBeside({ type, side }) {
  const s = window.useGameStore.getState();
  const cam = window.__threeCamera;
  const d = new cam.position.constructor();
  cam.getWorldDirection(d); d.y = 0; d.normalize();
  const gx = cam.position.x - d.z * 2 * side, gz = cam.position.z + d.x * 2 * side;
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

test.describe('ember', () => {
  test.setTimeout(180000);

  test('one bar: a day kill fills it, the roar and a grab spend it, a short press says so, a night kill adds nothing', async ({ page }) => {
    await page.addInitScript(installWorldHold);
    await bootDev(page);
    await startPlayActive(page);
    await page.waitForFunction(() => window.__craftyTest?.call('readMobs') && window.__threeCamera && window.GameMethods?.damageMob
      && window.useGameStore.getState().spawnMob && window.useGameStore.getState().getMobFloor, null, { timeout: 60000 })
      .catch((e) => { throw new Error(`SETUP: the mob hooks and camera never came up — ${e.message}`); });

    const S = () => page.evaluate(() => {
      const s = window.useGameStore.getState();
      return { ember: s.ember, isDay: s.isDay, form: s.beastFormActive, charging: s.beastCharging, held: s.voidhandHeld,
        alive: s.isAlive, active: window.__craftyTest.call('readIntents').active };
    });
    const bar = page.getByTestId('ember-bar');
    const barText = async () => ((await bar.count()) ? (await bar.textContent()) : null);

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
    }, { seed: SEED, capMs: test.info().timeout || 180000 });
    expect(staged.why, staged.why).toBeUndefined();

    // 1. ONE BAR. The stack the four meters sat in holds the ember bar, at the seeded value, and none of their labels.
    await expect(page.getByTestId('stat-stack'), 'SETUP: the HUD stat stack never rendered').toBeVisible();
    await expect(bar, 'the stat stack does not hold exactly one ember bar').toHaveCount(1);
    await expect(bar).toContainText(`${SEED}/${EMBER_MAX}`);
    expect(await page.getByTestId('stat-stack').textContent(), 'a retired meter is still on the HUD').not.toMatch(/ROAR!|GRAB!|SNARE!|IMBUE!/);

    // 2. A SHORT PRESS SAYS SO. R on a bar the roar cannot pay for: the notice, no charge, nothing taken.
    await page.keyboard.press('r');
    await expect(page.getByText('Not enough ember').first(), 'a roar the bar cannot pay for was refused in silence').toBeVisible({ timeout: 15000 });
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
    await page.keyboard.up('r');
    expect(heldShort.intent, `SETUP: R held never reached the roar intent: ${JSON.stringify(heldShort)}`).toBe(true);
    expect(heldShort.started, `R held on ${SEED} ember started the roar: ${JSON.stringify(heldShort)}`).toBe(false);
    expect(heldShort.ember, 'a held short roar took ember').toBe(SEED);

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
    await page.keyboard.up('r');
    const roared = await S();
    expect(roared.ember, 'the roar did not spend the full bar').toBe(0);
    await expect(bar, 'the emptied bar is still drawn').toHaveCount(0);
    // End the form the same way (a fresh press in a form ends it), and let the reveal camera hand the head back.
    await page.waitForTimeout(1500);
    await page.keyboard.down('r');
    await expect.poll(async () => (await S()).form, { message: 'R in the form did not end it', timeout: 30000 }).toBe(false);
    await page.keyboard.up('r');
    const atHead = await page.evaluate(async () => {
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const cam = window.__threeCamera;
      const t0 = performance.now();
      let streak = 0;
      while (streak < 2) {
        if (performance.now() - t0 > 20000) return false;
        await frame();
        const b = window.useGameStore.getState().playerRigidBodyRef?.current?.translation?.();
        const ok = b && Math.hypot(cam.position.x - b.x, cam.position.z - b.z) < 1 && Math.abs(cam.position.y - b.y - 1.2) < 0.6;
        streak = ok ? streak + 1 : 0;
      }
      return true;
    });
    expect(atHead, 'SETUP: the camera never came back to the head after the form').toBe(true);

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
    await page.keyboard.up('v');
    expect((await S()).ember, 'the grab did not spend its price').toBe(NIGHT_SEED - GRAB_COST);
    await expect(bar).toContainText(`${NIGHT_SEED - GRAB_COST}/${EMBER_MAX}`);

    const hold = await page.evaluate(() => window.__e2eWorldHold.release());
    console.log(`[ember] world held ${hold.heldMs} ms over ${hold.frames} drawn frames (longest ${hold.longestFrameMs} ms, cap ${hold.capMs}, lapsed ${hold.lapsed})`);
    expect(hold.lapsed, `SETUP: the world hold ran out before the last read: ${JSON.stringify(hold)}`).toBe(false);
    expect(hold.frames, `SETUP: the game drew no frame while the world was held: ${JSON.stringify(hold)}`).toBeGreaterThan(0);
  });

  test('X spends it: a bind and a fuse take their price, a fuse the bar cannot pay for says so, a pair with no recipe does not', async ({ page }) => {
    await page.addInitScript(installWorldHold);
    await bootDev(page);
    await startPlayActive(page);
    await page.waitForFunction(() => Array.isArray(window.__craftyTest?.call('readAllies')) && window.__craftyTest.call('readMobs')
      && window.__threeCamera && window.GameMethods?.damageMob && window.GameMethods?.captureMob
      && window.useGameStore.getState().spawnMob && window.useGameStore.getState().getMobFloor, null, { timeout: 60000 })
      .catch((e) => { throw new Error(`SETUP: the mob and squad hooks and camera never came up — ${e.message}`); });

    const S = () => page.evaluate(() => {
      const s = window.useGameStore.getState();
      return { ember: s.ember, alive: s.isAlive, active: window.__craftyTest.call('readIntents').active,
        allies: window.__craftyTest.call('readAllies') };
    });
    const notice = page.getByText('Not enough ember');
    const BIND_SEED = SNARE_COST + 5; // pays a bind, not a fuse
    const FUSE_SEED = FUSE_COST + 10;

    // Noon, no mob within 40 m, the world held, the snare unlocked, a bar that pays a bind and not a fuse.
    expect(await page.evaluate(setTime, 0.5), 'SETUP: noon did not read as day').toBe(true);
    const staged = await page.evaluate(({ seed, capMs }) => {
      const s = window.useGameStore.getState();
      const cam = window.__threeCamera;
      for (const m of window.__craftyTest.call('readMobs')) {
        if (m.health > 0 && Math.hypot(m.x - cam.position.x, m.z - cam.position.z) < 40) window.GameMethods.damageMob(m.id, 99999, 'physical', 'ally');
      }
      if (!window.__e2eHoldWorld) return { why: 'SETUP: the world hold was never installed (page.addInitScript(installWorldHold))' };
      window.__e2eHoldWorld({ capMs });
      window.useGameStore.setState({ ember: seed, unlockedTalents: { ...s.unlockedTalents, soulbind_snare: 1 } });
      return {};
    }, { seed: BIND_SEED, capMs: test.info().timeout || 180000 });
    expect(staged.why, staged.why).toBeUndefined();
    expect((await S()).allies, 'SETUP: the squad is not empty at the start').toEqual([]);

    // 1. A BIND SPENDS THE SNARE'S PRICE: X held on a staged 1-HP zombie in the aim until it joins the squad.
    const z = await page.evaluate(stageZombie);
    expect(z.why, z.why).toBeUndefined();
    await page.keyboard.down('x');
    await expect.poll(async () => (await S()).allies.map((a) => a.id), {
      message: `X held on a weakened zombie never bound it (gates ${JSON.stringify(await S())})`, timeout: 30000,
    }).toEqual([z.id]);
    await page.keyboard.up('x');
    expect((await S()).ember, 'the bind did not spend the snare\'s price').toBe(BIND_SEED - SNARE_COST);

    // 2. A FUSE THE BAR CANNOT PAY FOR SAYS SO. A spider bound beside the zombie (spider + zombie has a recipe), the aim on
    // the sky, a bar that pays a bind and not a fuse: X held across frames raises the notice and starts nothing. Below the
    // snare's price the keydown says it whatever X starts, so this bar is the one only the frame loop can answer for.
    const spider = await page.evaluate(bindBeside, { type: 'spider', side: 1 });
    expect(spider.why, spider.why).toBeUndefined();
    await page.evaluate(lookUp);
    await page.evaluate((v) => window.useGameStore.setState({ ember: v }), BIND_SEED);
    await expect(notice, 'SETUP: an earlier notice is still on screen').toHaveCount(0, { timeout: 15000 });
    await page.keyboard.down('x');
    await page.evaluate(frames, 10);
    await page.keyboard.up('x');
    await expect(notice.first(), `a fuse the bar cannot pay for was refused in silence (gates ${JSON.stringify(await S())})`)
      .toBeVisible({ timeout: 15000 });
    const short = await S();
    expect(short.ember, 'a refused fuse took ember').toBe(BIND_SEED);
    expect(short.allies.map((a) => a.id).sort(), 'a refused fuse changed the squad').toEqual([z.id, spider.id].sort());

    // 3. A FUSE SPENDS ITS PRICE: the same pair, the bar refilled past the fuse, X held until one hybrid stands for both.
    await page.evaluate((v) => window.useGameStore.setState({ ember: v }), FUSE_SEED);
    await page.keyboard.down('x');
    await expect.poll(async () => (await S()).allies.map((a) => a.hybridId), {
      message: `X held beside a pair with a recipe never fused it (gates ${JSON.stringify(await S())})`, timeout: 30000,
    }).toEqual(['dreadweaver']);
    await page.keyboard.up('x');
    expect((await S()).ember, 'the fuse did not spend its price').toBe(FUSE_SEED - FUSE_COST);

    // 4. A PAIR WITH NO RECIPE SAYS NOTHING. A zombie bound beside the hybrid (no recipe pairs them), the same short bar:
    // X held the same way, after the notice in step 2 showed this instrument can see one, raises none.
    const second = await page.evaluate(bindBeside, { type: 'zombie', side: -1 });
    expect(second.why, second.why).toBeUndefined();
    await page.evaluate(lookUp);
    await page.evaluate((v) => window.useGameStore.setState({ ember: v }), BIND_SEED);
    await expect(notice, 'SETUP: the step 2 notice is still on screen').toHaveCount(0, { timeout: 15000 });
    await page.keyboard.down('x');
    await page.evaluate(frames, 10);
    await page.keyboard.up('x');
    await page.waitForTimeout(1500);
    await expect(notice, 'a pair with no recipe blamed the ember bar').toHaveCount(0);
    const none = await S();
    expect(none.ember, 'a press beside a pair with no recipe took ember').toBe(BIND_SEED);
    expect(none.allies.length, `a pair with no recipe fused (gates ${JSON.stringify(none)})`).toBe(2);

    const hold = await page.evaluate(() => window.__e2eWorldHold.release());
    console.log(`[ember-x] world held ${hold.heldMs} ms over ${hold.frames} drawn frames (longest ${hold.longestFrameMs} ms, cap ${hold.capMs}, lapsed ${hold.lapsed})`);
    expect(hold.lapsed, `SETUP: the world hold ran out before the last read: ${JSON.stringify(hold)}`).toBe(false);
    expect(hold.frames, `SETUP: the game drew no frame while the world was held: ${JSON.stringify(hold)}`).toBeGreaterThan(0);
  });
});
