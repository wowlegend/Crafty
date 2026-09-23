import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';
import { PERFECT_WINDOW_MS, STAGGER_MS, RIPOSTE_MULT } from '../../src/game/perfectDodge.js';

// THE PERFECT DODGE, THROUGH A REAL SHIFT PRESS (plan 2026-09-23-crafty-perfect-dodge, Task 4).
//
// tests/gates/perfect-dodge-gates proves the window, the worker's stagger and the in-flight filter, and pins the
// dodge-start, riposte and pose wiring by source shape — the weak kind. This drives the running game: a real
// zombie winding up at the player, a real KeyboardEvent through the real listener, the real dodge start in the
// player controller, the real AI worker holding the strike, and a real damageMob riposte.
//
// TIMING: THE WINDUP IS PLANTED, ON A FROZEN CLOCK. The window is the last 220 ms of a 380 ms windup, and a loaded CI
// runner draws a frame every few hundred ms — so a natural windup is visible there for one frame or none. Two CI runs
// failed on exactly that: the first spec timed its press frame-by-frame (35822535594), the second froze on any live
// windup and pressed if the frozen due was in phase, and on CI found an in-phase windup in 4 tries in 90 s while the
// zombie walked onto the player (35830093253). Reproduced locally at this machine's own ~5 fps under load (23 tries,
// the early phase never) — NOT by CPU throttling: a frame count showed Chromium's CPU throttle leaves the frame rate
// unchanged here (26 vs 25 frames in 5 s; SwiftShader renders in the GPU process, which the throttle does not reach).
// So the world is frozen the moment the zombie spawns, and the `plantWindup` test hook (App.jsx) gives it the state the
// worker itself holds mid-windup — aggro, off cooldown, due in N world ms. Every field rides the payload back to the
// real worker, which strikes when it expires unless the stagger stops it. What stays real: the Shift press through the
// listener, the dodge start in the controller reading the ECS, the worker honouring (or not) the stagger, damageMob's
// riposte. What does not: the worker STARTING the windup (tests/gates/attack-telegraph-gates drives that).
//
// Mutation-Proof: by hand on the planted-windup version (cp backup, cmp-verified restore), each observed RED:
//   K1 Components.jsx: applyPerfectDodge removed from the dodge start -> "the perfect press staggered nothing"
//   K2 perfectDodge.js: the window check dropped (every windup counts) -> the CONTROL: "an EARLY press staggered"
//   K3 CombatSystem.jsx: the riposte removed -> "a hit on the staggered zombie dealt 1.00x"
// NOT CAUGHT HERE, by design: K4, ai.worker.js ignoring the stagger. It SURVIVES this spec: since R8.1 the main
// thread's holdStagger zeroes a staggered mob's windup on every reply, and strikesToApply drops its strikes — three
// layers, and from the running game only the first one that fails is visible. tests/gates/perfect-dodge-gates drives
// the REAL worker and kills K4 (mutate.sh, RED). `rewound` below still catches the worker AND holdStagger both broken.
test.describe('perfect dodge', () => {
  test.setTimeout(240000);

  // A zombie of our own, 1.6 m off the player, every other hostile within 24 m removed (they would hit the
  // player and blur whose strike landed), the player alive and full.
  const stage = (page) => page.evaluate(async () => {
    // SPAWN PROTECTION: damagePlayer drops every hit for 5 s after spawn. A strike landing inside it reads exactly
    // like one the stagger cancelled — the control caught a run where it did. Wait it out.
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    while (Date.now() - (window.useGameStore.getState()._spawnTime || 0) < 5500) await frame();
    const s = window.useGameStore.getState();
    window.useGameStore.setState({ isAlive: true, playerHealth: s.maxHealth });
    s.setTimeOfDay?.(0.5);
    const cam = window.__threeCamera.position;
    for (const m of window.__craftyTest.call('readMobs')) {
      if (!m.passive && Math.hypot(m.x - cam.x, m.z - cam.z) < 24) window.GameMethods.damageMob(m.id, 99999, 'physical', 'ally');
    }
    const before = new Set(window.__craftyTest.call('readMobs').map((m) => m.id));
    const gx = cam.x + 1.6, gz = cam.z;
    s.spawnMob(gx, gz, 'zombie', s.getMobFloor ? s.getMobFloor(gx, gz, cam.y - 1.6) : null);
    // FROZEN AT ONCE: the zombie cannot walk onto the player (CI saw it at 0.1 m). 12 s, because a burst cannot be
    // lengthened once it runs (game/hitstop.js stackHitstop) and a loaded runner spends seconds in the round trips
    // before the press — 4 s ran out there, caught by the SETUP check below.
    s.triggerHitstop(12000);
    const added = window.__craftyTest.call('readMobs').filter((m) => !before.has(m.id));
    return added.length === 1 ? added[0].id : null;
  });

  // Plant a windup due in the target phase on the frozen clock, press Shift through the real listener, hold it until
  // the controller consumes it, release, and let the freeze run out. Early = 330 ms left (outside the 220 ms window).
  const pressDuring = (page, id, phase) => page.evaluate(async ({ id, phase, due, STAGGER }) => {
    const call = (n, ...a) => window.__craftyTest.call(n, ...a);
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const zombie = () => call('readMobs').find((m) => m.id === id);
    const store = window.useGameStore;
    // Where everything stood — in every failure message, so the next red names its cause (CI run 35822535594 failed
    // three different ways and said why for none of them).
    const where = () => {
      const m = zombie(), c = window.__threeCamera.position, st = store.getState();
      return m ? { dist: +Math.hypot(m.x - c.x, m.z - c.z).toFixed(2), dy: +(m.y - c.y).toFixed(2), windup: m.windupUntil,
        stagger: m.staggerUntil, now: call('worldNow'), alive: st.isAlive, hp: st.playerHealth } : { zombie: 'gone' };
    };
    // Replies from the last tick before the freeze can still land and overwrite: wait them out, then plant.
    for (let i = 0; i < 3; i++) await frame();
    const planted = call('plantWindup', id, due);
    await frame();
    const z = zombie();
    const heldDue = z ? z.windupUntil - call('worldNow') : null;
    if (!z || !(Math.abs(heldDue - due) < 1)) return { why: `SETUP: the planted windup did not hold (planted ${planted}, read ${heldDue}) — ${JSON.stringify(where())}` };
    if (!(store.getState().hitstopUntil - performance.now() > 1000)) return { why: `SETUP: the freeze is nearly spent before the press — ${JSON.stringify(where())}` };
    const hp0 = store.getState().playerHealth;
    const dueAtPress = heldDue;
    // Did the controller START a roll, or did something else clear the intent? The dodge start plays its 'swing'
    // through the store's playSpatialSound — spied for the press. (The first draft read the invincibility callback,
    // which a slow frame sets and clears inside one frame: it reported "no roll" for a roll that staggered a zombie.)
    let started = false;
    const realSound = store.getState().playSpatialSound;
    store.setState({ playSpatialSound: (name, ...rest) => { if (name === 'swing') started = true; return realSound?.(name, ...rest); } });
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', bubbles: true }));
    const armed = call('readIntents').dodge === true; // a refused press also reads "not set" below — tell them apart
    let consumed = false;
    for (let i = 0; i < 20 && !consumed; i++) { await frame(); consumed = call('readIntents').dodge === false; }
    await frame();
    store.setState({ playSpatialSound: realSound });
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft', bubbles: true }));
    const after = zombie();
    const atPress = where();
    const staggeredAtPress = !!after && after.staggerUntil > call('worldNow');
    // THE RIPOSTE'S staggered hit, taken NOW — inside the freeze, so the stagger is certainly live. (Measured in a
    // later evaluate, a fast runner's world clock could spend the rest of the stagger in the round trip: CI run
    // 35822535594's first attempt.)
    let staggeredHit = null;
    if (staggeredAtPress && phase === 'perfect') {
      const h0 = after.health;
      window.GameMethods.damageMob(id, 10, 'physical', 'player');
      staggeredHit = h0 - zombie().health;
    }
    // The lowest health from the press until the strike would have landed: regen cannot hide a hit.
    // And whether the zombie wound up AGAIN while staggered: the worker's own part (the main thread's in-flight
    // filter drops a staggered mob's strike too, so a strike alone cannot show the worker honoured the stagger).
    let low = hp0, rewound = 0;
    const sample = () => {
      low = Math.min(low, store.getState().playerHealth);
      const m = zombie();
      if (m && m.windupUntil > 0 && m.staggerUntil > call('worldNow')) rewound++;
    };
    while (performance.now() < store.getState().hitstopUntil) { await frame(); sample(); } // the freeze runs out
    // After the freeze, a compact per-frame trace — [world ms since, windup left, distance, player hp] — so a strike that
    // never lands says whether the windup ran out, was cancelled, or the zombie left reach.
    // THE WINDOW: until just before the stagger would end (a staggered zombie cannot wind up again before STAGGER_MS, and
    // then needs a full windup), so it cannot catch a SECOND strike in the perfect case — and at a loaded runner's frame
    // rate the first strike lands one or two replies after its due: measured at 8x throttle, 408-888 world ms after the
    // freeze for a 330 ms due. It was 900 and the control failed intermittently there.
    const w0 = call('worldNow'), trace = [];
    while (call('worldNow') - w0 < STAGGER - 100) {
      await frame(); sample();
      const m = zombie(), c = window.__threeCamera.position, t = call('worldNow');
      if (trace.length < 24) trace.push(m ? [Math.round(t - w0), Math.round(m.windupUntil ? m.windupUntil - t : 0), +Math.hypot(m.x - c.x, m.z - c.z).toFixed(1), store.getState().playerHealth] : 'gone');
    }
    return { armed, consumed, started, dueAtPress, staggeredAtPress, staggeredHit, atPress, hpLost: hp0 - low, rewound, alive: store.getState().isAlive, trace };
  }, { id, phase, due: phase === 'early' ? PERFECT_WINDOW_MS + 110 : 120, STAGGER: STAGGER_MS });

  test('a press in the last moments of the windup staggers the zombie, its strike never lands, and a hit on it deals 1.5x', async ({ page }) => {
    await bootDev(page);
    await startPlayActive(page);
    await page.waitForFunction(() => window.__craftyTest?.call('readMobs') && window.__threeCamera && window.GameMethods?.damageMob, null, { timeout: 60000 });
    const id = await stage(page);
    expect(id, 'SETUP: spawnMob did not add exactly one zombie').not.toBeNull();

    const r = await pressDuring(page, id, 'perfect');
    expect(r.why, r.why).toBeUndefined();
    expect(r.armed, `Shift did not arm the dodge (input inactive or the player dead) — ${JSON.stringify(r)}`).toBe(true);
    expect(r.consumed, `the controller never consumed the Shift press — ${JSON.stringify(r)}`).toBe(true);
    expect(r.started, `the intent was cleared but no roll started (something else consumed it) — ${JSON.stringify(r)}`).toBe(true);
    expect(r.staggeredAtPress, `the perfect press staggered nothing (${r.dueAtPress.toFixed(0)} ms of windup left at the press) — ${JSON.stringify(r.atPress)}`).toBe(true);
    expect(r.hpLost, `the staggered zombie's strike landed anyway: the player lost ${r.hpLost}`).toBe(0);
    expect(r.rewound, `the staggered zombie wound up again in ${r.rewound} samples — the worker ignored the stagger`).toBe(0);

    // THE RIPOSTE, measured as a RATIO against an unstaggered hit on the same zombie — whatever else damageMob
    // multiplies, it multiplies both. The staggered hit was taken inside the freeze; the control after it ends.
    const plain = await page.evaluate(async ({ id, STAGGER }) => {
      const call = (n) => window.__craftyTest.call(n);
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const zombie = () => call('readMobs').find((m) => m.id === id);
      while (zombie() && zombie().staggerUntil > call('worldNow')) await frame();
      const w0 = call('worldNow');
      while (call('worldNow') - w0 < 100) await frame();
      const z = zombie();
      if (!z) return null;
      window.GameMethods.damageMob(id, 10, 'physical', 'player');
      return z.health - zombie().health;
    }, { id, STAGGER: STAGGER_MS });
    expect(r.staggeredHit, 'the staggered hit dealt no damage').toBeGreaterThan(0);
    expect(plain, 'the control hit dealt no damage (or the zombie was gone) — the ratio would mean nothing').toBeGreaterThan(0);
    expect(r.staggeredHit / plain, `a hit on the staggered zombie dealt ${(r.staggeredHit / plain).toFixed(2)}x`).toBeCloseTo(RIPOSTE_MULT, 2);
  });

  test('CONTROL: the same press made EARLY in the windup is an ordinary dodge — no stagger', async ({ page }) => {
    await bootDev(page);
    await startPlayActive(page);
    await page.waitForFunction(() => window.__craftyTest?.call('readMobs') && window.__threeCamera && window.GameMethods?.damageMob, null, { timeout: 60000 });
    const id = await stage(page);
    expect(id, 'SETUP: spawnMob did not add exactly one zombie').not.toBeNull();
    const r = await pressDuring(page, id, 'early');
    expect(r.why, r.why).toBeUndefined();
    expect(r.armed, `Shift did not arm the dodge — ${JSON.stringify(r)}`).toBe(true);
    expect(r.consumed, `the controller never consumed the Shift press — ${JSON.stringify(r)}`).toBe(true);
    expect(r.staggeredAtPress, `an EARLY press (${r.dueAtPress.toFixed(0)} ms of windup left) staggered the zombie`).toBe(false);
    // PRESENCE CONTROL for the perfect case's "its strike never lands": unstaggered, under the same freeze (which
    // holds the player's roll too, so distance cannot be why a strike misses), the same strike DOES land.
    expect(r.hpLost, `the unstaggered strike never landed either — "the strike never lands" above proves nothing: ${JSON.stringify(r)}`).toBeGreaterThan(0);
  });
});
