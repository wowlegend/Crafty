import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';
import { HEAVY_HOLD_MS, HEAVY_CHARGE_MS, HEAVY_MULT } from '../../src/game/heavyAttack.js';

// HEAVY MELEE THROUGH A REAL MOUSE HOLD (plan 2026-09-23-crafty-heavy-melee, Task 4).
//
// tests/gates/heavy-melee-gates proves the state machine; the wiring in Components.jsx (the press on the attack verb,
// the release on mouseup, the 2x damage, the stagger) is only structural there. This drives it: a real
// page.mouse.down / up through the real window listener, on a moss brute in the camera's facing direction.
//
// WHAT IS MEASURED, AND WHY IN FOUR PARTS. Every press swings the light attack at once (the tap is never delayed),
// so a held press deals a tap on the way DOWN and the heavy on the way UP. Health is read after the press and after
// the release, separately, for a HALF-charged hold (the CONTROL) and a full one:
//   half-charged: press = a tap, release = nothing          full: press = a tap, release = HEAVY_MULT x a tap
// The ratio is release/press within the full hold, so whatever else damageMob multiplies, it multiplies both.
// The control is half-charged, not a quick click, ON PURPOSE: a quick click releases inside the light swing's 300 ms
// cooldown, so it would deal nothing on release even if the release ignored the charge — the cooldown, not the
// charge, would be passing the test. At half charge the cooldown has run out and only the charge can refuse.
//
// FIXED FOR THE MEASUREMENT: the WORLD is frozen (a hitstop), so the brute neither strikes (a hit taken cancels the
// charge, by design) nor is shoved out of reach by the first hit's knockback — the charge runs on real time, on
// purpose, so the freeze does not stretch it. And Math.random is pinned high for the swings: solveMeleeDamage rolls
// a crit (2x), which would make any single ratio 0.5x or 2x wrong at random.
//
// Mutation-Proof: by hand (cp backup, cmp-verified restore), each observed RED:
//   J1 Components.jsx: `heavy ? Math.round(dealt * HEAVY_MULT) : dealt` -> `dealt` (plausible-wrong: the heavy fires
//      but hits light) -> the ratio
//   J2 Components.jsx: the heavy's staggerUntil line removed -> "the heavy staggered nothing"
//   J3 Components.jsx: the mouseup listener not added -> "the held release dealt nothing"
//   J4 Components.jsx: the release throws the heavy whatever the charge (plausible-wrong) -> the half-charged CONTROL
test.describe('heavy melee', () => {
  test.setTimeout(240000);

  test('a charged release hits for HEAVY_MULT x the tap and staggers; a half-charged one (the control) throws nothing', async ({ page }) => {
    await bootDev(page);
    await startPlayActive(page);
    await page.waitForFunction(() => window.__craftyTest?.call('readMobs') && window.__threeCamera && window.GameMethods?.damageMob, null, { timeout: 60000 });

    // A brute 2.5 m along the camera's facing (the camera creeps toward it through the freeze — a held hit shake —
    // about a metre over four swings, measured; the brute itself does not move), spawn protection waited out, other hostiles cleared, the player alive.
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
      // A MOSS BRUTE, for its 220 health: a warm-up swing, the control's tap, the full hold's tap and the heavy come to
      // 5 taps' worth — a zombie's 100 would die on the heavy itself, and a dead mob staggers nothing.
      s.spawnMob(gx, gz, 'moss_brute', s.getMobFloor ? s.getMobFloor(gx, gz, cam.position.y - 1.6) : null);
      // FREEZE AT ONCE, and pin the crit roll, for the whole measurement. The first draft waited 600 ms for the zombie
      // to settle first; it walked into the player in that time (0.29 m, straight below the cone) and even the tap
      // missed — a setup race that read as a failed swing.
      window.__heavyRandom = Math.random;
      Math.random = () => 0.999;
      s.triggerHitstop(30000);
      const added = window.__craftyTest.call('readMobs').filter((m) => !before.has(m.id));
      return added.length === 1 ? added[0].id : null;
    });
    expect(id, 'SETUP: spawnMob did not add exactly one brute').not.toBeNull();
    // THE READS ARE TAKEN IN THE PAGE, ON THE EVENTS. A capture-phase listener on window runs before the game's own
    // (bubble-phase) handlers, so it reads the brute's health just BEFORE each press and each release, and stamps
    // the time on the same clock the charge uses (performance.now). The first draft read between the press and the
    // release through page.evaluate; on a loaded machine one round trip took over a second, and the "half-charged"
    // control was held 1348 ms — a full charge. Nothing crosses the page boundary inside a hold now.
    await page.evaluate((mid) => {
      const zombie = () => window.__craftyTest.call('readMobs').find((e) => e.id === mid);
      window.__heavyLog = [];
      const log = (ev) => () => window.__heavyLog.push({ ev, t: performance.now(), hp: zombie()?.health ?? null });
      window.addEventListener('mousedown', log('down'), { capture: true });
      window.addEventListener('mouseup', log('up'), { capture: true });
    }, id);
    const read = () => page.evaluate((mid) => {
      const call = (n) => window.__craftyTest.call(n);
      const m = call('readMobs').find((e) => e.id === mid);
      const c = window.__threeCamera.position;
      const st = window.useGameStore.getState();
      return m
        ? { hp: m.health, staggered: m.staggerUntil > call('worldNow'), dist: +Math.hypot(m.x - c.x, m.z - c.z).toFixed(2),
          dy: +(m.y - c.y).toFixed(2), active: call('readIntents').active, alive: st.isAlive, frozen: st.hitstopUntil > performance.now(),
          mob: [+m.x.toFixed(2), +m.z.toFixed(2)], cam: [+c.x.toFixed(2), +c.z.toFixed(2)] }
        : { hp: null, gone: true };
    }, id);
    // One hold of `ms`: down, wait, up — then the two event reads and the state 120 ms after the release.
    const hold = async (ms) => {
      await page.mouse.down();
      await page.waitForTimeout(ms);
      await page.mouse.up();
      await page.waitForTimeout(120);
      const after = await read();
      const [down, up] = await page.evaluate(() => window.__heavyLog.splice(0));
      return { press: down.hp - up.hp, release: up.hp - after.hp, heldMs: Math.round(up.t - down.t), after };
    };

    await page.mouse.move(640, 360);
    const r = { start: await read() };
    expect(r.start.dist > 0.8 && r.start.dist < 3.5, `SETUP: the brute is not in front, in reach — ${JSON.stringify(r.start)}`).toBe(true);
    // WARM-UP. The page's FIRST swing stalls the main thread (measured: a 490 ms hold read 2602 ms on the game's own
    // clock, the release handled two seconds late) — whatever the first hit initialises, it is not the charge under
    // test. So one quick click first, unmeasured.
    r.warm = await hold(40);
    await page.waitForTimeout(400); // past the light swing's 300 ms cooldown
    // The CONTROL: released half-way through the charge — past the light cooldown, not ready. THIS ONE IS HELD IN THE
    // PAGE, timed by a busy-wait on the game's own clock: under load the page draws a frame every few hundred ms and a
    // real mouse event waits for the main thread, so a real 490 ms hold read 1106 ms — a full charge — on a run where
    // the warm-up read 50. The window this control needs (past 300, short of 700) is narrower than that jitter. The
    // bounds are both reported: the press handler stamps its charge between t0 and t1, so the true hold lies in
    // [t2 - t1, t2 - t0]. The FULL hold below is the real mouse, and J3 proves that path reaches the listener.
    r.half = await page.evaluate(({ ms, mid }) => {
      const hp = () => window.__craftyTest.call('readMobs').find((e) => e.id === mid)?.health ?? null;
      const opts = { button: 0, bubbles: true, cancelable: true };
      const hp0 = hp(), t0 = performance.now();
      window.dispatchEvent(new MouseEvent('mousedown', opts));
      const t1 = performance.now(), hp1 = hp();
      while (performance.now() - t1 < ms) { /* the hold, on the clock the charge reads */ }
      const t2 = performance.now();
      window.dispatchEvent(new MouseEvent('mouseup', opts));
      window.__heavyLog.splice(0);
      return { press: hp0 - hp1, release: hp1 - hp(), heldMin: Math.round(t2 - t1), heldMax: Math.round(t2 - t0) };
    }, { ms: HEAVY_HOLD_MS + HEAVY_CHARGE_MS / 2, mid: id });
    await page.waitForTimeout(120);
    r.half.after = await read();
    await page.waitForTimeout(400); // past the light swing's 300 ms cooldown
    // The FULL hold: past the hold threshold and the whole charge.
    r.full = await hold(HEAVY_HOLD_MS + HEAVY_CHARGE_MS + 200);
    await page.evaluate(() => { Math.random = window.__heavyRandom; });

    const where = JSON.stringify(r);
    const { half, full } = r;
    console.log(`[heavy-melee] half: press ${half.press} release ${half.release} (${half.heldMin}-${half.heldMax} ms) · full: press ${full.press} release ${full.release} (${full.heldMs} ms) · ${where}`);
    expect(full.after.gone, `SETUP: the brute died or vanished mid-measurement — ${where}`).toBeUndefined();
    expect(full.after.active && full.after.alive, `SETUP: the input gate dropped or the player died — ${where}`).toBe(true);
    expect(full.after.frozen, `SETUP: the world freeze ran out mid-measurement (the brute was free to move and strike) — ${where}`).toBe(true);
    expect(half.heldMin > 300 && half.heldMax < HEAVY_HOLD_MS + HEAVY_CHARGE_MS,
      `SETUP: the half-charged hold lasted ${half.heldMin}-${half.heldMax} ms on the game's clock, not inside (300, ${HEAVY_HOLD_MS + HEAVY_CHARGE_MS}) — the control cannot discriminate: ${where}`).toBe(true);
    expect(half.press, `the press dealt no damage — it never reached the brute (aim, range, or the gate): ${where}`).toBeGreaterThan(0);
    expect(half.release, `a HALF-charged release dealt ${half.release} — the heavy fired without a full charge: ${where}`).toBe(0);
    expect(half.after.staggered, `a half-charged release staggered the brute: ${where}`).toBe(false);
    expect(full.press, `the full hold's press did not swing the tap at once: ${where}`).toBe(half.press);
    expect(full.release, `the charged release dealt nothing — the release never threw the heavy: ${where}`).toBeGreaterThan(0);
    expect(full.release / full.press, `the charged release dealt ${(full.release / full.press).toFixed(2)}x the tap: ${where}`).toBeCloseTo(HEAVY_MULT, 1);
    expect(full.after.staggered, `the heavy staggered nothing: ${where}`).toBe(true);
  });
});
