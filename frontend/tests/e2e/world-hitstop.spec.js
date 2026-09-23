import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';

// THE WORLD HOLDS ITS BREATH ON A HIT, AND THE SHOVE LANDS AFTER IT (EXTERNAL-BASELINE #3).
//
// Hitstop used to stop the PLAYER only. It now stops the world: the AI clock and the mob render damp read
// game/hitstop.js worldTimeScale. The unit gate (tests/gates/world-hitstop-gates) proves the rule and pins
// the wiring by source shape — the weak kind. This proves it in the RUNNING game, through the real
// AIWorkerSystem frame loop, which is the seam no unit test reaches.
//
// The defect this exists to catch has a specific shape. The knockback shove is a ONE-frame impulse that
// drainKnockback spends in full in whichever frame calls it. Drain it on a frozen frame and it is spent at
// zero length: the hit never pushes, and nothing errors. So a frozen frame must HOLD the impulse, and the
// first frame after the freeze must spend it.
//
// HOW IT SAMPLES, and why. Everything is measured INSIDE the page, one sample per rendered frame, in a
// single evaluate. Measured locally at load 20: one host-side page.evaluate round-trip took 3.5 s, so any
// timing built from host waits said nothing about which frames fell inside the freeze. The freeze length
// is sized from the page's own measured frame time (16 frames, floor 2.5 s), so a slow runner still renders
// several frozen frames; a real light hit freezes for 45 ms, which a 10 fps runner steps over entirely.
// Stretching one hit's freeze with a second triggerHitstop is itself the burst rule: one long beat is
// honoured whole (stackHitstop).
//
// Mutation-Proof: by hand against src/systems/AIWorkerSystem.jsx (cp backup, byte-verified restore), each
// observed RED for the reason named, not another:
//   E1 drainKnockback called on frozen frames too  -> "the shove was spent on a FROZEN frame"
//   E2 the AI clock accumulates through the freeze -> "the mob moved while the world was frozen"
//   E3 the hold never releases (ws > 1)            -> the presence control: "an UNFROZEN knockback was never spent"
test.describe('world hitstop', () => {
  test.setTimeout(180000);

  // One evaluate: hit the mob (optionally under a freeze sized from the measured frame time), then read
  // it once per rendered frame while frozen and for `after` frames beyond. Returns the per-frame samples.
  const hitAndSample = (page, id, { freeze, after = 12 }) =>
    page.evaluate(async ({ mid, freeze, after }) => {
      const read = () => {
        const m = window.__craftyTest.call('readMobs').find((e) => e.id === mid);
        return m ? { knockback: m.knockback, x: m.x, z: m.z, t: performance.now() } : null;
      };
      const frame = () => new Promise((r) => requestAnimationFrame(() => r(performance.now())));
      let t = await frame();
      const t0 = t;
      for (let i = 0; i < 5; i++) t = await frame();
      const frameMs = (t - t0) / 5;
      const store = window.useGameStore;
      store.setState({ hitstopUntil: 0, hitstopStart: 0 });
      window.GameMethods.damageMob(mid, 1, 'physical', 'player');
      const stamped = read();
      let freezeMs = 0;
      if (freeze) {
        freezeMs = Math.min(30000, Math.max(2500, frameMs * 16));
        store.getState().triggerHitstop(freezeMs);
      }
      const until = store.getState().hitstopUntil;
      const frozen = [];
      while (freeze && performance.now() < until) {
        await frame();
        if (performance.now() < until) frozen.push(read());
      }
      const later = [];
      for (let i = 0; i < after; i++) { await frame(); later.push(read()); }
      return { frameMs, freezeMs, stamped, frozen, later };
    }, { mid: id, freeze, after });

  test('a hit HOLDS the knockback through the freeze, then spends it', async ({ page }) => {
    await bootDev(page);
    await startPlayActive(page);
    await page.evaluate(() => window.useGameStore.setState({ isAlive: true, playerHealth: window.useGameStore.getState().maxHealth }));

    // A zombie of our own, 4 units off the player. Identified by the id set it ADDS, not by position.
    const id = await page.evaluate(() => {
      const before = new Set(window.__craftyTest.call('readMobs').map((m) => m.id));
      const s = window.useGameStore.getState();
      s.spawnMob(s.playerPosition.x + 4, s.playerPosition.z, 'zombie');
      const added = window.__craftyTest.call('readMobs').filter((m) => !before.has(m.id));
      return added.length === 1 ? added[0].id : null;
    });
    expect(id, 'spawnMob did not add exactly one mob — the rest of this spec would read someone else').not.toBeNull();

    // PRESENCE CONTROL: with no freeze, a hit stamps a knockback and the next frames spend it. If this fails
    // the instrument cannot see a shove at all, and every "held" reading below would mean nothing.
    const free = await hitAndSample(page, id, { freeze: false });
    expect(free.stamped?.knockback, 'a player hit stamped no knockback — the presence control is blind').toBe(true);
    expect(free.later.some((m) => m && m.knockback === false),
      `an UNFROZEN knockback was never spent in ${free.later.length} frames — the drain itself is broken, not the hold`).toBe(true);

    // THE SUBJECT: the same hit, under a freeze.
    const held = await hitAndSample(page, id, { freeze: true });
    const where = `frame ${held.frameMs.toFixed(0)} ms, freeze ${held.freezeMs.toFixed(0)} ms, ${held.frozen.length} frozen frames`;
    expect(held.stamped?.knockback, `the frozen hit stamped no knockback (${where})`).toBe(true);
    expect(held.frozen.length, `fewer than 3 frames rendered inside the freeze — nothing was measured (${where})`).toBeGreaterThanOrEqual(3);
    expect(held.frozen.every((m) => m && m.knockback === true),
      `the shove was spent on a FROZEN frame, at zero length: the hit never pushes (${where})`).toBe(true);
    // From the second frozen frame on: a worker reply already in flight when the freeze began may land once.
    const [first, ...rest] = held.frozen.slice(1);
    const drift = Math.max(...rest.map((m) => Math.hypot(m.x - first.x, m.z - first.z)));
    expect(drift, `the mob moved while the world was frozen (${where})`).toBeLessThan(1e-6);
    expect(held.later.some((m) => m && m.knockback === false),
      `the freeze ended and the held knockback was never spent — the hit is lost after all (${where})`).toBe(true);
  });

  // R2.6: the freeze used to reach only the consumers edited to opt in (mobs, AI clock, boss). XP orbs were not
  // one of them, which makes them the honest second subject: a kill scatters orbs whose `age` advances only
  // when XPOrbSystem's frame loop steps them. Frozen, it must hold; after, it must move (or the orb is
  // collected, which also takes steps).
  //
  // Mutation-Proof: by hand against src/systems/XPOrbSystem.jsx (cp backup, byte-verified restore):
  //   E4 the orb step reads its raw frame delta again -> "an orb aged while the world was frozen"
  test('a kill\'s XP orbs hang through the freeze, then move', async ({ page }) => {
    await bootDev(page);
    await startPlayActive(page);
    await page.evaluate(() => window.useGameStore.setState({ isAlive: true, playerHealth: window.useGameStore.getState().maxHealth }));

    const r = await page.evaluate(async () => {
      const frame = () => new Promise((res) => requestAnimationFrame(() => res(performance.now())));
      const orbs = () => window.__craftyTest.call('readOrbs');
      let t = await frame();
      const t0 = t;
      for (let i = 0; i < 5; i++) t = await frame();
      const frameMs = (t - t0) / 5;
      const store = window.useGameStore;
      // Kill a mob of our own and return the ids of the orbs its death ADDED.
      const killForOrbs = () => {
        const beforeMobs = new Set(window.__craftyTest.call('readMobs').map((m) => m.id));
        const s = store.getState();
        s.spawnMob(s.playerPosition.x + 6, s.playerPosition.z, 'zombie');
        const mob = window.__craftyTest.call('readMobs').find((m) => !beforeMobs.has(m.id));
        if (!mob) return null;
        const beforeOrbs = new Set(orbs().map((o) => o.id));
        window.GameMethods.damageMob(mob.id, 99999, 'physical', 'player');
        return new Set(orbs().filter((o) => !beforeOrbs.has(o.id)).map((o) => o.id));
      };
      const ages = (ids) => orbs().filter((o) => ids.has(o.id)).map((o) => o.age);

      // PRESENCE CONTROL: no freeze of ours (the kill's own light hitstop passes in a few frames) -> they age.
      store.setState({ hitstopUntil: 0, hitstopStart: 0 });
      const freeIds = killForOrbs();
      const freeStart = freeIds ? ages(freeIds) : [];
      for (let i = 0; i < 20; i++) await frame();
      const freeEnd = freeIds ? ages(freeIds) : [];

      // THE SUBJECT: the same kill, then a freeze sized from the measured frame time.
      store.setState({ hitstopUntil: 0, hitstopStart: 0 });
      const ids = killForOrbs();
      const freezeMs = Math.min(30000, Math.max(2500, frameMs * 16));
      store.getState().triggerHitstop(freezeMs);
      const until = store.getState().hitstopUntil;
      const frozen = [];
      while (ids && performance.now() < until) {
        await frame();
        if (performance.now() < until) frozen.push(ages(ids));
      }
      const later = [];
      for (let i = 0; i < 12; i++) { await frame(); later.push(ages(ids)); }
      return { frameMs, freezeMs, freeCount: freeIds ? freeIds.size : -1, freeStart, freeEnd, count: ids ? ids.size : -1, frozen, later };
    });

    const where = `frame ${r.frameMs.toFixed(0)} ms, freeze ${r.freezeMs.toFixed(0)} ms, ${r.frozen.length} frozen frames, ${r.count} orbs`;
    expect(r.freeCount, 'the presence kill scattered no orbs — nothing below could be seen').toBeGreaterThan(0);
    expect(r.freeEnd.length === 0 || Math.max(...r.freeEnd) > Math.max(...r.freeStart),
      'unfrozen orbs never aged — the instrument cannot see an orb step at all').toBe(true);
    expect(r.count, `the frozen kill scattered no orbs (${where})`).toBeGreaterThan(0);
    expect(r.frozen.length, `fewer than 3 frames rendered inside the freeze (${where})`).toBeGreaterThanOrEqual(3);
    // From the second frozen frame on (the frame that triggered the freeze may already have stepped once).
    const [first, ...rest] = r.frozen.slice(1);
    for (const f of rest) expect(f, `an orb aged while the world was frozen (${where})`).toEqual(first);
    const last = r.later[r.later.length - 1];
    expect(last.length < first.length || Math.max(...last) > Math.max(...first),
      `the freeze ended and the orbs never moved again (${where})`).toBe(true);
  });
});
