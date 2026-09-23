import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';
import { SEA_LEVEL } from '../../src/world/oceanProfile.js';

// A MOB UNDER A ROOF STAYS ON THE GROUND (review #6, QUEUE R7.1).
//
// The mob ground probe cast down from y = 255, so the "ground" under a roof was the roof: a zombie spawned or
// standing under one was snapped up onto it. tests/gates/mob-floor-gates proves the floor rule on a chunk meshed
// by the real mesher in a real Rapier world, and drives the real worker through snapMob — but Terrain's
// registration of the probe, the chunk RE-MESH after a placed block, and AIWorkerSystem's reply loop are only
// structural there. This drives all three in the running game: a roof placed through the real build verb, the
// collider re-meshed by the real terrain worker, a zombie spawned under it and snapped by the real reply loop.
//
// SETUP vs RESULT (gates-and-probes, class 12): the scenario needs a dry, gentle 7x7 patch near spawn (tops
// within 3 blocks — the first draft demanded a FLAT one and the e2e world, hilly at spawn, had none among 32).
// If none exists the spec fails as SETUP, naming how many sites it scanned — never as "the probe is broken".
//
// Mutation-Proof: by hand (cp backup, byte-verified restore), each observed RED:
//   E1 AIWorkerSystem: snapMob(entity, null, store.getMobGroundLevel) — the top-down snap — "the zombie stood ON
//      the roof" (the probe asserts stay green under E1: they read getMobFloor directly — which is why the zombie
//      is here)
//   E2 EnhancedMagicSystem: projectileGrounded(projectile.position, null, ...) — the column top (R7.9) — "the
//      fireball cast under the roof burst after 0.0 m"
test.describe('mob floor', () => {
  test.setTimeout(180000);

  // A dry 7x7 patch whose tops lie within 3 blocks, centred on (cx, cz), mapped before anything is built on it.
  const mapPatch = (page, cx, cz) => page.evaluate(({ cx, cz, sea }) => {
    const s = window.useGameStore.getState();
    const grounds = {};
    let lo = Infinity, hi = -Infinity;
    for (let i = -3; i <= 3; i++) {
      for (let j = -3; j <= 3; j++) {
        const t = s.getMobGroundLevel(cx + i, cz + j);
        if (t == null || t <= sea + 1) return null;
        grounds[`${i},${j}`] = Math.round(t);
        lo = Math.min(lo, t); hi = Math.max(hi, t);
      }
    }
    return hi - lo <= 3 ? { cx, cz, grounds, maxTop: Math.round(hi) } : null;
  }, { cx, cz, sea: SEA_LEVEL });

  // A 7x7 roof through the real placement verb, then wait for the re-meshed collider to carry it.
  const buildRoof = async (page, { cx, cz }, roofY) => {
    await page.evaluate(({ cx, cz, roofY }) => {
      const s = window.useGameStore.getState();
      s.setSelectedBlock('stone');
      s.addToInventory('stone', 100);
      window.useGameStore.setState({ buildingMode: 'single', buildSize: 1 });
      const V = window.__threeCamera.position.constructor;
      for (let i = -3; i <= 3; i++) {
        for (let j = -3; j <= 3; j++) {
          window.GameMethods.terrainVerbs.place({ hitPoint: new V(cx + i + 0.5, roofY + 0.5, cz + j + 0.5), normal: { x: 0, y: 1, z: 0 } });
        }
      }
    }, { cx, cz, roofY });
    return page.waitForFunction(({ cx, cz, roofY }) => {
      const top = window.useGameStore.getState().getMobGroundLevel;
      return [[0, 0], [3, 3], [-3, -3]].every(([i, j]) => { const t = top(cx + i, cz + j); return t != null && t > roofY + 0.9; });
    }, { cx, cz, roofY }, { timeout: 30000 }).then(() => true, () => false);
  };

  test('a fireball cast under a roof flies — it does not burst at the muzzle (R7.9)', async ({ page }) => {
    await bootDev(page);
    await startPlayActive(page);
    await page.waitForFunction(
      () => window.GameMethods?.terrainVerbs?.place && window.__threeCamera && window.useGameStore.getState().castSpell
        && window.__craftyTest?.call('readProjectiles') !== undefined,
      null, { timeout: 60000 },
    );
    const me = await page.evaluate(() => {
      const c = window.__threeCamera.position;
      return { cx: Math.floor(c.x), cz: Math.floor(c.z), eye: c.y };
    });
    const site = await mapPatch(page, me.cx, me.cz);
    expect(site, 'SETUP: the ground around the player is not a dry patch with tops within 3 blocks').not.toBeNull();
    const roofY = Math.max(site.maxTop + 3, Math.ceil(me.eye) + 1); // over the player's head, with air under it
    expect(await buildRoof(page, site, roofY), 'the roof over the player never reached the collider').toBe(true);

    // PRESENCE CONTROL: the column top above the caster IS the roof — the old test would call the muzzle "ground".
    const top = await page.evaluate(({ cx, cz }) => window.useGameStore.getState().getMobGroundLevel(cx, cz), site);
    expect(top, 'control: the top probe does not read the roof over the caster').toBeGreaterThan(me.eye);

    const flight = await page.evaluate(async () => {
      const s = window.useGameStore.getState();
      window.useGameStore.setState({ isAlive: true, mana: s.maxMana ?? 100 });
      const before = new Set(window.__craftyTest.call('readProjectiles').map((p) => p.id));
      s.castSpell('fireball');
      const mine = () => window.__craftyTest.call('readProjectiles').find((p) => !before.has(p.id));
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const path = [];
      const t0 = performance.now();
      while (performance.now() - t0 < 6000) {
        const p = mine();
        if (!p) { if (path.length) break; await frame(); continue; }
        path.push({ x: p.x, y: p.y, z: p.z });
        await frame();
      }
      return path;
    });
    expect(flight.length, 'SETUP: castSpell created no projectile (mana, cooldown or an unmounted system)').toBeGreaterThan(0);
    const a = flight[0], b = flight[flight.length - 1];
    const travelled = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    expect(travelled, `the fireball cast under the roof burst after ${travelled.toFixed(1)} m (${flight.length} frames)`).toBeGreaterThan(4);
  });

  test('a roof over open ground: the live floor probe and a zombie under it stay on the ground', async ({ page }) => {
    await bootDev(page);
    await startPlayActive(page);
    await page.waitForFunction(
      () => window.GameMethods?.terrainVerbs?.place && window.__threeCamera && window.useGameStore.getState().getMobFloor,
      null, { timeout: 60000 },
    );
    await page.evaluate(() => window.useGameStore.setState({ isAlive: true, playerHealth: window.useGameStore.getState().maxHealth }));

    // 1. A dry, gentle 7x7 patch within the zombie's aggro range, with its ground mapped BEFORE the roof. Every
    //    column must read floor == top from its own top — nothing above it yet, so the two probes must agree
    //    (a check of the face walk on real generated terrain, 49 columns at a time).
    const site = await page.evaluate((sea) => {
      const s = window.useGameStore.getState();
      const top = s.getMobGroundLevel, floor = s.getMobFloor;
      const cam = window.__threeCamera.position;
      const px = Math.floor(cam.x), pz = Math.floor(cam.z);
      let scanned = 0, disagreed = 0, best = null;
      for (let r = 6; r <= 12; r += 2) {
        for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) {
          const cx = px + dx, cz = pz + dz;
          scanned++;
          const grounds = {};
          let lo = Infinity, hi = -Infinity, ok = true;
          for (let i = -3; i <= 3 && ok; i++) {
            for (let j = -3; j <= 3 && ok; j++) {
              const t = top(cx + i, cz + j);
              if (t == null || t <= sea + 1) { ok = false; break; }
              if (Math.abs(floor(cx + i, cz + j, t) - t) > 0.01) disagreed++;
              grounds[`${i},${j}`] = Math.round(t);
              lo = Math.min(lo, t); hi = Math.max(hi, t);
            }
          }
          if (ok && hi - lo <= 3 && (!best || hi - lo < best.range)) best = { cx, cz, grounds, maxTop: Math.round(hi), range: hi - lo };
        }
      }
      return best ? { ...best, scanned, disagreed } : { cx: null, scanned, disagreed };
    }, SEA_LEVEL);
    expect(site.cx, `SETUP: no dry 7x7 patch with tops within 3 blocks among ${site.scanned} sites near spawn — the scenario could not be built`).not.toBeNull();
    expect(site.disagreed, 'with nothing overhead, the floor probe disagreed with the top probe').toBe(0);
    const ground = site.grounds['0,0'];
    const roofY = site.maxTop + 3; // the roof's underside: 3+ blocks of air over every column

    // 2. A 7x7 roof, through the real placement verb (creative: free).
    await page.evaluate(({ cx, cz, roofY }) => {
      const s = window.useGameStore.getState();
      s.setSelectedBlock('stone');
      s.addToInventory('stone', 100);
      window.useGameStore.setState({ buildingMode: 'single', buildSize: 1 });
      const V = window.__threeCamera.position.constructor;
      for (let i = -3; i <= 3; i++) {
        for (let j = -3; j <= 3; j++) {
          window.GameMethods.terrainVerbs.place({ hitPoint: new V(cx + i + 0.5, roofY + 0.5, cz + j + 0.5), normal: { x: 0, y: 1, z: 0 } });
        }
      }
    }, { cx: site.cx, cz: site.cz, roofY });

    // 3. PRESENCE CONTROL: the re-meshed collider carries the roof — the TOP probe now reads it.
    const roofed = await page.waitForFunction(({ cx, cz, roofY }) => {
      const top = window.useGameStore.getState().getMobGroundLevel;
      return [[0, 0], [3, 3], [-3, -3]].every(([i, j]) => { const t = top(cx + i, cz + j); return t != null && t > roofY + 0.9; });
    }, { cx: site.cx, cz: site.cz, roofY }, { timeout: 30000 }).then(() => true, () => false);
    expect(roofed, 'the placed roof never reached the collider: the top probe cannot see it, so nothing below means anything').toBe(true);

    // 4. The live floor probe, on the live collider.
    const probe = await page.evaluate(({ cx, cz, ground, roofY }) => {
      const s = window.useGameStore.getState();
      return { top: s.getMobGroundLevel(cx, cz), under: s.getMobFloor(cx, cz, ground), onRoof: s.getMobFloor(cx, cz, roofY + 1) };
    }, { cx: site.cx, cz: site.cz, ground, roofY });
    expect(probe.top, 'control: the top probe reads the roof').toBeCloseTo(roofY + 1, 2);
    expect(probe.under, 'under the roof, the floor is the ground').toBeCloseTo(ground, 2);
    expect(probe.onRoof, 'standing on the roof, the floor is the roof').toBeCloseTo(roofY + 1, 2);

    // 5. A zombie spawned under the roof, sampled every rendered frame as the real reply loop snaps it.
    const run = await page.evaluate(async ({ cx, cz, ground }) => {
      const before = new Set(window.__craftyTest.call('readMobs').map((m) => m.id));
      window.useGameStore.getState().spawnMob(cx + 0.4, cz + 0.4, 'zombie', ground);
      const added = window.__craftyTest.call('readMobs').filter((m) => !before.has(m.id));
      if (added.length !== 1) return { id: null };
      const id = added[0].id;
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const samples = [];
      const t0 = performance.now();
      while (performance.now() - t0 < 10000) {
        await frame();
        const m = window.__craftyTest.call('readMobs').find((e) => e.id === id);
        if (!m) break;
        samples.push({ x: m.x, y: m.y, z: m.z });
      }
      return { id, samples };
    }, { cx: site.cx, cz: site.cz, ground });
    expect(run.id, 'spawnMob did not add exactly one mob').not.toBeNull();
    // Samples are per RENDERED frame, and a loaded runner renders few (3 frames in 4 s at load 13, locally). So the
    // denominator is not a frame count: it is the samples taken AFTER a worker reply moved the zombie — the snap
    // runs on every reply, so from that sample on the zombie's y is the snap's answer — while still under the roof.
    const first = run.samples[0], last = run.samples[run.samples.length - 1];
    const colOf = (m) => `${Math.floor(m.x + 0.1) - site.cx},${Math.floor(m.z + 0.1) - site.cz}`;
    const replied = run.samples.findIndex((m) => Math.hypot(m.x - first.x, m.z - first.z) > 0.01);
    expect(replied, `the zombie never moved in ${run.samples.length} frames — no worker reply was applied, so no snap ran`).toBeGreaterThan(0);
    const under = run.samples.slice(replied).filter((m) => site.grounds[colOf(m)] !== undefined);
    expect(under.length, `only ${under.length} post-reply samples under the roof, of ${run.samples.length} frames ` +
      `(first ${colOf(first)} y ${first.y.toFixed(2)}, last ${colOf(last)} y ${last.y.toFixed(2)}, ground ${ground})`).toBeGreaterThanOrEqual(2);
    // Above its column's own ground by more than a block = it was put on something; the roof is the only thing.
    const lifted = under.filter((m) => m.y > site.grounds[colOf(m)] + 1.6);
    const worst = lifted[0];
    expect(lifted.length, `the zombie stood ON the roof in ${lifted.length} of ${under.length} samples` +
      (worst ? ` (y ${worst.y.toFixed(2)} over ground ${site.grounds[colOf(worst)]}, roof top ${roofY + 1})` : '')).toBe(0);
  });
});
