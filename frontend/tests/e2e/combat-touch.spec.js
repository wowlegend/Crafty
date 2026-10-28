import { test, expect } from './_fixtures.js';
import { devices } from '@playwright/test';
import { bootDev, startPlayActive } from './_boot.js';

// CLOSE-QUARTERS COMBAT ON AN EMULATED iPAD (docs/superpowers/plans/2026-10-27-crafty-combat-stance.md, Task 11).
//
// Chromium with devices['iPad Pro 11 landscape'] (deviceScaleFactor 1), as tests/e2e/touch-hold.spec.js runs: real
// CDP touches through the overlay's own listeners. THIS IS NOT WEBKIT, and not iPadOS: real Safari is Kevin's device.
// The WebKit look at the chevrons is tests/e2e/combat-touch-webkit.spec.js (@local-only, excluded from CI).
//
//   1  JOYSTICK BACKPEDAL IS CAUGHT. A zombie 5 m ahead, the stick pushed 60 px DOWN (moveB) and held: the stance
//      engages, and on every frame at full weight the controller's move target leaves the husk at most 2.0 m/s
//      (the direction rebuilt from the positions that frame used, the cap a LITERAL, as in combat-stance.spec.js).
//   1b JOYSTICK FORWARD WITH THE THREAT BEHIND. A zombie 5 m behind, the stick pushed UP (moveF): the same. As on
//      desktop, a down-stick against a threat ahead cannot tell the away-from-threat clamp from a camera-backward or a
//      moveB-gated one, so this is the case that sees U4.
//   2  THREE TAPS MAKE A FINISHER. A frozen world, a moss brute 2.2 m ahead and a zombie 2 m at 60 degrees off-axis,
//      three taps on the action button: the third deals 1.5x and only it reaches the zombie. Gaps are judged on the
//      measured pointerdown times (SETUP outside [100, 650] ms), as in melee-string.spec.js. A REAL CDP tap first
//      must swing (the browser's touch path into the overlay); the three timed taps are pointer events dispatched on
//      the button IN THE PAGE, each gap placed by a busy wait on the clock the string reads. From outside the page a
//      gap cannot be placed: every CDP touch and every evaluate waits for the main thread, which a SwiftShader frame
//      holds for hundreds of ms (CI run 40675430218: taps aimed 350 ms apart were handled 2477-4941 ms apart). A CDP
//      `timestamp` does not place them either: it sets only the event's timeStamp, which the game reads for the heavy's
//      hold (input/primaryInput.js `at`), while the string judges a press when its handler runs (Components.jsx
//      triggerMeleeAttack reads performance.now()); in that run each swing fired within 3 ms of its handler. Measured
//      locally on SwiftShader (84 ms median frame): three CDP taps stamped exactly 350 ms apart reached the page with
//      timeStamps 350 ms apart and handlers 390-916 ms apart, one rep of three outside the 650 ms window; sent without
//      awaiting, the handlers ran 0-1 ms apart. What
//      the substitution changes: the timed taps skip the browser's touch-to-pointer translation and the compatibility
//      mouse events after it (input/compatMouse.js filters those), so only the real tap exercises that path.
//   3  CHEVRONS CLEAR EVERY TOUCH CONTROL, landscape then portrait (834 x 1194), with the tray open. For 8 bearings
//      outside the frustum a windup gets a chevron that overlaps no [data-touch-btn] and stays in the viewport;
//      bearings in view are skipped and counted, `checked N/8` is printed, and N must be at least 5.
//
// WHAT THIS DOES NOT CHECK: the chase (combat-stance.spec.js judges it on desktop; on touch only the target is
// judged, which does not depend on the frame rate); WebKit and iPadOS; an analog stick (the joystick writes the same
// eight boolean intents as WASD, input/touchMath.js, so the stance clamps the same vectors).
//
// Mutation-Proof: OWED (the Task 11 batch below, observed verdicts to be written here).
//   U1 src/game/windupChevrons.js  touchBottomInsetPx returns 0                                 -> case 3 (the action or jump button)
//   U2 src/game/meleeString.js     a desktop-only string: gateSwing's `if (!heavy && !form) {` gains `&& !navigator.maxTouchPoints`
//                                  (the plan's handleMouseDown no longer exists: mouse and touch share pressPrimary)   -> case 2
//   U3 src/game/windupChevrons.js  SIDE_INSET_PX = 8                                           -> case 3, portrait (the tray column)
//   U4 src/Components.jsx          the stance applied only when input.moveB: the stanceWalk call is handed
//                                  `input.moveB ? stance : { w: 0, awayX: 0, awayZ: 0, gap: 0 }`              -> case 1b
//   U0 src/game/windupChevrons.js  a comment edit (identity)                                    -> must SURVIVE
// U2 and U4 are written where the code lives: the light-path guard is game/meleeString.js gateSwing (its `form` is
// Components' `!!beastEl`), and stanceWalk never sees the keys (it takes moveVector's output). A key-gated stance can
// only be written where the keys are, so U4 gates the stance at the stanceWalk call in Components.jsx; `input.moveB`
// inside stanceWalk would be a ReferenceError, a crash and not the plausible-wrong mutant this case exists for.
// Case 1 and 1b also judge `applied`, the velocity the ramp fed the body, from SETTLE_MS on, sampling past the catch
// until then: a longer settle that stopped at the catch found the husk already adjacent at the first sample. The
// stance's clamp lives in src/game/combatStance.js stanceWalk, which src/game/combatStance.test.js drives directly.

const IPAD = devices['iPad Pro 11 landscape'];
test.use({ viewport: IPAD.viewport, userAgent: IPAD.userAgent, isMobile: IPAD.isMobile, hasTouch: IPAD.hasTouch, deviceScaleFactor: 1 });

const RETREAT = 2.0; // LITERALS: the yardstick must not move with the subject
const EPS = 1e-6;
// The applied velocity (readMoveTarget's `applied`, what the ramp fed the body) is judged from SETTLE_MS of sampling on,
// within APPLIED_TOL: combat-stance.spec.js's numbers and reasons. Sampling starts after the stick is
// down, so the ramp has had at least that long.
const SETTLE_MS = 120;
const APPLIED_TOL = 0.1;
const FINISHER_MULT = 1.5;
const WINDOW = 650;

// `at` (optional): the time the input HAPPENED, CDP's `timestamp` (seconds since the epoch), which Chromium carries into
// the event's timeStamp (tests/e2e/touch-hold.spec.js). Omitted, the browser stamps the moment it dispatches the event.
const stampOf = (at) => (at === undefined ? {} : { timestamp: at });
const touchStart = (cdp, p, at) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }], ...stampOf(at) });
const touchMove = (cdp, p) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y }] });
const touchEnd = (cdp, at) => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], ...stampOf(at) });

/** The centre of a control, and proof a thumb there lands ON it (tests/e2e/touch-hold.spec.js's aimAt, copied). */
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
    return { ok: hit === el, x, y, why: `the centre of ${id} hits ${name}` };
  }, testid);
  if (!a.ok) throw new Error(`SETUP: ${a.why}`);
  return a;
}

// Runs in the page before the app (addInitScript), so it must be self-contained.
function installTouchCombatHelpers() {
  const call = (n, ...a) => window.__craftyTest.call(n, ...a);
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const tick = () => new Promise((r) => setTimeout(r, 2));
  const store = () => window.useGameStore.getState();
  const cam = () => window.__threeCamera;
  const fwdOf = (yaw) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });
  const rightOf = (yaw) => ({ x: Math.cos(yaw), z: -Math.sin(yaw) });
  const rectOf = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const meets = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  window.__downs = [];
  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') window.__downs.push(performance.now()); }, { capture: true });
  const H = {
    median: 16,
    sleepUntil: async (t) => { while (performance.now() < t) await tick(); },
    spinUntil: (t) => { while (performance.now() < t) { /* no frame may start before the next tap */ } },
    // One tap on the action button through the overlay's own React handlers. Each event is built right before its
    // dispatch, since an event's timeStamp (which the overlay hands the game) is its creation time.
    tap() {
      const el = document.querySelector('[data-testid="touch-action"]');
      const opts = { bubbles: true, cancelable: true, pointerId: 78, pointerType: 'touch', isPrimary: true, button: 0 };
      el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, buttons: 1 }));
      el.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0 }));
      return window.__downs[window.__downs.length - 1];
    },
    async frames(n) { for (let i = 0; i < n; i++) await frame(); },
    async frameInterval(n) {
      const d = [];
      let t = performance.now();
      for (let i = 0; i < n; i++) { await frame(); const u = performance.now(); d.push(u - t); t = u; }
      d.sort((a, b) => a - b);
      H.median = Math.round(d[Math.floor(d.length / 2)]);
      return H.median;
    },
    setView(yaw, pitch = 0) { const c = cam(); c.rotation.order = 'YXZ'; c.rotation.y = yaw; c.rotation.x = pitch; c.updateMatrixWorld(); },
    heal() { window.useGameStore.setState({ isAlive: true, playerHealth: store().maxHealth }); },
    killHostiles(r) {
      const c = cam().position;
      for (const m of call('readMobs')) {
        if (!m.passive && m.health > 0 && Math.hypot(m.x - c.x, m.z - c.z) < r) window.GameMethods.damageMob(m.id, 99999, 'physical', 'ally');
      }
    },
    floorAt(x, z) { const f = store().getMobFloor; const y = f ? f(x, z, cam().position.y + 3) : null; return Number.isFinite(y) ? y : null; },
    hp(id) { return call('readMobs').find((m) => m.id === id)?.health ?? null; },
    str() { return call('readString'); },
    // THE STAND POINT (combat-stance.spec.js): the spawn, on the hearth platform; every stance case starts there.
    prepare() {
      H.heal();
      store().setTimeOfDay?.(0.5);
      H.killHostiles(40);
      const c = cam().position;
      const floor = H.floorAt(c.x, c.z);
      if (floor === null) return { why: 'SETUP: no floor under the stand point' };
      H.stand = { x: c.x, z: c.z, floor };
      const level = (yaw, s) => { const f = fwdOf(yaw), y = H.floorAt(c.x + f.x * s, c.z + f.z * s); return y !== null && Math.abs(y - floor) <= 1; };
      // a heading whose husk spots, 5 m ahead and 5 m behind, are on the player's level
      for (let k = 0; k < 8; k++) { const yaw = (k * Math.PI) / 4; if (level(yaw, 5) && level(yaw, -5)) { H.yaw = yaw; return { yaw, floor }; } }
      return { why: 'SETUP: no heading puts a husk 5 m ahead and 5 m behind on the player\'s level' };
    },
    async home() {
      const rb = store().playerRigidBodyRef?.current;
      if (!rb || !H.stand) return false;
      rb.setTranslation({ x: H.stand.x, y: H.stand.floor + 1.2, z: H.stand.z }, true);
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
      await H.frames(10);
      const c = cam().position;
      return Math.hypot(c.x - H.stand.x, c.z - H.stand.z) < 0.5;
    },
    // The calm on the wall clock (CALM_MS), then the exit blend on the game's capped step (EXIT_S): combat-stance.spec.js
    // idle(), whose reasons apply. Returns w, or null when the page stopped advancing game time (SETUP).
    async idle() {
      H.killHostiles(40);
      const t0 = performance.now();
      const calmBy = 2000 + 300 + 2 * H.median;
      let st = call('readStance');
      while (performance.now() - t0 < calmBy && st?.engaged) { await frame(); st = call('readStance'); }
      if (st?.engaged) { await frame(); await frame(); st = call('readStance'); }
      if (!st || st.engaged) return st?.w;
      const g0 = st.atS + st.stepS;
      while (st.w !== 0 && st.atS + st.stepS - g0 < 0.9 && performance.now() - t0 < 120000) { await frame(); st = call('readStance'); }
      return st.w !== 0 && st.atS + st.stepS - g0 < 0.9 ? null : st.w;
    },
    async spawnZombie(where, dist) {
      H.heal();
      H.setView(H.yaw, 0);
      const c = cam().position, f = fwdOf(H.yaw), s = where === 'behind' ? -1 : 1;
      const x = c.x + f.x * dist * s, z = c.z + f.z * dist * s;
      const before = new Set(call('readMobs').map((m) => m.id));
      store().spawnMob(x, z, 'zombie', H.floorAt(x, z));
      await frame();
      const added = call('readMobs').filter((m) => !before.has(m.id));
      return added.length === 1 ? { id: added[0].id } : { why: `SETUP: spawnMob added ${added.length} mobs, not one` };
    },
    async engage() {
      const t0 = performance.now();
      const deadline = Math.max(3000, 15 * H.median);
      while (performance.now() - t0 < deadline) {
        await frame();
        const st = call('readStance');
        if (st && st.engaged === true && st.w === 1) return true;
      }
      return false;
    },
    // Sample every frame while the stick is held (the touch itself is driven from the test through CDP).
    // `minMs`: keep sampling at least this long even once the husk has caught up, so the applied velocity has settled
    // frames to be judged on (a husk already walking in during the engage can be adjacent on the first sample).
    async sample(id, maxMs, minMs = 0) {
      const out = [], t0 = performance.now();
      let intents = null;
      for (;;) {
        await frame();
        const st = call('readStance'), mt = call('readMoveTarget'), c = cam().position;
        const m = call('readMobs').find((x) => x.id === id);
        if (!intents) intents = call('readIntents');
        out.push({ t: performance.now() - t0, st, mt, gap: m ? Math.hypot(m.x - c.x, m.z - c.z) : null });
        if (performance.now() - t0 > maxMs) break;
        if (out[out.length - 1].gap != null && out[out.length - 1].gap <= 2.6 && performance.now() - t0 >= minMs) break;
      }
      return { out, intents };
    },
    // CASE 2's stage: frozen, no crit, a brute dead ahead and a zombie 60 degrees off-axis (melee-string.spec.js).
    async stageMelee() {
      H.heal();
      H.killHostiles(40);
      H.setView(H.yaw, 0);
      store().triggerHitstop(600000);
      window.__touchRandom = window.__touchRandom || Math.random;
      Math.random = () => 0.999;
      const rb = store().playerRigidBodyRef?.current;
      if (!rb) return { why: 'SETUP: no player body (playerRigidBodyRef) to stage from' };
      const c = rb.translation(), f = fwdOf(H.yaw), r = rightOf(H.yaw); // the body: every cone starts there (combat/swingOrigin.js)
      const k = Math.cos(Math.PI / 3), s = Math.sin(Math.PI / 3);
      const b = { x: c.x + f.x * 2.2, z: c.z + f.z * 2.2 };
      const z = { x: c.x + (k * f.x + s * r.x) * 2.0, z: c.z + (k * f.z + s * r.z) * 2.0 };
      const before = new Set(call('readMobs').map((m) => m.id));
      store().spawnMob(b.x, b.z, 'moss_brute', H.floorAt(b.x, b.z));
      const mid = new Set(call('readMobs').map((m) => m.id));
      store().spawnMob(z.x, z.z, 'zombie', H.floorAt(z.x, z.z));
      await H.frames(3);
      const brute = call('readMobs').find((m) => !before.has(m.id) && m.type === 'moss_brute');
      const zombie = call('readMobs').find((m) => !mid.has(m.id) && m.type === 'zombie');
      return brute && zombie ? { brute: brute.id, zombie: zombie.id } : { why: 'SETUP: the melee stage did not spawn a brute and a zombie' };
    },
    async swingAfter(prevAt) {
      const s0 = H.str();
      const deadline = Math.max(performance.now(), s0.readyAt) + Math.max(300, 3 * H.median);
      while (H.str().lastSwingAt <= prevAt && performance.now() < deadline) await frame();
      const s = H.str();
      return { fired: s.lastSwingAt > prevAt, at: s.lastSwingAt, step: s.lastSwingStep };
    },
    // CASE 3: a zombie 2 m at `deg` degrees from the view (0 ahead, 90 right), frozen; its projection; its chevron.
    async bearing(deg) {
      H.heal();
      H.killHostiles(40);
      await H.frames(2);
      const c = cam().position, f = fwdOf(H.yaw), r = rightOf(H.yaw), a = (deg * Math.PI) / 180;
      const x = c.x + (Math.cos(a) * f.x + Math.sin(a) * r.x) * 2, z = c.z + (Math.cos(a) * f.z + Math.sin(a) * r.z) * 2;
      const before = new Set(call('readMobs').map((m) => m.id));
      store().spawnMob(x, z, 'zombie', H.floorAt(x, z));
      await H.frames(3);
      const m = call('readMobs').find((e) => !before.has(e.id));
      if (!m) return { why: `SETUP: no zombie spawned at ${deg} degrees` };
      const v = cam().position.clone().set(m.x, m.y, m.z).project(cam());
      const inView = v.z <= 1 && Math.abs(v.x) <= 0.94 && Math.abs(v.y) <= 0.94;
      if (inView) return { deg, inView: true };
      call('plantWindup', m.id, 2000);
      let on = [], n = 0;
      while (n < 30) {
        await frame(); n++;
        on = [...document.querySelectorAll('[data-testid="windup-chevron"][data-on="1"]')];
        if (on.length) break;
      }
      if (on.length !== 1) return { deg, count: on.length, ndc: [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)] };
      const rect = rectOf(on[0]);
      const btns = [...document.querySelectorAll('[data-touch-btn]')].map((el) => ({ id: el.getAttribute('data-testid'), r: rectOf(el) })).filter((b) => b.r.w > 0 && b.r.h > 0);
      const hits = btns.filter((b) => meets(rect, b.r)).map((b) => b.id);
      const inside = rect.l >= 0 && rect.t >= 0 && rect.r <= window.innerWidth && rect.b <= window.innerHeight;
      window.GameMethods.damageMob(m.id, 99999, 'physical', 'ally');
      return { deg, count: 1, angle: Number(on[0].dataset.angle), rect, hits, inside, buttons: btns.length };
    },
    thaw() {
      H.killHostiles(40);
      if (window.__touchRandom) Math.random = window.__touchRandom;
      window.useGameStore.setState({ hitstopUntil: performance.now() });
      H.setView(H.yaw, 0);
    },
  };
  window.__touchCombat = H;
}

/**
 * The target on every frame at full weight, and the applied velocity from SETTLE_MS on, judged against a direction
 * rebuilt from the positions that frame used.
 */
function judgeTarget(samples) {
  let judged = 0, worstAway = -Infinity, applied = 0, worstAppliedAway = -Infinity;
  for (const { t, st, mt } of samples) {
    if (!st || !mt || st.w !== 1 || mt.frame !== st.frame || Math.hypot(mt.rawX, mt.rawZ) < 1) continue;
    const ax = st.playerX - st.threatX, az = st.playerZ - st.threatZ, l = Math.hypot(ax, az);
    if (l < 1e-3) continue;
    worstAway = Math.max(worstAway, (mt.targetX * ax + mt.targetZ * az) / l);
    judged++;
    if (t < SETTLE_MS) continue;
    worstAppliedAway = Math.max(worstAppliedAway, (mt.appliedX * ax + mt.appliedZ * az) / l);
    applied++;
  }
  return { judged, worstAway: +worstAway.toFixed(6), applied, worstAppliedAway: +worstAppliedAway.toFixed(6) };
}

async function boot(page) {
  await page.addInitScript(installTouchCombatHelpers);
  await bootDev(page);
  await startPlayActive(page);
  await page.waitForFunction(() => window.__craftyTest?.call('readMobs') && window.__threeCamera && window.GameMethods?.damageMob
    && window.useGameStore.getState().spawnMob && window.useGameStore.getState().getMobFloor
    && document.querySelector('[data-testid="touch-action"]'), null, { timeout: 60000 })
    .catch((e) => { throw new Error(`SETUP: the mob hooks, the camera or the touch overlay never came up — ${e.message}`); });
  await page.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    while (Date.now() - (window.useGameStore.getState()._spawnTime || 0) < 5500) await frame();
  });
  const median = await page.evaluate(() => window.__touchCombat.frameInterval(30));
  console.log(`combat-touch: median frame interval: ${median} ms`);
}

test.describe('combat on touch', () => {
  test.setTimeout(600000);

  test('the joystick: a down-stick backpedal and an up-stick walk away from a husk behind are both held to the retreat cap', async ({ page }) => {
    await boot(page);
    const prep = await page.evaluate(() => window.__touchCombat.prepare());
    expect(prep.why, prep.why).toBeUndefined();
    const cdp = await page.context().newCDPSession(page);
    const vp = page.viewportSize();
    const stick = { x: Math.round(vp.width * 0.15), y: Math.round(vp.height * 0.7) };
    for (const [label, where, dy, intent] of [['1 (stick down, husk ahead)', 'ahead', 60, 'moveB'], ['1b (stick up, husk behind)', 'behind', -60, 'moveF']]) {
      const w = await page.evaluate(() => window.__touchCombat.idle());
      expect(w, `SETUP: case ${label}: the game stopped advancing its exit blend`).not.toBeNull();
      expect(w, `the stance never left before case ${label}`).toBe(0);
      expect(await page.evaluate(() => window.__touchCombat.home()), `SETUP: case ${label}: the player could not be put back on the stand point`).toBe(true);
      const sp = await page.evaluate((wh) => window.__touchCombat.spawnZombie(wh, 5), where);
      expect(sp.why, sp.why).toBeUndefined();
      expect(await page.evaluate(() => window.__touchCombat.engage()), `case ${label}: the stance never engaged with an aggro'd husk 5 m ${where}`).toBe(true);
      await touchStart(cdp, stick);
      await touchMove(cdp, { x: stick.x, y: stick.y + dy / 2 });
      await touchMove(cdp, { x: stick.x, y: stick.y + dy });
      let run;
      try {
        run = await page.evaluate(({ id, minMs }) => window.__touchCombat.sample(id, 8000, minMs + 4 * window.__touchCombat.median), { id: sp.id, minMs: SETTLE_MS });
      } finally {
        await touchEnd(cdp);
      }
      expect(run.intents?.[intent], `SETUP: case ${label}: the stick never wrote ${intent} — ${JSON.stringify(run.intents)}`).toBe(true);
      const t = judgeTarget(run.out);
      expect(t.judged, `SETUP: case ${label}: no frame at full weight with the stick's target recorded`).toBeGreaterThan(0);
      expect(t.worstAway, `case ${label}: the stick's target left the husk at ${t.worstAway} m/s (${t.judged} frames)`).toBeLessThanOrEqual(RETREAT + EPS);
      const span = run.out.map((s) => [Math.round(s.t), s.gap == null ? null : +s.gap.toFixed(2), s.st ? s.st.w : null]);
      expect(t.applied, `SETUP: case ${label}: no frame at full weight from ${SETTLE_MS} ms of sampling on (${t.judged} judged; [ms, gap, w] ${JSON.stringify(span.slice(0, 12))})`).toBeGreaterThan(0);
      expect(t.worstAppliedAway, `case ${label}: the velocity fed to the body left the husk at ${t.worstAppliedAway} m/s (${t.applied} settled frames)`).toBeLessThanOrEqual(RETREAT + APPLIED_TOL);
    }
  });

  test('a real tap on the action button swings, and three in-page taps on it make a finisher that sweeps the husk 60 degrees off-axis', async ({ page }) => {
    await boot(page);
    const prep = await page.evaluate(() => window.__touchCombat.prepare());
    expect(prep.why, prep.why).toBeUndefined();
    const cdp = await page.context().newCDPSession(page);
    try {
      const st = await page.evaluate(() => window.__touchCombat.stageMelee());
      expect(st.why, st.why).toBeUndefined();
      const action = await aimAt(page, 'touch-action');
      const hp = () => page.evaluate(({ b, z }) => ({ b: window.__touchCombat.hp(b), z: window.__touchCombat.hp(z) }), { b: st.brute, z: st.zombie });
      const h0 = await hp();
      // A TAP on the input's clock, which the game reads the hold on: under load CDP handles the lift long after the
      // press, and an unstamped tap was a held press that threw a heavy (CI run 40675430218: the first tap dealt 60, a
      // light swing plus the heavy, and the heavy's stagger made every later hit a 1.5x riposte).
      const tap0 = Date.now() / 1000;
      await touchStart(cdp, action, tap0);
      await touchEnd(cdp, tap0 + 0.04);
      const real = await page.evaluate(() => window.__touchCombat.swingAfter(window.__downs.slice(-1)[0] - 1));
      const h1 = await hp();
      const realWhere = JSON.stringify({ real, before: h0, after: h1, downs: await page.evaluate(() => window.__downs.length) });
      expect(real.fired, `a real touch on the action button fired no swing of the light string — ${realWhere}`).toBe(true);
      expect(h0.b - h1.b, `the real tap's swing dealt nothing to the brute dead ahead — ${realWhere}`).toBeGreaterThan(0);
      const c = await page.evaluate(async ({ b, z }) => {
        const H = window.__touchCombat;
        await H.sleepUntil(Math.max(performance.now(), H.str().windowEndsAt, H.str().readyAt) + 100); // the real tap's string lapses
        const r = () => ({ b: H.hp(b), z: H.hp(z) });
        const r0 = r();
        const t1 = H.tap();
        const s1 = await H.swingAfter(t1 - 1);
        const r1 = r();
        H.spinUntil(t1 + 350);
        const t2 = H.tap();
        const s2 = await H.swingAfter(s1.at);
        const r2 = r();
        H.spinUntil(s2.at + 350);
        const t3 = H.tap();
        const s3 = await H.swingAfter(s2.at);
        const r3 = r();
        return { s1, s2, s3, downs: [t1, t2, t3], d: [r0.b - r1.b, r1.b - r2.b, r2.b - r3.b], zd: [r0.z - r1.z, r1.z - r2.z, r2.z - r3.z] };
      }, { b: st.brute, z: st.zombie });
      const { s1, s2, s3, d, zd, downs } = c;
      const where = JSON.stringify({ ...c, realDealt: h0.b - h1.b });
      expect(s1.fired && s2.fired, `SETUP: a tap on the action button fired no swing — ${where}`).toBe(true);
      expect(downs[1] - downs[0] >= 100 && downs[1] - downs[0] <= WINDOW, `SETUP: tap 2 came ${Math.round(downs[1] - downs[0])} ms after tap 1 — ${where}`).toBe(true);
      expect(downs[2] - s2.at >= 100 && downs[2] - s2.at <= WINDOW, `SETUP: tap 3 came ${Math.round(downs[2] - s2.at)} ms after step 2 — ${where}`).toBe(true);
      expect(d[0], `the first tap dealt nothing to the brute — ${where}`).toBeGreaterThan(0);
      expect(d[0], `the real tap and an in-page tap dealt different light swings — ${where}`).toBe(h0.b - h1.b);
      expect(d[2], `three taps on the action button made no finisher — ${where}`).toBe(Math.round(d[0] * FINISHER_MULT));
      expect(zd[0] + zd[1], `a light tap hit the zombie off-axis — ${where}`).toBe(0);
      expect(zd[2], `the touch finisher missed the zombie 60 degrees off-axis — ${where}`).toBeGreaterThan(0);
    } finally {
      await page.evaluate(() => window.__touchCombat.thaw()).catch(() => {});
    }
  });

  test('chevrons stay clear of every touch control, landscape and portrait, with the tray open', async ({ page }) => {
    await boot(page);
    const prep = await page.evaluate(() => window.__touchCombat.prepare());
    expect(prep.why, prep.why).toBeUndefined();
    const cdp = await page.context().newCDPSession(page);
    try {
      await page.evaluate(() => { window.useGameStore.getState().triggerHitstop(600000); });
      for (const vp of [IPAD.viewport, { width: 834, height: 1194 }]) {
        await page.setViewportSize(vp);
        await page.evaluate(() => window.__touchCombat.frames(5));
        const opener = await aimAt(page, 'touch-panels');
        const open = await page.evaluate(() => document.querySelectorAll('[data-testid^="touch-tray-"]').length);
        if (open === 0) { await touchStart(cdp, opener); await touchEnd(cdp); await page.evaluate(() => window.__touchCombat.frames(5)); }
        const tray = await page.evaluate(() => document.querySelectorAll('[data-testid^="touch-tray-"]').length);
        expect(tray, `SETUP: ${vp.width}x${vp.height}: the tray did not open`).toBeGreaterThan(0);
        const rows = [];
        for (let deg = 0; deg < 360; deg += 45) rows.push(await page.evaluate((d) => window.__touchCombat.bearing(d), deg));
        const why = rows.find((r) => r.why);
        expect(why?.why, why?.why).toBeUndefined();
        const checked = rows.filter((r) => !r.inView);
        console.log(`combat-touch: ${vp.width}x${vp.height}: checked ${checked.length}/8 — ${JSON.stringify(rows.map((r) => (r.inView ? `${r.deg}:view` : `${r.deg}:${r.angle ?? r.count}`)))}`);
        expect(checked.length, `${vp.width}x${vp.height}: only ${checked.length} of 8 bearings were off screen`).toBeGreaterThanOrEqual(5);
        for (const r of checked) {
          expect(r.count, `${vp.width}x${vp.height}: a windup at ${r.deg} degrees, off screen (ndc ${JSON.stringify(r.ndc)}), got ${r.count} chevrons`).toBe(1);
          expect(r.buttons, 'SETUP: no [data-touch-btn] on screen to check against').toBeGreaterThan(3);
          expect(r.inside, `${vp.width}x${vp.height}: the chevron for ${r.deg} degrees left the viewport — ${JSON.stringify(r.rect)}`).toBe(true);
          expect(r.hits, `${vp.width}x${vp.height}: the chevron for ${r.deg} degrees covers a touch control — ${JSON.stringify(r)}`).toEqual([]);
        }
      }
    } finally {
      await page.evaluate(() => window.__touchCombat.thaw()).catch(() => {});
    }
  });
});
