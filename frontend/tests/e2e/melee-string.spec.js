import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';

// THE LIGHT STRING IN PLAY, through real clicks (docs/superpowers/plans/2026-10-27-crafty-combat-stance.md, Task 9).
//
// src/game/meleeString.test.js proves the string's rules as a pure module. This drives the running game: real mouse
// events through the controller's window listeners, the verb router, triggerMeleeAttack's cone and damage, the frame's
// buffered fire, the dodge site and the heavy's release.
//
// STAGING. A frozen world (triggerHitstop), so the AI never ticks and no mob moves, winds up or strikes; Math.random
// pinned high, so no swing crits (a bare-handed light swing deals 20, a finisher 30). Each case stages a fresh moss
// brute 2.2 m dead ahead and a zombie 2.0 m at 60 degrees off the view axis: outside the 90 degree light cone, inside
// the 140 degree finisher's.
//
// TIMING IS JUDGED AGAINST MEASURED TIMES, NEVER INTENDED ONES (plan review finding 8). Each click is stamped on the
// page clock by a capture listener, each case states the semantic interval its intent needs (from the string's own
// rules: fire or buffer from readyAt - BUFFER_MS, the window to + STRING_WINDOW_MS), and a measured gap outside it is
// SETUP, never a verdict. A BUFFERED fire is judged by state (readString().lastSwingAt / lastSwingStep), polled until a
// deadline of readyAt + max(300, 3 x the median frame interval), because it fires in useFrame, up to a frame late.
// The dodge's start is stamped independently of the subject (the 'swing' sound the dodge site plays), so a mutant that
// never stamps cancelAt is judged, not excused.
//
// WHAT THIS DOES NOT CHECK: the string in a beast form (out of scope: the string is the human sword's); touch
// (tests/e2e/combat-touch.spec.js, Task 11); the hand's sweep (by eye, Task 10).
//
// Mutation-Proof: OWED (the Task 9 batch below, observed verdicts to be written here).
//   S1 src/Components.jsx          swingShape(step) -> swingShape(1) (never a finisher)               -> case 1 ratio
//   S2 src/game/meleeString.js     the window check dropped                                            -> case 2 control
//   S3 src/Components.jsx          the cone arc fixed at Math.PI / 2                                   -> case 1 off-axis zombie
//   S4 src/Components.jsx          cancelIntoDodge -> endString at the dodge start                     -> case 4
//   S5 src/Components.jsx          the takeBufferedSwing line removed                                  -> case 3
//   S6 src/game/meleeString.js     endString(now) taken from the heavy's throw: gateSwing's            -> case 5
//                                  `endString(now);` -> `if (form) endString(now);` (a form's swing keeps it)
//   S7 src/Components.jsx          the router's meleeHit arc fixed at Math.PI / 2                      -> case 6
//   S0 src/game/meleeString.js     a comment edit (identity)                                           -> must SURVIVE
// S6 RE-ANCHORED (round-2 review, 2026-10-28): 446099f4 moved the heavy's `if (heavy) endString(now);` out of
// Components.jsx into game/meleeString.js gateSwing, where one `endString(now);` now ends the string for a heavy AND a
// beast form's swing. The anchor is unique in that file; deleting the line would also take it from the form, so the
// mutant keeps it there and removes only the heavy's, which is what this case judges.

const FINISHER_MULT = 1.5; // LITERALS: the yardstick must not move with the subject
const WINDOW = 650;
const HEAVY_FULL_MS = 700; // HEAVY_HOLD_MS + HEAVY_CHARGE_MS

function installStringHelpers() {
  const call = (n, ...a) => window.__craftyTest.call(n, ...a);
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const tick = () => new Promise((r) => setTimeout(r, 2));
  const store = () => window.useGameStore.getState();
  const cam = () => window.__threeCamera;
  const fwdOf = (yaw) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });
  const rightOf = (yaw) => ({ x: Math.cos(yaw), z: -Math.sin(yaw) });
  window.__clicks = [];
  window.addEventListener('mousedown', () => window.__clicks.push(performance.now()), { capture: true });
  const H = {
    yaw: 0,
    median: 16,
    sleepUntil: async (t) => { while (performance.now() < t) await tick(); },
    async frames(n) { for (let i = 0; i < n; i++) await frame(); },
    async frameInterval(n) {
      const d = [];
      let t = performance.now();
      for (let i = 0; i < n; i++) { await frame(); const u = performance.now(); d.push(u - t); t = u; }
      d.sort((a, b) => a - b);
      H.median = Math.round(d[Math.floor(d.length / 2)]);
      return H.median;
    },
    setView(yaw, pitch = 0) {
      const c = cam();
      c.rotation.order = 'YXZ';
      c.rotation.y = yaw;
      c.rotation.x = pitch;
      c.updateMatrixWorld();
    },
    floorAt(x, z) {
      const f = store().getMobFloor;
      const y = f ? f(x, z, cam().position.y + 3) : null;
      return Number.isFinite(y) ? y : null;
    },
    killHostiles(r) {
      const c = cam().position;
      for (const m of call('readMobs')) {
        if (!m.passive && m.health > 0 && Math.hypot(m.x - c.x, m.z - c.z) < r) window.GameMethods.damageMob(m.id, 99999, 'physical', 'ally');
      }
    },
    hp(id) { return call('readMobs').find((m) => m.id === id)?.health ?? null; },
    str() { return call('readString'); },
    // The world frozen for the whole spec, Math.random pinned (no crit). One long burst: stacking never extends a
    // freeze past its own start + the asked span, so it is asked once.
    freeze() {
      store().triggerHitstop(600000);
      window.__stringRandom = window.__stringRandom || Math.random;
      Math.random = () => 0.999;
    },
    thaw() {
      H.killHostiles(40);
      if (window.__stringRandom) Math.random = window.__stringRandom;
      window.useGameStore.setState({ hitstopUntil: performance.now() });
    },
    // A fresh moss brute 2.2 m dead ahead and a zombie 2.0 m at 60 degrees right of the view axis.
    async stage() {
      window.useGameStore.setState({ isAlive: true, playerHealth: store().maxHealth });
      H.killHostiles(40);
      H.setView(H.yaw, 0);
      const c = cam().position, f = fwdOf(H.yaw), r = rightOf(H.yaw);
      const at = (dx, dz) => ({ x: c.x + dx, z: c.z + dz });
      const b = at(f.x * 2.2, f.z * 2.2);
      const k = Math.cos(Math.PI / 3), s = Math.sin(Math.PI / 3);
      const z = at((k * f.x + s * r.x) * 2.0, (k * f.z + s * r.z) * 2.0);
      const before = new Set(call('readMobs').map((m) => m.id));
      store().spawnMob(b.x, b.z, 'moss_brute', H.floorAt(b.x, b.z));
      const mid = new Set(call('readMobs').map((m) => m.id));
      store().spawnMob(z.x, z.z, 'zombie', H.floorAt(z.x, z.z));
      await H.frames(3);
      const brute = call('readMobs').find((m) => !before.has(m.id) && m.type === 'moss_brute');
      const zombie = call('readMobs').find((m) => !mid.has(m.id) && m.type === 'zombie');
      if (!brute || !zombie) return { why: `SETUP: the stage did not spawn a brute and a zombie (${!!brute}, ${!!zombie})` };
      const off = (m) => {
        const dx = m.x - c.x, dz = m.z - c.z, l = Math.hypot(dx, dz);
        return { dist: +l.toFixed(2), deg: +((Math.acos((dx * f.x + dz * f.z) / l) * 180) / Math.PI).toFixed(1) };
      };
      const ob = off(brute), oz = off(zombie);
      if (!(ob.deg < 10 && ob.dist < 3)) return { why: `SETUP: the brute is not dead ahead in reach — ${JSON.stringify(ob)}` };
      if (!(oz.deg > 52 && oz.deg < 68 && oz.dist < 3)) return { why: `SETUP: the zombie is not 60 degrees off-axis in reach — ${JSON.stringify(oz)}` };
      const left = store().hitstopUntil - performance.now();
      if (left < 30000) return { why: `SETUP: the freeze has ${Math.round(left)} ms left` };
      return { brute: brute.id, zombie: zombie.id, ob, oz };
    },
    // One click through the real window listeners; returns its stamp from the capture listener.
    click() {
      const opts = { button: 0, bubbles: true, cancelable: true };
      window.dispatchEvent(new MouseEvent('mousedown', opts));
      window.dispatchEvent(new MouseEvent('mouseup', opts));
      return window.__clicks[window.__clicks.length - 1];
    },
    // Wait until a swing newer than `prevAt` has fired, or the deadline readyAt + max(300, 3 x median frame).
    async swingAfter(prevAt) {
      const s0 = H.str();
      const deadline = Math.max(performance.now(), s0.readyAt) + Math.max(300, 3 * H.median);
      while (H.str().lastSwingAt <= prevAt && performance.now() < deadline) await frame();
      const s = H.str();
      return { fired: s.lastSwingAt > prevAt, at: s.lastSwingAt, step: s.lastSwingStep, last: s.last };
    },
    // Wait the string's window and the finisher recovery out.
    async rest() { await H.sleepUntil(performance.now() + 1200); },
  };
  window.__stringSpec = H;
}

test.describe('melee string', () => {
  test.setTimeout(480000);

  test('the third hit is a 1.5x finisher that sweeps 140 degrees; the window, the buffer, the dodge and the heavy shape it', async ({ page }) => {
    await page.addInitScript(installStringHelpers);
    await bootDev(page);
    await startPlayActive(page);
    await page.waitForFunction(() => window.__craftyTest?.call('readMobs') && window.__threeCamera && window.GameMethods?.damageMob
      && window.useGameStore.getState().spawnMob && window.useGameStore.getState().getMobFloor, null, { timeout: 60000 })
      .catch((e) => { throw new Error(`SETUP: the mob hooks, camera and spawner never came up — ${e.message}`); });
    const hasHook = await page.evaluate(() => { try { return !!window.__craftyTest.call('readString'); } catch { return false; } });
    expect(hasHook, 'the light string is not wired into the running game: App.jsx registers no readString hook').toBe(true);
    await page.evaluate(async () => {
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      while (Date.now() - (window.useGameStore.getState()._spawnTime || 0) < 5500) await frame();
    });
    const median = await page.evaluate(() => window.__stringSpec.frameInterval(30));
    console.log(`melee-string: median frame interval: ${median} ms`);
    await page.mouse.move(640, 400);
    await page.evaluate(() => window.__stringSpec.freeze());

    try {
      // CASE 1: clicks at 0, 350, 700 — the third is the finisher, and only it reaches the zombie 60 degrees off-axis.
      const c1 = await page.evaluate(async () => {
        const H = window.__stringSpec;
        const st = await H.stage();
        if (st.why) return st;
        const b0 = H.hp(st.brute), z0 = H.hp(st.zombie);
        const t0 = H.click();
        const s1 = await H.swingAfter(t0 - 1);
        const b1 = H.hp(st.brute), z1 = H.hp(st.zombie);
        await H.sleepUntil(t0 + 350);
        const t2 = H.click();
        const s2 = await H.swingAfter(s1.at);
        const b2 = H.hp(st.brute), z2 = H.hp(st.zombie);
        await H.sleepUntil(t0 + 700);
        const t3 = H.click();
        const s3 = await H.swingAfter(s2.at);
        const b3 = H.hp(st.brute), z3 = H.hp(st.zombie);
        return { st, s1, s2, s3, gap2: t2 - t0, gap3: t3 - s2.at, d: [b0 - b1, b1 - b2, b2 - b3], zd: [z0 - z1, z1 - z2, z2 - z3], last: H.str().last };
      });
      expect(c1.why, c1.why).toBeUndefined();
      expect(c1.s1.fired && c1.s2.fired, `SETUP: case 1: a light swing never fired — ${JSON.stringify(c1)}`).toBe(true);
      expect(c1.gap2 >= 100 && c1.gap2 <= WINDOW, `SETUP: case 1: click 2 came ${Math.round(c1.gap2)} ms after click 1, outside [100, 650]`).toBe(true);
      expect(c1.gap3 >= 100 && c1.gap3 <= WINDOW, `SETUP: case 1: click 3 came ${Math.round(c1.gap3)} ms after step 2 fired, outside [100, 650]`).toBe(true);
      expect(c1.s3.fired, `the third click fired no swing — ${JSON.stringify(c1)}`).toBe(true);
      expect(c1.d[0], `the first swing dealt nothing to the brute dead ahead — ${JSON.stringify(c1)}`).toBeGreaterThan(0);
      expect(c1.d[1], `steps 1 and 2 dealt different damage — ${JSON.stringify(c1.d)}`).toBe(c1.d[0]);
      expect(c1.d[2], `the third hit is not a ${FINISHER_MULT}x finisher: ${JSON.stringify(c1.d)} (steps ${c1.s1.step}, ${c1.s2.step}, ${c1.s3.step})`).toBe(Math.round(c1.d[0] * FINISHER_MULT));
      expect(c1.zd[0] + c1.zd[1], `a light swing hit the zombie 60 degrees off-axis — ${JSON.stringify(c1.zd)}`).toBe(0);
      expect(c1.zd[2], `the finisher's 140 degree sweep missed the mob 60 degrees off-axis — ${JSON.stringify(c1.zd)} ${JSON.stringify(c1.st.oz)}`).toBeGreaterThan(0);
      expect(c1.last, 'the string did not restart after the finisher').toBe(0);

      // CASE 2 (control): clicks at 0, 800, 1600 — every gap past the window, so no finisher.
      await page.evaluate(() => window.__stringSpec.rest());
      const c2 = await page.evaluate(async () => {
        const H = window.__stringSpec;
        const st = await H.stage();
        if (st.why) return st;
        const b0 = H.hp(st.brute), z0 = H.hp(st.zombie);
        const t = [H.click()];
        const s1 = await H.swingAfter(t[0] - 1);
        const b1 = H.hp(st.brute);
        await H.sleepUntil(t[0] + 800);
        t.push(H.click());
        const s2 = await H.swingAfter(s1.at);
        const b2 = H.hp(st.brute);
        await H.sleepUntil(t[0] + 1600);
        t.push(H.click());
        const s3 = await H.swingAfter(s2.at);
        const b3 = H.hp(st.brute), z3 = H.hp(st.zombie);
        return { st, steps: [s1.step, s2.step, s3.step], fired: s1.fired && s2.fired && s3.fired, gaps: [s2.at - s1.at, s3.at - s2.at], d: [b0 - b1, b1 - b2, b2 - b3], zd: z0 - z3 };
      });
      expect(c2.why, c2.why).toBeUndefined();
      expect(c2.fired, `SETUP: case 2: a click fired no swing — ${JSON.stringify(c2)}`).toBe(true);
      expect(c2.gaps.every((g) => g > WINDOW), `SETUP: case 2: a gap was inside the window — ${JSON.stringify(c2.gaps)}`).toBe(true);
      expect(c2.d[2], `three clicks 800 ms apart made a finisher — ${JSON.stringify(c2)}`).toBe(c2.d[0]);
      expect(c2.zd, `three clicks 800 ms apart reached the zombie off-axis — ${JSON.stringify(c2)}`).toBe(0);

      // CASE 3: the buffer. Clicks at 0 and 200: the second is buffered and fires as step 2 when the cooldown ends.
      // Control: clicks at 0 and 20, which is dropped.
      await page.evaluate(() => window.__stringSpec.rest());
      const c3 = await page.evaluate(async () => {
        const H = window.__stringSpec;
        const st = await H.stage();
        if (st.why) return st;
        const b0 = H.hp(st.brute);
        const t0 = H.click();
        const s1 = await H.swingAfter(t0 - 1);
        const b1 = H.hp(st.brute);
        await H.sleepUntil(t0 + 200);
        const t2 = H.click();
        const buffered = H.str().buffered; // in the same task as the click
        const s2 = await H.swingAfter(s1.at);
        const b2 = H.hp(st.brute);
        return { st, gap: t2 - t0, buffered, s2, last: H.str().last, d1: b0 - b1, total: b0 - b2 };
      });
      expect(c3.why, c3.why).toBeUndefined();
      expect(c3.gap >= 100 && c3.gap < 300, `SETUP: case 3: the second click came ${Math.round(c3.gap)} ms after the first, outside [100, 300)`).toBe(true);
      expect(c3.buffered, `a click with ${Math.round(300 - c3.gap)} ms of cooldown left was not buffered — ${JSON.stringify(c3)}`).toBe(true);
      expect(c3.s2.fired && c3.last === 2, `the buffered click never fired as step 2 — ${JSON.stringify(c3)}`).toBe(true);
      expect(c3.total, `the brute was not hit twice — ${JSON.stringify(c3)}`).toBe(2 * c3.d1);
      await page.evaluate(() => window.__stringSpec.rest());
      const c3c = await page.evaluate(async () => {
        const H = window.__stringSpec;
        const st = await H.stage();
        if (st.why) return st;
        const b0 = H.hp(st.brute);
        const t0 = H.click();
        const s1 = await H.swingAfter(t0 - 1);
        const b1 = H.hp(st.brute);
        await H.sleepUntil(t0 + 20);
        const t2 = H.click();
        const buffered = H.str().buffered;
        const s2 = await H.swingAfter(s1.at); // waits out the same deadline a buffered fire would get
        return { st, gap: t2 - t0, buffered, fired2: s2.fired, d1: b0 - b1, total: b0 - H.hp(st.brute) };
      });
      expect(c3c.why, c3c.why).toBeUndefined();
      expect(c3c.gap > 0 && c3c.gap < 100, `SETUP: case 3 control: the second click came ${Math.round(c3c.gap)} ms after the first, outside (0, 100)`).toBe(true);
      expect(c3c.buffered, `a click with ${Math.round(300 - c3c.gap)} ms of cooldown left was buffered`).toBe(false);
      expect(c3c.total, `a dropped click still hit — ${JSON.stringify(c3c)}`).toBe(c3c.d1);

      // CASE 4: cancel into dodge. Clicks at 0 and 350, Shift at 600; the third click lands past the undodged window
      // and inside the dodged one, so it is the finisher only if the dodge kept the string alive.
      await page.evaluate(() => window.__stringSpec.rest());
      const c4 = await page.evaluate(async () => {
        const H = window.__stringSpec;
        const call = (n) => window.__craftyTest.call(n);
        const st = await H.stage();
        if (st.why) return st;
        const b0 = H.hp(st.brute);
        const t0 = H.click();
        const s1 = await H.swingAfter(t0 - 1);
        const b1 = H.hp(st.brute);
        await H.sleepUntil(t0 + 350);
        H.click();
        const s2 = await H.swingAfter(s1.at);
        await H.sleepUntil(t0 + 600);
        // The dodge's start, stamped independently of the string: the 'swing' sound the dodge site plays.
        const store = window.useGameStore;
        const real = store.getState().playSpatialSound;
        let dodgeAt = 0;
        store.setState({ playSpatialSound: (name, ...rest) => { if (name === 'swing' && !dodgeAt) dodgeAt = performance.now(); return real?.(name, ...rest); } });
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', bubbles: true }));
        const armed = call('readIntents').dodge === true;
        for (let i = 0; i < 30 && !dodgeAt; i++) await new Promise((r) => requestAnimationFrame(r));
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft', bubbles: true }));
        store.setState({ playSpatialSound: real });
        if (!dodgeAt) return { why: `SETUP: case 4: the dodge never started (armed ${armed}) — ${JSON.stringify(H.str())}` };
        const at3 = Math.max(dodgeAt + 400, s2.at + 700);
        await H.sleepUntil(at3);
        const b2 = H.hp(st.brute);
        const t3 = H.click();
        const s3 = await H.swingAfter(s2.at);
        return { st, s2, s3, dodgeAt, t3, sinceStep2: dodgeAt - s2.at, d1: b0 - b1, d3: b2 - H.hp(st.brute), cancelAt: H.str().cancelAt };
      });
      expect(c4.why, c4.why).toBeUndefined();
      expect(c4.s2.step, `SETUP: case 4: the second click was not step 2 — ${JSON.stringify(c4)}`).toBe(2);
      expect(c4.sinceStep2 <= WINDOW, `SETUP: case 4: the dodge started ${Math.round(c4.sinceStep2)} ms after step 2, after its window had lapsed`).toBe(true);
      expect(c4.t3 - c4.s2.at > WINDOW, 'SETUP: case 4: the third click is inside the undodged window').toBe(true);
      expect(c4.s3.fired, `the click after the dodge fired no swing — ${JSON.stringify(c4)}`).toBe(true);
      expect(c4.d3, `a dodge mid-string did not keep it alive: the third hit dealt ${c4.d3}, step ${c4.s3.step} — ${JSON.stringify(c4)}`).toBe(Math.round(c4.d1 * FINISHER_MULT));

      // CASE 5: a heavy ends the string. Click at 0; at 150 a HELD press (it buffers, fires as step 2, and the hold
      // starts); release at +750 (the heavy); a click 10 ms later must not be a finisher on the heavy's heels.
      await page.evaluate(() => window.__stringSpec.rest());
      const c5 = await page.evaluate(async () => {
        const H = window.__stringSpec;
        const st = await H.stage();
        if (st.why) return st;
        const opts = { button: 0, bubbles: true, cancelable: true };
        const t0 = H.click();
        const s1 = await H.swingAfter(t0 - 1);
        await H.sleepUntil(t0 + 150);
        window.dispatchEvent(new MouseEvent('mousedown', opts));
        const holdAt = window.__clicks[window.__clicks.length - 1];
        const s2 = await H.swingAfter(s1.at);
        await H.sleepUntil(holdAt + 750);
        const bh = H.hp(st.brute);
        window.dispatchEvent(new MouseEvent('mouseup', opts));
        const releaseAt = performance.now();
        const heavy = bh - H.hp(st.brute);
        await H.sleepUntil(releaseAt + 10);
        const b0 = H.hp(st.brute);
        const tc = H.click();
        const sc = await H.swingAfter(s2.at);
        const after = b0 - H.hp(st.brute);
        await H.sleepUntil(releaseAt + 400);
        const tl = H.click();
        const sl = await H.swingAfter(Math.max(s2.at, sc.at));
        return { st, s1, s2, held: releaseAt - holdAt, heavy, clickSinceStep2: tc - s2.at, sc, after, sl, late: tl - releaseAt };
      });
      expect(c5.why, c5.why).toBeUndefined();
      expect(c5.s2.fired && c5.s2.step === 2, `SETUP: case 5: the held press did not fire as step 2 — ${JSON.stringify(c5)}`).toBe(true);
      expect(c5.held >= HEAVY_FULL_MS, `SETUP: case 5: the hold lasted ${Math.round(c5.held)} ms, under ${HEAVY_FULL_MS}`).toBe(true);
      expect(c5.heavy, `SETUP: case 5: the release threw no heavy — ${JSON.stringify(c5)}`).toBeGreaterThan(0);
      // Only inside step 2's window could the click be a finisher at all: past it, the case cannot see S6.
      expect(c5.clickSinceStep2 <= WINDOW, `SETUP: case 5: the click after the heavy came ${Math.round(c5.clickSinceStep2)} ms after step 2, past its window`).toBe(true);
      expect(c5.sc.fired && c5.sc.step === 3, `a finisher landed on the heavy's heels — ${JSON.stringify(c5)}`).toBe(false);
      expect(c5.after, `the click 10 ms after the heavy hit the brute — ${JSON.stringify(c5)}`).toBe(0);
      expect(c5.sl.fired && c5.sl.step === 1, `the click 400 ms after the heavy did not swing step 1 — ${JSON.stringify(c5)}`).toBe(true);

      // CASE 6: the finisher click routes to attack. Only the zombie 60 degrees off-axis; clicks 1 and 2 at level
      // pitch, then the view pitched down until the crosshair meets ground within reach, and click 3.
      await page.evaluate(() => window.__stringSpec.rest());
      const c6 = await page.evaluate(async () => {
        const H = window.__stringSpec;
        const st = await H.stage();
        if (st.why) return st;
        window.GameMethods.damageMob(st.brute, 99999, 'physical', 'ally');
        let pitch = null;
        for (let p = -0.3; p >= -1.45; p -= 0.05) {
          H.setView(H.yaw, p);
          const hit = window.GameMethods.castBuildRay?.();
          if (hit && Number.isFinite(hit.toi)) { pitch = p; break; }
        }
        H.setView(H.yaw, 0);
        await H.frames(2);
        if (pitch === null) return { why: 'SETUP: case 6: no downward pitch put ground within the build reach' };
        const z0 = H.hp(st.zombie);
        const t0 = H.click();
        const s1 = await H.swingAfter(t0 - 1);
        await H.sleepUntil(t0 + 350);
        H.click();
        const s2 = await H.swingAfter(s1.at);
        const z2 = H.hp(st.zombie);
        H.setView(H.yaw, pitch);
        await H.frames(1);
        const ground = window.GameMethods.castBuildRay?.();
        await H.sleepUntil(Math.max(performance.now(), s2.at + 350));
        const t3 = H.click();
        const s3 = await H.swingAfter(s2.at);
        H.setView(H.yaw, 0);
        return { st, pitch: +pitch.toFixed(2), s1, s2, s3, gap3: t3 - s2.at, ground: ground ? +ground.toi.toFixed(2) : null, z12: z0 - z2, z3: z2 - H.hp(st.zombie) };
      });
      expect(c6.why, c6.why).toBeUndefined();
      expect(c6.s1.fired && c6.s2.fired && c6.s2.step === 2, `SETUP: case 6: clicks 1 and 2 at level pitch did not both swing (routed elsewhere) — ${JSON.stringify(c6)}`).toBe(true);
      expect(c6.z12, `SETUP: case 6: a light swing hit the off-axis zombie — ${JSON.stringify(c6)}`).toBe(0);
      expect(c6.ground !== null, `SETUP: case 6: the pitched view meets no ground — ${JSON.stringify(c6)}`).toBe(true);
      expect(c6.gap3 >= 100 && c6.gap3 <= WINDOW, `SETUP: case 6: click 3 came ${Math.round(c6.gap3)} ms after step 2, outside [100, 650]`).toBe(true);
      expect(c6.z3, `the finisher click mined a block instead of sweeping the off-axis husk — ${JSON.stringify(c6)}`).toBeGreaterThan(0);
    } finally {
      await page.evaluate(() => window.__stringSpec?.thaw()).catch(() => {});
    }
  });
});
