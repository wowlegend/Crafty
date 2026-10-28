import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';
import { SEA_LEVEL } from '../../src/world/oceanProfile.js';
import { BURST_M, flown, stoppedShort } from './_spellEnd.js';
import { MIN_UNDER, TEST_BUDGET_MS, colOf, floorEvidence, watchUntilEvidence } from './_floorSamples.js';

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
// THE FIREBALL IS MEASURED BY WHERE IT ENDED, NOT BY THE PATH SAMPLED PER FRAME (2026-10-27). The first version
// read the live projectile once per rendered frame and called the distance between the first and last samples
// "the flight". On CI's software renderer the traces show 4.7-11.2 s between rendered frames around the cast —
// longer than a fireball's whole 3 s life — so the spell's entire flight fitted inside ONE frame and the spec
// printed "burst after 0.0 m (1 frames)" whatever it had done (runs 40499349776, 40517958583: red three attempts
// running; green on 40514448242). In 40517958583's first attempt the first frame carried the fireball 3.6 m past
// the muzzle WITHOUT bursting, then the trace's screencast shows no new frame for 8.7 s, and the spell was gone at
// the next sample: the spec failed on its own 4 m threshold, on a flight it never saw end. All three attempts show
// the same terrain from the same spot and aim; what differed was the frame timing and the mobs near the line (in
// the third, a wild villager — tagged "villager", not a named hub NPC, so a spell can hit it — stands close at the
// right edge of the view as the spell is cast).
// Both are inputs the spec read and never set. So the spell now reports its own end (readSpentProjectiles:
// where, and what ended it), and the spec ESTABLISHES the three inputs it used to inherit: the AIM (level, along a
// heading whose ground stays below the flight line for 8 m — it used to fly wherever the camera happened to face),
// MOBS (a cast a mob or the boss stopped within 4 m of the muzzle is set aside and recast, up to three times: it
// cannot show whether the spell flies; one stopped beyond 4 m is judged, since the ground test passed at every
// half-metre substep on the way out — and the subject's defect can never read as 'mob' — EnhancedMagicSystem tests
// the ground before it tests mobs, so a muzzle burst ends 'ground', or 'age' when the frame that carried it was
// over 3 s long, and at the muzzle either way), and the FRAME RATE (no longer read at all).
//
// Mutation-Proof: by hand (cp backup, byte-verified restore), each observed RED:
//   E1 AIWorkerSystem: snapMob(entity, null, store.getMobGroundLevel) — the top-down snap — "the zombie stood ON
//      the roof" (the probe asserts stay green under E1: they read getMobFloor directly — which is why the zombie
//      is here)
//   E2 EnhancedMagicSystem: projectileGrounded(p, null, ...) — the column top (R7.9) — "the fireball cast under
//      the roof burst 0.5 m from the muzzle (ended by ground ...)"
//   E3 EnhancedMagicSystem: the DEV end record never written — "no end was recorded" (the instrument's presence
//      check: a blind recorder must not read as a clean flight)
// The set-aside rule (_spellEnd.js) is mutation-proven where it can be driven: tests/gates/spell-end-verdict-gates
// (its M1 is the old rule, which set aside a mob end at any distance). What the record stores is proven by
// tests/gates/spent-spell-record-gates.
// The flake itself, CONSTRUCTED rather than waited for (2026-10-27, throwaway :4291 config, identity mutant green
// on both tests): a page-side burner making every frame with a live spell take 4 s read "the fireball cast under the
// roof burst after 1.3 m (2 frames)" on the old per-frame sampling — CI's shape — and passed on the end record.
//
// THE ZOMBIE IS WATCHED UNTIL ITS EVIDENCE EXISTS, NOT FOR A FLAT 10 s (2026-10-28). The same defect, in the zombie test:
// it sampled once per requestAnimationFrame callback for 10 s of wall clock and then demanded a worker reply and 2
// post-reply samples under the roof — a frame count read inside a time window. What CI measured (run 40637608377, shard
// 5, both traces): that in-page loop ran 10.04 s and 10.05 s and returned 2 samples and 1, so in the ~10 s after spawnMob
// the page ran at most ONE requestAnimationFrame callback, while in the retry the screencast shows compositor frames at
// +0.44-0.51 s after the spawn. An episodic main-thread stall, then (inferred: rAF stopped and the compositor did not),
// ~10 s long and starting at the spawn — not a slow steady frame rate. Its cause is unmeasured. It failed three attempts
// of three on feat/steady-cool ("the zombie never moved in 1 frames" / "only 1 post-reply samples under the roof, of 2
// frames"), and main's first attempt failed the same way twice (995f1da2, d5375ac1), each passing on a retry. It now
// samples at least the old 10 s, then on until the evidence exists, the zombie is gone, or 60 s; nothing it asserts was
// relaxed. The whole watch, its poll loop included, is _floorSamples.js watchUntilEvidence, which
// tests/gates/floor-sample-window-gates drives on a fake clock; this spec supplies only the page reads, the clock and
// the sleep. Whether it supplies them right (t0 right after the spawn, this test's own site) is the one seam no unit
// gate sees: it is unverified until CI runs the pushed sha.
// Local (throwaway :4307 config, 2026-10-28): the unmodified spec passed at load ~22 (13 frames in its 10 s). The CI
// shape constructed with a page-side burner (a 9.6 s frame after the spawn, then 2.5 s frames), against the old spec and
// this one, and this spec unburned, all died in SETUP ("the world never built ... within 90000 ms") at load 145-222, so
// none gave a verdict: this spec's browser run is OWED to CI.
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

  // How far from the eye the chosen heading's ground must stay below the flight line: the muzzle sits 2 m out, so
  // this leaves 6 m of open flight past it — more than the 4 m the assertion asks for.
  const OPEN_M = 8;
  // A spell hits a mob within size + 1.5 of it (fireball: 2.7 m, CombatSystem checkMobCollision); keep 3.5 m.
  const MOB_CLEAR_M = 3.5;

  // ONE fireball, cast LEVEL from where the player stands, along the best of 8 headings, then read back where the
  // spell itself says it ENDED. Every input the verdict depends on is set here or reported back:
  //  - the heading: its ground — the patch's ground mapped BEFORE the roof, the column top beyond — stays more than a
  //    spell's 0.5 m landing band (plus 0.3 m) below the eye for OPEN_M; preferring one with no mob near the line.
  //  - the frame rate: the wait runs until the spell leaves the live list, on any number of frames, and the verdict
  //    reads the spell's own end record — never the samples, which a single long frame can contain whole.
  const castLevel = (page, { cx, cz, grounds }) => page.evaluate(async ({ cx, cz, grounds, openM, mobClearM }) => {
    const s = window.useGameStore.getState();
    const cam = window.__threeCamera;
    const ox = cam.position.x, oy = cam.position.y, oz = cam.position.z;
    // The probes read column floor(x + 0.1) (the seam jitter), so the patch map is keyed the same way.
    const groundAt = (x, z) => {
      const g = grounds[`${Math.floor(x + 0.1) - cx},${Math.floor(z + 0.1) - cz}`];
      return g !== undefined ? g : s.getMobGroundLevel(x, z);
    };
    const mobs = window.__craftyTest.call('readMobs');
    const headings = [];
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4, hx = Math.sin(a), hz = -Math.cos(a);
      let open = 0;
      for (let i = 20; i <= openM * 10; i++) {
        const g = groundAt(ox + (hx * i) / 10, oz + (hz * i) / 10);
        if (g == null || g + 0.5 >= oy - 0.3) break;
        open = i / 10;
      }
      // Nearest mob to the flight line between the muzzle and 12 m — the same 3D distance the hit test measures.
      let nearMob = Infinity;
      for (const m of mobs) {
        const t = Math.max(2, Math.min(12, (m.x - ox) * hx + (m.z - oz) * hz));
        nearMob = Math.min(nearMob, Math.hypot(m.x - (ox + hx * t), m.y - oy, m.z - (oz + hz * t)));
      }
      headings.push({ k, hx, hz, open, nearMob });
    }
    const usable = headings.filter((h) => h.open >= openM);
    if (!usable.length) {
      return { setup: `no heading keeps its ground below the flight line for ${openM} m (open, by heading: ` +
        `${headings.map((h) => h.open.toFixed(1)).join(', ')}; eye ${oy.toFixed(2)})` };
    }
    const h = usable.find((u) => u.nearMob > mobClearM) || usable.reduce((b, u) => (u.nearMob > b.nearMob ? u : b));

    cam.lookAt(ox + h.hx * 10, oy, oz + h.hz * 10); // LEVEL: the flight height is the eye
    window.useGameStore.setState({ isAlive: true, mana: s.maxMana ?? 100 });
    const before = new Set(window.__craftyTest.call('readProjectiles').map((p) => p.id));
    window.useGameStore.getState().castSpell('fireball');
    const mine = window.__craftyTest.call('readProjectiles').find((p) => !before.has(p.id));
    if (!mine) return { setup: 'castSpell created no projectile (mana, isAlive or an unmounted system)' };

    const live = () => window.__craftyTest.call('readProjectiles').some((p) => p.id === mine.id);
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const t0 = performance.now();
    let frames = 0;
    while (live() && performance.now() - t0 < 60000) { await frame(); frames++; }
    const end = window.__craftyTest.call('readSpentProjectiles').find((e) => e.id === mine.id) || null;
    return {
      heading: h.k, open: h.open, nearMob: h.nearMob, eye: oy, muzzle: { x: mine.x, y: mine.y, z: mine.z },
      end, frames, waitedMs: performance.now() - t0, stillLive: live(),
    };
  }, { cx, cz, grounds, openM: OPEN_M, mobClearM: MOB_CLEAR_M });

  test('a fireball cast under a roof flies — it does not burst at the muzzle (R7.9)', async ({ page }) => {
    // Up to three casts on a slow runner, each waiting out a whole flight; the boot alone can take 90 s on CI.
    test.setTimeout(240000);
    await bootDev(page);
    await startPlayActive(page);
    await page.waitForFunction(
      () => window.GameMethods?.terrainVerbs?.place && window.__threeCamera && window.useGameStore.getState().castSpell
        && window.__craftyTest?.call('readProjectiles') !== undefined
        && window.__craftyTest?.call('readSpentProjectiles') !== undefined,
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

    // A cast a MOB or the boss ended WITHIN BURST_M of the muzzle is set aside and recast: the spell was stopped before
    // it could show whether it flies. One ended BEYOND BURST_M is a valid flight and is judged — the ground test passed
    // at every half-metre substep on the way out (_spellEnd.js). Setting those aside too threw valid flights away, and
    // three in a row read as a SETUP failure on a spell that flew (review, 2026-10-27).
    const casts = [];
    for (let n = 0; n < 3; n++) {
      const c = await castLevel(page, site);
      expect(c.setup ?? null, `SETUP: ${c.setup}`).toBeNull();
      casts.push(c);
      if (!stoppedShort(c)) break;
    }
    const c = casts[casts.length - 1];
    const where = `heading ${c.heading}, open ${c.open.toFixed(1)} m, nearest mob ${c.nearMob.toFixed(1)} m, ` +
      `${c.frames} frames in ${c.waitedMs.toFixed(0)} ms, cast ${casts.length} of up to 3`;
    expect(c.eye, `SETUP: the eye (${c.eye.toFixed(2)}) is not under the roof's underside (${roofY}) — the muzzle is not under it`)
      .toBeLessThan(roofY - 0.5);
    expect(c.stillLive, `the fireball was still in flight after 60 s — nothing ended it (${where})`).toBe(false);
    // PRESENCE: the spell's own end record exists. A recorder that wrote nothing must not read as a clean flight.
    expect(c.end, `the fireball left the live list but no end was recorded — readSpentProjectiles is blind (${where})`).not.toBeNull();
    const flew = flown(c);
    expect(stoppedShort(c), `SETUP: a ${c.end.by} stopped the fireball within ${BURST_M} m of the muzzle in all ` +
      `${casts.length} casts (last at ${flew.toFixed(1)} m) — no flight long enough to judge was measured (${where})`).toBe(false);
    expect(flew, `the fireball cast under the roof burst ${flew.toFixed(1)} m from the muzzle ` +
      `(ended by ${c.end.by} at age ${c.end.age.toFixed(0)} ms; ${where})`).toBeGreaterThan(BURST_M);
  });

  test('a roof over open ground: the live floor probe and a zombie under it stay on the ground', async ({ page }) => {
    // The zombie is watched for up to 60 s on a slow renderer, after a boot that can take 90 s on CI (_floorSamples.js).
    test.setTimeout(TEST_BUDGET_MS);
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

    // 5. A zombie spawned under the roof, sampled as the real reply loop snaps it: a recorder in the page takes one sample
    //    per requestAnimationFrame callback, and this reads it until the verdict's evidence exists (_floorSamples.js).
    const id = await page.evaluate(({ cx, cz, ground }) => {
      const before = new Set(window.__craftyTest.call('readMobs').map((m) => m.id));
      window.useGameStore.getState().spawnMob(cx + 0.4, cz + 0.4, 'zombie', ground);
      const added = window.__craftyTest.call('readMobs').filter((m) => !before.has(m.id));
      if (added.length !== 1) return null;
      const rec = { id: added[0].id, samples: [], gone: false, stop: false };
      window.__mobFloorRec = rec;
      const tick = () => {
        if (rec.stop) return;
        const m = window.__craftyTest.call('readMobs').find((e) => e.id === rec.id);
        if (!m) { rec.gone = true; return; }
        rec.samples.push({ x: m.x, y: m.y, z: m.z });
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      return rec.id;
    }, { cx: site.cx, cz: site.cz, ground });
    expect(id, 'spawnMob did not add exactly one mob').not.toBeNull();
    // HOW LONG: at least the old 10 s, then on until 2 post-reply samples under the roof exist, the zombie is gone, or
    // 60 s have passed (_floorSamples.js watchUntilEvidence: the loop is there, so the gate drives it). A flat 10 s held
    // 1-2 samples on CI, where the page ran at most one requestAnimationFrame callback in the ~10 s after the spawn.
    let watch;
    try {
      watch = await watchUntilEvidence({
        read: () => page.evaluate(() => ({ samples: window.__mobFloorRec.samples, gone: window.__mobFloorRec.gone })),
        now: () => Date.now(),
        sleep: (ms) => page.waitForTimeout(ms),
        site,
      });
    } finally {
      await page.evaluate(() => { window.__mobFloorRec.stop = true; }).catch(() => {}); // a closed page has no recorder to stop
    }
    const { rec, elapsedMs } = watch;
    const watched = `${rec.samples.length} frames in ${elapsedMs} ms${rec.gone ? ', then the zombie was gone' : ''}`;
    // Samples are per requestAnimationFrame callback, and a loaded runner runs few. So the denominator is not a frame count: it is the
    // samples taken AFTER a worker reply moved the zombie — the snap runs on every reply, so from that sample on the
    // zombie's y is the snap's answer — while still under the roof.
    const first = rec.samples[0], last = rec.samples[rec.samples.length - 1];
    const { replied, under } = floorEvidence(rec.samples, site);
    expect(replied, `the zombie never moved in ${watched} — no worker reply was applied, so no snap ran`).toBeGreaterThan(0);
    expect(under.length, `only ${under.length} post-reply samples under the roof, of ${watched} ` +
      `(first ${colOf(first, site)} y ${first.y.toFixed(2)}, last ${colOf(last, site)} y ${last.y.toFixed(2)}, ground ${ground})`)
      .toBeGreaterThanOrEqual(MIN_UNDER);
    // Above its column's own ground by more than a block = it was put on something; the roof is the only thing.
    const lifted = under.filter((m) => m.y > site.grounds[colOf(m, site)] + 1.6);
    const worst = lifted[0];
    expect(lifted.length, `the zombie stood ON the roof in ${lifted.length} of ${under.length} samples` +
      (worst ? ` (y ${worst.y.toFixed(2)} over ground ${site.grounds[colOf(worst, site)]}, roof top ${roofY + 1})` : '')).toBe(0);
  });
});
