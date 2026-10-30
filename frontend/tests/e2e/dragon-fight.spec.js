import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';
import { STAGGER_MS, PERFECT_WINDOW_MS } from '../../src/game/perfectDodge.js';
import { roarFalloff, DRAGON_MOVES } from '../../src/game/dragonMoves.js';
import { UI } from '../../src/theme/tokens.js';

// THE DRAGON'S FIRST HALF, IN THE RUNNING GAME (DECISIONS 2026-10-30 items 123-126; task script
// docs/superpowers/plans/2026-10-30-crafty-w3b-dragon.md, B6). The unit tests prove the move machine, the record and the
// decals as pure parts; this drives them through the lazy dragon on the DEV server: the real move machine starts a
// bite and its decal shows; a real Shift press through the real listener parries it; a planted roar shoves the player
// once at 5 m, not at all at 11 m, and not at all under i-frames; a planted fireball bursts on the disc its windup
// showed, missing a player 4 m off it and hitting one on it; and hurl, a squad ally, an element zone and a fire spell's
// burn each hand the dragon's id to damageMob through their own systems, each window's HP change its source's alone.
//
// TIMING: THE WORLD IS FROZEN WHERE A WINDOW IS NARROW (the perfect-dodge spec's method, tests/e2e/perfect-dodge.spec.js).
// A loaded CI runner draws a frame every few hundred ms, so the last 220 ms of a 520 ms windup can pass between two
// frames. The dragon is woken inside a freeze and pinned (no flight step: a planted move resolves at a known distance);
// the natural bite is caught on the frame it starts and the world frozen again at once; the windups the presses answer
// are planted on the frozen clock (plantDragonMove, which starts them as the machine does, decal included). What stays
// real: the move machine, the Shift press and the dodge start, the strike and the shove, the systems that hit the
// dragon. DEV hooks: world/bossSystem.js (spawnDragonAt, readImpulses, requestZoneAt, requestHurlAt) and
// render/BossEntity.jsx (readDragon, pinDragon, plantDragonMove).
//
// Mutation-Proof: no local e2e (SSD-light); browser mutants run as mutant branches through CI. RUN and killed on all
// three attempts: K1 withBossTarget left out of the dodge start (Components.jsx) -> "the perfect press staggered
// nothing" (CI run 41033053640); R25-hurl HurlSystem back on the bare mob list -> "the hurled block never reached the
// dragon" (CI run 41033057486). Written to kill, NOT RUN (registry W3B:dragon-e2e-mutants-unrun):
//   M1 roarFalloff 1 past 9 m (game/dragonMoves.js) -> "a roar at 11 m shoved the player"
//   M2 BossEntity's ctx ignores isPlayerInvincible -> "a roar under i-frames shoved the player"
//   M3 a windup of 0 -> "the bite started with no windup" (it strikes on the frame it starts, so no windup is caught)
//   D1 the decal pool never shown (render/BossEntity.jsx showDecal a no-op) -> "no decal during the bite's windup"
//   F1 the launch aimed at the player rather than its mark (render/BossEntity.jsx) -> "a fireball damaged the player 4 m
//      off its disc"
//   R25 SquadAISystem / ElementZoneSystem / the spell's burn back on the bare mob list -> that path's case
// BLIND SPOT: the dragon's own flight into reach (pinned here), the phase-0 dive, the heavy chain through real mouse
// holds, the touch dodge, the slam (no case reaches it), and the lookbook's held tells (frames, not a gate).

test.describe('the dragon fight', () => {
  test.setTimeout(300000);

  /** Wait out spawn protection, clear the hostiles near the player, freeze the world, and wake the dragon `d` metres
   *  east of the player on the ground there, at `phase`, pinned. Returns the dragon's place or { why }. */
  const stage = (page, d, phase, { calm = false } = {}) => page.evaluate(async ({ d, phase, calm }) => {
    const call = (n, ...a) => window.__craftyTest.call(n, ...a);
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    while (Date.now() - (window.useGameStore.getState()._spawnTime || 0) < 5500) await frame();
    const s = window.useGameStore.getState();
    window.useGameStore.setState({ isAlive: true, playerHealth: s.maxHealth });
    s.setTimeOfDay?.(0.5);
    const cam = window.__threeCamera.position;
    for (const m of call('readMobs')) {
      if (!m.passive && Math.hypot(m.x - cam.x, m.z - cam.z) < 30) window.GameMethods.damageMob(m.id, 99999, 'physical', 'ally');
    }
    s.triggerHitstop(60000);
    const x = cam.x + d, z = cam.z;
    const g = s.getMobGroundLevel?.(x, z);
    const ground = Number.isFinite(g) ? g : cam.y - 1.62;
    call('spawnDragonAt', [x, ground + 0.8, z], { phase });
    const t0 = performance.now();
    let rec = null;
    while (performance.now() - t0 < 45000) {
      rec = call('readDragon');
      if (rec && rec.active) break;
      await frame();
    }
    if (!rec || !rec.active) return { why: `SETUP: the dragon's chunk never mounted a live record in 45 s (${JSON.stringify(rec)})` };
    call('pinDragon', { pinned: true, calm });
    if (!(window.useGameStore.getState().hitstopUntil - performance.now() > 5000)) return { why: 'SETUP: the freeze is nearly spent' };
    return { at: [x, ground + 0.8, z], ground };
  }, { d, phase, calm });

  /** A Shift press through the real listener, held until the controller consumes it. */
  const pressShift = (page) => page.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const call = (n) => window.__craftyTest.call(n);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', bubbles: true }));
    const armed = call('readIntents').dodge === true;
    let consumed = false;
    for (let i = 0; i < 30 && !consumed; i++) { await frame(); consumed = call('readIntents').dodge === false; }
    await frame();
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft', bubbles: true }));
    const r = call('readDragon');
    return { armed, consumed, alive: window.useGameStore.getState().isAlive, staggered: r.staggerUntil > r.now, windupUntil: r.windupUntil, now: r.now, staggerUntil: r.staggerUntil };
  });

  test('the dragon telegraphs its bite, and a perfect dodge in its last moments staggers it; an early press does not', async ({ page }) => {
    await bootDev(page);
    await startPlayActive(page);
    await page.waitForFunction(() => window.__craftyTest?.call('readMobs') && window.__threeCamera && window.GameMethods?.damageMob, null, { timeout: 60000 });
    const st = await stage(page, 3, 1);
    expect(st.why, st.why).toBeUndefined();

    // THE TELL, from the real machine: thaw, and on the frame the bite starts, freeze again and read it.
    const tell = await page.evaluate(async () => {
      const call = (n, ...a) => window.__craftyTest.call(n, ...a);
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const store = window.useGameStore;
      store.setState({ hitstopUntil: performance.now() });
      const t0 = performance.now();
      while (performance.now() - t0 < 15000) {
        await frame();
        const r = call('readDragon');
        if (r && r.move) {
          store.getState().triggerHitstop(60000);
          return { move: r.move, left: r.windupUntil - r.now, decal: r.decal };
        }
      }
      return { why: 'the dragon started no move in 15 s with the player 3 m away' };
    });
    expect(tell.why, tell.why).toBeUndefined();
    expect(tell.move, `the first move with the player 3 m off was not the bite: ${JSON.stringify(tell)}`).toBe('bite');
    expect(tell.left, `the bite started with no windup: ${JSON.stringify(tell)}`).toBeGreaterThan(0);
    expect(tell.left).toBeLessThanOrEqual(DRAGON_MOVES.bite.windupMs);
    expect(tell.decal, `no decal during the bite's windup: ${JSON.stringify(tell)}`).not.toBeNull();
    expect(tell.decal.shape).toBe('arc');
    expect(tell.decal.colour, 'the decal is not the danger red (a token read as undefined draws white)').toBe(UI.color.danger.toLowerCase());
    expect(tell.decal.radius).toBeCloseTo(DRAGON_MOVES.bite.reach, 3);

    // CONTROL: the same bite planted with more than the window left: an ordinary dodge, no stagger.
    const early = await page.evaluate((due) => window.__craftyTest.call('plantDragonMove', 'bite', due), PERFECT_WINDOW_MS + 110);
    expect(early).toBeGreaterThan(PERFECT_WINDOW_MS);
    const e = await pressShift(page);
    expect(e.armed, `Shift did not arm the dodge (input or the player) — ${JSON.stringify(e)}`).toBe(true);
    expect(e.consumed, `the controller never consumed the Shift press — ${JSON.stringify(e)}`).toBe(true);
    expect(e.staggered, `an EARLY press staggered the dragon — ${JSON.stringify(e)}`).toBe(false);

    // The dodge's cooldown runs on real time; the world stays frozen. The roll moved the player, so the dragon is woken
    // 3 m off again (it is pinned: only the hook moves it).
    await page.waitForTimeout(1500);
    const due = await page.evaluate(async () => {
      const call = (n, ...a) => window.__craftyTest.call(n, ...a);
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const s = window.useGameStore.getState();
      const cam = window.__threeCamera.position;
      const g = s.getMobGroundLevel?.(cam.x + 3, cam.z);
      call('spawnDragonAt', [cam.x + 3, (Number.isFinite(g) ? g : cam.y - 1.62) + 0.8, cam.z], { phase: 1 });
      for (let i = 0; i < 3; i++) await frame();
      return call('plantDragonMove', 'bite', 150);
    });
    expect(due).toBeLessThanOrEqual(PERFECT_WINDOW_MS);
    const p = await pressShift(page);
    expect(p.armed, `Shift did not arm the dodge — ${JSON.stringify(p)}`).toBe(true);
    expect(p.consumed, `the controller never consumed the Shift press — ${JSON.stringify(p)}`).toBe(true);
    expect(p.staggered, `the perfect press staggered nothing (${due} ms of windup left) — ${JSON.stringify(p)}`).toBe(true);
    expect(p.windupUntil, 'the parried bite is still winding up').toBe(0);
    // Staggered for exactly STAGGER_MS of world time from the press (the world is frozen, so the press and the read share
    // one world instant). Its end is read here, not sampled after the thaw: a loaded runner's first frame after a freeze
    // can come a second or more later, past the whole stagger (tests/e2e/perfect-dodge.spec.js measures it).
    expect(p.staggerUntil - p.now, `the stagger is not ${STAGGER_MS} ms long — ${JSON.stringify(p)}`).toBeCloseTo(STAGGER_MS, 3);

    // Thawed, the parried bite never lands, and the move machine has cancelled it.
    const after = await page.evaluate(async () => {
      const call = (n) => window.__craftyTest.call(n);
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const store = window.useGameStore;
      const bites = [];
      const real = store.getState().damagePlayer;
      store.setState({ damagePlayer: (amount, source, ...rest) => { if (/Bite/.test(String(source))) bites.push(amount); return real?.(amount, source, ...rest); } });
      store.setState({ hitstopUntil: performance.now() });
      const w0 = call('worldNow');
      while (call('worldNow') - w0 < 600) await frame();
      store.setState({ damagePlayer: real });
      const r = call('readDragon');
      return { bites, move: r.move, waited: call('worldNow') - w0 };
    });
    expect(after.waited, 'SETUP: the world never ran past the parried bite\'s due time').toBeGreaterThanOrEqual(150);
    expect(after.bites, 'the parried bite landed').toEqual([]);
    expect(after.move, 'the move machine did not cancel the parried bite').toBeNull();
  });

  test('the roar: its ring shows through the windup, one shove of 24 at 5 m, and nothing at 11 m or under i-frames', async ({ page }) => {
    await bootDev(page);
    await startPlayActive(page);
    await page.waitForFunction(() => window.__craftyTest?.call('readMobs') && window.__threeCamera && window.GameMethods?.damageMob, null, { timeout: 60000 });
    const st = await stage(page, 5, 1, { calm: true });
    expect(st.why, st.why).toBeUndefined();

    // `iframes`: the store's isPlayerInvincible answers true through the roar, as a roll's does through its window. A
    // stand-in for a real Shift, whose i-frames run on real time and cannot be lined up with a roar due on the frozen
    // world clock; what it still proves is that the dragon's frame loop reads the player's i-frames into the machine.
    const roarAt = (dist, { iframes = false } = {}) => page.evaluate(async ({ dist, iframes }) => {
      const call = (n, ...a) => window.__craftyTest.call(n, ...a);
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const store = window.useGameStore;
      const cam = window.__threeCamera.position;
      if (!(store.getState().hitstopUntil > performance.now())) store.getState().triggerHitstop(60000);
      // The player moves on real time through the freeze: a shove from an earlier roar is still carrying them. Wait
      // until they stand still (5 s at most), so the dragon is woken `dist` from where they will be when it roars.
      for (let still = 0, last = cam.clone(), t0 = performance.now(); still < 5 && performance.now() - t0 < 5000;) {
        await frame();
        still = cam.distanceTo(last) < 0.005 ? still + 1 : 0;
        last.copy(cam);
      }
      const g = store.getState().getMobGroundLevel?.(cam.x + dist, cam.z);
      call('spawnDragonAt', [cam.x + dist, (Number.isFinite(g) ? g : cam.y - 1.62) + 0.8, cam.z], { phase: 1 });
      for (let i = 0; i < 3; i++) await frame();
      call('clearImpulses');
      const due = call('plantDragonMove', 'roar', 150);
      await frame();
      const during = call('readDragon');
      // Where the player stands from the dragon when the roar is due: the shove itself moves them afterwards.
      const distance = Math.hypot(during.position.x - cam.x, during.position.z - cam.z);
      const hits = [];
      const real = store.getState().damagePlayer;
      const realInvincible = store.getState().isPlayerInvincible;
      store.setState({ damagePlayer: (amount, source, ...rest) => { hits.push({ amount, source: String(source) }); return real?.(amount, source, ...rest); } });
      if (iframes) store.setState({ isPlayerInvincible: () => true });
      const hp0 = store.getState().playerHealth;
      store.setState({ hitstopUntil: performance.now() });
      const w0 = call('worldNow'), t0 = performance.now();
      while (call('worldNow') - w0 < due + 400 && performance.now() - t0 < 20000) await frame();
      const invincibleHeld = store.getState().isPlayerInvincible?.() === true;
      store.setState({ damagePlayer: real });
      if (iframes) store.setState({ isPlayerInvincible: realInvincible });
      const r = call('readDragon');
      return { due, decal: during.decal, distance, impulses: call('readImpulses'), hits, hpLost: hp0 - store.getState().playerHealth,
        decalAfter: r.decal, waited: call('worldNow') - w0, invincibleHeld };
    }, { dist, iframes });

    const near = await roarAt(5);
    expect(near.decal, `no ring during the roar's windup: ${JSON.stringify(near)}`).not.toBeNull();
    expect(near.decal.shape).toBe('ring');
    expect(near.decal.radius).toBeCloseTo(DRAGON_MOVES.roar.radius, 3);
    expect(near.waited, `SETUP: the world never ran past the roar's due time: ${JSON.stringify(near)}`).toBeGreaterThanOrEqual(near.due);
    expect(near.distance, 'SETUP: the pinned dragon moved').toBeCloseTo(5, 0);
    const shoves = near.impulses.map((i) => Math.hypot(i.x, i.z));
    expect(shoves, `the roar at 5 m did not shove the player once: ${JSON.stringify(near)}`).toHaveLength(1);
    expect(shoves[0]).toBeCloseTo(36 * roarFalloff(near.distance), 0);
    expect(near.hits.filter((h) => /Shockwave/.test(h.source)), `the roar at 5 m did not strike: ${JSON.stringify(near.hits)}`).toHaveLength(1);
    expect(near.hpLost, 'the roar at 5 m took no health').toBeGreaterThan(0);
    expect(near.decalAfter, 'the ring outlived the roar').toBeNull();

    const far = await roarAt(11);
    expect(far.waited, `SETUP: the world never ran past the roar's due time: ${JSON.stringify(far)}`).toBeGreaterThanOrEqual(far.due);
    expect(far.distance, `SETUP: the player was not out of the roar's ${DRAGON_MOVES.roar.radius} m when it was due: ${JSON.stringify(far)}`)
      .toBeGreaterThan(DRAGON_MOVES.roar.radius + 1);
    expect(far.impulses, `a roar at 11 m shoved the player: ${JSON.stringify(far)}`).toEqual([]);
    expect(far.hits.filter((h) => /Shockwave/.test(h.source)), 'a roar at 11 m struck').toEqual([]);

    // The same roar at 5 m under i-frames: a whiff, with no shove and no strike (the 5 m case above is the presence).
    const rolled = await roarAt(5, { iframes: true });
    expect(rolled.waited, `SETUP: the world never ran past the roar's due time: ${JSON.stringify(rolled)}`).toBeGreaterThanOrEqual(rolled.due);
    expect(rolled.distance, 'SETUP: the pinned dragon moved').toBeCloseTo(5, 0);
    expect(rolled.invincibleHeld, 'SETUP: something replaced the stand-in i-frames before the roar was due').toBe(true);
    expect(rolled.impulses, `a roar under i-frames shoved the player: ${JSON.stringify(rolled)}`).toEqual([]);
    expect(rolled.hits.filter((h) => /Shockwave/.test(h.source)), `a roar under i-frames struck: ${JSON.stringify(rolled.hits)}`).toEqual([]);
  });

  test('the fireball bursts on the disc its windup showed: a player 4 m off it is untouched, a player on it is hit', async ({ page }) => {
    await bootDev(page);
    await startPlayActive(page);
    await page.waitForFunction(() => window.__craftyTest?.call('readMobs') && window.__threeCamera && window.GameMethods?.damageMob, null, { timeout: 60000 });
    const st = await stage(page, 8, 0, { calm: true });
    expect(st.why, st.why).toBeUndefined();

    // A fireball planted with its mark `off` metres north of where the player stands, then flown: where it burst, whether
    // it hit, and every fireball hit the player took meanwhile.
    const shot = (off) => page.evaluate(async ({ off }) => {
      const call = (n, ...a) => window.__craftyTest.call(n, ...a);
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const store = window.useGameStore;
      const cam = window.__threeCamera.position;
      if (!(store.getState().hitstopUntil > performance.now())) store.getState().triggerHitstop(60000);
      for (let still = 0, last = cam.clone(), t0 = performance.now(); still < 5 && performance.now() - t0 < 5000;) {
        await frame();
        still = cam.distanceTo(last) < 0.005 ? still + 1 : 0;
        last.copy(cam);
      }
      const n0 = call('readDragon').bursts.count;
      const aim = [cam.x, cam.z - off];
      const due = call('plantDragonMove', 'fireball', 150, { at: aim });
      await frame();
      const during = call('readDragon');
      const feet = [cam.x, cam.z];
      const hits = [];
      const real = store.getState().damagePlayer;
      store.setState({ damagePlayer: (amount, source, ...rest) => { hits.push({ amount, source: String(source) }); return real?.(amount, source, ...rest); } });
      store.setState({ hitstopUntil: performance.now() });
      const w0 = call('worldNow'), t0 = performance.now();
      let r = during;
      while (call('worldNow') - w0 < 8000 && performance.now() - t0 < 20000) {
        await frame();
        r = call('readDragon');
        if (r.bursts.count > n0) break;
      }
      store.setState({ damagePlayer: real });
      store.getState().triggerHitstop(60000);
      return { due, aim, feet, decal: during.decal, burst: r.bursts.count > n0 ? r.bursts.log[r.bursts.log.length - 1] : null,
        fireballHits: hits.filter((h) => /Fireball/.test(h.source)), waited: call('worldNow') - w0 };
    }, { off });

    const miss = await shot(4);
    expect(miss.decal, `no disc during the fireball's windup: ${JSON.stringify(miss)}`).not.toBeNull();
    expect(miss.decal.shape).toBe('disc');
    expect(miss.decal.radius).toBeCloseTo(DRAGON_MOVES.fireball.radius, 3);
    expect(Math.hypot(miss.decal.at[0] - miss.aim[0], miss.decal.at[2] - miss.aim[1]), `the disc is not on the mark: ${JSON.stringify(miss)}`).toBeLessThan(0.05);
    expect(miss.burst, `SETUP: the fireball never burst in 8 s of world time: ${JSON.stringify(miss)}`).not.toBeNull();
    expect(Math.hypot(miss.burst.x - miss.aim[0], miss.burst.z - miss.aim[1]), `the fireball burst off its mark: ${JSON.stringify(miss)}`).toBeLessThan(0.05);
    expect(Math.hypot(miss.feet[0] - miss.aim[0], miss.feet[1] - miss.aim[1]), 'SETUP: the player was not 4 m off the mark').toBeCloseTo(4, 1);
    expect(miss.burst.hit, `the fireball hit a player 4 m off its disc: ${JSON.stringify(miss)}`).toBe(false);
    expect(miss.fireballHits, `a fireball damaged the player 4 m off its disc: ${JSON.stringify(miss)}`).toEqual([]);

    const hit = await shot(0);
    expect(hit.burst, `SETUP: the fireball never burst in 8 s of world time: ${JSON.stringify(hit)}`).not.toBeNull();
    expect(hit.burst.hit, `the fireball missed a player standing on its disc: ${JSON.stringify(hit)}`).toBe(true);
    expect(hit.fireballHits, `the fireball on its disc did not damage the player once: ${JSON.stringify(hit)}`).toHaveLength(1);
  });

  test('hurl, a squad ally, an element zone and a fire spell\'s burn each reach the dragon through damageMob and lower its HP', async ({ page }) => {
    await bootDev(page);
    await startPlayActive(page);
    await page.waitForFunction(() => window.__craftyTest?.call('readMobs') && window.__threeCamera && window.GameMethods?.damageMob, null, { timeout: 60000 });
    const st = await stage(page, 8, 1, { calm: true });
    expect(st.why, st.why).toBeUndefined();

    // Every call damageMob takes for the dragon, with its source, from here on: each system reads GameMethods.damageMob
    // at the call, so a wrapper sees them all. The HP is read from the store's mirror of the boss hook.
    const run = await page.evaluate(async ({ at }) => {
      const call = (n, ...a) => window.__craftyTest.call(n, ...a);
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const store = window.useGameStore;
      const GM = window.GameMethods;
      const real = GM.damageMob;
      const calls = [];
      GM.damageMob = (id, dmg, type, source = 'player', ...rest) => {
        const out = real(id, dmg, type, source, ...rest);
        if (id === 'shadow-dragon') calls.push({ dmg, source, live: !!out, t: call('worldNow') });
        return out;
      };
      const hp = () => store.getState().bossHealth;
      const waitWorld = async (ms) => { const w0 = call('worldNow'), t0 = performance.now(); while (call('worldNow') - w0 < ms && performance.now() - t0 < 30000) await frame(); };
      store.setState({ hitstopUntil: performance.now() });
      const hp0 = hp();
      await waitWorld(1000);
      const steady = hp();
      const out = { hp0, steady, phases: {} };
      // Each window keeps the calls made in it, and the live ones from any other source: an HP change is a source's only
      // when no other source hit the dragon in its window.
      const mark = async (name, sources, act, ms) => {
        const before = hp(), n0 = calls.length;
        await act();
        await waitWorld(ms);
        const own = calls.slice(n0);
        out.phases[name] = { before, after: hp(), calls: own, others: own.filter((c) => c.live && !sources.includes(c.source)) };
      };
      // Wait until `source` has not hit the dragon for `quietMs` of world time (at most `maxMs`): a burn ticks for its
      // duration and a zone for its ttl, past the window that started them.
      const settle = async (source, quietMs, maxMs) => {
        const w0 = call('worldNow'), t0 = performance.now();
        while (call('worldNow') - w0 < maxMs && performance.now() - t0 < 30000) {
          const last = calls.filter((c) => c.source === source).at(-1);
          if (!last || call('worldNow') - last.t >= quietMs) return true;
          await frame();
        }
        return false;
      };
      const cam = window.__threeCamera;
      // HURL: a block thrown from the eye at the dragon, the way the voidhand throws it.
      await mark('hurl', ['player'], () => call('requestHurlAt', [cam.position.x, at[1] + 0.4, cam.position.z], [1, 0, 0]), 1500);
      // BURN: a fireball cast at the dragon through the store's castSpell (what the F key and the mouse call), the camera
      // turned to face it; its direct hit, then its burn's ticks through damageMob.
      cam.rotation.order = 'YXZ';
      cam.rotation.set(0, -Math.PI / 2, 0);
      cam.updateMatrixWorld();
      store.getState().setMana?.(store.getState().maxMana);
      await mark('burn', ['player', 'player-dot'], () => { out.cast = store.getState().castSpell?.('fireball') === true; }, 5500);
      out.burnSettled = await settle('player-dot', 2500, 15000);
      // ZONE: a burning zone painted under the dragon, as an imbued cast's impact paints one.
      await mark('zone', ['hazard'], () => call('requestZoneAt', [at[0], at[1] - 0.8, at[2]], 'burning'), 3000);
      out.zoneSettled = await settle('hazard', 2500, 15000);
      // ALLY: a zombie bound into the squad beside the dragon.
      await mark('ally', ['ally'], async () => {
        const s = store.getState();
        const before = new Set(call('readMobs').map((m) => m.id));
        s.spawnMob(at[0], at[2] + 3, 'zombie', s.getMobFloor ? s.getMobFloor(at[0], at[2] + 3, at[1]) : null);
        const added = call('readMobs').find((m) => !before.has(m.id));
        out.allyBound = added ? !!GM.captureMob?.(added.id) : false;
      }, 4000);
      GM.damageMob = real;
      out.end = hp();
      return out;
    }, { at: st.at });

    expect(run.steady, `SETUP: the calm, pinned dragon lost health with nothing hitting it: ${JSON.stringify(run)}`).toBe(run.hp0);
    const of = (name, source) => run.phases[name].calls.filter((c) => c.source === source && c.live);
    expect(of('hurl', 'player').length, `the hurled block never reached the dragon: ${JSON.stringify(run.phases.hurl)}`).toBeGreaterThanOrEqual(1);
    expect(run.phases.hurl.after, 'the hurl did not lower its HP').toBeLessThan(run.phases.hurl.before);
    expect(run.cast, 'SETUP: castSpell refused the fireball').toBe(true);
    expect(of('burn', 'player-dot').length, `the fireball's burn never ticked on the dragon: ${JSON.stringify(run.phases.burn)}`).toBeGreaterThanOrEqual(2);
    expect(run.phases.burn.after, 'the cast and its burn did not lower its HP').toBeLessThan(run.phases.burn.before);
    expect(run.burnSettled, `SETUP: the burn still ticked 15 s on: ${JSON.stringify(run.phases.burn)}`).toBe(true);
    expect(of('zone', 'hazard').length, `the burning zone never reached the dragon: ${JSON.stringify(run.phases.zone)}`).toBeGreaterThanOrEqual(1);
    expect(run.phases.zone.others, `another source hit the dragon in the zone's window: ${JSON.stringify(run.phases.zone.others)}`).toEqual([]);
    expect(run.phases.zone.after, 'the zone did not lower its HP').toBeLessThan(run.phases.zone.before);
    expect(run.zoneSettled, `SETUP: the zone still ticked 15 s on: ${JSON.stringify(run.phases.zone)}`).toBe(true);
    expect(run.allyBound, 'SETUP: the zombie could not be bound into the squad').toBe(true);
    expect(of('ally', 'ally').length, `the ally never struck the dragon: ${JSON.stringify(run.phases.ally)}`).toBeGreaterThanOrEqual(1);
    expect(run.phases.ally.others, `another source hit the dragon in the ally's window: ${JSON.stringify(run.phases.ally.others)}`).toEqual([]);
    expect(run.phases.ally.after, 'the ally did not lower its HP').toBeLessThan(run.phases.ally.before);
  });
});
