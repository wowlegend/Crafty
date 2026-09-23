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
// TIMING, and why the world is frozen for the press. The window is the last 220 ms of a 380 ms windup; a loaded
// runner renders a frame every ~300 ms, and the dodge start consumes the press on the NEXT frame — so a press
// timed frame-by-frame lands after the strike, for a real player at that frame rate too. A hitstop freezes the
// WORLD clock and nothing else: `windupUntil - worldNow()` holds still across the frame that consumes the press,
// while the player controller (real time) runs. So the spec waits for the remaining windup to reach the target
// phase, freezes the world, presses, and lets the freeze run out. The CONTROL is the same sequence pressed EARLY.
//
// Mutation-Proof: by hand (cp backup, cmp-verified restore), each observed RED:
//   K1 Components.jsx: applyPerfectDodge removed from the dodge start -> "the perfect press staggered nothing"
//   K2 perfectDodge.js: the window check dropped (every windup counts) -> the CONTROL: "an EARLY press staggered"
//   K3 CombatSystem.jsx: the riposte removed -> "a hit on the staggered zombie dealt 1.00x"
//   K4 ai.worker.js: the stagger ignored -> "wound up again" — SURVIVED the first draft, which judged the worker
//      by the player's health: AIWorkerSystem's in-flight filter drops a staggered mob's strike as well, so the
//      worker's check is invisible to a strike-based assertion (redundancy, not a hole). The windup is its own mark.
test.describe('perfect dodge', () => {
  test.setTimeout(240000);

  // A zombie of our own, 1.6 m off the player, every other hostile within 24 m removed (they would hit the
  // player and blur whose strike landed), the player alive and full.
  const stage = (page) => page.evaluate(() => {
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
    const added = window.__craftyTest.call('readMobs').filter((m) => !before.has(m.id));
    return added.length === 1 ? added[0].id : null;
  });

  // Wait for the zombie's remaining windup to enter the target phase, freeze the world, press Shift through the
  // real listener, hold it until the controller consumes it, release, and let the freeze run out.
  const pressDuring = (page, id, phase) => page.evaluate(async ({ id, phase, WINDOW }) => {
    const call = (n) => window.__craftyTest.call(n);
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const zombie = () => call('readMobs').find((m) => m.id === id);
    const store = window.useGameStore;
    const t0 = performance.now();
    let z = null, due = 0;
    while (performance.now() - t0 < 30000) {
      await frame();
      const m = zombie();
      if (!m) return { why: 'the zombie is gone' };
      due = m.windupUntil - call('worldNow');
      const inPhase = phase === 'early' ? due > WINDOW + 60 : due > 30 && due <= WINDOW - 30;
      if (m.windupUntil > 0 && inPhase) { z = m; break; }
    }
    if (!z) return { why: `no windup reached the ${phase} phase in 30 s` };
    store.getState().triggerHitstop(1500);
    const hp0 = store.getState().playerHealth;
    const dueAtPress = z.windupUntil - call('worldNow');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', bubbles: true }));
    const armed = call('readIntents').dodge === true; // a refused press also reads "not set" below — tell them apart
    let consumed = false;
    for (let i = 0; i < 20 && !consumed; i++) { await frame(); consumed = call('readIntents').dodge === false; }
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft', bubbles: true }));
    const after = zombie();
    const staggeredAtPress = !!after && after.staggerUntil > call('worldNow');
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
    const w0 = call('worldNow');
    while (call('worldNow') - w0 < 900) { await frame(); sample(); }
    return { armed, consumed, dueAtPress, staggeredAtPress, hpLost: hp0 - low, rewound, alive: store.getState().isAlive };
  }, { id, phase, WINDOW: PERFECT_WINDOW_MS });

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
    expect(r.staggeredAtPress, `the perfect press staggered nothing (${r.dueAtPress.toFixed(0)} ms of windup left at the press)`).toBe(true);
    expect(r.hpLost, `the staggered zombie's strike landed anyway: the player lost ${r.hpLost}`).toBe(0);
    expect(r.rewound, `the staggered zombie wound up again in ${r.rewound} samples — the worker ignored the stagger`).toBe(0);

    // THE RIPOSTE, measured as a RATIO against an unstaggered hit on the same zombie — whatever else damageMob
    // multiplies, it multiplies both. The staggered hit first (the stagger is live), the control after it ends.
    const ratio = await page.evaluate(async ({ id, STAGGER }) => {
      const call = (n) => window.__craftyTest.call(n);
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const hp = () => call('readMobs').find((m) => m.id === id)?.health;
      const z = call('readMobs').find((m) => m.id === id);
      if (!z || !(z.staggerUntil > call('worldNow'))) return { why: 'the stagger was over before the riposte could be measured' };
      const h0 = hp(); window.GameMethods.damageMob(id, 10, 'physical', 'player'); const staggered = h0 - hp();
      const w0 = call('worldNow');
      while (call('worldNow') - w0 < STAGGER + 200) await frame();
      const h1 = hp(); window.GameMethods.damageMob(id, 10, 'physical', 'player'); const plain = h1 - hp();
      return { staggered, plain };
    }, { id, STAGGER: STAGGER_MS });
    expect(ratio.why, ratio.why).toBeUndefined();
    expect(ratio.plain, 'the control hit dealt no damage — the ratio would mean nothing').toBeGreaterThan(0);
    expect(ratio.staggered / ratio.plain, `a hit on the staggered zombie dealt ${(ratio.staggered / ratio.plain).toFixed(2)}x`).toBeCloseTo(RIPOSTE_MULT, 2);
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
    expect(r.hpLost, 'the unstaggered strike never landed either — "the strike never lands" above proves nothing').toBeGreaterThan(0);
  });
});
