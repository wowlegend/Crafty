import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';

// THE PLAYER LOOP'S LOAD AND FORM WIRING, IN THE BOOTED GAME (registry REVIEW:chaos-play:load-hold-e2e; DECISIONS
// 2026-10-30 items 151, 154, 155 and 166). The chaos harness (tests/integration/chaosPlay/harness.js) drives the pure
// pieces against real Rapier, but it models the Player loop rather than importing Components.jsx, so reverting that
// loop's wiring of the load hold, the load fit and the form fit left every unit test green (round-2 dynamic review,
// finding C). These cases run the real loop:
//
//  1. A save of where the player stands, loaded through the store's loadWorldData: every drawn frame from the Load until
//     the hold lets go, the body never drops more than 0.06 m under the saved height (the old world is wiped and the new
//     one streams in under it), the hold held for at least one frame, and the player is let go where they saved.
//  2. A save whose position is 1.5 m down in the ground under the player (as a save from the old Save button, or the
//     frozen pre-cut fixture, can hold one): the load stands the player on that column's top, not inside it.
//  3. The golem (2.4 m tall) asked for under a ceiling two blocks over the feet: the frame's swap refuses it, the base
//     capsule stays, the body stays out of the ceiling, and the player is told ("No room to change shape here"). Presence
//     first: the same ask on open ground swaps the golem in.
//
// Each waits in DRAWN frames (requestAnimationFrame in the page), never a wall-clock window, and every failure message
// carries the input and life gates the loop reads (rule 4e). Hostiles within 60 m are swept before each reading.
//
// WHAT THIS DOES NOT CHECK: a load over the deep ocean or in a beast form (tests/integration/chaos-play-loads.test.jsx),
// the roar's own room check at its commit, or the ember a refused form gives back (src/game/formRefusal.test.js).
//
// Mutation-Proof: see the commit trailers (each case red on a dispatched CI run with one wiring line of Components.jsx
// reverted; no local browser run).

const NO_ROOM_TEXT = 'No room to change shape here';

const installNoticeLog = () => {
  window.__e2eNotices = [];
  new MutationObserver((records) => {
    for (const r of records) for (const n of r.addedNodes) {
      const text = n.textContent || '';
      if (text) window.__e2eNotices.push(text);
    }
  }).observe(document, { childList: true, subtree: true });
};

/** In the page: what the loop reads, for every failure message. */
function gates() {
  const s = window.useGameStore.getState();
  const rb = s.playerRigidBodyRef?.current;
  const t = rb ? rb.translation() : null;
  const c = rb ? rb.collider(0) : null;
  return {
    body: t && [t.x, t.y, t.z].map((v) => Math.round(v * 100) / 100), capsule: c && [c.halfHeight(), c.radius()].map((v) => Math.round(v * 100) / 100),
    active: window.__craftyTest.call('readIntents').active, alive: s.isAlive, form: s.activeBeastForm,
    resumeSpawn: s.resumeSpawn, worldReloading: s.worldReloading, frozen: performance.now() < s.hitstopUntil,
  };
}

/** In the page: noon, hostiles within 60 m killed, and the body settled (its height still over 20 drawn frames, on a
 *  column whose ground the probe answers). Returns where it stands. */
async function settle() {
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const s = window.useGameStore.getState();
  s.setTimeOfDay?.(0.5);
  const sweep = () => {
    const cam = window.__threeCamera?.position;
    if (!cam) return;
    for (const m of window.__craftyTest.call('readMobs')) {
      if (!m.passive && m.health > 0 && Math.hypot(m.x - cam.x, m.z - cam.z) < 60) window.GameMethods.damageMob(m.id, 99999, 'physical', 'ally');
    }
  };
  let still = 0, last = null;
  for (let i = 0; i < 1200 && still < 20; i++) {
    await frame();
    sweep();
    const t = window.useGameStore.getState().playerRigidBodyRef.current.translation();
    const ground = window.useGameStore.getState().getMobGroundLevel?.(t.x, t.z);
    still = last !== null && Math.abs(t.y - last) < 0.002 && Number.isFinite(ground) ? still + 1 : 0;
    last = t.y;
  }
  const t = window.useGameStore.getState().playerRigidBodyRef.current.translation();
  return { settled: still >= 20, at: { x: t.x, y: t.y, z: t.z }, ground: window.useGameStore.getState().getMobGroundLevel?.(t.x, t.z) ?? null };
}

/** In the page: load a save of the live game whose player position is `position`, through saveActiveWorld and the slot
 *  the autosave writes, and sample the body every drawn frame from the Load until 30 frames after the hold lets go. */
async function loadAndSample(position) {
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const g = () => window.useGameStore.getState();
  g().saveActiveWorld(position);
  const id = localStorage.getItem('crafty_active_world');
  const blob = id ? JSON.parse(localStorage.getItem('crafty_world_save_' + id) || 'null') : null;
  if (!blob) return { why: 'SETUP: saveActiveWorld wrote no world blob' };
  const samples = [];
  g().loadWorldData(blob);
  let after = -1;
  for (let i = 0; i < 2400 && after < 30; i++) {
    await frame();
    const s = g();
    const t = s.playerRigidBodyRef.current.translation();
    const holding = !!s.resumeSpawn;
    samples.push({ y: t.y, holding, reloading: s.worldReloading });
    if (t.y < position.y - 2) break; // falling through the world: nothing holds the body, and the readings below say so
    if (after >= 0) after += 1;
    else if (!holding && !s.worldReloading) after = 0;
  }
  const t = g().playerRigidBodyRef.current.translation();
  return {
    frames: samples.length, heldFrames: samples.filter((s) => s.holding).length, released: after >= 30,
    minY: Math.min(...samples.map((s) => s.y)), end: { x: t.x, y: t.y, z: t.z },
  };
}

/** In the page: ask the store for the golem until the Player loop's frame swap runs on it, and read what it did. A form
 *  entered from the store rather than the roar is ended by the transform state machine's timer on the next frame, and
 *  when that lands before React's activeBeastForm effect has queued the swap, the swap never runs; that ask is made
 *  again, up to 5 times. An ask ran when the golem's capsule was swapped in or the player was told there is no room. */
async function askGolem({ roof, noRoom }) {
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const s = () => window.useGameStore.getState();
  for (let attempt = 1; attempt <= 5; attempt++) {
    const mark = window.__e2eNotices.length;
    if (!s().enterBeastForm('arcane')) return { why: 'SETUP: the store refused the golem (dead, or already in a form)' };
    let golem = false, maxTop = -Infinity;
    for (let i = 0; i < 30; i++) {
      await frame();
      const rb = s().playerRigidBodyRef.current;
      const c = rb.collider(0);
      if (Math.abs(c.halfHeight() - 0.7) < 1e-3 && Math.abs(c.radius() - 0.5) < 1e-3) golem = true;
      maxTop = Math.max(maxTop, rb.translation().y + c.halfHeight() + c.radius());
    }
    if (s().beastFormActive) s().exitBeastForm();
    for (let i = 0; i < 5; i++) await frame();
    const said = window.__e2eNotices.slice(mark).some((n) => n.includes(noRoom));
    if (golem || said) {
      const c = s().playerRigidBodyRef.current.collider(0);
      return { attempt, golem, said, capsule: [c.halfHeight(), c.radius()].map((v) => Math.round(v * 1000) / 1000),
        overRoof: roof === null ? null : +(maxTop - roof).toFixed(3) };
    }
  }
  return { why: 'SETUP: in 5 asks the Player loop never ran the golem\'s swap (the form ended each time before it was queued)' };
}

test.describe('the Player loop\'s load and form wiring', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(300000);
    await page.addInitScript(installNoticeLog);
    await bootDev(page);
    await startPlayActive(page);
  });

  test('a load holds the player where they saved while the world re-streams, then lets them go there', async ({ page }) => {
    const before = await page.evaluate(settle);
    expect(before.settled, `SETUP: the player never stood still on probed ground ${JSON.stringify({ before, gates: await page.evaluate(gates) })}`).toBe(true);
    const r = await page.evaluate(loadAndSample, before.at);
    expect(r.why, r.why).toBeUndefined();
    const why = JSON.stringify({ before, r, gates: await page.evaluate(gates) });
    expect(r.heldFrames, `the load never held the body (the Player loop did not take the resume) ${why}`).toBeGreaterThan(0);
    expect(r.minY, `the body dropped under the saved height while the world re-streamed ${why}`).toBeGreaterThan(before.at.y - 0.06);
    expect(r.released, `the load never let the player go within ${r.frames} drawn frames ${why}`).toBe(true);
    expect(Math.hypot(r.end.x - before.at.x, r.end.z - before.at.z), `the player was let go away from where they saved ${why}`).toBeLessThan(0.05);
    expect(Math.abs(r.end.y - before.at.y), `the player was let go off the saved height ${why}`).toBeLessThan(0.1);
  });

  test('a save whose position is in the ground under the player stands them on that column\'s top', async ({ page }) => {
    const before = await page.evaluate(settle);
    expect(before.settled, `SETUP: the player never stood still on probed ground ${JSON.stringify({ before, gates: await page.evaluate(gates) })}`).toBe(true);
    const buried = { x: before.at.x, y: before.at.y - 1.5, z: before.at.z };
    const r = await page.evaluate(loadAndSample, buried);
    expect(r.why, r.why).toBeUndefined();
    const why = JSON.stringify({ before, buried, r, gates: await page.evaluate(gates) });
    expect(r.heldFrames, `the load never held the body (the Player loop did not take the resume) ${why}`).toBeGreaterThan(0);
    expect(r.released, `the load never let the player go within ${r.frames} drawn frames ${why}`).toBe(true);
    expect(Math.hypot(r.end.x - buried.x, r.end.z - buried.z), `the player was moved off the saved column ${why}`).toBeLessThan(0.05);
    expect(r.end.y, `the player was left in the ground under the column's top ${why}`).toBeGreaterThan(before.at.y - 0.1);
  });

  test('the golem asked for under a two-high ceiling is refused, and said; on open ground it swaps in', async ({ page }) => {
    const before = await page.evaluate(settle);
    expect(before.settled, `SETUP: the player never stood still on probed ground ${JSON.stringify({ before, gates: await page.evaluate(gates) })}`).toBe(true);
    // Presence first: on open ground (nothing within 3 m over the eye) the golem swaps in, and the base shape comes back.
    const clearOver = await page.evaluate(() => {
      const eye = window.__threeCamera.position;
      const up = window.GameMethods.castWorldRay({ x: eye.x, y: eye.y, z: eye.z }, { x: 0, y: 1, z: 0 }, 3);
      return up ? up.toi : null;
    });
    expect(clearOver, `SETUP: something stands ${clearOver} m over the eye on the spawn`).toBeNull();
    const open = await page.evaluate(askGolem, { roof: null, noRoom: NO_ROOM_TEXT });
    expect(open.why, open.why).toBeUndefined();
    expect(open.golem, `SETUP: on open ground the golem's swap ran and did not swap it in ${JSON.stringify({ open, gates: await page.evaluate(gates) })}`).toBe(true);
    expect(open.capsule, 'SETUP: the base shape did not come back when the golem ended').toEqual([0.5, 0.4]);

    // A stone ceiling over the 3 x 3 columns around the player, its underside two blocks over the feet's cell, written as
    // Terrain's place() writes a block (the worker's edit, then the store's record), and its collider waited for.
    const ceiling = await page.evaluate(async () => {
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const s = window.useGameStore.getState();
      const t = s.playerRigidBodyRef.current.translation();
      const feet = Math.floor(t.y - 0.9 + 0.01);
      const y = feet + 2;
      const blocks = new Map(s.worldBlocks);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const x = Math.floor(t.x) + dx, z = Math.floor(t.z) + dz;
        const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
        s.terrainWorker.postMessage({ type: 'update_block', payload: { cx, cz, x: x - cx * 16, y, z: z - cz * 16, blockType: 3 } });
        blocks.set(`${x}_${y}_${z}`, 3);
      }
      s.setWorldBlocks(blocks);
      const eye = window.__threeCamera.position;
      for (let i = 0; i < 3000; i++) {
        await frame();
        const up = window.GameMethods.castWorldRay({ x: eye.x, y: eye.y, z: eye.z }, { x: 0, y: 1, z: 0 }, 3);
        if (up && Math.abs(eye.y + up.toi - y) < 0.05) return { y, frames: i + 1 };
      }
      return { why: `SETUP: the ceiling at ${y} never got a collider over the eye at ${eye.y.toFixed(2)}` };
    });
    expect(ceiling.why, ceiling.why).toBeUndefined();

    const refused = await page.evaluate(askGolem, { roof: ceiling.y, noRoom: NO_ROOM_TEXT });
    expect(refused.why, refused.why).toBeUndefined();
    const why = JSON.stringify({ ceiling, refused, gates: await page.evaluate(gates) });
    expect(refused.golem, `the golem was swapped in under the ceiling ${why}`).toBe(false);
    expect(refused.said, `the refusal was not said ${why}`).toBe(true);
    expect(refused.capsule, `the base capsule did not stay ${why}`).toEqual([0.5, 0.4]);
    expect(refused.overRoof, `the body went up into the ceiling ${why}`).toBeLessThanOrEqual(0.01);
  });
});
