import { test, expect } from './_fixtures.js';
import { devices } from '@playwright/test';
import { bootDev, startPlayActive } from './_boot.js';
import { HEAVY_HOLD_MS, HEAVY_CHARGE_MS, HEAVY_MULT } from '../../src/game/heavyAttack.js';
import { ANTICIPATION_SEC } from '../../src/game/beastTransform.js';
import { TAP_HOLD_MS } from '../../src/input/aspectWheel.js';

// TOUCH PLAYS THE SIGNATURE — the lived proof for Phase 0c (plan docs/superpowers/plans/2026-10-27-crafty-touch-hold.md).
//
// tests/gates/touch-hold-gates.test.jsx proves what the touch overlay WRITES on each pointer event, in jsdom. This drives
// the running game on an emulated iPad with REAL touch input and reads what the game DOES: the beast form committing,
// a heavy landing on a brute, the Talents panel opening. Before Phase 0c none of the three could happen on touch.
//
// REAL INPUT. Every press below that is not a timed control is CDP `Input.dispatchTouchEvent` — `touchStart` with one
// point, then `touchEnd` with none — which is exactly the pair Playwright's own Chromium `touchscreen.tap` sends
// (playwright-core 1.64.1 coreBundle.js), with a wait in between, so Chromium's own input pipeline produces the
// pointerdown / pointerup / implicit capture the overlay listens to. Each target is hit-tested first
// (`elementFromPoint` at its centre must BE the control), so a press can never land on something else and still pass.
//
// THE DEVICE. iPad Pro 11 landscape (1194x834, its user agent, isMobile, hasTouch), but deviceScaleFactor 1 instead of
// its 2: CI renders on SwiftShader, tests/e2e/heavy-melee.spec.js measured 3-5 fps at ~1 Mpx, and the roar needs frames
// INSIDE its hold. The device's `defaultBrowserType` (webkit) is deliberately not passed: it is a worker option, the
// config pins chromium, and CDP touch is Chromium's. So this is NOT a WebKit run — real Safari is Kevin's device.
//
// TIMING HONESTY. Each hold is stamped on the game's own clock (performance.now) by window listeners, and every verdict
// prints it. Under load a real touch can be held longer than asked; where that makes a control unable to discriminate,
// the spec says SETUP (scripts/dev/mutate-e2e.sh scores that COULD NOT CHECK), never a verdict.
//
// Mutation-Proof: OWED — NO verdict below has been observed yet. Not run by the authoring lane: the browser and port
// 4179 are reserved for the command session, which runs every e2e and its mutation batch (scripts/dev/mutate-e2e.sh,
// E0 with --identity). The batch, each expected RED unless marked, with the case expected to catch it:
//   E1 src/ui/TouchControls.jsx: the roar sector's press does nothing (no hold at all) -> the roar HOLD
//   E2 src/input/touchHold.js: plausible-wrong, the release clears 10 minutes late (a latch) -> the roar CONTROL
//   E3 src/ui/TouchControls.jsx: plausible-wrong, the roar's minimum pulse 1000 ms (a tap held a second) -> the CONTROL
//   E4 src/ui/TouchControls.jsx: the action button presses nothing -> "the action button's press dealt no damage"
//   E5 src/Components.jsx: plausible-wrong, the heavy pressed as 'mouse' whatever the source -> the full hold's release
//   E6 src/Components.jsx: plausible-wrong, the release throws the heavy whatever the charge -> the half-charged CONTROL
//   E7 src/ui/TouchControls.jsx: a locked sector does not call onOpenTalents -> the F9 case
//   E8 src/App.jsx: onOpenTalents unwired -> the F9 case
//   E9 src/ui/TouchControls.jsx: tap-to-play not withheld while Talents is open -> the F9 case
//   E0 identity (a comment edit in src/ui/TouchControls.jsx) -> must SURVIVE
// (A mutant of ANTICIPATION_SEC is deliberately absent: this spec imports that constant, so it would move its own
// thresholds and score SETUP, not a verdict.) Replace OWED with the observed verdicts.

const IPAD = devices['iPad Pro 11 landscape'];
test.use({ viewport: IPAD.viewport, userAgent: IPAD.userAgent, isMobile: IPAD.isMobile, hasTouch: IPAD.hasTouch, deviceScaleFactor: 1 });

const touchStart = (cdp, p) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] });
const touchEnd = (cdp) => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

/** The centre of a control, and proof a thumb there lands ON it. Throws SETUP otherwise. */
async function aimAt(page, testid) {
  const a = await page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (!el) return { ok: false, why: `no [data-testid="${id}"] in the DOM` };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    const name = hit ? (hit.getAttribute('data-testid') || hit.tagName) : 'nothing';
    return { ok: hit === el, x, y, locked: el.getAttribute('data-locked'), why: `the centre of ${id} hits ${name}` };
  }, testid);
  if (!a.ok) throw new Error(`SETUP: ${a.why}`);
  return a;
}

/** Wait for a control to attach, or fail SETUP naming it. */
async function attached(page, testid, why) {
  await page
    .waitForFunction((id) => !!document.querySelector(`[data-testid="${id}"]`), testid, { timeout: 20000 })
    .catch(() => { throw new Error(`SETUP: ${testid} never attached — ${why}`); });
}

/** Window listeners that stamp every pointer press and lift on the game's clock, with the target and the roar intent.
 *  BUBBLE phase on window: they run after React's root listener, so `roar` is the intent the press just wrote. */
async function installPressLog(page) {
  await page.evaluate(() => {
    window.__pressLog = [];
    const id = (e) => (e.target && e.target.closest ? e.target.closest('[data-testid]')?.getAttribute('data-testid') : null) ?? null;
    for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'mousedown']) {
      window.addEventListener(type, (e) => {
        window.__pressLog.push({ type, t: performance.now(), id: id(e), pointerType: e.pointerType ?? null,
          roar: window.__craftyTest.call('readIntents').roar, active: window.__craftyTest.call('readIntents').active });
      });
    }
  });
}

/** A real touch on `p`, held `ms` (wall clock), plus the logged press/lift on the game's clock. */
async function press(page, cdp, p, ms) {
  await page.evaluate(() => { window.__pressLog = []; });
  await touchStart(cdp, p);
  await page.waitForTimeout(ms);
  await touchEnd(cdp);
  await page.waitForTimeout(50);
  const log = await page.evaluate(() => window.__pressLog.splice(0));
  const down = log.find((e) => e.type === 'pointerdown');
  const up = log.find((e) => e.type === 'pointerup' || e.type === 'pointercancel');
  return { log, down, up, heldMs: down && up ? Math.round(up.t - down.t) : null };
}

async function enterTouchPlay(page) {
  await bootDev(page);
  await startPlayActive(page);
  await attached(page, 'touch-action', 'the touch overlay did not mount (isTouchDevice false, or input never went live)');
}

test.describe('touch plays the signature (iPad Pro 11 landscape, real touch)', () => {
  test.setTimeout(240000);

  test('the roar sector: a 120 ms tap charges and cancels (the CONTROL); a held press commits the beast form', async ({ page }) => {
    await enterTouchPlay(page);
    await page.evaluate(() => {
      const s = window.useGameStore.getState();
      s.setTimeOfDay?.(0.5);
      window.useGameStore.setState({ isAlive: true, playerHealth: s.maxHealth, ferocityBanked: 100,
        unlockedTalents: { ...s.unlockedTalents, wildheart_roar: 1 } });
      const cam = window.__threeCamera;
      for (const m of window.__craftyTest.call('readMobs') || []) {
        if (!m.passive && cam && Math.hypot(m.x - cam.position.x, m.z - cam.position.z) < 32) window.GameMethods?.damageMob?.(m.id, 99999, 'physical', 'ally');
      }
      // The state machine's own transitions, stamped as they happen: a charge START (beastCharging rising) proves the
      // frame loop saw a press, and the commit time places the form inside or outside the hold.
      window.__roar = { starts: 0, formAt: null };
      window.useGameStore.subscribe((st, prev) => {
        if (st.beastCharging && !prev.beastCharging) window.__roar.starts += 1;
        if (st.beastFormActive && !prev.beastFormActive && window.__roar.formAt === null) window.__roar.formAt = performance.now();
      });
    });
    await installPressLog(page);
    const cdp = await page.context().newCDPSession(page);
    const openRing = async () => {
      await press(page, cdp, await aimAt(page, 'touch-aspects'), 60);
      await attached(page, 'touch-aspect-roar', 'a real tap on the Aspect opener did not open the ring');
    };

    // THE CONTROL — a tap, 120 ms. It must REACH the roar (presence: the press raised the intent and the state machine
    // started a charge) and still not transform, because the charge needs ANTICIPATION_SEC held.
    await openRing();
    const roarAim = await aimAt(page, 'touch-aspect-roar');
    expect(roarAim.locked, 'SETUP: the roar sector is still locked — the talent did not take').toBe('false');
    const tap = await press(page, cdp, roarAim, TAP_HOLD_MS);
    await page.waitForTimeout(2000);
    const afterTap = await page.evaluate(() => ({ starts: window.__roar.starts, form: window.useGameStore.getState().beastFormActive }));
    const tapWhere = JSON.stringify({ tap: { heldMs: tap.heldMs, log: tap.log }, afterTap });
    console.log(`[touch-hold] roar CONTROL: ${tapWhere}`);
    expect(tap.down?.id, `SETUP: the tap's pointerdown did not land on the roar sector — ${tapWhere}`).toBe('touch-aspect-roar');
    expect(tap.down?.roar, `the tap reached the roar sector but did not raise the roar intent — ${tapWhere}`).toBe(true);
    expect(tap.heldMs !== null && tap.heldMs < ANTICIPATION_SEC * 1000,
      `SETUP: the 120 ms tap lasted ${tap.heldMs} ms on the game's clock — the control cannot discriminate: ${tapWhere}`).toBe(true);
    expect(afterTap.starts, `SETUP: the frame loop never saw the tap (no charge started) — the control cannot discriminate: ${tapWhere}`).toBeGreaterThanOrEqual(1);
    expect(afterTap.form, `a ${tap.heldMs} ms tap committed the beast form — the roar no longer needs its charge held: ${tapWhere}`).toBe(false);

    // THE HOLD — at least 600 ms, then until the form commits (cap 20 s): at a few frames per second a fixed 600 ms
    // can end before any frame lands past 0.45 s, which would be the renderer failing, not the hold.
    await openRing();
    const holdAim = await aimAt(page, 'touch-aspect-roar');
    await page.evaluate(() => { window.__pressLog = []; });
    await touchStart(cdp, holdAim);
    await page.waitForTimeout(600);
    const committed = await page
      .waitForFunction(() => window.useGameStore.getState().beastFormActive === true, null, { timeout: 20000 })
      .then(() => true, () => false);
    await touchEnd(cdp);
    await page.waitForTimeout(100);
    const hold = await page.evaluate(() => {
      const log = window.__pressLog.splice(0);
      return { log, formAt: window.__roar.formAt, form: window.useGameStore.getState().beastFormActive };
    });
    const down = hold.log.find((e) => e.type === 'pointerdown');
    const up = hold.log.find((e) => e.type === 'pointerup' || e.type === 'pointercancel');
    const holdWhere = JSON.stringify({ heldMs: down && up ? Math.round(up.t - down.t) : null, formAfterPressMs: down && hold.formAt ? Math.round(hold.formAt - down.t) : null, hold });
    console.log(`[touch-hold] roar HOLD: ${holdWhere}`);
    expect(down?.id, `SETUP: the hold's pointerdown did not land on the roar sector — ${holdWhere}`).toBe('touch-aspect-roar');
    expect(up, `SETUP: the hold's lift (pointerup or pointercancel) was never logged — ${holdWhere}`).toBeDefined();
    expect(committed, `holding the roar sector never committed the beast form — ${holdWhere}`).toBe(true);
    expect(hold.formAt <= up.t, `the form committed only after the lift, not during the hold — ${holdWhere}`).toBe(true);
    // 25 ms of slack: the commit is stamped when the store flips, inside a frame whose clock read can precede it slightly.
    expect(hold.formAt - down.t, `the form committed ${Math.round(hold.formAt - down.t)} ms into the hold — before the ${ANTICIPATION_SEC * 1000} ms charge: ${holdWhere}`)
      .toBeGreaterThanOrEqual(ANTICIPATION_SEC * 1000 - 25);
  });

  test('the action button: a held press throws the heavy (HEAVY_MULT x the tap); a half-charged hold (the CONTROL) throws nothing', async ({ page }) => {
    await enterTouchPlay(page);
    await page.waitForFunction(() => window.__craftyTest?.call('readMobs') && window.__threeCamera && window.GameMethods?.damageMob, null, { timeout: 60000 })
      .catch(() => { throw new Error('SETUP: the mob bridge (readMobs / camera / damageMob) never came up'); });
    // The brute, frozen world and pinned crit roll of tests/e2e/heavy-melee.spec.js, for the same reasons (read there).
    const id = await page.evaluate(async () => {
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      while (Date.now() - (window.useGameStore.getState()._spawnTime || 0) < 5500) await frame();
      const s = window.useGameStore.getState();
      window.useGameStore.setState({ isAlive: true, playerHealth: s.maxHealth });
      s.setTimeOfDay?.(0.5);
      const cam = window.__threeCamera;
      for (const m of window.__craftyTest.call('readMobs')) {
        if (!m.passive && Math.hypot(m.x - cam.position.x, m.z - cam.position.z) < 24) window.GameMethods.damageMob(m.id, 99999, 'physical', 'ally');
      }
      const d = new cam.position.constructor();
      cam.getWorldDirection(d); d.y = 0; d.normalize();
      const gx = cam.position.x + d.x * 2.5, gz = cam.position.z + d.z * 2.5;
      const before = new Set(window.__craftyTest.call('readMobs').map((m) => m.id));
      const gy = s.getMobFloor ? s.getMobFloor(gx, gz, cam.position.y - 1.6) : null;
      s.spawnMob(gx, gz, 'moss_brute', gy);
      window.__touchRandom = Math.random;
      Math.random = () => 0.999;
      s.triggerHitstop(120000);
      const added = window.__craftyTest.call('readMobs').filter((m) => !before.has(m.id));
      return added.length === 1 ? added[0].id : null;
    });
    expect(id, 'SETUP: spawnMob did not add exactly one brute').not.toBeNull();
    // The brute's health on every press and lift, read in CAPTURE phase on window — before the game's handlers run for
    // an event targeted at the button — and stamped on the charge's own clock.
    await page.evaluate((mid) => {
      window.__hpLog = [];
      const hp = () => window.__craftyTest.call('readMobs').find((e) => e.id === mid)?.health ?? null;
      for (const type of ['pointerdown', 'pointerup']) {
        window.addEventListener(type, (e) => {
          const target = e.target && e.target.closest ? e.target.closest('[data-testid]')?.getAttribute('data-testid') : null;
          window.__hpLog.push({ type, t: performance.now(), hp: hp(), target, synthetic: !e.isTrusted });
        }, { capture: true });
      }
    }, id);
    const read = () => page.evaluate((mid) => {
      const call = (n) => window.__craftyTest.call(n);
      const m = call('readMobs').find((e) => e.id === mid);
      const c = window.__threeCamera.position;
      const st = window.useGameStore.getState();
      return m
        ? { hp: m.health, staggered: m.staggerUntil > call('worldNow'), dist: +Math.hypot(m.x - c.x, m.z - c.z).toFixed(2),
          active: call('readIntents').active, alive: st.isAlive, frozen: st.hitstopUntil > performance.now() }
        : { hp: null, gone: true };
    }, id);
    const aim = () => page.evaluate((mid) => {
      const m = window.__craftyTest.call('readMobs').find((e) => e.id === mid);
      if (m) window.__threeCamera.lookAt(m.x, m.y + 0.8, m.z);
    }, id);
    const cdp = await page.context().newCDPSession(page);
    const action = await aimAt(page, 'touch-action');
    // One real touch on the action button: down, `ms`, up — then the press and lift health reads, and the state after.
    const hold = async (ms) => {
      await page.evaluate(() => { window.__hpLog = []; });
      await touchStart(cdp, action);
      await page.waitForTimeout(ms);
      await touchEnd(cdp);
      await page.waitForTimeout(120);
      const after = await read();
      const log = await page.evaluate(() => window.__hpLog.splice(0));
      const down = log.find((e) => e.type === 'pointerdown' && e.target === 'touch-action');
      const up = log.find((e) => e.type === 'pointerup' && e.target === 'touch-action');
      if (!down || !up) return { log, after, missing: true };
      return { press: down.hp - up.hp, release: up.hp - after.hp, heldMs: Math.round(up.t - down.t), after, trusted: !down.synthetic };
    };

    const r = { start: await read() };
    expect(r.start.dist > 0.8 && r.start.dist < 3.5, `SETUP: the brute is not in front, in reach — ${JSON.stringify(r.start)}`).toBe(true);
    await aim();
    r.warm = await hold(40); // the page's first swing stalls the main thread (heavy-melee.spec.js); unmeasured
    await page.waitForTimeout(400);
    // THE CONTROL: half-way through the charge — past the light swing's 300 ms cooldown, short of ready — held IN THE
    // PAGE on the game's clock by pointer events dispatched on the button (a real touch's jitter under load exceeds this
    // window; heavy-melee.spec.js measured it). React handles them as it handles the real ones; setPointerCapture
    // refuses their synthetic pointerId, which the overlay swallows by design. The FULL hold below is the real touch.
    await aim();
    r.half = await page.evaluate(({ ms, mid }) => {
      const hp = () => window.__craftyTest.call('readMobs').find((e) => e.id === mid)?.health ?? null;
      const el = document.querySelector('[data-testid="touch-action"]');
      const opts = { bubbles: true, cancelable: true, pointerId: 77, pointerType: 'touch', isPrimary: true, button: 0 };
      const hp0 = hp(), t0 = performance.now();
      el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, buttons: 1 }));
      const t1 = performance.now(), hp1 = hp();
      while (performance.now() - t1 < ms) { /* the hold, on the clock the charge reads */ }
      const t2 = performance.now();
      el.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0 }));
      window.__hpLog.splice(0);
      return { press: hp0 - hp1, release: hp1 - hp(), heldMin: Math.round(t2 - t1), heldMax: Math.round(t2 - t0) };
    }, { ms: HEAVY_HOLD_MS + HEAVY_CHARGE_MS / 2, mid: id });
    await page.waitForTimeout(120);
    r.half.after = await read();
    await page.waitForTimeout(400);
    // THE FULL HOLD: a real touch, past the hold threshold and the whole charge.
    await aim();
    r.full = await hold(HEAVY_HOLD_MS + HEAVY_CHARGE_MS + 200);
    await page.evaluate(() => { Math.random = window.__touchRandom; });

    const where = JSON.stringify(r);
    const { half, full } = r;
    console.log(`[touch-hold] heavy half: press ${half.press} release ${half.release} (${half.heldMin}-${half.heldMax} ms) · full: press ${full.press} release ${full.release} (${full.heldMs} ms, trusted ${full.trusted})`);
    expect(full.missing, `SETUP: the real hold's pointerdown/pointerup on touch-action were not both logged — ${where}`).toBeUndefined();
    expect(full.after.gone, `SETUP: the brute died or vanished mid-measurement — ${where}`).toBeUndefined();
    expect(full.after.active && full.after.alive, `SETUP: the input gate dropped or the player died — ${where}`).toBe(true);
    expect(full.after.frozen, `SETUP: the world freeze ran out mid-measurement — ${where}`).toBe(true);
    expect(half.heldMin > 300 && half.heldMax < HEAVY_HOLD_MS + HEAVY_CHARGE_MS,
      `SETUP: the half-charged hold lasted ${half.heldMin}-${half.heldMax} ms, not inside (300, ${HEAVY_HOLD_MS + HEAVY_CHARGE_MS}) — the control cannot discriminate: ${where}`).toBe(true);
    expect(full.heldMs >= HEAVY_HOLD_MS + HEAVY_CHARGE_MS,
      `SETUP: the real hold lasted ${full.heldMs} ms on the game's clock, short of the ${HEAVY_HOLD_MS + HEAVY_CHARGE_MS} ms charge: ${where}`).toBe(true);
    expect(full.trusted, `SETUP: the full hold was not a real (trusted) touch — ${where}`).toBe(true);
    expect(half.press, `the action button's press dealt no damage — it never reached the brute (aim, range, or the gate): ${where}`).toBeGreaterThan(0);
    expect(half.release, `a HALF-charged release dealt ${half.release} — the heavy fired without a full charge: ${where}`).toBe(0);
    expect(half.after.staggered, `a half-charged release staggered the brute: ${where}`).toBe(false);
    expect(full.press, `the held press did not swing the light tap at once: ${where}`).toBe(half.press);
    expect(full.release, `the charged release dealt nothing — a held touch never threw the heavy: ${where}`).toBeGreaterThan(0);
    expect(full.release / full.press, `the charged release dealt ${(full.release / full.press).toFixed(2)}x the tap: ${where}`).toBeCloseTo(HEAVY_MULT, 1);
    expect(full.after.staggered, `the heavy staggered nothing: ${where}`).toBe(true);
  });

  test('F9: a new player sees the roar locked, and a tap on it opens the Talents panel without roaring', async ({ page }) => {
    await enterTouchPlay(page);
    await page.evaluate(() => window.useGameStore.setState({ unlockedTalents: {} })); // a fresh profile, set, not assumed
    await installPressLog(page);
    const cdp = await page.context().newCDPSession(page);
    await press(page, cdp, await aimAt(page, 'touch-aspects'), 60);
    await attached(page, 'touch-aspect-roar', 'a new player\'s Aspect ring did not open — the opener or the sector is gated again');
    const roarAim = await aimAt(page, 'touch-aspect-roar');
    expect(roarAim.locked, 'a new player\'s roar sector is not marked locked').toBe('true');
    const tap = await press(page, cdp, roarAim, 80);
    const opened = await page
      .waitForFunction(() => !!document.querySelector('[data-testid="progression-panel"]'), null, { timeout: 15000 })
      .then(() => true, () => false);
    const state = await page.evaluate(() => ({ roar: window.__craftyTest.call('readIntents').roar, active: window.__craftyTest.call('readIntents').active,
      tapToPlay: !!document.querySelector('[data-testid="touch-tap-to-play"]') }));
    const where = JSON.stringify({ tap: tap.log, state });
    console.log(`[touch-hold] F9: ${where}`);
    expect(tap.down?.id, `SETUP: the tap did not land on the roar sector — ${where}`).toBe('touch-aspect-roar');
    expect(opened, `a tap on the locked roar did not open the Talents panel — ${where}`).toBe(true);
    expect(tap.log.some((e) => e.roar === true) || state.roar, `a locked roar wrote its intent — ${where}`).toBe(false);
    expect(state.tapToPlay, `tap-to-play sits over the open Talents panel — ${where}`).toBe(false);
  });
});
