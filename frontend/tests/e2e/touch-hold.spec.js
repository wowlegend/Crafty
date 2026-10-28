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
// TIMING HONESTY. Each hold is stamped by window listeners on the clock the game reads, and every verdict prints it.
// The action button's hold is the input's own time (the events' timeStamp — CI run 40517958583, below), printed beside
// the handled gap: the heavy is decided AT the release, from both stamps. The roar is not, and cannot be: the frame loop
// commits it DURING the hold, so it can only act on a lift the page has handled, and under load the page learns of a
// lift long after it happened while frames keep running (measured 2026-10-27, six CDP taps on this iPad at ~3 fps: press
// latency 551-2534 ms, lift latency 535-4326 ms; three unstamped "120 ms" taps were handled 661-4460 ms apart and two of
// them committed the beast form, because the harness itself lifts only after CDP has seen the press handled). Counting
// the roar's charge from the press's stamp would make that worse, not better: in all six, the frame that first saw the
// press ran 874-2535 ms after the press's stamp, past the 450 ms charge, so every tap would have committed at once. So
// the roar CONTROL is a tap the frame loop sees for exactly one frame (below), and the roar HOLD is real touch.
// Under load a lift can be handled long after it happened; where that makes a control unable to discriminate, the spec
// says SETUP (scripts/dev/mutate-e2e.sh scores that COULD NOT CHECK), never a verdict.
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
//   E10 src/input/aspectWheel.js: plausible-wrong, the Aspect row back at its old offset (ASPECT_ROW_BOTTOM 104, onto
//       the jump on iPad Pro 11 landscape — review F1) -> the F1 jump case
//   E11 src/input/aspectWheel.js: the fan's item 0 back on its opener (`-i * step`) -> the F1 sweep (the opener stolen)
//   E12 src/Components.jsx: a raw window mousedown listener presses the primary unfiltered, beside installPrimaryMouse
//       (review F2) -> the F2 case (presses as "mouse" +1). Review round 2: the old F2 verdict compared one echo total,
//       which the mouseup echo alone satisfied, so this mutant was predicted to SURVIVE it; the verdict is the press now.
//   E13 src/input/compatMouse.js: makeMouseHandlers presses whatever the filter says -> the F2 case (presses as "mouse")
//   E0 identity (a comment edit in src/ui/TouchControls.jsx) -> must SURVIVE
// (A mutant of ANTICIPATION_SEC is deliberately absent: this spec imports that constant, so it would move its own
// thresholds and score SETUP, not a verdict.) Replace OWED with the observed verdicts.
// CI run 40517958583 fix (the input-time hold; the fresh-brute isolation; F2's entry wait) — OBSERVED 2026-10-27 by its
// lane, the action-button case alone, a throwaway config on a free port, a machine at load 31-85 on 14 cores
// (E2E_WORLD_TIMEOUT=180000), each RED with the message named unless marked:
//   E0 identity (a comment edit in src/ui/TouchControls.jsx) -> SURVIVED, as it must
//   E14 src/ui/TouchControls.jsx: the action button's lift passes no timeStamp -> RED, "a 40 ms tap whose lift was
//       handled 2218 ms later threw the heavy (40)"
//   E15 src/Components.jsx: releaseHeavySwing drops the lift's time -> RED, the late lift (handled 2300 ms, threw 40)
//   E16 src/Components.jsx: pressPrimary drops the press's time -> RED, "a 1401 ms hold whose press was handled late
//       threw nothing"
//   E17 src/game/heavyAttack.js: plausible-wrong, the release reads the handler clock again -> RED, the late lift
//   E18 src/Components.jsx: the heavy's staggerUntil line removed -> RED, "the heavy staggered nothing" (a verdict that
//       could not fail on CI while the warm-up's stagger lingered under the freeze)
//   E6 src/Components.jsx: plausible-wrong, the release throws the heavy whatever the charge -> RED, "a HALF-charged
//       release dealt 40"
//   E19 F2's flake CONSTRUCTED (a throwaway spec, deleted): the title menu brought back, input made live as forcePlay
//       does, touch-action hit-tested the moment it mounted -> covered by "CANVAS in title-diorama", topmost 969 ms
//       later. Every entry of the batch above logged the same cover: 3332-8841 ms after startPlayActive returned.
// Review round 3 (the roar CONTROL rebuilt as a one-frame tap; the late press lifted quickly) — OBSERVED 2026-10-27 by
// its lane, a throwaway config on port 4317, E2E_WORLD_TIMEOUT=300000, load 110-430 on 14 cores (the frame loop saw the
// CONTROL's press 4046-7604 ms after it), the roar and action cases, each RED with the message named unless marked:
//   E0 identity (a comment edit in src/ui/TouchControls.jsx) -> SURVIVED, as it must (2 passed)
//   E2 src/input/touchHold.js: plausible-wrong, the release clears 10 minutes late -> RED, "a lift handled 6007 ms after
//       its press, past the 120 ms minimum pulse, left the roar raised — the hold outlives its finger"
//   E3 src/ui/TouchControls.jsx: plausible-wrong, the roar's minimum pulse 1000 ms -> SURVIVED, and it cannot be seen at
//       that frame rate: the frame loop first saw the press 4046 ms after it, so a 1000 ms pulse had run out before the
//       lift and the game cannot tell it from 120 ms. It is RED in tests/gates/touch-hold-gates.test.jsx ("a TAP is
//       today's pulse"). When the frame that sees the press ends within 1000 ms of it (CI's ~3 fps), the lift lands
//       inside the mutant's pulse and the intent verdict here reds it; that run is not yet observed.
//   E20 src/Components.jsx: triggerMeleeAttack hands meleeRefusal no heavy flag -> RED, "a 1501 ms hold whose press was
//       handled late and lifted 101 ms after threw nothing — the light swing's cooldown, on the handler clock, ate the
//       charged release"

const IPAD = devices['iPad Pro 11 landscape'];
test.use({ viewport: IPAD.viewport, userAgent: IPAD.userAgent, isMobile: IPAD.isMobile, hasTouch: IPAD.hasTouch, deviceScaleFactor: 1 });

// `at` (optional): the time the input HAPPENED, CDP's `timestamp` (seconds since the epoch), which Chromium carries into
// the event's `timeStamp`. Omitted, the browser stamps the moment it dispatches the event.
const stampOf = (at) => (at === undefined ? {} : { timestamp: at });
const touchStart = (cdp, p, at) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }], ...stampOf(at) });
const touchEnd = (cdp, at) => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], ...stampOf(at) });

/** The centre of a control, and proof a thumb there lands ON it. Throws SETUP otherwise, naming what covers it: the
 *  hit element and the nearest [data-testid] around it (a bare "CANVAS" cannot tell the world from the title diorama). */
async function aimAt(page, testid) {
  const a = await page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (!el) return { ok: false, why: `no [data-testid="${id}"] in the DOM` };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    const around = hit && !hit.getAttribute('data-testid') ? hit.closest('[data-testid]')?.getAttribute('data-testid') : null;
    const name = hit ? `${hit.getAttribute('data-testid') || hit.tagName}${around ? ` in ${around}` : ''}` : 'nothing';
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

/** Window listeners that stamp every pointer press and lift on the handlers' clock (`t`) and the input's (`ts`, the
 *  event's timeStamp), with the target and the roar intent.
 *  BUBBLE phase on window: they run after React's root listener, so `roar` is the intent the press just wrote. */
async function installPressLog(page) {
  await page.evaluate(() => {
    window.__pressLog = [];
    const id = (e) => (e.target && e.target.closest ? e.target.closest('[data-testid]')?.getAttribute('data-testid') : null) ?? null;
    for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'mousedown']) {
      window.addEventListener(type, (e) => {
        window.__pressLog.push({ type, t: performance.now(), ts: e.timeStamp, id: id(e), pointerType: e.pointerType ?? null,
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

/** What is topmost at a control's centre: 'self' when the control is, else the hit and the nearest [data-testid]
 *  around it. A page function (serialised by Playwright), so it closes over nothing. */
const coverAt = (id) => {
  const el = document.querySelector(`[data-testid="${id}"]`);
  if (!el) return 'absent';
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  if (hit === el) return 'self';
  const around = hit && !hit.getAttribute('data-testid') ? hit.closest('[data-testid]')?.getAttribute('data-testid') : null;
  return hit ? `${hit.getAttribute('data-testid') || hit.tagName}${around ? ` in ${around}` : ''}` : 'nothing';
};

/** Wait until `testid` is topmost at its centre, or fail SETUP naming what still covers it. Logs what covered it at
 *  entry and for how long, so a run says whether the wait did anything. */
async function uncovered(page, testid, why) {
  const t0 = Date.now();
  const first = await page.evaluate(coverAt, testid);
  let now = first;
  while (now !== 'self' && Date.now() - t0 < 30000) {
    await page.waitForTimeout(100);
    now = await page.evaluate(coverAt, testid);
  }
  console.log(`[touch-hold] entry: ${testid} ${first === 'self' ? 'topmost at once' : `covered by ${first}, topmost after ${Date.now() - t0} ms`}`);
  if (now !== 'self') throw new Error(`SETUP: ${testid} is still covered by ${now} 30 s after input went live — ${why}`);
}

// REVIEW F2's flake (CI run 40517958583, 1 of 2: "SETUP: the centre of touch-action hits CANVAS"). The overlay mounts
// the moment input goes live, but the title menu LEAVES on an exit animation: MenuSystem keeps it mounted under
// AnimatePresence — a fixed, z-index 9999, pointer-events-auto layer holding the title diorama's canvas — until the fade
// ends, which on a loaded software renderer outlasts startPlayActive's 500 ms of held gate (measured 2026-10-27 on a
// loaded machine: 12 of 13 entries covered by "CANVAS in title-diorama" for 2.8-8.8 s after it returned). A case that
// aimed straight away (F2) hit-tested a control the menu still covered. The entry now waits for the overlay to be
// topmost — the one input aimAt reads and nothing used to set — and fails SETUP naming the cover if it never is.
async function enterTouchPlay(page) {
  await bootDev(page);
  await startPlayActive(page);
  await attached(page, 'touch-action', 'the touch overlay did not mount (isTouchDevice false, or input never went live)');
  await uncovered(page, 'touch-action', 'the title menu never left, or something else sits over the overlay');
}

test.describe('touch plays the signature (iPad Pro 11 landscape, real touch)', () => {
  test.setTimeout(240000);

  test('the roar sector: a tap the frame loop sees for one frame charges and cancels (the CONTROL); a held press commits the beast form', async ({ page }) => {
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

    // THE CONTROL — a TAP THE FRAME LOOP SEES FOR ONE FRAME. It must REACH the roar (presence: the press raised the
    // intent and the state machine started a charge) and still not transform, because the charge needs ANTICIPATION_SEC
    // held. The roar is decided by the frame loop during the hold, so a tap is short only on the clock the frames see:
    // a real CDP touch cannot be made short there under load (TIMING HONESTY, above — measured 661-4460 ms between its
    // handlers). So the press and the lift are pointer events dispatched IN THE PAGE on the sector, as the action button's
    // half-charged control is: the press, then the lift in the very frame that first saw it (a microtask queued from the
    // store's charge-start transition, which runs inside the frame loop's tick and before the next frame). React handles
    // them as it handles the real ones; setPointerCapture refuses their synthetic pointerId, which the overlay swallows by
    // design. Whatever the frame rate, the frames see the roar held for one frame, and a correct roar cancels on the next.
    // Two verdicts: the lift lowers the intent at once once the minimum pulse has run (a hold that outlives its finger —
    // E2, E3 — fails here at any frame rate), and no beast form follows.
    await openRing();
    const roarAim = await aimAt(page, 'touch-aspect-roar');
    expect(roarAim.locked, 'SETUP: the roar sector is still locked — the talent did not take').toBe('false');
    const tap = await page.evaluate(() => new Promise((resolve) => {
      const el = document.querySelector('[data-testid="touch-aspect-roar"]');
      const opts = { bubbles: true, cancelable: true, pointerId: 91, pointerType: 'touch', isPrimary: true, button: 0 };
      const intent = () => window.__craftyTest.call('readIntents').roar;
      const out = {};
      let done = false;
      const finish = (o) => { if (!done) { done = true; unsub(); resolve(o); } };
      const unsub = window.useGameStore.subscribe((st, prev) => {
        if (!(st.beastCharging && !prev.beastCharging) || out.chargeAt !== undefined) return;
        out.chargeAt = performance.now();
        queueMicrotask(() => {
          out.liftAt = performance.now();
          el.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0 }));
          out.roarAfterLift = intent();
          finish(out);
        });
      });
      out.pressAt = performance.now();
      el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, buttons: 1 }));
      out.roarAfterPress = intent();
      setTimeout(() => finish({ ...out, noCharge: true }), 20000);
    }));
    await page.waitForTimeout(2000);
    const afterTap = await page.evaluate(() => ({ starts: window.__roar.starts, form: window.useGameStore.getState().beastFormActive,
      charging: window.useGameStore.getState().beastCharging, roar: window.__craftyTest.call('readIntents').roar }));
    const liftMs = tap.liftAt !== undefined ? Math.round(tap.liftAt - tap.pressAt) : null;
    const tapWhere = JSON.stringify({ liftAfterPressMs: liftMs, chargeAfterPressMs: tap.chargeAt !== undefined ? Math.round(tap.chargeAt - tap.pressAt) : null, tap, afterTap });
    console.log(`[touch-hold] roar CONTROL: ${tapWhere}`);
    expect(tap.roarAfterPress, `the press on the roar sector did not raise the roar intent — ${tapWhere}`).toBe(true);
    expect(tap.noCharge, `SETUP: the frame loop never started a charge in 20 s of the roar held — the control cannot discriminate: ${tapWhere}`).toBeUndefined();
    if (liftMs >= TAP_HOLD_MS) {
      expect(tap.roarAfterLift, `a lift handled ${liftMs} ms after its press, past the ${TAP_HOLD_MS} ms minimum pulse, left the roar raised — the hold outlives its finger: ${tapWhere}`).toBe(false);
    }
    expect(afterTap.form, `a tap the frame loop saw for one frame committed the beast form — the roar no longer needs its charge held: ${tapWhere}`).toBe(false);
    expect(afterTap.charging || afterTap.roar, `the tap's charge never ended (or its intent never dropped) — ${tapWhere}`).toBe(false);

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
      window.__touchSpawn = { x: gx, y: gy, z: gz }; // each fresh brute below stands here
      s.spawnMob(gx, gz, 'moss_brute', gy);
      window.__touchRandom = Math.random;
      Math.random = () => 0.999;
      s.triggerHitstop(120000);
      const added = window.__craftyTest.call('readMobs').filter((m) => !before.has(m.id));
      window.__touchMob = added.length === 1 ? added[0].id : null; // re-pointed by freshBrute
      return window.__touchMob;
    });
    expect(id, 'SETUP: spawnMob did not add exactly one brute').not.toBeNull();
    // The brute's health on every press and lift, read in CAPTURE phase on window — before the game's handlers run for
    // an event targeted at the button — with TWO clocks: `t`, when the handler ran (performance.now), and `ts`, when the
    // input happened (the event's timeStamp). The game reads the hold on the second; the first is what a stall moves.
    await page.evaluate(() => {
      window.__hpLog = [];
      const hp = () => window.__craftyTest.call('readMobs').find((e) => e.id === window.__touchMob)?.health ?? null;
      for (const type of ['pointerdown', 'pointerup']) {
        window.addEventListener(type, (e) => {
          const target = e.target && e.target.closest ? e.target.closest('[data-testid]')?.getAttribute('data-testid') : null;
          window.__hpLog.push({ type, t: performance.now(), ts: e.timeStamp, hp: hp(), target, synthetic: !e.isTrusted });
        }, { capture: true });
      }
    });
    const read = () => page.evaluate(() => {
      const call = (n) => window.__craftyTest.call(n);
      const m = call('readMobs').find((e) => e.id === window.__touchMob);
      const c = window.__threeCamera.position;
      const st = window.useGameStore.getState();
      return m
        ? { hp: m.health, staggered: m.staggerUntil > call('worldNow'), dist: +Math.hypot(m.x - c.x, m.z - c.z).toFixed(2),
          active: call('readIntents').active, alive: st.isAlive, frozen: st.hitstopUntil > performance.now() }
        : { hp: null, gone: true };
    });
    // A FRESH BRUTE where the first stood (heavy-melee.spec.js's beast phase does the same). CI run 40517958583 failed
    // "a half-charged release staggered the brute" 3 of 3, and the half never staggered it: the WARM-UP did. Its 40 ms
    // touch was handled 1029-7269 ms apart, the game threw a heavy (release 40 = HEAVY_MULT x its press of 20), and the
    // world is FROZEN for the measurement — the stagger runs on the world clock, so it never expired. The half's press
    // then dealt 30, the riposte's 1.5x on a staggered brute: it was staggered BEFORE the half began. And the full
    // hold's "the heavy staggered" read that same stale stagger, so it could not fail. The warm-up cannot be made a tap
    // here: CDP returns from the press only once the page has handled it, so under load the harness LIFTS late — measured
    // locally 2026-10-27, a "40 ms" warm-up 2801 ms apart on the input clock, a real held press whose heavy is correct.
    // So a stagger read is attributable only on a brute nothing has staggered: each judged phase starts on a fresh one,
    // and says so (SETUP) first.
    const freshBrute = () => page.evaluate(() => {
      const s = window.useGameStore.getState();
      const at = window.__touchSpawn;
      if (window.__craftyTest.call('readMobs').some((e) => e.id === window.__touchMob)) window.GameMethods.damageMob(window.__touchMob, 99999, 'physical', 'ally');
      const before = new Set(window.__craftyTest.call('readMobs').map((m) => m.id));
      s.spawnMob(at.x, at.z, 'moss_brute', at.y);
      const added = window.__craftyTest.call('readMobs').filter((m) => !before.has(m.id));
      window.__touchMob = added.length === 1 ? added[0].id : null;
      return window.__touchMob;
    });
    const aim = () => page.evaluate(() => {
      const m = window.__craftyTest.call('readMobs').find((e) => e.id === window.__touchMob);
      if (m) window.__threeCamera.lookAt(m.x, m.y + 0.8, m.z);
    });
    const cdp = await page.context().newCDPSession(page);
    const action = await aimAt(page, 'touch-action');
    // One real touch on the action button: down, `ms`, up — then the press and lift health reads, and the state after.
    // `heldMs` is the hold on the input's clock (the one the game reads); `handledMs` on the handlers'. `downAt` / `upAt`
    // stamp the touch's own times (see touchStart).
    const hold = async (ms, { downAt, upAt } = {}) => {
      await page.evaluate(() => { window.__hpLog = []; });
      await touchStart(cdp, action, downAt);
      await page.waitForTimeout(ms);
      await touchEnd(cdp, upAt);
      await page.waitForTimeout(120);
      const after = await read();
      const log = await page.evaluate(() => window.__hpLog.splice(0));
      const down = log.find((e) => e.type === 'pointerdown' && e.target === 'touch-action');
      const up = log.find((e) => e.type === 'pointerup' && e.target === 'touch-action');
      if (!down || !up) return { log, after, missing: true };
      return { press: down.hp - up.hp, release: up.hp - after.hp, heldMs: Math.round(up.ts - down.ts),
        handledMs: Math.round(up.t - down.t), after, trusted: !down.synthetic };
    };
    const brute = async (phase) => {
      expect(await freshBrute(), `SETUP: no fresh brute for ${phase}`).not.toBeNull();
      const before = await read();
      expect(before.staggered, `SETUP: the fresh brute for ${phase} is already staggered — its stagger read cannot be attributed: ${JSON.stringify(before)}`).toBe(false);
      expect(before.dist > 0.8 && before.dist < 3.5, `SETUP: the fresh brute for ${phase} is not in front, in reach — ${JSON.stringify(before)}`).toBe(true);
      return before;
    };

    const r = { start: await read() };
    expect(r.start.dist > 0.8 && r.start.dist < 3.5, `SETUP: the brute is not in front, in reach — ${JSON.stringify(r.start)}`).toBe(true);
    await aim();
    r.warm = await hold(40); // the page's first swing stalls the main thread (heavy-melee.spec.js); unmeasured, and its
    r.warm.staggered = (await read()).staggered; // brute is replaced, whatever it did to it (printed, never judged)
    await page.waitForTimeout(400);
    r.halfBefore = await brute('the half-charged CONTROL');
    // THE CONTROL: half-way through the charge — past the light swing's 300 ms cooldown, short of ready — held IN THE
    // PAGE on the game's clock by pointer events dispatched on the button (a real touch's jitter under load exceeds this
    // window; heavy-melee.spec.js measured it). React handles them as it handles the real ones; setPointerCapture
    // refuses their synthetic pointerId, which the overlay swallows by design. The FULL hold below is the real touch.
    // In-page events are stamped when CONSTRUCTED (DOM: an event's timeStamp is its creation time), so each is built
    // right before its dispatch and the input clock the game reads matches the busy-waited hold.
    await aim();
    r.half = await page.evaluate(({ ms }) => {
      const hp = () => window.__craftyTest.call('readMobs').find((e) => e.id === window.__touchMob)?.health ?? null;
      const el = document.querySelector('[data-testid="touch-action"]');
      const opts = { bubbles: true, cancelable: true, pointerId: 77, pointerType: 'touch', isPrimary: true, button: 0 };
      const hp0 = hp(), t0 = performance.now();
      const down = new PointerEvent('pointerdown', { ...opts, buttons: 1 });
      el.dispatchEvent(down);
      const t1 = performance.now(), hp1 = hp();
      while (performance.now() - t1 < ms) { /* the hold, on the clock the charge reads */ }
      const t2 = performance.now();
      const up = new PointerEvent('pointerup', { ...opts, buttons: 0 });
      el.dispatchEvent(up);
      window.__hpLog.splice(0);
      return { press: hp0 - hp1, release: hp1 - hp(), heldMin: Math.round(t2 - t1), heldMax: Math.round(t2 - t0),
        heldMs: Math.round(up.timeStamp - down.timeStamp) };
    }, { ms: HEAVY_HOLD_MS + HEAVY_CHARGE_MS / 2 });
    await page.waitForTimeout(120);
    r.half.after = await read();
    await page.waitForTimeout(400);
    // THE FULL HOLD: a real touch, past the hold threshold and the whole charge, on the same brute (the half must have
    // left it unstaggered — its verdict below — so the full's stagger read is the heavy's own).
    await aim();
    r.fullBefore = await read();
    r.full = await hold(HEAVY_HOLD_MS + HEAVY_CHARGE_MS + 200);
    await page.waitForTimeout(400);

    // A LATE LIFT: a real touch whose lift HAPPENED 40 ms after its press but is DISPATCHED a second later — what a
    // stalled main thread does to a quick tap, with the stall replaced by CDP's own input time (`timestamp`). It changes
    // WHY the lift is handled late, not what the game sees: two trusted pointer events, stamped 40 ms apart, handled a
    // second or more apart. A game that reads the hold on its handlers throws a heavy here; one that reads the finger
    // swings once. (The game half of what CI run 40517958583 surfaced: its warm-up was handled 1029-7269 ms apart.)
    r.lateBefore = await brute('the late lift');
    await aim();
    const tap0 = Date.now() / 1000;
    r.late = await hold(1000, { downAt: tap0, upAt: tap0 + 0.04 });
    await page.waitForTimeout(400);
    // A LATE PRESS, its mirror: the finger lands, the main thread is busy for a second, then the press is handled, and
    // the lift 400 ms after it — past the light swing's 300 ms cooldown, short of a charge on the handler clock, 1.4 s
    // of hold on the finger's. Held IN THE PAGE (the event is constructed when the finger lands and dispatched after the
    // stall), because the handler gap must sit inside (300, 700) and a real touch's jitter under load exceeds that.
    // A page function (serialised by Playwright, so it closes over nothing): a touch whose press is constructed when the
    // finger lands, dispatched after `stallMs` of a busy main thread, and lifted `holdMs` after it was handled.
    const lateTouch = ({ stallMs, holdMs, pointerId }) => {
      const hp = () => window.__craftyTest.call('readMobs').find((e) => e.id === window.__touchMob)?.health ?? null;
      const spin = (ms) => { const s0 = performance.now(); while (performance.now() - s0 < ms) { /* the main thread, busy */ } };
      const el = document.querySelector('[data-testid="touch-action"]');
      const opts = { bubbles: true, cancelable: true, pointerId, pointerType: 'touch', isPrimary: true, button: 0 };
      const down = new PointerEvent('pointerdown', { ...opts, buttons: 1 }); // the finger lands: stamped now
      spin(stallMs);
      const hp0 = hp(), h0 = performance.now();
      el.dispatchEvent(down);
      const hp1 = hp();
      spin(holdMs);
      const up = new PointerEvent('pointerup', { ...opts, buttons: 0 });
      const h1 = performance.now();
      el.dispatchEvent(up);
      window.__hpLog.splice(0);
      return { press: hp0 - hp1, release: hp1 - hp(), heldMs: Math.round(up.timeStamp - down.timeStamp), handledMs: Math.round(h1 - h0) };
    };
    await aim();
    r.latePress = await page.evaluate(lateTouch, { stallMs: 1000, holdMs: 400, pointerId: 78 });
    await page.waitForTimeout(120);
    r.latePress.after = await read();
    await page.waitForTimeout(400);
    // A LATE PRESS LIFTED QUICKLY (review round 3, item 3): the same stall, then the lift only 100 ms after the press is
    // handled — a 1.5 s hold on the finger, but the press's light swing and the release now sit inside the light swing's
    // 300 ms cooldown on the HANDLER clock, which used to drop the charged release silently (heavyAttack.meleeRefusal).
    // On a fresh brute: the late press's heavy staggered the last one.
    r.quickBefore = await brute('the late press lifted quickly');
    await aim();
    r.quick = await page.evaluate(lateTouch, { stallMs: 1400, holdMs: 100, pointerId: 79 });
    await page.waitForTimeout(120);
    r.quick.after = await read();
    await page.evaluate(() => { Math.random = window.__touchRandom; });

    const where = JSON.stringify(r);
    const { half, full, late, latePress, quick } = r;
    const READY = HEAVY_HOLD_MS + HEAVY_CHARGE_MS;
    console.log(`[touch-hold] heavy warm: held ${r.warm.heldMs} ms (handled ${r.warm.handledMs}) release ${r.warm.release} staggered ${r.warm.staggered}`
      + ` · half: press ${half.press} release ${half.release} (${half.heldMin}-${half.heldMax} ms, input ${half.heldMs})`
      + ` · full: press ${full.press} release ${full.release} (${full.heldMs} ms, handled ${full.handledMs}, trusted ${full.trusted})`
      + ` · late lift: press ${late.press} release ${late.release} (input ${late.heldMs} ms, handled ${late.handledMs})`
      + ` · late press: press ${latePress.press} release ${latePress.release} (input ${latePress.heldMs} ms, handled ${latePress.handledMs})`
      + ` · late press lifted quickly: press ${quick.press} release ${quick.release} (input ${quick.heldMs} ms, handled ${quick.handledMs})`);
    for (const [name, ph] of [['full', full], ['late lift', late]]) {
      expect(ph.missing, `SETUP: the ${name}'s pointerdown/pointerup on touch-action were not both logged — ${where}`).toBeUndefined();
      expect(ph.trusted, `SETUP: the ${name} was not a real (trusted) touch — ${where}`).toBe(true);
    }
    for (const [name, after] of [['half', half.after], ['full', full.after], ['late lift', late.after], ['late press', latePress.after],
      ['late press lifted quickly', quick.after]]) {
      expect(after.gone, `SETUP: the brute died or vanished in the ${name} — ${where}`).toBeUndefined();
      expect(after.active && after.alive, `SETUP: the input gate dropped or the player died in the ${name} — ${where}`).toBe(true);
      expect(after.frozen, `SETUP: the world freeze ran out by the ${name} — ${where}`).toBe(true);
    }
    expect(half.heldMin > 300 && half.heldMax < READY && half.heldMs > 300 && half.heldMs < READY,
      `SETUP: the half-charged hold lasted ${half.heldMin}-${half.heldMax} ms (input ${half.heldMs}), not inside (300, ${READY}) — the control cannot discriminate: ${where}`).toBe(true);
    expect(full.heldMs >= READY,
      `SETUP: the real hold lasted ${full.heldMs} ms on the input's clock, short of the ${READY} ms charge: ${where}`).toBe(true);
    // THE CONTROL
    expect(half.press, `the action button's press dealt no damage — it never reached the brute (aim, range, or the gate): ${where}`).toBeGreaterThan(0);
    expect(half.release, `a HALF-charged release dealt ${half.release} — the heavy fired without a full charge: ${where}`).toBe(0);
    expect(half.after.staggered, `a half-charged release staggered the (fresh) brute: ${where}`).toBe(false);
    // THE FULL HOLD
    expect(r.fullBefore.staggered, `SETUP: the brute was staggered before the full hold — its stagger read cannot be attributed: ${where}`).toBe(false);
    expect(full.press, `the held press did not swing the light tap at once: ${where}`).toBe(half.press);
    expect(full.release, `the charged release dealt nothing — a held touch never threw the heavy: ${where}`).toBeGreaterThan(0);
    expect(full.release / full.press, `the charged release dealt ${(full.release / full.press).toFixed(2)}x the tap: ${where}`).toBeCloseTo(HEAVY_MULT, 1);
    expect(full.after.staggered, `the heavy staggered nothing: ${where}`).toBe(true);
    // THE LATE LIFT
    expect(late.heldMs < HEAVY_HOLD_MS, `SETUP: the late lift's input times are ${late.heldMs} ms apart, not a tap — CDP's timestamp did not reach the event: ${where}`).toBe(true);
    expect(late.handledMs >= READY, `SETUP: the late lift was handled only ${late.handledMs} ms after its press — the case cannot discriminate: ${where}`).toBe(true);
    expect(late.press, `PRESENCE: the late-lift tap dealt no damage — it never reached the brute: ${where}`).toBeGreaterThan(0);
    expect(late.release, `a ${late.heldMs} ms tap whose lift was handled ${late.handledMs} ms later threw the heavy (${late.release}) — the hold is read on the handler's clock, not the finger's: ${where}`).toBe(0);
    expect(late.after.staggered, `the late-lift tap staggered the brute: ${where}`).toBe(false);
    // THE LATE PRESS
    expect(latePress.handledMs > 300 && latePress.handledMs < READY && latePress.heldMs >= READY,
      `SETUP: the late press was handled ${latePress.handledMs} ms (input ${latePress.heldMs}), not inside (300, ${READY}) with a full charge on the input — the case cannot discriminate: ${where}`).toBe(true);
    expect(latePress.press, `PRESENCE: the late press dealt no damage — it never reached the brute: ${where}`).toBeGreaterThan(0);
    expect(latePress.release, `a ${latePress.heldMs} ms hold whose press was handled late threw nothing — the charge counted from the handler, not the finger: ${where}`).toBeGreaterThan(0);
    expect(latePress.release / latePress.press, `the late press's release dealt ${(latePress.release / latePress.press).toFixed(2)}x the tap: ${where}`).toBeCloseTo(HEAVY_MULT, 1);
    expect(latePress.after.staggered, `the late press's heavy staggered nothing: ${where}`).toBe(true);
    // THE LATE PRESS LIFTED QUICKLY. Under 250 ms handled (not 300): the heavy's own clock read comes a few ms after the
    // lift's handler starts, and the case must sit inside the cooldown with that margin to discriminate.
    expect(quick.handledMs < 250 && quick.heldMs >= READY,
      `SETUP: the quick late press was handled ${quick.handledMs} ms apart (input ${quick.heldMs}), not under 250 with a full charge on the input — it cannot sit inside the light swing's cooldown: ${where}`).toBe(true);
    expect(quick.press, `PRESENCE: the quick late press dealt no damage — it never reached the brute: ${where}`).toBeGreaterThan(0);
    expect(quick.release, `a ${quick.heldMs} ms hold whose press was handled late and lifted ${quick.handledMs} ms after threw nothing — the light swing's cooldown, on the handler clock, ate the charged release: ${where}`).toBeGreaterThan(0);
    expect(quick.release / quick.press, `the quick late press's release dealt ${(quick.release / quick.press).toFixed(2)}x the tap: ${where}`).toBeCloseTo(HEAVY_MULT, 1);
    expect(quick.after.staggered, `the quick late press's heavy staggered nothing: ${where}`).toBe(true);
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

  // REVIEW F1 (2026-10-27): the Aspect opener, now shown to every player, sat on the centre of the jump button, so a new
  // player's jump tap opened the ring. tests/gates/touch-layout-gates.test.jsx proves the RECTANGLES are disjoint; this
  // proves the browser agrees — its own CSS engine, stacking order and hit-testing, which the jsdom gate cannot model.
  test('F1: a tap on jump lands on jump, never on the Aspect opener; with everything open, every control owns its centre', async ({ page }) => {
    await enterTouchPlay(page);
    await page.evaluate(() => window.useGameStore.setState({ unlockedTalents: {} })); // a fresh profile: the opener shows
    await attached(page, 'touch-aspects', 'the Aspect opener is not offered to a fresh profile');
    await installPressLog(page);
    const cdp = await page.context().newCDPSession(page);
    // The jump's centre, hit-tested WITHOUT aimAt (which would call a covered jump SETUP — here it is the verdict).
    const jump = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="touch-jump"]');
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      return { x, y, hit: hit ? (hit.getAttribute('data-testid') || hit.tagName) : 'nothing' };
    });
    const tap = await press(page, cdp, jump, 60);
    await page.waitForTimeout(200);
    const ringOpen = await page.evaluate(() => !!document.querySelector('[data-testid="touch-aspect-roar"]'));
    const jumpWhere = JSON.stringify({ jump, tap: tap.log, ringOpen });
    console.log(`[touch-hold] F1 jump: ${jumpWhere}`);
    expect(tap.down, `SETUP: the real tap at the jump's centre logged no pointerdown — ${jumpWhere}`).toBeDefined();
    expect(jump.hit, `the jump's centre hit-tests to ${jump.hit} — a jump tap lands on another control: ${jumpWhere}`).toBe('touch-jump');
    expect(tap.down.id, `the jump tap's pointerdown landed on ${tap.down.id}: ${jumpWhere}`).toBe('touch-jump');
    expect(ringOpen, `a tap on jump opened the Aspect ring — F1: ${jumpWhere}`).toBe(false);

    // Everything open at once (each opener tapped for real, through aimAt: an opener that is covered is SETUP here),
    // then every control's centre must hit that control and nothing above it.
    for (const opener of ['touch-panels', 'touch-aspects', 'touch-spells']) await press(page, cdp, await aimAt(page, opener), 60);
    await attached(page, 'touch-aspect-roar', 'the Aspect ring did not open');
    await attached(page, 'touch-spell-fireball', 'the spell ring did not open');
    const sweep = await page.evaluate(() => {
      const rows = [];
      for (const el of document.querySelectorAll('[data-touch-btn]')) {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const name = (n) => (n ? (n.getAttribute('data-testid') || n.getAttribute('aria-label') || n.tagName) : 'nothing');
        rows.push({ control: name(el), hit: hit === el ? 'self' : name(hit) });
      }
      return rows;
    });
    const stolen = sweep.filter((r) => r.hit !== 'self');
    console.log(`[touch-hold] F1 sweep: ${sweep.length} controls, ${stolen.length} stolen: ${JSON.stringify(stolen)}`);
    // pause, action, cast, jump, dodge, the tray toggle (6) + 4 tray rows + 2 openers + 4 Aspect + 4 spell sectors = 20,
    // the same universe touch-layout-gates counts (it adds the joystick base, which is not a button).
    expect(sweep.length, `SETUP: the sweep saw ${sweep.length} controls with everything open — ${JSON.stringify(sweep)}`).toBe(20);
    expect(stolen, `controls whose centre lands on something else: ${JSON.stringify(stolen)}`).toEqual([]);
  });

  // REVIEW F2 (2026-10-27): a tap's compatibility mousedown reached the game's window `mousedown` listener and pressed the
  // primary a second time as 'mouse'. This taps the action button for real and reads, through the dev test bridge, the
  // primary's presses PER SOURCE and the echoes the game dropped PER EVENT TYPE (input/compatMouse.js, Components.jsx).
  // Review round 2: it used to compare one echo TOTAL against the mousedowns, and the total counts the mouseup echo too,
  // so un-filtering the mousedown alone (E12) stayed green. The verdict is now the press itself: exactly one as 'touch',
  // none as 'mouse'; and the mousedown drops must cover every compat mousedown Chromium delivered.
  test('F2: a real tap on the action button presses the primary once as "touch" and never as "mouse"', async ({ page }) => {
    await enterTouchPlay(page);
    await installPressLog(page);
    const cdp = await page.context().newCDPSession(page);
    const action = await aimAt(page, 'touch-action');
    const before = await page.evaluate(() => window.__craftyTest.call('readCompatMouse'));
    expect(before?.presses && before?.dropped, `SETUP: the readCompatMouse hook is absent or has the old shape — ${JSON.stringify(before)}`).toBeTruthy();
    const tap = await press(page, cdp, action, 60);
    await page.waitForTimeout(150);
    const after = await page.evaluate(() => window.__craftyTest.call('readCompatMouse'));
    const mousedowns = tap.log.filter((e) => e.type === 'mousedown');
    const delta = (k, field) => after[field][k] - before[field][k];
    const where = JSON.stringify({ before, after, log: tap.log });
    console.log(`[touch-hold] F2: ${mousedowns.length} compat mousedown(s); presses touch +${delta('touch', 'presses')} mouse +${delta('mouse', 'presses')}; dropped mousedown +${delta('mousedown', 'dropped')} mouseup +${delta('mouseup', 'dropped')}`);
    expect(tap.down?.id, `SETUP: the real tap's pointerdown did not land on the action button — ${where}`).toBe('touch-action');
    // PRESENCE: with no compat mousedown the case cannot discriminate (a browser that suppressed it has no F2 to show).
    expect(mousedowns.length, `SETUP: Chromium delivered no compatibility mousedown for the tap — ${where}`).toBeGreaterThan(0);
    expect(delta('touch', 'presses'), `PRESENCE: the tap did not press the primary as "touch" exactly once — ${where}`).toBe(1);
    expect(delta('mouse', 'presses'), `a compat mousedown pressed the primary as "mouse" — the F2 double press: ${where}`).toBe(0);
    expect(delta('mousedown', 'dropped'), `a compat mousedown was not dropped as an echo: ${where}`).toBeGreaterThanOrEqual(mousedowns.length);
  });
});
