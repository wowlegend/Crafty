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
// timing built from host waits said nothing about which frames fell inside the freeze. A real light hit
// freezes for 45 ms, which a 10 fps runner steps over entirely, so each test freezes the world itself, with
// triggerHitstop — stretching one hit's freeze with a second triggerHitstop is itself the burst rule: one long
// beat is honoured whole (stackHitstop).
//
// THE FREEZE IS HELD FOR A FRAME COUNT, NOT A WALL-CLOCK WINDOW (2026-10-27). No window sized in advance can
// promise frames, because frames INSIDE the freeze are far slower than the ones measured before it: the hit's
// sparks and bloom are held at their peak, and a software renderer pays for that every frame. The window went
// 2500 ms (CI run 35845534213: 2 frames inside it, three attempts running) -> an 8000 ms floor -> CI run
// 40546819334: "2 frozen frames" inside 8000 ms, with 298 ms frames measured before the hit. A window stretched
// AHEAD of the longest frame seen was tried first and rejected on a simulation against the real stackHitstop: one
// 10 s frame after 1 s frames still outran it (2 frozen frames). So holdFreeze (below) opens the freeze as one long
// beat through the store's own action (triggerHitstop: stackHitstop honours one long beat whole, up to the cap) and
// ENDS it once both hold: HOLD_FRAMES frames have rendered inside it, and the old window has elapsed (16 measured
// frames, floor 8000 ms, cap 30000 ms) — so a fast runner sees the same ~8 s freeze it always did, and a slow one a
// longer one. It ends it by writing hitstopUntil = now: every reader (worldTimeScale, tickWorldClock, the player)
// compares that value with the clock and nothing else, so this IS the clock reaching the end of a timed freeze, and
// the next burst banks the span actually frozen. No frame length can make it lapse early, short of the 90 s cap.
// The assertions are unchanged (at least 3 frozen frames, compared from the second on); the hold aims one past
// that floor.
//
// Mutation-Proof: by hand against src/systems/AIWorkerSystem.jsx (cp backup, byte-verified restore), each
// observed RED for the reason named, not another:
//   E1 drainKnockback called on frozen frames too  -> "the shove was spent on a FROZEN frame"
//   E2 the AI clock accumulates through the freeze -> "the mob moved while the world was frozen"
//   E3 the hold never releases (ws > 1)            -> the presence control: "an UNFROZEN knockback was never spent"
// RE-PROVEN on the held freeze, 2026-10-27 (scripts/dev/mutate-e2e.sh's contract on a throwaway :4291 config, load
// 17-75 on 14 cores, 0.8-2.4 s frames before the hit, up to 10.6 s inside the freeze): identity survived 3/3; E1, E2,
// E4, E5 RED with the messages named; E3 as `if (delta < 0)` RED on the presence control as named. Written as
// `delta > 1` it is frame-rate dependent — a loaded machine renders frames over 1 s, so the drain still ran on some,
// and the post-freeze check caught it instead ("the held knockback was never spent") — so prove E3 as `delta < 0`.
// The flake itself, CONSTRUCTED rather than waited for: a page-side burner forcing 12 s frames inside the freeze
// read "fewer than 3 frames rendered inside the freeze (frame 1034 ms, freeze 16547 ms, 1 frozen frames)" on the
// old fixed window, and passed on the held freeze. (3 s frames did not reproduce it on a loaded box: its slow
// pre-hit frames had already grown the old window to 16 x frame.)
const HOLD_FRAMES = 4;

// Installed into the page (page functions run in the browser and cannot share a closure): freeze the world, call
// `read()` once per rendered frame while the freeze holds, and end the freeze once `need` frames have rendered
// inside it and `minMs` has passed. A frame counts only when the freeze is still in force AFTER it rendered.
const installHoldFreeze = (page) => page.evaluate(() => {
  window.__e2eHoldFreeze = async ({ read, need, frameMs, capMs = 90000 }) => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => r(performance.now())));
    const store = window.useGameStore;
    const minMs = Math.min(30000, Math.max(8000, frameMs * 16)); // the window the spec used to size in advance
    store.getState().triggerHitstop(capMs); // one long beat, honoured whole — ended below, never left to the cap
    const start = store.getState().hitstopStart;
    const frozen = [];
    let longest = 0, prev = performance.now();
    while (performance.now() < store.getState().hitstopUntil) {
      const t = await frame();
      longest = Math.max(longest, t - prev);
      prev = t;
      if (performance.now() >= store.getState().hitstopUntil) break;
      frozen.push(read());
      if (frozen.length >= need && performance.now() - start >= minMs) {
        store.setState({ hitstopUntil: performance.now() }); // the timed freeze's end, reached now
      }
    }
    return { frozen, minMs, freezeMs: store.getState().hitstopUntil - start, longest };
  };
});

test.describe('world hitstop', () => {
  // A held freeze can run long on a slow runner — that is its job — and test 1 already took 162 s of 180 on CI.
  test.setTimeout(240000);

  // One evaluate: hit the mob (optionally under a held freeze), then read it once per rendered frame while
  // frozen and for `after` frames beyond. Returns the per-frame samples.
  const hitAndSample = (page, id, { freeze, after = 12 }) =>
    page.evaluate(async ({ mid, freeze, after, need }) => {
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
      const held = freeze
        ? await window.__e2eHoldFreeze({ read, need, frameMs })
        : { frozen: [], minMs: 0, freezeMs: 0, longest: 0 };
      const later = [];
      for (let i = 0; i < after; i++) { await frame(); later.push(read()); }
      return { frameMs, stamped, later, ...held };
    }, { mid: id, freeze, after, need: HOLD_FRAMES });

  // The diagnosis every frozen-frame message carries: the frame rate before the hit, the freeze as held against
  // the window it would once have been, and the longest frame inside it.
  const freezeWhere = (r) => `frame ${r.frameMs.toFixed(0)} ms, freeze ${r.freezeMs.toFixed(0)} ms ` +
    `(min ${r.minMs.toFixed(0)} ms, longest frame ${r.longest.toFixed(0)} ms), ${r.frozen.length} frozen frames`;

  test('a hit HOLDS the knockback through the freeze, then spends it', async ({ page }) => {
    await bootDev(page);
    await startPlayActive(page);
    await installHoldFreeze(page);
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
    const where = freezeWhere(held);
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

  // R2.7: the WORLD clock — what the AI worker's timers, the windup telegraph and the dragon's attacks read —
  // must HOLD through a freeze and move again after it. A unit test drives the clock by hand; only the running
  // game proves the ticker is mounted and runs before its consumers.
  //
  // Mutation-Proof: by hand against src/GameScene.jsx (cp backup, byte-verified restore):
  //   E5 <WorldClockTicker /> unmounted -> "the world clock advanced during the freeze" (unticked, worldNow falls back
  //      to the wall clock — so it is the HOLD, not the presence control, that catches a missing ticker)
  test('the world clock holds through a freeze and moves after it', async ({ page }) => {
    await bootDev(page);
    await startPlayActive(page);
    await installHoldFreeze(page);
    const r = await page.evaluate(async (need) => {
      const frame = () => new Promise((res) => requestAnimationFrame(() => res(performance.now())));
      const wn = () => window.__craftyTest.call('worldNow');
      let t = await frame();
      const t0 = t;
      for (let i = 0; i < 5; i++) t = await frame();
      const frameMs = (t - t0) / 5;
      const store = window.useGameStore;
      store.setState({ hitstopUntil: 0, hitstopStart: 0 });
      const free0 = wn();
      for (let i = 0; i < 6; i++) await frame();
      const free1 = wn();
      const held = await window.__e2eHoldFreeze({ read: wn, need, frameMs });
      for (let i = 0; i < 6; i++) await frame();
      return { frameMs, free0, free1, after: wn(), ...held };
    }, HOLD_FRAMES);
    const where = freezeWhere(r);
    expect(r.free1 - r.free0, `the world clock never advanced unfrozen — the ticker is not running (${where})`).toBeGreaterThan(0);
    expect(r.frozen.length, `fewer than 3 frames inside the freeze (${where})`).toBeGreaterThanOrEqual(3);
    const [first, ...rest] = r.frozen.slice(1);
    for (const w of rest) expect(w, `the world clock advanced during the freeze (${where})`).toBe(first);
    expect(r.after, `the world clock did not move again after the freeze (${where})`).toBeGreaterThan(first);
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
    await installHoldFreeze(page);

    const r = await page.evaluate(async (need) => {
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

      // THE SUBJECT: the same kill, then a held freeze.
      store.setState({ hitstopUntil: 0, hitstopStart: 0 });
      const ids = killForOrbs();
      const held = ids
        ? await window.__e2eHoldFreeze({ read: () => ages(ids), need, frameMs })
        : { frozen: [], minMs: 0, freezeMs: 0, longest: 0 };
      const later = [];
      for (let i = 0; ids && i < 12; i++) { await frame(); later.push(ages(ids)); }
      return { frameMs, freeCount: freeIds ? freeIds.size : -1, freeStart, freeEnd, count: ids ? ids.size : -1, later, ...held };
    }, HOLD_FRAMES);

    const where = `${freezeWhere(r)}, ${r.count} orbs`;
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
