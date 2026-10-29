import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';
import { HEAVY_HOLD_MS, HEAVY_CHARGE_MS, HEAVY_MULT } from '../../src/game/heavyAttack.js';
import { COOLDOWN_SEC } from '../../src/game/beastTransform.js';
import { foldVerbMods } from '../../src/game/verbMods.js';
import { TALENT_LIMITS } from '../../src/game/talentTree.js';
import { TRANSFORM_CAM_SEC } from '../../src/game/transformCam.js';

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
//   J5 (R9.3) releaseHeavy ignores which input holds the charge -> "a T tapped during the mouse hold ended its charge"
//   J6 (R9.2) the beast-form gate dropped from the mouse press -> "a BEAST-form hold threw ... on release"
//      RE-MEASURED 2026-10-27, and the first receipt did not hold: against the REAL-mouse beast hold this case used to
//      make, J6 stayed GREEN (form [true,true], release 0, held 2690 ms) — frames ran inside the hold and the per-frame
//      cancel in a form dropped the charge before the release. With the in-page hold (no frame inside it): RED,
//      "a BEAST-form hold threw 18 on release", form [true,true]. Unmutated: green, release 0.
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
      const gy = s.getMobFloor ? s.getMobFloor(gx, gz, cam.position.y - 1.6) : null;
      window.__heavySpawn = { x: gx, y: gy, z: gz }; // the beast phase's fresh brute stands here, whatever became of this one
      s.spawnMob(gx, gz, 'moss_brute', gy);
      // FREEZE AT ONCE, and pin the crit roll, for the whole measurement. The first draft waited 600 ms for the zombie
      // to settle first; it walked into the player in that time (0.29 m, straight below the cone) and even the tap
      // missed — a setup race that read as a failed swing.
      window.__heavyRandom = Math.random;
      Math.random = () => 0.999;
      s.triggerHitstop(120000); // long enough for every phase below; each asserts it still holds
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
      // `mid` is re-pointed (window.__heavyMob) when the beast phase swaps in a fresh brute; `form` is read on the event.
      window.__heavyMob = mid;
      const log = (ev) => () => {
        const m = window.__craftyTest.call('readMobs').find((e) => e.id === window.__heavyMob);
        window.__heavyLog.push({ ev, t: performance.now(), hp: m?.health ?? null, form: window.useGameStore.getState().beastFormActive });
      };
      window.addEventListener('mousedown', log('down'), { capture: true });
      window.addEventListener('mouseup', log('up'), { capture: true });
    }, id);
    const read = () => page.evaluate((mid) => {
      const call = (n) => window.__craftyTest.call(n);
      const cur = window.__heavyMob ?? mid; // the beast phase swaps in a fresh brute
      const m = call('readMobs').find((e) => e.id === cur);
      const c = window.__threeCamera.position;
      const st = window.useGameStore.getState();
      return m
        ? { hp: m.health, staggered: m.staggerUntil > call('worldNow'), dist: +Math.hypot(m.x - c.x, m.z - c.z).toFixed(2),
          dy: +(m.y - c.y).toFixed(2), active: call('readIntents').active, alive: st.isAlive, frozen: st.hitstopUntil > performance.now(),
          mob: [+m.x.toFixed(2), +m.z.toFixed(2)], cam: [+c.x.toFixed(2), +c.z.toFixed(2)] }
        : { hp: null, gone: true };
    }, id);
    // AIM, before every phase. The in-page holds below block the main thread for up to 0.8 s, and the frame after one
    // integrates that whole gap: the camera was measured wandering ~1 m and ~0.6 m in height across the phases, and
    // one run in three the cross phase's press then missed the cone (a SETUP failure, caught as one). The aim is set,
    // not inherited: the camera is turned to the current brute before each press.
    const aim = () => page.evaluate(() => {
      const m = window.__craftyTest.call('readMobs').find((e) => e.id === window.__heavyMob);
      if (m) window.__threeCamera.lookAt(m.x, m.y + 0.8, m.z);
    });
    // One hold of `ms`: down, wait, up — then the two event reads and the state 120 ms after the release.
    const hold = async (ms) => {
      await page.mouse.down();
      await page.waitForTimeout(ms);
      await page.mouse.up();
      await page.waitForTimeout(120);
      const after = await read();
      const [down, up] = await page.evaluate(() => window.__heavyLog.splice(0));
      return { press: down.hp - up.hp, release: up.hp - after.hp, heldMs: Math.round(up.t - down.t), after, form: [down.form, up.form] };
    };

    await page.mouse.move(640, 360);
    const r = { start: await read() };
    expect(r.start.dist > 0.8 && r.start.dist < 3.5, `SETUP: the brute is not in front, in reach — ${JSON.stringify(r.start)}`).toBe(true);
    // WARM-UP. The page's FIRST swing stalls the main thread (measured: a 490 ms hold read 2602 ms on the game's own
    // clock, the release handled two seconds late) — whatever the first hit initialises, it is not the charge under
    // test. So one quick click first, unmeasured.
    await aim();
    r.warm = await hold(40);
    await page.waitForTimeout(400); // past the light swing's 300 ms cooldown
    // The CONTROL: released half-way through the charge — past the light cooldown, not ready. THIS ONE IS HELD IN THE
    // PAGE, timed by a busy-wait on the game's own clock: under load the page draws a frame every few hundred ms and a
    // real mouse event waits for the main thread, so a real 490 ms hold read 1106 ms — a full charge — on a run where
    // the warm-up read 50. The window this control needs (past 300, short of 700) is narrower than that jitter. The
    // bounds are both reported: the press handler stamps its charge between t0 and t1, so the true hold lies in
    // [t2 - t1, t2 - t0]. The FULL hold below is the real mouse, and J3 proves that path reaches the listener.
    await aim();
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
    await aim();
    r.full = await hold(HEAVY_HOLD_MS + HEAVY_CHARGE_MS + 200);
    // R9.3 (review #8): T tapped DURING a mouse hold. Its keyup used to release the charge the MOUSE held (early: the
    // mouse's own release then threw nothing). And a T tapped LATE in the hold — as a real key lands under load —
    // swung its own light tap, whose 300 ms cooldown then silently ate the charged release (found by this case going
    // red intermittently WITH the R9.3 fix in: release 0). Held in the page, on the game's clock, so the late tap is
    // placed exactly: press at 0, T down and up at +600 ms, release at +820 ms (charged at 700).
    await page.waitForTimeout(400);
    // Health is read DIRECTLY around each dispatch: for an event dispatched AT window, the capture-phase log listener
    // was measured running AFTER the game's own handler (a correct heavy read as "press 60, release 0").
    await aim();
    r.cross = await page.evaluate(() => {
      const hp = () => window.__craftyTest.call('readMobs').find((e) => e.id === window.__heavyMob)?.health ?? null;
      const opts = { button: 0, bubbles: true, cancelable: true };
      const spin = (until) => { while (performance.now() < until) { /* the hold, on the clock the charge reads */ } };
      const h0 = hp(), t0 = performance.now();
      window.dispatchEvent(new MouseEvent('mousedown', opts));
      const h1 = hp();
      spin(t0 + 600);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyT', bubbles: true }));
      const h2 = hp();
      spin(t0 + 820);
      window.dispatchEvent(new MouseEvent('mouseup', opts));
      const h3 = hp();
      window.__heavyLog.splice(0);
      return { press: h0 - h1, tTap: h1 - h2, release: h2 - h3, heldMs: Math.round(performance.now() - t0) };
    });
    await page.waitForTimeout(120);
    r.crossAfter = await read();
    // R9.2 (review #8): a hold in a BEAST form. The heavy is the human sword's; a form's hold used to slow the walk,
    // tick "ready", and throw a free extra light swing on release. Now the release adds nothing.
    // The form is entered through the REAL roar (R held past the anticipation, a full ember bar, the talent): a
    // store-called enterBeastForm starts no transform timer, so the form ends on the first tick at which the canvas
    // clock reads past the form's length (at once, in a page that has run that long) and the hold tests the human sword.
    // A FRESH brute, frozen where the first stood: the first one is nearly spent, and the roar's burst lands on it.
    r.beastId = await page.evaluate(({ mid, endurance }) => {
      const s = window.useGameStore.getState();
      const at = window.__heavySpawn;
      if (window.__craftyTest.call('readMobs').some((e) => e.id === mid)) window.GameMethods.damageMob(mid, 99999, 'physical', 'ally');
      const before = new Set(window.__craftyTest.call('readMobs').map((m) => m.id));
      s.spawnMob(at.x, at.z, 'moss_brute', at.y);
      const fresh = window.__craftyTest.call('readMobs').find((m) => !before.has(m.id));
      window.__heavyMob = fresh?.id ?? null;
      window.useGameStore.setState({
        ember: 100,
        unlockedTalents: { ...s.unlockedTalents, wildheart_roar: 1, wildheart_endurance: endurance },
      });
      return window.__heavyMob;
    }, { mid: id, endurance: TALENT_LIMITS.wildheart_endurance });
    // THE FORM IS ESTABLISHED, NOT RACED. A form lasts FORM_DURATION_SEC of REAL time (beastTransform.js, on R3F's
    // clock — the world freeze does not stop it), and the first version of this case spent that budget across the page
    // boundary: a fixed 3 s for the reveal camera, four round trips, then a REAL mouse hold, which CI stretched from
    // 0.9 s to 3-15 s. CI run 40503389065 (shard 2, all three attempts): the form was already over at the press twice
    // (the HUMAN sword then threw its heavy, correctly) and over before the release once — form [true,false], release 0.
    // So now: Primal Endurance at its talent limit (a real state, +9 s); the commit and the camera's hand-back awaited
    // IN THE PAGE, frame by frame; and the hold made in the page with no frame inside it. The form's timer ticks only in
    // the player's frame, so a form live at the press is live at the release by construction (both are still read).
    // A hold with no frame in it is also the STRICTEST case of the property: a frame can only DROP a charge (the
    // per-frame cancel in a form, Components.jsx), never start one, so here the press gate alone stands between the
    // hold and a free swing, and J6 cannot be masked by that cancel. The real-mouse path is the full hold's (J3).
    // R is HELD until the form commits, not for a fixed time: the transform needs the roar held across frames for its
    // 0.45 s anticipation, and a fixed 900 ms hold lost that race in 1 of 2 runs at this machine's ~3-5 fps (measured;
    // the human sword then threw its heavy, correctly — which is what a SETUP line must say, not the verdict).
    // ONE RE-ROAR, and only when the form's TIMER ran out during the setup (the page stalled past it): a second chance
    // at the precondition, never at the verdict. A form that ended EARLY is never retried — it fails at once, as a
    // defect. Every roar is reported (`roars`). The re-roar path was driven once by a probe (a 15 s stall injected after
    // the first commit, a 14 s form): classified "timer ran out (0-17931 ms, 14000 long)", re-roared, and measured.
    // Measured locally (load ~35-60, three runs) without a probe: the commit read stalled 0-4 s, the press landed 4-10 s
    // after the commit — inside the 23 s form, and inside 14 s too, once the fixed wait and the real-mouse hold are gone.
    await page.keyboard.down('r');
    r.beast = await page.evaluate(async ({ holdMs, camMs, roarMs, lastsMs, cooldownMs }) => {
      const st = () => window.useGameStore.getState();
      const frame = () => new Promise((res) => requestAnimationFrame(res));
      const drawn = () => window.__craftyTest.call('readFrameloop')?.frames ?? null; // R3F frames drawn (DEV hook)
      const key = (type) => window.dispatchEvent(new KeyboardEvent(type, { code: 'KeyR', bubbles: true }));
      const cam = window.__threeCamera;
      const brute = () => window.__craftyTest.call('readMobs').find((e) => e.id === window.__heavyMob);
      const t0 = performance.now();
      const since = (t) => Math.round(t - t0);
      const head = () => {
        const b = st().playerRigidBodyRef?.current?.translation?.();
        return b ? { across: +Math.hypot(cam.position.x - b.x, cam.position.z - b.z).toFixed(2), up: +(cam.position.y - b.y - 1.2).toFixed(2) } : null;
      };
      const roars = [];
      let h = null;
      for (let roar = 1; ; roar++) {
        if (roar > 1) {
          // Past the transform's cooldown (it starts at the exit, which was before we saw it), the bank refilled, R again.
          const until = performance.now() + cooldownMs;
          while (performance.now() < until) await frame();
          window.useGameStore.setState({ ember: 100 });
          key('keydown');
        }
        // 1. The roar commits. `human` and `formAt` bracket the commit: it landed between the two reads.
        const tr0 = performance.now();
        let human = tr0;
        while (!st().beastFormActive) {
          if (performance.now() - tr0 > roarMs) return { setup: `holding R for ${roarMs} ms never committed a beast form (roar ${roar})`, roars };
          human = performance.now();
          await frame();
        }
        const formAt = performance.now();
        const seenAt = [since(human), since(formAt)];
        key('keyup'); // in a form only a fresh PRESS of R does anything (it ends the form), so letting go is inert
        // 2. The reveal camera hands back the first-person view. It runs TRANSFORM_CAM_SEC of frame time from the roar's
        // START, which precedes the commit; then the head pose returns. The melee cone and the click ray both start at
        // the camera, so wait for both: the window past on the clock, and the camera at the body's head (within 1 m
        // across and 0.6 m in height — the freeze's hit shake moves it) on two R3F frames in a row.
        let streak = 0, seen = drawn(), live = formAt, ranOut = null;
        while (streak < 2) {
          await frame();
          const now = performance.now();
          if (!st().beastFormActive) {
            // How long it lasted, bracketed: it committed in (human, formAt] and ended in (live, now]. Both clocks are
            // real time (R3F's clock is a THREE.Clock), so ending before `lastsMs` could have run is a defect, not timing.
            const least = Math.round(live - formAt), most = Math.round(now - human);
            const lasted = `it lasted ${least}-${most} ms and is ${lastsMs} ms long`;
            if (most < lastsMs) return { early: `the beast form ended EARLY, before its timer could run out (${lasted}, roar ${roar})`, roars };
            ranOut = `the form's timer ran out before the camera came back to the head — the page stalled (${lasted})`;
            break;
          }
          live = now;
          if (now - formAt > 20000) return { setup: 'the camera never came back to the head within 20 s of the form', roars, head: head() };
          const d = drawn();
          if (d !== null && d === seen) continue; // no R3F frame since the last look
          seen = d;
          h = head();
          streak = now - formAt >= camMs && h && h.across < 1 && Math.abs(h.up) < 0.6 ? streak + 1 : 0;
        }
        roars.push({ seenAt, ranOut });
        if (!ranOut) break;
        if (roar >= 2) return { setup: ranOut, roars, head: head() };
      }
      // 3. The hold, in ONE task: aim, press, hold on the clock the charge reads (performance.now), release.
      const m = brute();
      if (!m) return { setup: 'the fresh brute was gone before the press', roars };
      const hp = () => brute()?.health ?? null;
      cam.lookAt(m.x, m.y + 0.8, m.z);
      const opts = { button: 0, bubbles: true, cancelable: true };
      const h0 = hp(), f0 = st().beastFormActive, tp = performance.now();
      window.dispatchEvent(new MouseEvent('mousedown', opts));
      const h1 = hp();
      while (performance.now() - tp < holdMs) { /* the hold — no frame runs inside it */ }
      const f1 = st().beastFormActive, tr = performance.now();
      window.dispatchEvent(new MouseEvent('mouseup', opts));
      const h2 = hp();
      window.__heavyLog.splice(0);
      return { press: h0 - h1, release: h1 - h2, form: [f0, f1], heldMs: Math.round(tr - tp), roars, pressAt: since(tp), head: h };
    }, { holdMs: HEAVY_HOLD_MS + HEAVY_CHARGE_MS + 200, camMs: TRANSFORM_CAM_SEC * 1000, roarMs: 20000,
      lastsMs: foldVerbMods({ wildheart_roar: 1, wildheart_endurance: TALENT_LIMITS.wildheart_endurance }, null).roarSec * 1000, cooldownMs: COOLDOWN_SEC * 1000 + 200 });
    await page.keyboard.up('r'); // Playwright's own key state; the roar intent is already down (inert either way)
    await page.waitForTimeout(120);
    r.beast.after = await read();
    await page.evaluate(() => { Math.random = window.__heavyRandom; });

    const where = JSON.stringify(r);
    const { half, full } = r;
    console.log(`[heavy-melee] half: press ${half.press} release ${half.release} (${half.heldMin}-${half.heldMax} ms) · full: press ${full.press} release ${full.release} (${full.heldMs} ms) · cross: ${JSON.stringify(r.cross)} @ ${JSON.stringify({ dist: r.crossAfter?.dist, dy: r.crossAfter?.dy, mob: r.crossAfter?.mob, cam: r.crossAfter?.cam })} · full@ ${JSON.stringify({ dist: full.after.dist, dy: full.after.dy, cam: full.after.cam })} · beast: ${JSON.stringify({ form: r.beast?.form, press: r.beast?.press, release: r.beast?.release, heldMs: r.beast?.heldMs, roars: r.beast?.roars, pressAt: r.beast?.pressAt, head: r.beast?.head, setup: r.beast?.setup, early: r.beast?.early })}`);
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
    // R9.3: the mouse's charge survived a T tapped inside it (the brute is staggered from the heavy above, so both of
    // these hits carry the riposte — the release is compared with the unstaggered tap as a floor, not an equality).
    expect(r.cross.press, `SETUP: the cross hold's press did not reach the brute — ${where}`).toBeGreaterThan(0);
    expect(r.cross.tTap, `a T tapped during a held charge swung a light tap (${r.cross.tTap}) — the arm is drawn back: ${where}`).toBe(0);
    expect(r.cross.release, `a T tapped during the mouse hold ended its charge, or its tap's cooldown ate the release (release ${r.cross.release}): ${where}`)
      .toBeGreaterThanOrEqual(HEAVY_MULT * half.press);
    // R9.2: in a beast form the hold charges nothing — the release adds NOTHING.
    expect(r.beastId, `SETUP: the fresh brute did not spawn — ${where}`).not.toBeNull();
    expect(r.beast.early, `${r.beast.early} — ${where}`).toBeUndefined();
    expect(r.beast.setup, `SETUP: ${r.beast.setup} — ${where}`).toBeUndefined();
    expect(r.beast.form, `SETUP: not in a beast form at the press AND the release (no frame ran between them) — ${where}`).toEqual([true, true]);
    expect(r.beast.after.frozen, `SETUP: the world freeze ran out before the beast hold ended — ${where}`).toBe(true);
    expect(r.beast.press, `SETUP: the form's press did not swing — ${where}`).toBeGreaterThan(0);
    expect(r.beast.release, `a BEAST-form hold threw ${r.beast.release} on release — a free extra swing: ${where}`).toBe(0);
  });
});
