import { test, expect } from './_fixtures.js';
import { bootDev, startPlay, store } from './_boot.js';

// Gameplay-LOGIC flows driven through the REAL booted game store (not a mocked unit). These close
// the audit's biggest E2E gap: damage->death->respawn, XP->level, loot->equip, and the coin sink
// were proven only by isolated unit tests (or not at all) — never end-to-end in the running game.
test.beforeEach(async ({ page }) => {
  await bootDev(page);
  await startPlay(page);
});

test('XP grant levels the player up (and full-heals, per the documented design)', async ({ page }) => {
  const before = await store(page, () => {
    const s = window.useGameStore.getState();
    return { level: s.level };
  });
  const after = await store(page, () => {
    window.useGameStore.getState().grantXP(100000, 'e2e');
    const s = window.useGameStore.getState();
    return { level: s.level, health: Math.round(s.playerHealth), maxHealth: Math.round(s.maxHealth) };
  });
  expect(after.level).toBeGreaterThan(before.level);
  expect(after.health).toBe(after.maxHealth); // grantXP doubles as a full-heal (audit-noted behavior)
});

test('loot -> inventory -> equip wires through to the equipment slot', async ({ page }) => {
  // inventory is categorized (blocks/tools/magic); addToInventory lands items in `blocks`,
  // and equipItem consumes from any category + sets equipment[slot] (real slot is `weapon`).
  const res = await store(page, () => {
    const g = () => window.useGameStore.getState();
    g().addToInventory('Iron Sword', 1);
    const inInventory = (g().inventory.blocks['Iron Sword'] || 0) >= 1;
    g().equipItem('weapon', 'Iron Sword');
    return { inInventory, weapon: g().equipment?.weapon };
  });
  expect(res.inInventory).toBe(true);
  expect(res.weapon).toBe('Iron Sword');
});

test('coin sink: earning then spending adjusts the balance correctly', async ({ page }) => {
  const res = await store(page, () => {
    const g = () => window.useGameStore.getState();
    const start = g().coins;
    g().addCoins(100);
    const earned = g().coins;
    g().spendCoins(30);
    return { start, earned, after: g().coins };
  });
  expect(res.earned).toBe(res.start + 100);
  expect(res.after).toBe(res.start + 70);
});

test('soft-death + respawn: a lethal hit kills, respawn revives and KEEPS progression/loot/coins', async ({ page }) => {
  const res = await store(page, () => {
    const g = () => window.useGameStore.getState();
    // seed progression + loot + coins to prove respawn preserves them
    g().grantXP(5000, 'e2e');
    g().addToInventory('Iron Sword', 1);
    g().addCoins(42);
    const pre = { level: g().level, sword: g().inventory.blocks['Iron Sword'] || 0, coins: g().coins };
    // deterministically bypass the 5s spawn protection, then a lethal hit (a fresh attacker key has no cooldown)
    window.useGameStore.setState({ _spawnTime: 0 });
    g().damagePlayer(999999, 'test-lethal');
    const aliveAfterHit = g().isAlive;
    g().respawn();
    const r = g();
    return {
      pre,
      aliveAfterHit,
      alive: r.isAlive,
      health: Math.round(r.playerHealth),
      maxHealth: Math.round(r.maxHealth),
      level: r.level,
      sword: r.inventory.blocks['Iron Sword'] || 0,
      coins: r.coins,
    };
  });
  expect(res.aliveAfterHit).toBe(false); // the lethal hit registered death
  expect(res.alive).toBe(true); // respawn revived
  expect(res.health).toBe(res.maxHealth); // vitals restored
  expect(res.level).toBe(res.pre.level); // progression preserved
  expect(res.sword).toBe(res.pre.sword); // inventory preserved
  expect(res.coins).toBe(res.pre.coins); // coins preserved
});

// Chain lightning in the running game hops only onto live mobs, and each arc ends where its mob stands at the hop.
// The world is frozen (a hitstop) so the bolt hangs at the muzzle and the mobs hold still. Inside the bolt's own direct
// hit, the instant before the chain picks its targets, C (the mob nearest the strike after the one it hit) is killed and
// B is moved 2 m: the motion a mob mirror sampled up to 250 ms ago has not seen. The arc ends are read from the
// system's DEV record of what it drew; the positions they are judged against come from the ECS at each hop.
const chainLightningCase = async ({ page }) => {
  await page.waitForFunction(
    () => window.GameMethods?.damageMob && window.GameMethods?.checkMobCollision && window.__threeCamera
      && window.useGameStore.getState().castSpell && window.useGameStore.getState().spawnMob
      && window.__craftyTest.call('readChainArcs') !== undefined,
    null, { timeout: 60000 },
  ).catch(() => { throw new Error('SETUP: the magic, combat or spawner system never mounted'); });
  // Strict, unlike startPlay: terrain that streams in under the muzzle after the scene is planned ends the bolt.
  await page.waitForFunction(() => window.useGameStore.getState().isSpawnChunkLoaded === true, null, { timeout: 90000 })
    .catch(() => { throw new Error('SETUP: the spawn chunk never loaded'); });

  const r = await page.evaluate(async () => {
    const store = window.useGameStore;
    const s = store.getState();
    const GM = window.GameMethods;
    const call = (name) => window.__craftyTest.call(name);
    const frame = () => new Promise((res) => requestAnimationFrame(res));
    const cam = window.__threeCamera;
    const home = { x: cam.position.x, y: cam.position.y, z: cam.position.z };

    // The bolt must hang in open air at the muzzle; if its own ground test passes there it ends 'ground' on the first
    // frozen frame and never strikes. So the cast is made from 6 m over the loaded ground top, along a heading where
    // the bolt's ground test (projectileGrounded via floorUnderPoint) reads open air.
    const grounded = (x, y, z) => {
      const f = s.getMobFloor ? s.getMobFloor(x, z, y - 0.1, 0) : Infinity;
      const g = f === Infinity ? (s.getMobGroundLevel ? s.getMobGroundLevel(x, z) : null) : f;
      return g != null && !Number.isNaN(g) && y <= g + 0.5;
    };
    let dir = null, eye = null;
    const tops = [];
    for (let k = 0; k < 8 && !dir; k++) {
      const a = (k * Math.PI) / 4, hx = Math.sin(a), hz = -Math.cos(a);
      const mx = home.x + hx * 2, mz = home.z + hz * 2;
      const top = s.getMobGroundLevel ? s.getMobGroundLevel(mx, mz) : null;
      tops.push(top);
      if (top == null || !Number.isFinite(top)) continue; // no ground loaded there: the plan would not hold
      if (!grounded(mx, top + 6, mz)) { dir = { x: hx, z: hz }; eye = { x: home.x, y: top + 6, z: home.z }; }
    }
    if (!dir) return { setup: `no heading has loaded ground with open air 6 m over it (tops ${tops.join(', ')})` };
    const M = { x: eye.x + dir.x * 2, y: eye.y, z: eye.z + dir.z * 2 }; // castSpell's muzzle, 2 m along the aim
    const side = { x: -dir.z, z: dir.x };
    const at = (along, across, drop) => ({
      x: M.x + dir.x * along + side.x * across, y: M.y - drop, z: M.z + dir.z * along + side.z * across,
    });
    const spawn = (p) => {
      const before = new Set(call('readMobs').map((m) => m.id));
      s.spawnMob(p.x, p.z, 'zombie', p.y - 0.5); // spawnMob adds the 0.5 back
      const added = call('readMobs').filter((m) => !before.has(m.id));
      return added.length === 1 ? added[0].id : null;
    };

    store.setState({ isAlive: true, mana: 1e6, maxMana: 1e6 });
    s.triggerHitstop(150000); // released below, once the strike has been read
    const origDamage = GM.damageMob;
    try {
      const A = spawn(at(0, 0, 1));   // 1 m under the muzzle: the bolt's direct hit
      const C = spawn(at(0, 2.5, 1)); // 2.7 m from the strike, outside the bolt's 2.3 m reach; killed inside the hit
      const B = spawn(at(1, -3, 1));  // 3.3 m from the strike; moved 2 m inside the hit
      if (A == null || B == null || C == null) return { setup: `spawnMob did not add exactly one mob each (${A}, ${B}, ${C})` };

      // Long enough for the 250 ms mirror to have sampled all three: a chain that read the mirror would then see C
      // alive and B where it stood, which is what makes this check able to fail.
      const t0 = performance.now();
      for (let n = 0; n < 3 || performance.now() - t0 < 400; n++) await frame();

      // The chain takes the nearest live hostile at each of its 3 hops of 8 m (game/spells.js), so any hostile other
      // than A, B and C within that reach of the strike decides the verdict too: a crowd that walked in takes the hops
      // before B. They are put down first, with no player credit; one still alive is a SETUP failure, not a chain one.
      const REACH = 3 * 8 + 2;
      const strangers = () => call('readMobs').filter((m) => !m.passive && m.health > 0 && ![A, B, C].includes(m.id)
        && Math.hypot(m.x - M.x, m.y - M.y, m.z - M.z) <= REACH).map((m) => m.id);
      const cleared = strangers();
      for (const id of cleared) origDamage(id, 99999, 'physical', 'ally');
      const left = strangers();
      if (left.length) return { setup: `hostiles other than A, B and C still alive within the chain's reach: ${left.join(', ')}` };

      const hops = [];
      let struck = false, moved = false;
      GM.damageMob = (id, dmg, type, source, ...rest) => {
        if (type === 'lightning' && source === undefined) { // a chain hop: the target as the ECS holds it right now
          const m = call('readMobs').find((x) => x.id === id);
          hops.push({ id, health: m ? m.health : null, x: m?.x, y: m?.y, z: m?.z });
        } else if (type === 'lightning' && id === A && !struck) { // the direct hit, before the chain runs
          struck = true;
          origDamage(C, 99999, 'physical', 'player');
          const b = call('readMobs').find((x) => x.id === B);
          const live = b && GM.checkMobCollision({ x: b.x, y: b.y, z: b.z }, 0.3);
          if (live && live.id === B) { live.position.x += dir.x * 2; live.position.z += dir.z * 2; moved = true; }
        }
        return origDamage(id, dmg, type, source, ...rest);
      };

      if (grounded(M.x, M.y, M.z)) return { setup: `the ground under the muzzle rose to it while the scene was set up` };
      // castSpell reads the camera synchronously; the player controller puts it back on its next frame.
      cam.position.set(eye.x, eye.y, eye.z);
      cam.lookAt(M.x + dir.x * 10, eye.y, M.z + dir.z * 10);
      const before = new Set(call('readProjectiles').map((p) => p.id));
      s.castSpell('lightning');
      cam.position.set(home.x, home.y, home.z);
      const bolt = call('readProjectiles').find((p) => !before.has(p.id));
      if (!bolt) return { setup: 'castSpell created no projectile' };
      const t1 = performance.now();
      let frames = 0;
      while (call('readProjectiles').some((p) => p.id === bolt.id) && performance.now() - t1 < 60000) { await frame(); frames++; }
      const end = call('readSpentProjectiles').find((e) => e.id === bolt.id) || null;
      const arcs = call('readChainArcs').slice(-hops.length || 0);
      const p = (v) => (v ? `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})` : 'none');
      const scene = `muzzle planned ${p(M)}, bolt from ${p(bolt)} to ${p(end)}; store camera is the aimed one: `
        + `${store.getState().gameCamera === cam}; frozen: ${store.getState().hitstopUntil > performance.now()}; `
        + `cleared from the reach: [${cleared.join(', ')}]`;
      return { A, B, C, struck, moved, hops, arcs, end, frames, scene };
    } finally {
      GM.damageMob = origDamage;
      store.setState({ hitstopUntil: performance.now() });
    }
  });

  expect(r.setup, `SETUP: ${r.setup}`).toBeUndefined();
  const where = `bolt ended by ${r.end?.by ?? 'nothing'} after ${r.frames} frames; ${r.scene}; hops ${JSON.stringify(r.hops)}`;
  // A bolt that ended on anything but a mob never reached the strike this case is about.
  expect(r.end?.by, `SETUP: the bolt ended before striking (${where})`).toBe('mob');
  expect(r.struck, `the bolt never struck A — nothing below is about a chain (${where})`).toBe(true);
  expect(r.moved, `SETUP: B could not be moved inside the hit (${where})`).toBe(true);
  expect(r.hops.length, `the strike chained to nobody (${where})`).toBeGreaterThan(0);
  const ids = r.hops.map((h) => h.id);
  expect(ids, `the chain hopped onto C, killed in the same frame (${where})`).not.toContain(r.C);
  expect(ids, `the chain never reached B (${where})`).toContain(r.B);
  for (const h of r.hops) expect(h.health, `a hop landed on a dead mob, ${h.id} (${where})`).toBeGreaterThan(0);
  expect(r.arcs.map((a) => a.target), `the drawn arcs name other targets than the hops (${where})`).toEqual(ids);
  r.hops.forEach((h, i) => {
    const a = r.arcs[i];
    const off = Math.hypot(a.x - h.x, a.y - 0.9 - h.y, a.z - h.z); // the arc ends at body height over the feet
    expect(off, `the arc to mob ${h.id} ends ${off.toFixed(2)} m from where it stands (${where})`).toBeLessThan(0.3);
  });
};

test.describe('chain lightning', () => {
  // The file's beforeEach boot shares the test's budget, and this case also waits for the world.
  test.describe.configure({ timeout: 240000 });
  test('chain lightning hops only onto live mobs, and each arc ends where its mob stands', chainLightningCase);
});
