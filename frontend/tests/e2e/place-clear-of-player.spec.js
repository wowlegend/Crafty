import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';
import { installWorldHold } from './_worldHold.js';
import { surfaceBlockAt } from '../../src/world/climate.js';
import { SEA_LEVEL } from '../../src/world/oceanProfile.js';

// A BURST OF CLICKS AT THE SHORE NEVER SHUTS THE PLAYER IN A BLOCK (Kevin, 2026-10-30: "seems to get stuck in an invisible
// box when travelling near the oceans, or caused by digging some blocks or something, i was left click / right clicking
// chaotically"). In the booted game, on a beach column near where he stood (his screenshot's -78, -4), real left and right
// clicks build a two-high pillar in front of the player, then aim a right-click at the pillar's face at eye level (the
// cell it fills is the one the camera is in) and one straight down (the feet's cell), then mine the pillar away and
// place and mine one more block behind. Before the fix the eye-level click wrote a block around the camera: the player
// could not move, and could not see the block (every face of it points away from an eye inside it). Then the player
// walks out on real W, A, S and D. Last, a block is written around the camera the way a save from before the fix brings
// one back (the worker's edit and the store's record, as a load delivers them): the centre and the lowest point are in
// the open cell under it, so the stuck-in-rock watch reads the capsule itself (game/stuckInRock.js) and stands the player
// clear of it within CLEAR_FRAMES drawn frames, and the player walks out, a metre each way within WALK_FRAMES. (A left
// click from inside such a block takes it: tests/integration/place-clear-of-player-rapier.test.jsx; the player is no
// longer left inside one to make it.)
//
// THE PRESENCE BEFORE THE ABSENCE. The same four walks run on the same spot before the burst, and each must cover a metre
// there, or the spot cannot show a trap (SETUP). The burst must aim at least one right-click whose cell lies inside the
// body at its own mousedown, or it never tested the defect (SETUP). On a failure the spec prints what holds the player:
// every placed block within 3 m with whether it lies inside the capsule, the build ray's distance to a collider from the
// eye in six directions, and the input gates (rule 4e).
//
// THE CLICK'S AIM IS SET ON ITS OWN MOUSEDOWN (tests/e2e/talents.spec.js armClickAim says why): a capture listener on
// window turns the camera to the click's yaw and pitch before the game's handler casts the build ray, and records the cell
// that ray will fill; a bubble listener added after the game's own reads the verb the press was routed to and the cell
// after it. The world is held still across the burst (_worldHold.js), so the body, mobs and day stand still between
// aims, and released for the walks.
//
// THE STAND-INS' WIRING IS LIVE. Each placing click must hold a stand-in collider (world/placedCellColliders.js) right
// after the game handled it, and the count must be back to 0 within the watch's frame bound: the worker echoed the
// click's seq on its chunk's mesh, ChunkMesh's effect marked the cell, and the after-step callback retired it. The node
// gate drives the registry itself, so this is the only check that the game wires it. A stand-in that never retires keeps
// a mined cell solid and unseen. It is a liveness check, not a timing one.
//
// WHAT THIS DOES NOT CHECK: touch placement (the same place verb), the Building Tools' multi-block footprints, a player
// running into a cell whose trimesh lands late (tests/integration/place-clear-of-player-rapier.test.jsx drives both against
// real Rapier), the cut of the player's sweep at the new colliders (the Player loop's argument to moveKinematic), or the
// look of the refusal notice. It LOGS, and does not assert, the live delay that node gate stands in for: for each placing
// click, the drawn frames until a world ray meets the new cell and until the chunk's new mesh is set, and the stand-ins
// still held on each of those frames.
//
// Mutation-Proof: see the commit trailers (red-first: the burst on the unfixed placement; the node gate's mutants).

const KEVIN = { x: -78, z: -4 };
const REFUSAL = /standing there/;
// A walk ends at WALK_STOP_M or after WALK_FRAMES drawn frames. Bounded by distance because CI's software renderer draws
// frames up to MAX_FRAME_STEP_SEC (0.25 s) apart: thirty of them at 14 m/s walked 103 m out to sea on the red run,
// where the seabed is under the void-fall line, and the reset to the origin spoiled every walk after it.
const WALK_FRAMES = 30;
const WALK_STOP_M = 1.5;
const WALK_MIN_M = 1;
// The stuck-in-rock watch stands a body clear once its readings have been in the rock for 0.3 s of play (a reading every
// 0.1 s, confirmed over 0.2 s: game/stuckInRock.js), out at 0.25 s at 60 Hz and 0.283 s at 120 Hz on the real Player
// (tests/gates/player-placement-gates.test.jsx, mutation-proven there). A frame's step is its time, up to 0.25 s, so 60
// drawn frames are at least half a second of play at any rate up to 120 Hz.
const CLEAR_FRAMES = 60;
const KEYS = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd' };

/** In node: beach columns near Kevin's spot, nearest first and 8 m apart. Land one block above the sea with water on one
 *  side, and the beach flat for two blocks either way along the other axis (the pillar is built along it). "Water on one
 *  side" is a neighbour AT OR BELOW the sea line: the dry shore strip (surfaceY 28) or the sea; `isWater` is false on the
 *  strip, which is dry. */
function shoreColumns(want) {
  const out = [];
  const at = (x, z) => surfaceBlockAt(x, z);
  for (let r = 0; r <= 80 && out.length < want; r++) {
    for (let dx = -r; dx <= r && out.length < want; dx++) for (let dz = -r; dz <= r && out.length < want; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const x = KEVIN.x + dx, z = KEVIN.z + dz;
      const c = at(x, z);
      if (c.isWater || c.surfaceY !== SEA_LEVEL + 1 || out.some((o) => Math.hypot(o.x - x, o.z - z) < 8)) continue;
      const seaward = (nx, nz) => at(nx, nz).surfaceY <= SEA_LEVEL;
      const waterX = seaward(x - 1, z) || seaward(x + 1, z);
      const waterZ = seaward(x, z - 1) || seaward(x, z + 1);
      const flatAlong = (ax, az) => [-2, -1, 1, 2].every((k) => { const n = at(x + ax * k, z + az * k); return !n.isWater && n.surfaceY === c.surfaceY; });
      if (waterX && flatAlong(0, 1)) out.push({ x, z, top: c.surfaceY + 1, along: 'z' });
      else if (waterZ && flatAlong(1, 0)) out.push({ x, z, top: c.surfaceY + 1, along: 'x' });
    }
  }
  return out;
}

/** Installed before boot: every refusal notice the page adds to its DOM, in order (a toast gone before a poll still counts). */
const installNoticeLog = () => {
  window.__e2eRefusals = [];
  new MutationObserver((records) => {
    for (const r of records) for (const n of r.addedNodes) {
      if (/standing there/.test(n.textContent || '')) window.__e2eRefusals.push(n.textContent);
    }
  }).observe(document, { childList: true, subtree: true });
};

/** In the page: `n` drawn frames. */
async function frames(n) {
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  for (let i = 0; i < n; i++) await frame();
}

/** In the page: the world held, noon, the body and camera put over the column (x, z) at `y` and kept still. */
function standAt({ x, z, y, capMs }) {
  const s = window.useGameStore.getState();
  s.setTimeOfDay?.(0.5);
  if (!window.__e2eHoldWorld) return { why: 'SETUP: the world hold was never installed (page.addInitScript(installWorldHold))' };
  if (!window.__e2eWorldHold || window.__e2eWorldHold.done || performance.now() >= s.hitstopUntil) window.__e2eHoldWorld({ capMs });
  const rb = s.playerRigidBodyRef?.current;
  if (!rb) return { why: 'SETUP: no player body' };
  rb.setTranslation({ x, y, z }, true);
  rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
  window.__threeCamera.position.set(x, y + 0.67, z);
  return {};
}

/** In the page: the ground the physics probe finds at the column and two blocks either way along `along` (null where no
 *  collider has streamed in yet). */
function probeGround({ x, z, along }) {
  const g = window.useGameStore.getState().getMobGroundLevel;
  if (!g) return null;
  const ax = along === 'x' ? 1 : 0, az = along === 'z' ? 1 : 0;
  return [-2, -1, 0, 1, 2].map((k) => {
    const y = g(x + ax * k, z + az * k);
    return Number.isFinite(y) ? Math.round(y * 100) / 100 : null;
  });
}

/** In the page: every hostile within 80 m killed (the walks measure the player, not a mob in the way). */
function sweepHostiles() {
  const cam = window.__threeCamera.position;
  let swept = 0;
  for (const m of window.__craftyTest.call('readMobs')) {
    if (!m.passive && m.health > 0 && Math.hypot(m.x - cam.x, m.z - cam.z) < 80) {
      window.GameMethods.damageMob(m.id, 99999, 'physical', 'ally');
      swept += 1;
    }
  }
  return swept;
}

/** In the page: drawn frames until the capsule no longer reaches into the cell `x_y_z` with the world running, at most
 *  `maxFrames`: the count, or null. */
function framesUntilClear({ cell, maxFrames }) {
  const [x, y, z] = cell.split('_').map(Number);
  return new Promise((resolve) => {
    let n = 0;
    const tick = () => {
      n += 1;
      const s = window.useGameStore.getState();
      const rb = s.playerRigidBodyRef?.current;
      const t = rb.translation(), c = rb.collider(0), hh = c.halfHeight();
      const dx = Math.max(x - t.x, 0, t.x - (x + 1)), dz = Math.max(z - t.z, 0, t.z - (z + 1));
      const dy = Math.max(y - (t.y + hh), 0, (t.y - hh) - (y + 1));
      if (Math.hypot(dx, dy, dz) >= c.radius() && performance.now() >= s.hitstopUntil) resolve(n);
      else if (n >= maxFrames) resolve(null);
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** In the page: what holds the player. Placed blocks within 3 m (and whether each lies inside the capsule), the build
 *  ray's distance to a collider from the eye in six directions, and the gates every verb and step reads. */
function readHold() {
  const s = window.useGameStore.getState();
  const rb = s.playerRigidBodyRef?.current;
  if (!rb) return { why: 'no player body' };
  const t = rb.translation();
  const col = rb.collider(0);
  const hh = col.halfHeight(), r = col.radius();
  const inBody = (x, y, z) => {
    const dx = Math.max(x - t.x, 0, t.x - (x + 1));
    const dz = Math.max(z - t.z, 0, t.z - (z + 1));
    const dy = Math.max(y - (t.y + hh), 0, (t.y - hh) - (y + 1));
    return Math.hypot(dx, dy, dz) < r;
  };
  const placed = [];
  for (const [k, id] of s.worldBlocks) {
    if (!id) continue;
    const [x, y, z] = k.split('_').map(Number);
    if (Math.abs(x + 0.5 - t.x) > 3 || Math.abs(y + 0.5 - t.y) > 3 || Math.abs(z + 0.5 - t.z) > 3) continue;
    placed.push({ cell: k, id, inBody: inBody(x, y, z) });
  }
  const eye = window.__threeCamera.position;
  const rays = {};
  for (const [name, d] of Object.entries({ up: [0, 1, 0], down: [0, -1, 0], n: [0, 0, -1], s: [0, 0, 1], w: [-1, 0, 0], e: [1, 0, 0] })) {
    const h = window.GameMethods.castWorldRay({ x: eye.x, y: eye.y, z: eye.z }, { x: d[0], y: d[1], z: d[2] }, 4);
    rays[name] = h ? Math.round(h.toi * 100) / 100 : null;
  }
  const round = (v) => Math.round(v * 100) / 100;
  return {
    body: [round(t.x), round(t.y), round(t.z)], capsule: [round(hh), round(r)], eye: [round(eye.x), round(eye.y), round(eye.z)],
    placed, inBody: placed.filter((p) => p.inBody).map((p) => p.cell), eyeRays: rays,
    gates: { active: window.__craftyTest.call('readIntents').active, alive: s.isAlive, frozen: performance.now() < s.hitstopUntil },
  };
}

/** In the page: frames after a click until it settles (at least `minFrames`, at most `maxFrames`). For a click that paid for
 *  a cell (the stack fell at the click; the store records the cell once the worker answers that it filled it,
 *  world/placeAtHit.js): the frame the store recorded it, the frame a world ray from the eye first meets that cell, the
 *  frame its chunk's mesh in the store changed, and the stand-ins held each frame. The frame counts are a log (CI's frame
 *  times are not a player's); the caller asserts only that the last count is 0. When it settles, the cell's record and the
 *  stack are read again into the click's record (`placedNow`, `stackAfter`). */
function watchClick({ minFrames, maxFrames }) {
  const rec = window.__e2eClick;
  const paid = !!(rec && rec.verb === 'place' && rec.placeCell && rec.stackAfter < rec.stackBefore);
  const placed = paid ? rec.placeCell.split('_').map(Number) : null;
  const key = placed ? `${Math.floor(placed[0] / 16)}_${Math.floor(placed[2] / 16)}` : null;
  const out = { placed: false, frames: 0, recordedAt: null, solidAt: null, meshAt: null, standIns: [] };
  const finish = () => {
    const s = window.useGameStore.getState();
    if (rec && rec.placeCell) rec.placedNow = s.worldBlocks.get(rec.placeCell) ?? null;
    if (rec) rec.stackAfter = s.inventory.blocks.grass ?? 0;
    out.placed = !!(placed && rec.placedNow);
    return out;
  };
  return new Promise((resolve) => {
    const tick = () => {
      out.frames += 1;
      if (placed) {
        if (out.recordedAt === null && window.useGameStore.getState().worldBlocks.get(rec.placeCell)) out.recordedAt = out.frames;
        const eye = window.__threeCamera.position;
        const d = { x: placed[0] + 0.5 - eye.x, y: placed[1] + 0.5 - eye.y, z: placed[2] + 0.5 - eye.z };
        const len = Math.hypot(d.x, d.y, d.z);
        const hit = window.GameMethods.castWorldRay({ x: eye.x, y: eye.y, z: eye.z }, { x: d.x / len, y: d.y / len, z: d.z / len }, len);
        if (out.solidAt === null && hit) out.solidAt = out.frames;
        if (out.meshAt === null && window.useGameStore.getState().debugChunks?.[key]?.meshData !== window.__e2eMeshAtClick) out.meshAt = out.frames;
        out.standIns.push(window.__craftyTest.call('readPlacedCells') ?? null);
      }
      const settled = !placed || (out.recordedAt !== null && out.solidAt !== null && out.meshAt !== null && out.standIns[out.standIns.length - 1] === 0);
      if ((out.frames >= minFrames && settled) || out.frames >= maxFrames) resolve(finish());
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** In the page: arm the next mousedown. A capture listener (it runs before the game's handler) turns the camera to the
 *  aim and records the cell the place verb would fill from that ray and whether it lies inside the capsule; a bubble
 *  listener, added after the game's own, records the verb the press was routed to, the cell after, and the stack. */
function armClick({ yaw, pitch }) {
  const call = (n) => window.__craftyTest.call(n);
  const cam = window.__threeCamera;
  const rec = { yaw, pitch };
  window.__e2eClick = rec;
  let before = null;
  window.addEventListener('mousedown', () => {
    before = call('readCompatMouse') ?? null;
    cam.rotation.order = 'YXZ'; cam.rotation.y = yaw; cam.rotation.x = pitch; cam.updateMatrixWorld();
    const s = window.useGameStore.getState();
    const rb = s.playerRigidBodyRef.current;
    const t = rb.translation();
    const col = rb.collider(0);
    const hh = col.halfHeight(), r = col.radius();
    const hit = window.GameMethods.castBuildRay();
    rec.stackBefore = s.inventory.blocks.grass ?? 0;
    if (hit && hit.normal) {
      const p = hit.hitPoint.clone().add(new cam.position.constructor(hit.normal.x, hit.normal.y, hit.normal.z).multiplyScalar(0.01));
      const [x, y, z] = [Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)];
      const dx = Math.max(x - t.x, 0, t.x - (x + 1));
      const dz = Math.max(z - t.z, 0, t.z - (z + 1));
      const dy = Math.max(y - (t.y + hh), 0, (t.y - hh) - (y + 1));
      rec.placeCell = `${x}_${y}_${z}`;
      rec.placeInBody = Math.hypot(dx, dy, dz) < r;
      rec.mineCell = `${hit.targetedX}_${hit.targetedY}_${hit.targetedZ}`;
      rec.toi = Math.round(hit.toi * 100) / 100;
      window.__e2eMeshAtClick = s.debugChunks?.[`${Math.floor(x / 16)}_${Math.floor(z / 16)}`]?.meshData ?? null;
    } else rec.placeCell = null;
  }, { capture: true, once: true });
  window.addEventListener('mousedown', () => {
    const after = call('readCompatMouse');
    const s = window.useGameStore.getState();
    rec.verb = before && after && after.presses.mouse > before.presses.mouse ? (after.verbs?.mouse ?? null) : 'none: not pressed';
    rec.placedNow = rec.placeCell ? (s.worldBlocks.get(rec.placeCell) ?? null) : null;
    rec.minedNow = rec.mineCell ? (s.worldBlocks.get(rec.mineCell) ?? null) : null;
    rec.stackAfter = s.inventory.blocks.grass ?? 0;
    rec.standInsAtClick = call('readPlacedCells') ?? null; // the game's handler has run: a placed cell's stand-in exists now
  }, { once: true });
}

/** Real W, A, S or D held from `from` until the body is WALK_STOP_M away or WALK_FRAMES frames are drawn, the camera
 *  level and facing -z; metres covered. */
async function walk(page, code, from) {
  await page.evaluate(({ x, y, z }) => {
    const rb = window.useGameStore.getState().playerRigidBodyRef.current;
    rb.setTranslation({ x, y, z }, true);
    rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
    const cam = window.__threeCamera;
    cam.position.set(x, y + 0.67, z);
    cam.rotation.order = 'YXZ'; cam.rotation.y = 0; cam.rotation.x = 0; cam.updateMatrixWorld();
  }, from);
  await page.evaluate(frames, 3);
  await page.keyboard.down(KEYS[code]);
  await page.evaluate(({ x, z, stopM, maxFrames }) => new Promise((resolve) => {
    const rb = window.useGameStore.getState().playerRigidBodyRef.current;
    let drawn = 0;
    const tick = () => {
      const t = rb.translation();
      drawn += 1;
      if (Math.hypot(t.x - x, t.z - z) >= stopM || drawn >= maxFrames) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), { x: from.x, z: from.z, stopM: WALK_STOP_M, maxFrames: WALK_FRAMES });
  await page.keyboard.up(KEYS[code]);
  await page.evaluate(frames, 3);
  const t = await page.evaluate(() => window.useGameStore.getState().playerRigidBodyRef.current.translation());
  const m = Math.round(Math.hypot(t.x - from.x, t.z - from.z) * 100) / 100;
  // A walk this long is the void-fall reset to the origin, not a step: read as a pass it would hide a trap.
  if (m > 20) throw new Error(`SETUP: ${code} ended ${m} m from the spot at ${JSON.stringify([t.x, t.y, t.z])}: the player was reset, not walked`);
  return m;
}

test.describe('placing beside the player at the shore', () => {
  test.setTimeout(300000);

  test('a burst of real clicks around the player never shuts them in a block, and a block an old save holds round the camera lets them go', async ({ page }) => {
    await page.addInitScript(installWorldHold);
    await page.addInitScript(installNoticeLog);
    await bootDev(page);
    await startPlayActive(page);
    await page.waitForFunction(() => window.__craftyTest?.call('readMobs') && window.__threeCamera && window.GameMethods?.castBuildRay
      && window.GameMethods?.castWorldRay && window.GameMethods?.damageMob && window.useGameStore.getState().getMobGroundLevel, null, { timeout: 60000 })
      .catch((e) => { throw new Error(`SETUP: the build ray, ground probe and camera never came up — ${e.message}`); });
    const capMs = test.info().timeout || 300000;

    // 1. A BEACH COLUMN, AND THE PRESENCE. Stood over it under the held world until its colliders stream in, then put on
    // the ground the probe finds there (the capsule's centre 0.96 m over the top, as it rests); from there the player must
    // walk a metre each way before any click, or the next column is tried (a cactus or a tree can stand in the way).
    const candidates = shoreColumns(4);
    expect(candidates.length, `SETUP: no beach column one block over the sea within 80 m of ${JSON.stringify(KEVIN)}`).toBeGreaterThan(0);
    await page.evaluate(() => window.useGameStore.setState((st) => ({ selectedBlock: 'grass', buildingMode: 'single', buildSize: 1,
      inventory: { ...st.inventory, blocks: { ...st.inventory.blocks, grass: 64 } } })));
    let spot = null;
    let baseline = null;
    const tried = [];
    for (const c of candidates) {
      const from = { x: c.x + 0.5, y: c.top + 0.96, z: c.z + 0.5 };
      const staged = await page.evaluate(standAt, { ...from, y: c.top + 1.2, capMs });
      expect(staged.why, staged.why).toBeUndefined();
      let ground = null;
      await expect.poll(async () => {
        ground = await page.evaluate(probeGround, { x: from.x, z: from.z, along: c.along });
        return !!ground && ground.every((g) => g !== null);
      }, { message: `SETUP: the colliders around the beach column ${c.x}, ${c.z} never streamed in (probe ${JSON.stringify(ground)})`, timeout: 60000 }).toBe(true);
      if (!ground.every((g) => Math.abs(g - c.top) < 0.01)) { tried.push({ ...c, ground }); continue; }
      await page.evaluate(standAt, { ...from, capMs });
      await page.evaluate(() => window.__e2eWorldHold.release());
      await page.evaluate(sweepHostiles);
      const walks = {};
      for (const code of Object.keys(KEYS)) walks[code] = await walk(page, code, from);
      tried.push({ ...c, ground, walks });
      if (Object.values(walks).every((m) => m >= WALK_MIN_M)) { spot = { ...c, from }; baseline = walks; break; }
    }
    expect(spot, `SETUP: no beach column had the generated ground and a metre's walk each way before any click (tried ${JSON.stringify(tried)})`).not.toBeNull();
    console.log(`[place-clear] beach column ${spot.x}, ${spot.z} (top ${spot.top}, pillar along ${spot.along}); baseline walks ${JSON.stringify(baseline)}`);

    // 2. THE BURST. Forward is +along: a block on the ground ahead, one on top of it, a level right-click at the pillar's
    // face (the eye's cell), one straight down (the feet's cell), the pillar mined away, a block placed behind and mined.
    await page.evaluate(standAt, { ...spot.from, capMs });
    await page.evaluate(sweepHostiles);
    const ahead = spot.along === 'z' ? Math.PI : -Math.PI / 2; // three.js: yaw 0 faces -z, PI faces +z, -PI/2 faces +x
    const behind = ahead + Math.PI;
    const down = -Math.PI / 2 + 0.02;
    const burst = [
      ['right', ahead, -1.0], ['right', ahead, -0.6], ['right', ahead, 0], ['right', ahead, down],
      ['left', ahead, 0], ['left', ahead, -0.6], ['right', behind, -1.0], ['left', behind, -1.0], ['right', behind, down],
    ];
    await page.mouse.move(640, 400);
    const clicks = [];
    for (const [button, yaw, pitch] of burst) {
      await page.evaluate(armClick, { yaw, pitch });
      await page.mouse.click(640, 400, { button });
      // At least 4 frames: the edit's re-mesh lands and a step puts its collider in the scene.
      const latency = await page.evaluate(watchClick, { minFrames: 4, maxFrames: 30 });
      clicks.push({ button, ...(await page.evaluate(() => window.__e2eClick)), latency });
    }
    const held = await page.evaluate(readHold);
    console.log(`[place-clear] clicks ${JSON.stringify(clicks)}`);
    console.log(`[place-clear] click to solid, in drawn frames: ${JSON.stringify(clicks.filter((c) => c.latency.placed).map((c) => ({ cell: c.placeCell, standInsAtClick: c.standInsAtClick, ...c.latency })))}`);
    console.log(`[place-clear] after the burst ${JSON.stringify(held)}`);
    const pressed = clicks.filter((c) => c.verb === 'place' || c.verb === 'mine');
    expect(pressed.length, `SETUP: of ${clicks.length} clicks, only ${pressed.length} reached the place or mine verb (gates ${JSON.stringify(held.gates)}; clicks ${JSON.stringify(clicks)})`).toBe(clicks.length);
    const intoBody = clicks.filter((c) => c.button === 'right' && c.placeInBody);
    expect(intoBody.length, `SETUP: no right-click aimed at a cell inside the body, so the burst never tested the defect (clicks ${JSON.stringify(clicks)})`).toBeGreaterThan(0);

    // THE STAND-INS ARE LIVE: one held from each placing click, and every one retired within the watch's frame bound.
    const placing = clicks.filter((c) => c.latency.placed);
    expect(placing.length, `SETUP: no click placed a cell, so the stand-ins were never made (clicks ${JSON.stringify(clicks)})`).toBeGreaterThan(0);
    for (const c of placing) {
      expect(c.standInsAtClick, `the placing click at ${c.placeCell} held no stand-in collider at the click (${JSON.stringify(c)})`).toBeGreaterThanOrEqual(1);
      expect(c.latency.standIns.at(-1), `the stand-ins after the placing click at ${c.placeCell} were not back to 0 within ${c.latency.frames} drawn frames (held ${JSON.stringify(c.latency.standIns)}; ray solid at ${c.latency.solidAt}, mesh set at ${c.latency.meshAt})`).toBe(0);
    }

    // 3. THE SUBJECT: no block inside the body, every right-click into it refused and spent nothing, and the player told.
    expect(held.inBody, `a block was left inside the player: ${JSON.stringify(held)}`).toEqual([]);
    for (const c of intoBody) {
      expect({ placed: c.placedNow, spent: c.stackBefore - c.stackAfter }, `a right-click into the body's cell ${c.placeCell} placed or spent (click ${JSON.stringify(c)})`).toEqual({ placed: null, spent: 0 });
    }
    const outside = clicks.filter((c) => c.button === 'right' && c.verb === 'place' && !c.placeInBody);
    expect(outside.length, 'SETUP: no right-click placed clear of the body').toBeGreaterThan(0);
    for (const c of outside) expect(c.placedNow, `a right-click clear of the body was refused (click ${JSON.stringify(c)})`).not.toBeNull();
    expect(await page.evaluate(() => window.__e2eRefusals.length), 'the refused right-click told the player nothing').toBeGreaterThan(0);

    // 4. AND THEY WALK OUT, each way, from where the burst left them.
    const after = { x: held.body[0], y: held.body[1], z: held.body[2] };
    await page.evaluate(() => window.__e2eWorldHold.release());
    await page.evaluate(sweepHostiles);
    for (const code of Object.keys(KEYS)) {
      const m = await walk(page, code, after);
      expect(m, `after the burst, ${code} walked ${m} m (baseline ${baseline[code]} m): the player is held (${JSON.stringify(await page.evaluate(readHold))})`).toBeGreaterThanOrEqual(WALK_MIN_M);
    }

    // 5. A SAVE FROM BEFORE THE FIX: a block around the camera, written as a load writes a save's placed blocks.
    await page.evaluate(standAt, { ...spot.from, capMs });
    const boxed = await page.evaluate(({ x, y, z }) => {
      const s = window.useGameStore.getState();
      if (!s.terrainWorker) return { why: 'SETUP: no terrain worker in the store' };
      const cell = [Math.floor(x), Math.floor(y + 0.67), Math.floor(z)];
      const cx = Math.floor(cell[0] / 16), cz = Math.floor(cell[2] / 16);
      s.terrainWorker.postMessage({ type: 'update_block', payload: { cx, cz, x: cell[0] - cx * 16, y: cell[1], z: cell[2] - cz * 16, blockType: 1 } });
      s.setWorldBlocks(new Map(s.worldBlocks).set(cell.join('_'), 1));
      return { cell: cell.join('_') };
    }, spot.from);
    expect(boxed.why, boxed.why).toBeUndefined();
    let box = null;
    await expect.poll(async () => {
      box = await page.evaluate(readHold);
      return Object.values(box.eyeRays).every((d) => d !== null && d < 0.7);
    }, { message: `SETUP: the block written around the camera never closed in its collider (${JSON.stringify(box)})`, timeout: 30000 }).toBe(true);
    expect(box.inBody, `SETUP: the block written around the camera is not inside the body (${JSON.stringify(box)})`).toContain(boxed.cell);
    // Released, the stuck-in-rock watch stands the capsule clear of the block within CLEAR_FRAMES: beside it, the nearest
    // open spot a straight move through open cells reaches, or on the column's top where none is (game/formFit.js).
    await page.evaluate(() => window.__e2eWorldHold.release());
    const clearOn = await page.evaluate(framesUntilClear, { cell: boxed.cell, maxFrames: CLEAR_FRAMES });
    const clear = await page.evaluate(readHold);
    console.log(`[place-clear] stood clear of the block ${boxed.cell} on frame ${clearOn} of ${CLEAR_FRAMES}: ${JSON.stringify(clear)}`);
    expect(clearOn, `the block written around the camera still held the player ${CLEAR_FRAMES} frames after the release (${JSON.stringify(clear)})`).not.toBeNull();
    expect(clear.inBody, `a placed block is still inside the body once it was stood clear (${JSON.stringify(clear)})`).toEqual([]);
    const freed = { x: clear.body[0], y: clear.body[1], z: clear.body[2] };
    for (const code of Object.keys(KEYS)) {
      const m = await walk(page, code, freed);
      expect(m, `stood clear of the block, ${code} walked ${m} m: the player is held (${JSON.stringify(await page.evaluate(readHold))})`).toBeGreaterThanOrEqual(WALK_MIN_M);
    }
  });
});
