// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { placeAtHit } from '../../src/world/placeAtHit.js';
import { mineTarget } from '../../src/world/buildTarget.js';
import { createPlacedCellColliders, createEditSeq } from '../../src/world/placedCellColliders.js';
import { generateMesh } from '../../src/world/mesher.js';
import { voxelIndex, CHUNK_SIZE, CHUNK_VOLUME, chunkOf } from '../../src/world/chunkLayout.js';
import { moveKinematic } from '../../src/game/kinematicMove.js';
import { BASE_CAPSULE, BEAST_FORMS } from '../../src/game/beasts.js';
import { BASE_MOVE_SPEED, JUMP_VELOCITY, GLUE_VELOCITY, applyGravity } from '../../src/game/locomotion.js';
import { EYE_HEIGHT_M } from '../../src/combat/swingOrigin.js';
import { SEA_LEVEL } from '../../src/world/oceanProfile.js';

// A RIGHT-CLICK MUST NOT PUT A BLOCK INSIDE THE PLAYER (Kevin, 2026-10-30: "stuck in an invisible box ... near the oceans
// ... left click / right clicking chaotically"). Pressed against a step or looking down, the place verb's cell can be one
// the player's own capsule fills. The block is written, its chunk re-meshes, and the new trimesh collider holds the
// capsule from inside: the KCC moves it nowhere. With the camera inside the cell, every face of the block points away from
// the eye and the FrontSide terrain material culls them all, so the box cannot be seen; the build ray from inside hits
// the box's inner face, so a left click mines the cell beyond it and a right click fills the box's own cell again.
//
// Real modules wired the way the game wires them: the greedy mesher (world/mesher.js), one fixed body and one trimesh
// collider per chunk over the drawn positions and indices (Terrain.jsx ChunkMesh), rebuilt on every edit
// (terrain.worker.js update_block); the player as Components.jsx makes it (kinematic body, capsule BASE_CAPSULE, KCC
// offset 0.05, autostep 1.05 / 0.2, snap 0.5, 45 degree slope), moved once a frame through moveKinematic; the eye
// EYE_HEIGHT_M over the body; the build ray as world/buildRay.js castBuildRay casts it (8 m, the player's body excluded); and
// the real placeAtHit against the real store, its batched edit answered as the worker answers it. @dimforge/rapier3d-compat is
// the build the app ships.
//
// A LATE TRIMESH. In the game a placed cell's trimesh lands some frames after the click (the worker re-meshes, the main
// thread sets the chunk, @react-three/rapier rebuilds the collider in a passive effect), and a player running at 14 m/s
// covers a cell's width in four frames. So the worker here can land each edit `lag` frames late, between two frames as the
// passive effect does, with the edit's seq echoed as terrain.worker.js echoes it, and several meshes due together land as
// one React commit does: every old trimesh removed, then every new one created. The real world/placedCellColliders.js
// stands in for each placed cell from the click, wired as Terrain.jsx and the Player loop wire it (placeAtHit's `cells`,
// moveKinematic's `unindexed`, `landed` after the trimesh is built, `afterStep` after each world step).
//
// WHAT THIS DOES NOT CHECK: the build ray inside Terrain.jsx itself, the verb router, or React's own effect order and
// Terrain.jsx's wiring of the colliders (the e2e tests/e2e/place-clear-of-player.spec.js drives real clicks in the booted
// game and logs the live delay from a click to a solid cell).
//
// Mutation-Proof: see the commit trailer.

const DT = 1 / 60;
const AIR = 0, SAND = 4, STONE = 3, WATER = 9;
const LAND_TOP = 30; // the land's top face: solid cells y < 30, so the player stands in cells y = 30, 31
const SEA_X = 12; // from x = 12 east, a seabed under water to SEA_LEVEL: the shore the player stands beside
const SEA_FLOOR = 24;

beforeAll(async () => {
  await RAPIER.init();
});

let notes;
let clock = 1e7;
beforeEach(() => {
  useGameStore.setState(useGameStore.getInitialState(), true);
  notes = [];
  // The denial toast is throttled to one a second on performance.now; each read is 5 s on, so none is swallowed.
  vi.spyOn(performance, 'now').mockImplementation(() => (clock += 5000));
  useGameStore.setState((s) => ({
    addNotification: (text, type) => notes.push({ text, type }),
    worldBlocks: new Map(),
    chests: new Map(),
    selectedBlock: 'grass',
    buildingMode: 'single',
    buildSize: 1,
    inventory: { ...s.inventory, blocks: { ...s.inventory.blocks, grass: 64 } },
  }));
});
afterEach(() => {
  vi.restoreAllMocks();
  useGameStore.setState(useGameStore.getInitialState(), true);
});

// ---- the world: 3 x 3 chunks of land beside a shore -------------------------------------------------------------------
function makeChunks() {
  const chunks = new Map();
  for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) {
    const b = new Uint8Array(CHUNK_VOLUME);
    for (let lx = 0; lx < CHUNK_SIZE; lx++) for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const sea = cx * CHUNK_SIZE + lx >= SEA_X;
      const top = sea ? SEA_FLOOR : LAND_TOP - 1;
      for (let y = 0; y <= top; y++) b[voxelIndex(lx, y, lz)] = y >= top - 2 ? SAND : STONE;
      for (let y = top + 1; y <= SEA_LEVEL; y++) b[voxelIndex(lx, y, lz)] = WATER;
    }
    chunks.set(`${cx}_${cz}`, b);
  }
  return chunks;
}

/** One React commit of chunk meshes, in React's order: every old trimesh removed (passive cleanups run before passive
 *  setups), then each chunk's subtree in turn, children first. A chunk mounted the first time is mounted as
 *  @react-three/rapier 2.2 mounts it: the TrimeshCollider's effect makes the body (a RigidBodyDesc with no translation,
 *  so at the origin) and the trimesh on it, then the RigidBody's own effect moves the body to the chunk's place with
 *  setTranslation(position, false), which Rapier carries to the body's colliders only at a step or a propagation. Last,
 *  ChunkMesh's effect calls `landed`. */
function mountChunks(S, landing) {
  const built = landing.map(({ key }) => {
    const [cx, cz] = key.split('_').map(Number);
    return { key, cx, cz, mesh: generateMesh(cx, cz, S.chunks.get(key), undefined) };
  });
  for (const { key } of built) {
    const rec = S.recs.get(key);
    if (rec?.collider) { S.world.removeCollider(rec.collider, true); rec.collider = null; }
  }
  for (const [i, b] of built.entries()) {
    let rec = S.recs.get(b.key);
    const first = !rec;
    if (first) S.recs.set(b.key, (rec = { body: S.world.createRigidBody(RAPIER.RigidBodyDesc.fixed()), collider: null }));
    rec.collider = b.mesh.indices.length ? S.world.createCollider(RAPIER.ColliderDesc.trimesh(b.mesh.positions, b.mesh.indices), rec.body) : null;
    if (first) rec.body.setTranslation({ x: b.cx * CHUNK_SIZE, y: 0, z: b.cz * CHUNK_SIZE }, false);
    S.cells?.landed(b.cx, b.cz, landing[i].editSeq, rec.collider);
  }
}

function mountChunk(S, key) {
  mountChunks(S, [{ key, editSeq: S.worker?.seq ?? 0 }]);
}

function setVoxel(S, x, y, z, t) {
  const cx = chunkOf(x), cz = chunkOf(z);
  S.chunks.get(`${cx}_${cz}`)[voxelIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)] = t;
  mountChunk(S, `${cx}_${cz}`);
}

/** terrain.worker.js handles messages in order: each edit is applied and its chunk re-meshed with the last placement seq
 *  it has seen; the mesh reaches the main thread `lag` frames later (never before an earlier one). Lag 0 lands at once. */
function post(S, msg, lag) {
  const { cx, cz, x, y, z, blockType, seq } = msg.payload;
  if (typeof seq === 'number') S.worker.seq = seq;
  const item = { due: Math.max(S.f + lag, S.worker.lastDue), wx: cx * CHUNK_SIZE + x, y, wz: cz * CHUNK_SIZE + z, t: blockType, editSeq: S.worker.seq };
  S.worker.lastDue = item.due;
  S.worker.queue.push(item);
  if (lag === 0) landDue(S);
}

/** The meshes due by now, landed as one commit (the voxels of every due edit first, then the chunks they touch). */
function landDue(S) {
  const due = S.worker.queue.filter((q) => q.due <= S.f);
  if (!due.length) return;
  S.worker.queue = S.worker.queue.filter((q) => q.due > S.f);
  const byChunk = new Map();
  for (const q of due) {
    const cx = chunkOf(q.wx), cz = chunkOf(q.wz);
    // A cell the worker refused changes no voxel; its chunk is re-meshed all the same.
    if (q.t !== null) S.chunks.get(`${cx}_${cz}`)[voxelIndex(q.wx - cx * CHUNK_SIZE, q.y, q.wz - cz * CHUNK_SIZE)] = q.t;
    byChunk.set(`${cx}_${cz}`, q.editSeq);
  }
  mountChunks(S, [...byChunk].map(([key, editSeq]) => ({ key, editSeq })));
}

/** A frame of the game: the meshes due land between frames, then the Player frame and its world steps. */
function tick(S, opts) {
  landDue(S);
  frame(S.p, opts);
  S.f++;
}

function voxel(S, x, y, z) {
  const cx = chunkOf(x), cz = chunkOf(z);
  return S.chunks.get(`${cx}_${cz}`)[voxelIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)];
}

function makeKcc(world) {
  const kcc = world.createCharacterController(0.05);
  kcc.enableAutostep(1.05, 0.2, true);
  kcc.enableSnapToGround(0.5);
  kcc.setMaxSlopeClimbAngle(Math.PI / 4);
  return kcc;
}

function playerParts(world, body, collider, cells) {
  const handle = body.handle;
  return { world, body, collider, cells, kcc: makeKcc(world), vy: 0, filter: (c) => { const p = c.parent(); return !p || p.handle !== handle; } };
}

/** A world with the player standing at (x, z) on the land, its body published where placeAtHit reads it. */
function makeScene({ x = 4.5, z = 8.5, edits = [] } = {}) {
  const world = new RAPIER.World({ x: 0, y: -30, z: 0 });
  const S = { world, chunks: makeChunks(), recs: new Map(), worker: { seq: 0, lastDue: 0, queue: [] }, f: 0 };
  for (const [ex, ey, ez, t] of edits) {
    const cx = chunkOf(ex), cz = chunkOf(ez);
    S.chunks.get(`${cx}_${cz}`)[voxelIndex(ex - cx * CHUNK_SIZE, ey, ez - cz * CHUNK_SIZE)] = t;
  }
  for (const key of S.chunks.keys()) mountChunk(S, key);
  S.cells = createPlacedCellColliders(world, RAPIER, createEditSeq());
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, LAND_TOP + 1.2, z));
  const collider = world.createCollider(RAPIER.ColliderDesc.capsule(BASE_CAPSULE.halfHeight, BASE_CAPSULE.radius), body);
  S.p = playerParts(world, body, collider, S.cells);
  world.step();
  for (let i = 0; i < 60; i++) frame(S.p); // settle onto the land
  useGameStore.setState({ playerRigidBodyRef: { current: body } });
  return S;
}

/** One Player frame at `hz`: grounded from the last sweep, jump / glue / gravity, one moveKinematic write (the colliders
 *  made since the last step handed in, as Components.jsx hands them), then the world steps @react-three/rapier's fixed
 *  1/60 s accumulator takes in that time (two at 30 Hz), each followed by the after-step callback. The sweep comes BEFORE
 *  the steps here, the worst order: in the game the stepper subscribed first and steps first, so a collider made between
 *  frames is unseen only by the sweep of a frame that takes no step (every other frame at 120 Hz, and at any rate a frame
 *  whose accumulator is under 1/60 s; at most 1/60 s of travel). */
function frame(P, { mx = 0, mz = 0, jump = false, hz = 60 } = {}) {
  const dt = 1 / hz;
  const grounded = P.kcc.computedGrounded();
  if (jump && grounded) P.vy = JUMP_VELOCITY;
  else if (grounded) P.vy = GLUE_VELOCITY;
  else P.vy = applyGravity(P.vy, 1, dt);
  moveKinematic(P.body, P.kcc, P.collider, { x: mx * BASE_MOVE_SPEED * dt, y: P.vy * dt, z: mz * BASE_MOVE_SPEED * dt }, P.filter, P.cells?.unindexed());
  for (let s = 0; s < Math.round(dt / DT); s++) {
    P.world.step();
    P.cells?.afterStep();
  }
}

const eye = (S) => { const t = S.p.body.translation(); return new THREE.Vector3(t.x, t.y + EYE_HEIGHT_M, t.z); };

/** world/buildRay.js castBuildRay: the hit the place verb is handed (the direction scaled by toi, as there), from the camera,
 *  which is the eye unless a test moves it. */
function buildRay(S, dir, from = eye(S)) {
  const d = new THREE.Vector3(dir.x, dir.y, dir.z).normalize();
  const ray = new RAPIER.Ray({ x: from.x, y: from.y, z: from.z }, { x: d.x, y: d.y, z: d.z });
  const hit = S.world.castRayAndGetNormal(ray, 8.0, true, undefined, undefined, undefined, S.p.body, S.p.filter);
  if (!hit) return null;
  const toi = hit.timeOfImpact;
  const hitPoint = from.clone().add(d.multiplyScalar(toi));
  return { toi, normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z }, direction: d, hitPoint };
}

/** The voxel the worker holds at a cell: its latest edit still in flight, else the voxels here. */
function workerVoxel(S, x, y, z) {
  for (let i = S.worker.queue.length - 1; i >= 0; i--) {
    const q = S.worker.queue[i];
    if (q.t !== null && q.wx === x && q.y === y && q.wz === z) return q.t;
  }
  return voxel(S, x, y, z);
}

/** The right-click: the real placeAtHit with the cells held solid from the click, its batched edit answered as
 *  terrain.worker.js answers it (a cell filled only where the worker holds air or water, every sent cell's chunk
 *  re-meshed), the edits landing `lag` frames on. `placed` is the cells filled, `cells` the cells sent. */
function rightClick(S, h, lag = 0) {
  const cells = [];
  let placed = 0;
  placeAtHit(h, {
    cells: S.cells,
    editCells: (edit, done) => {
      const applied = [];
      edit.cells.forEach((c, i) => {
        cells.push([c.x, c.y, c.z]);
        const empty = [AIR, WATER].includes(workerVoxel(S, c.x, c.y, c.z));
        if (empty) applied.push(i);
        const cx = chunkOf(c.x), cz = chunkOf(c.z);
        post(S, { type: 'update_block', payload: { cx, cz, x: c.x - cx * CHUNK_SIZE, y: c.y, z: c.z - cz * CHUNK_SIZE, blockType: empty ? edit.blockType : null, seq: c.seq } }, lag);
      });
      placed = applied.length;
      done(applied);
    },
  });
  return { placed, cells };
}

/** The left click as Terrain.jsx's mine verb makes it: the cell the build ray targets, mined in the store and the worker. */
function leftClick(S, h, lag = 0) {
  const c = mineTarget(h.hitPoint, h.direction, useGameStore.getState());
  const cx = chunkOf(c.x), cz = chunkOf(c.z);
  post(S, { type: 'update_block', payload: { cx, cz, x: c.x - cx * CHUNK_SIZE, y: c.y, z: c.z - cz * CHUNK_SIZE, blockType: AIR } }, lag);
  useGameStore.setState({ worldBlocks: new Map(useGameStore.getState().worldBlocks).set(`${c.x}_${c.y}_${c.z}`, 0) });
  return [c.x, c.y, c.z];
}

/** Exact capsule-vs-cell overlap: the capsule's vertical segment against the unit box, closer than the radius. */
function overlaps(S, [x, y, z]) {
  const t = S.p.body.translation();
  const hh = S.p.collider.halfHeight(), r = S.p.collider.radius();
  const dx = Math.max(x - t.x, 0, t.x - (x + 1));
  const dz = Math.max(z - t.z, 0, t.z - (z + 1));
  const dy = Math.max(y - (t.y + hh), 0, (t.y - hh) - (y + 1));
  return Math.hypot(dx, dy, dz) < r;
}

function solidInBody(S) {
  const t = S.p.body.translation(), out = [];
  for (let x = Math.floor(t.x) - 1; x <= Math.floor(t.x) + 1; x++)
    for (let y = Math.floor(t.y) - 2; y <= Math.floor(t.y) + 2; y++)
      for (let z = Math.floor(t.z) - 1; z <= Math.floor(t.z) + 1; z++) {
        const v = voxel(S, x, y, z);
        if (v !== AIR && v !== WATER && overlaps(S, [x, y, z])) out.push(`${x},${y},${z}`);
      }
  return out;
}

/** Can the player get out? From a snapshot of this exact state: 8 headings, each walked and jumped for one second. */
function escape(S) {
  const snap = S.world.takeSnapshot();
  const t0 = S.p.body.translation();
  let best = 0, rise = 0;
  const runs = [];
  for (let k = 0; k < 8; k++) for (const jump of [false, true]) {
    const w = RAPIER.World.restoreSnapshot(snap);
    const P = playerParts(w, w.getRigidBody(S.p.body.handle), w.getCollider(S.p.collider.handle));
    const a = (k * Math.PI) / 4;
    let up = 0;
    for (let i = 0; i < 60; i++) { frame(P, { mx: Math.cos(a), mz: Math.sin(a), jump }); up = Math.max(up, P.body.translation().y - t0.y); }
    const e = P.body.translation();
    const moved = Math.hypot(e.x - t0.x, e.z - t0.z);
    runs.push(+moved.toFixed(2));
    best = Math.max(best, moved);
    rise = Math.max(rise, up);
    w.free();
  }
  return { free: best > 1 || rise > 1, best: +best.toFixed(3), rise: +rise.toFixed(3), runs };
}

const grass = () => useGameStore.getState().inventory.blocks.grass;
const IN_THE_WAY = /standing/i;

describe('a right-click never puts a block inside the player (real Rapier, real mesher, real placeAtHit)', () => {
  it('the instrument sees a trap: a block written into the eye\'s cell holds the player, the same world without it does not', () => {
    const open = makeScene();
    expect(escape(open).free, 'SETUP: the player cannot walk on open land, so no reading below means anything').toBe(true);
    const S = makeScene();
    const e = eye(S);
    setVoxel(S, Math.floor(e.x), Math.floor(e.y), Math.floor(e.z), STONE);
    const out = escape(S);
    expect(out.free, `SETUP: a block in the eye's cell did not trap the player (${JSON.stringify(out)}): the escape reading cannot see a trap`).toBe(false);
  });

  it('pressed against a two-high step at the shore, a level right-click at its face (the eye\'s cell) is refused and the player walks on', () => {
    const S = makeScene({ x: 4.5, z: 8.5, edits: [[2, LAND_TOP, 8, SAND], [2, LAND_TOP + 1, 8, SAND]] });
    for (let i = 0; i < 30; i++) frame(S.p, { mx: -1 });
    for (let i = 0; i < 10; i++) frame(S.p);
    const h = buildRay(S, { x: -1, y: 0, z: 0 });
    expect(h, 'SETUP: the level ray from the eye hits nothing').not.toBeNull();
    expect(h.toi, `SETUP: the player is not pressed against the step (the ray hits it ${h.toi.toFixed(2)} m away)`).toBeLessThan(0.6);
    const before = grass();
    const r = rightClick(S, h);
    const out = escape(S);
    expect(solidInBody(S), `a block was placed inside the player (cells ${JSON.stringify(r.cells)}; then best walk ${out.best} m, best rise ${out.rise} m)`).toEqual([]);
    expect(out.free, `the right-click trapped the player: best walk ${out.best} m, best rise ${out.rise} m over 16 tries ${JSON.stringify(out.runs)}`).toBe(true);
    expect(r.placed, 'the refused placement reports a cell placed').toBe(0);
    expect(grass(), 'the refused placement spent a block').toBe(before);
    expect(notes.map((n) => n.text).filter((t) => IN_THE_WAY.test(t)), `the refusal was silent (notes ${JSON.stringify(notes)})`).toHaveLength(1);
  });

  it('looking straight down, a right-click at the ground (the feet\'s cell) is refused and the player walks on', () => {
    // Off the cell's centre, where a player stands: at the exact centre the KCC walked the capsule out of a block in its
    // feet (measured: 14 m), and 0 m from each of five other spots in the cell.
    const S = makeScene({ x: 4.45, z: 8.3 });
    const h = buildRay(S, { x: 0, y: -1, z: 0 });
    expect(h, 'SETUP: the ray down hits nothing').not.toBeNull();
    const r = rightClick(S, h);
    const out = escape(S);
    expect(solidInBody(S), `a block was placed inside the player (cells ${JSON.stringify(r.cells)}; then best walk ${out.best} m, best rise ${out.rise} m)`).toEqual([]);
    expect(out.free, `the right-click trapped the player: best walk ${out.best} m, best rise ${out.rise} m ${JSON.stringify(out.runs)}`).toBe(true);
    expect(r.placed, 'the refused placement reports a cell placed').toBe(0);
  });

  it('right after a teleport (a respawn, a load), before any world step, a right-click at the new feet\'s cell is refused', () => {
    // The Player loop's spawn and resume branches move the body with setTranslation; its collider follows only at the next
    // world step, and a click can land in between (chaos session deep, 120 Hz, lag 8, seed 1: a click on the frame of the
    // respawn put a block into the capsule at the origin). The guard reads where the body is, not where its collider was.
    const S = makeScene({ x: 4.45, z: 8.3 });
    S.p.body.setTranslation({ x: 9.45, y: LAND_TOP + 0.95, z: 8.3 }, true);
    expect(S.p.collider.translation().x, 'SETUP: the collider already followed the teleport').toBeCloseTo(4.45, 3);
    const h = buildRay(S, { x: 0, y: -1, z: 0 });
    expect(h && h.toi, 'SETUP: the ray down from the new eye does not reach the ground').toBeLessThan(2);
    const r = rightClick(S, h);
    expect(r.placed, `a block was placed into the teleported body (cells ${JSON.stringify(r.cells)})`).toBe(0);
  });

  it('the control: the same click at the step from a metre back places the block, and the player still walks', () => {
    const S = makeScene({ x: 4.5, z: 8.5, edits: [[2, LAND_TOP, 8, SAND], [2, LAND_TOP + 1, 8, SAND]] });
    const h = buildRay(S, { x: -1, y: 0, z: 0 });
    expect(h && h.toi, 'SETUP: the level ray does not reach the step a metre back').toBeGreaterThan(1);
    const before = grass();
    const r = rightClick(S, h);
    expect(r.placed, `a placement clear of the player was refused (notes ${JSON.stringify(notes)})`).toBe(1);
    expect(r.cells, 'the placement went somewhere other than the cell in front of the step').toEqual([[3, LAND_TOP + 1, 8]]);
    expect(grass(), 'the placement did not spend one block').toBe(before - 1);
    expect(escape(S).free, 'a placement clear of the player trapped them').toBe(true);
  });

  it('building stays possible: a block on the ground beside the player places, and one under the feet places once a jump has lifted them clear of its cell', () => {
    const S = makeScene();
    const beside = { hitPoint: new THREE.Vector3(5.5, LAND_TOP, 8.5), normal: { x: 0, y: 1, z: 0 }, direction: new THREE.Vector3(0, -1, 0) };
    expect(rightClick(S, beside).placed, `the cell beside the player (0.1 m clear of the capsule) was refused (notes ${JSON.stringify(notes)})`).toBe(1);

    const P = makeScene();
    const y0 = P.p.body.translation().y;
    frame(P.p, { jump: true });
    // Part-way up, the capsule's lower end is still inside the cell under it (its bottom, not its centre, is what counts).
    while (P.p.body.translation().y - y0 < 0.4) frame(P.p);
    const rising = P.p.body.translation().y - y0;
    expect(overlaps(P, [4, LAND_TOP, 8]), `SETUP: ${rising.toFixed(2)} m up, the capsule has already left the cell under it`).toBe(true);
    const early = rightClick(P, buildRay(P, { x: 0, y: -1, z: 0 }));
    expect(early.placed, `a block was placed into the cell the rising player's feet are still in (${rising.toFixed(2)} m up)`).toBe(0);
    for (let i = 0; i < 120 && P.p.vy > 0; i++) frame(P.p);
    const apex = P.p.body.translation().y - y0;
    expect(apex, 'SETUP: the jump did not lift the feet a block clear').toBeGreaterThan(1.1);
    const down = buildRay(P, { x: 0, y: -1, z: 0 });
    const r = rightClick(P, down);
    expect(r.placed, `a pillar block placed under the feet at the jump's apex (${apex.toFixed(2)} m) was refused`).toBe(1);
    expect(r.cells, 'the pillar block went somewhere other than the cell under the player').toEqual([[4, LAND_TOP, 8]]);
    for (let i = 0; i < 90; i++) frame(P.p);
    expect(P.p.body.translation().y - y0, 'the player did not land on the pillar block').toBeGreaterThan(0.9);
  });

  it('the guard reads the body\'s live shape: in the bull form a cell the base capsule clears but the bull fills is refused', () => {
    const S = makeScene();
    const bull = BEAST_FORMS.ice;
    expect(bull.radius, 'SETUP: the bull is no wider than the base capsule').toBeGreaterThan(BASE_CAPSULE.radius + 0.1);
    // The shape set in place where the body stands, with no fit (game/formFit.js places the game's swap): the guard must
    // read the shape the body has, wherever it is.
    S.p.collider.setShape(new RAPIER.Capsule(bull.halfHeight, bull.radius));
    moveKinematic(S.p.body, S.p.kcc, S.p.collider, { x: 0, y: GLUE_VELOCITY * DT, z: 0 }, S.p.filter);
    S.p.world.step();
    for (let i = 0; i < 30; i++) frame(S.p);
    const beside = { hitPoint: new THREE.Vector3(5.5, LAND_TOP, 8.5), normal: { x: 0, y: 1, z: 0 }, direction: new THREE.Vector3(0, -1, 0) };
    expect(overlaps(S, [5, LAND_TOP, 8]), 'SETUP: the bull does not reach into the cell beside it').toBe(true);
    expect(overlaps(S, [5, LAND_TOP, 8]) && !overlaps({ p: { body: S.p.body, collider: { halfHeight: () => BASE_CAPSULE.halfHeight, radius: () => BASE_CAPSULE.radius } } }, [5, LAND_TOP, 8]),
      'SETUP: the base capsule would also reach the cell, so this does not show the guard reads the live shape').toBe(true);
    const r = rightClick(S, beside);
    expect(r.placed, 'a cell inside the bull\'s body was placed').toBe(0);
    expect(voxel(S, 5, LAND_TOP, 8), 'a block was placed inside the bull').toBe(AIR);
  });

  it('a block an earlier click left around the camera (a save from before the fix): a left click mines it, and the player walks out', () => {
    const S = makeScene({ x: 4.5, z: 8.5, edits: [[2, LAND_TOP, 8, SAND], [2, LAND_TOP + 1, 8, SAND]] });
    // The control first: with the eye's cell clear, a left click takes the block the ray hits (the step's upper cell).
    const target = (h) => {
      const c = mineTarget(h.hitPoint, h.direction, useGameStore.getState());
      return [c.x, c.y, c.z];
    };
    expect(target(buildRay(S, { x: -1, y: 0, z: 0 })), 'with the eye clear, the left click does not take the block the ray hits').toEqual([2, LAND_TOP + 1, 8]);

    const e = eye(S);
    const cell = [Math.floor(e.x), Math.floor(e.y), Math.floor(e.z)];
    setVoxel(S, cell[0], cell[1], cell[2], 1);
    useGameStore.setState({ worldBlocks: new Map([[cell.join('_'), 1]]) });
    expect(escape(S).free, 'SETUP: the block around the camera does not hold the player').toBe(false);
    const taken = [];
    for (const dir of [{ x: -1, y: 0, z: 0 }, { x: 0.4, y: -0.3, z: 1 }, { x: 0, y: -1, z: 0 }]) {
      const h = buildRay(S, dir);
      expect(h && h.toi, `SETUP: from inside the block the ray ${JSON.stringify(dir)} hits nothing within its face`).toBeLessThan(0.7);
      taken.push(target(h));
    }
    expect(taken, 'from inside a placed block, the left click takes a cell other than the one around the camera').toEqual([cell, cell, cell]);
    // Mined as the mine verb mines it: the voxel cleared and the store's record set to 0 (mined), not deleted.
    setVoxel(S, cell[0], cell[1], cell[2], AIR);
    useGameStore.setState({ worldBlocks: new Map([[cell.join('_'), 0]]) });
    const out = escape(S);
    expect(out.free, `mining the block around the camera did not free the player (best walk ${out.best} m, rise ${out.rise} m)`).toBe(true);
    // With the eye still in the mined cell, the next left click takes what it aims at, not the empty cell around the eye.
    expect(target(buildRay(S, { x: -1, y: 0, z: 0 })), 'with the eye in a mined cell, the left click took that empty cell instead of the block it aims at').toEqual([2, LAND_TOP + 1, 8]);
  });

  it('the roar camera sitting in a wall block 4.5 m behind and 2.2 m above the body: a left click from it does not take that wall block', () => {
    const S = makeScene({ x: 4.3, z: 8.5 });
    const t = S.p.body.translation();
    // game/transformCam.js: the reveal pose sits 4.5 m behind the facing (here -x) and 2.2 m over the body, looking at mid-body.
    const cam = new THREE.Vector3(t.x + 4.5, t.y + 2.2, t.z);
    const wall = [Math.floor(cam.x), Math.floor(cam.y), Math.floor(cam.z)];
    setVoxel(S, wall[0], wall[1], wall[2], SAND);
    useGameStore.setState({ worldBlocks: new Map([[wall.join('_'), SAND]]) });
    frame(S.p); // a block placed before the roar: its trimesh indexed by a step since
    const h = buildRay(S, { x: t.x - cam.x, y: t.y + 0.6 - cam.y, z: 0 }, cam);
    expect(h && h.toi, 'SETUP: the ray from the roar camera does not meet its own block\'s inner face first').toBeLessThan(1);
    const c = mineTarget(h.hitPoint, h.direction, useGameStore.getState());
    expect([c.x, c.y, c.z], 'the left click took the wall block the roar camera sits in, behind the player').not.toEqual(wall);
  });

  it('a footprint around the player places every cell but the ones the body fills, and spends exactly those', () => {
    const S = makeScene();
    useGameStore.setState({ buildingMode: 'cube', buildSize: 3 });
    const before = grass();
    const r = rightClick(S, buildRay(S, { x: 0, y: -1, z: 0 }));
    const inBody = r.cells.filter((c) => overlaps(S, c));
    expect(r.cells.length, `the 3 x 3 x 3 footprint placed ${r.cells.length} cells: the body's column is 2 cells, so 25 should place`).toBe(25);
    expect(inBody, 'a footprint cell went inside the player').toEqual([]);
    expect(r.placed, 'the placed count is not the cells sent').toBe(r.cells.length);
    expect(before - grass(), 'the footprint spent a block for a cell it did not place').toBe(r.cells.length);
    expect(solidInBody(S), 'a block is inside the player after the footprint').toEqual([]);
  });
});

// ---- a late trimesh ----------------------------------------------------------------------------------------------------
const STEP = [[2, LAND_TOP, 8, SAND], [2, LAND_TOP + 1, 8, SAND]]; // a two-high step, its face at x = 3
const CELL = [3, LAND_TOP + 1, 8]; // the cell in front of the step at eye height

/** How far the capsule reaches into the unit cell: its radius less the core segment's distance to the box (0 when clear). */
function depth(S, [x, y, z]) {
  const t = S.p.body.translation();
  const hh = S.p.collider.halfHeight(), r = S.p.collider.radius();
  const dx = Math.max(x - t.x, 0, t.x - (x + 1));
  const dz = Math.max(z - t.z, 0, t.z - (z + 1));
  const dy = Math.max(y - (t.y + hh), 0, (t.y - hh) - (y + 1));
  return Math.max(0, r - Math.hypot(dx, dy, dz));
}

const solidAt = (S, [x, y, z]) => { const v = voxel(S, x, y, z); return v !== AIR && v !== WATER; };
const eyeCell = (S) => { const e = eye(S); return [Math.floor(e.x), Math.floor(e.y), Math.floor(e.z)]; };

/** Running at the step from `x` (1.5 m off its face at 4.5), a right-click at its face at eye level, W held while the
 *  trimesh is `lag` frames late and ten frames after; the deepest the capsule reached into the placed cell. */
function lateWall({ lag, hz = 60, x = 4.5, first = () => {} }) {
  const S = makeScene({ x, z: 8.5, edits: STEP });
  first(S);
  const r = rightClick(S, buildRay(S, { x: -1, y: 0, z: 0 }), lag);
  let deepest = 0;
  for (let i = 0; i < lag + 10; i++) {
    tick(S, { mx: -1, hz });
    deepest = Math.max(deepest, depth(S, CELL));
  }
  return { S, r, deepest };
}

function expectNeverEntered({ S, r, deepest }, what) {
  expect(r.cells, `SETUP: the right-click did not place the cell in front of the step at eye level (notes ${JSON.stringify(notes)})`).toEqual([CELL]);
  expect(S.worker.queue.length, 'SETUP: an edit never landed').toBe(0);
  expect(solidAt(S, CELL), 'SETUP: the landed trimesh does not fill the cell').toBe(true);
  const gap = S.p.body.translation().x - (CELL[0] + 1) - BASE_CAPSULE.radius;
  expect(gap, `SETUP: the player did not run up to the cell (${gap.toFixed(2)} m short of it)`).toBeLessThan(0.1);
  const out = escape(S);
  expect(deepest, `${what}: the player ran ${deepest.toFixed(2)} m into the placed cell before it was solid (now at x ${S.p.body.translation().x.toFixed(2)}; eye cell ${eyeCell(S)}; best walk ${out.best} m)`).toBe(0);
  expect(solidAt(S, eyeCell(S)), `${what}: the eye is inside a solid cell ${eyeCell(S)}, which draws no face toward it`).toBe(false);
  expect(out.free, `${what}: the player is held (best walk ${out.best} m, best rise ${out.rise} m)`).toBe(true);
  expect(S.cells.size(), `${what}: a stand-in collider outlived the trimesh that holds its cell`).toBe(0);
}

describe('a placed cell is solid to the player from the click, however late its chunk\'s trimesh lands (real Rapier, real mesher)', () => {
  for (const [hz, x] of [[60, 4.5], [30, 4.42]]) {
    for (const lag of [2, 4, 8]) {
      it(`running at a step, ${hz} Hz frames swept before their step, a right-click at its face at eye level whose trimesh lands ${lag} frames late: the player never enters the cell`, () => {
        expectNeverEntered(lateWall({ lag, hz, x }), `${hz} Hz, ${lag} frames late`);
      });
    }
  }

  it('the first sweep after the click stops short of the new cell by the controller\'s offset, the gap the KCC keeps', () => {
    const S = makeScene({ x: 4.5, z: 8.5, edits: STEP });
    const r = rightClick(S, buildRay(S, { x: -1, y: 0, z: 0 }), 8);
    expect(r.cells, 'SETUP: the right-click did not place the cell in front of the step').toEqual([CELL]);
    tick(S, { mx: -1 });
    const gap = S.p.body.translation().x - (CELL[0] + 1) - BASE_CAPSULE.radius;
    expect(gap, `SETUP: the frame's walk (${(BASE_MOVE_SPEED / 60).toFixed(2)} m) did not reach the cell`).toBeLessThan(0.1);
    expect(gap, `the sweep stopped ${gap.toFixed(3)} m from the cell, inside the KCC's ${S.p.kcc.offset()} m offset`).toBeGreaterThan(0.045);
  });

  it('a long sweep past two new cells stops at the nearer one, whichever was listed first', () => {
    // A frame as long as MAX_FRAME_STEP_SEC (0.25 s) walks 3.5 m: the cut must take the nearest collider the sweep meets.
    for (const order of [[[3, LAND_TOP + 1, 8], [1, LAND_TOP + 1, 8]], [[1, LAND_TOP + 1, 8], [3, LAND_TOP + 1, 8]]]) {
      const S = makeScene({ x: 4.5, z: 8.5 });
      for (const [x, y, z] of order) S.cells.add(x, y, z);
      expect(S.cells.unindexed().length, 'SETUP: the two new cells are not both unindexed').toBe(2);
      frame(S.p, { mx: -1, hz: 4 });
      const x = S.p.body.translation().x;
      expect(x, `listed ${JSON.stringify(order)}: the 3.5 m sweep went into the nearer new cell (stopped at x ${x.toFixed(2)})`).toBeGreaterThan(4 + BASE_CAPSULE.radius);
    }
  });

  it('a mesh made for an earlier edit still in flight does not retire a later cell\'s stand-in', () => {
    // A left click on the ground ahead, in the same chunk, goes first: its mesh lands 3 frames on and was made before the
    // right-click's edit, so it lacks the placed cell. The placed cell's own mesh lands 8 frames on.
    let mined = null;
    const run = lateWall({ lag: 8, first: (S) => { mined = leftClick(S, buildRay(S, { x: 1, y: -0.4, z: 0 }), 3); } });
    expect([chunkOf(mined[0]), chunkOf(mined[2])], `SETUP: the earlier edit (${mined}) is not in the placed cell's chunk`).toEqual([chunkOf(CELL[0]), chunkOf(CELL[2])]);
    expectNeverEntered(run, 'an earlier mesh landed first');
  });

  it('on a frame that took no world step (120 Hz), the guard tests where the body is going as well as where it was stepped', () => {
    const S = makeScene({ x: 4.5, z: 8.5, edits: STEP });
    // One 120 Hz frame's walk at the step, given to the body and not yet stepped.
    moveKinematic(S.p.body, S.p.kcc, S.p.collider, { x: -BASE_MOVE_SPEED / 120, y: 0, z: 0 }, S.p.filter);
    const pending = S.p.body.translation().x - S.p.body.nextTranslation().x;
    expect(pending, 'SETUP: no move is pending').toBeGreaterThan(0.1);
    expect(depth(S, CELL), 'SETUP: the stepped capsule already reaches the cell').toBe(0);
    expect(S.p.body.nextTranslation().x - (CELL[0] + 1), 'SETUP: the pending move does not carry the capsule into the cell').toBeLessThan(BASE_CAPSULE.radius);
    const r = rightClick(S, buildRay(S, { x: -1, y: 0, z: 0 }));
    expect(r.placed, `a cell the next step moves the body into was placed (${JSON.stringify(r.cells)})`).toBe(0);
  });

  for (const hz of [60, 30]) {
    it(`pressed against a step, ${hz} Hz frames swept before their step, while two chunks rebuild in one commit every frame: the player stays out of it`, () => {
      // Rapier reuses a removed collider's slot and its broad-phase leaf until the next step: a lone chunk rebuilt in place
      // gets its own leaf back, but two rebuilt in one commit swap leaves, and the sweep found neither trimesh.
      const S = makeScene({ x: 4.5, z: 8.5, edits: STEP });
      for (let i = 0; i < 20; i++) tick(S, { mx: -1, hz });
      const pressed = S.p.body.translation().x;
      expect(pressed - 3 - BASE_CAPSULE.radius, 'SETUP: the player is not pressed against the step').toBeLessThan(0.1);
      let deepest = 0;
      for (let i = 0; i < 12; i++) {
        mountChunks(S, [{ key: '0_0', editSeq: 0 }, { key: '1_0', editSeq: 0 }]);
        // Every other frame they rebuild twice before a step, so a trimesh listed as unindexed is gone by the sweep.
        if (i % 2) mountChunks(S, [{ key: '1_0', editSeq: 0 }, { key: '0_0', editSeq: 0 }]);
        frame(S.p, { mx: -1, hz });
        deepest = Math.max(deepest, depth(S, [2, LAND_TOP, 8]), depth(S, [2, LAND_TOP + 1, 8]));
      }
      expect(deepest, `the player ran ${deepest.toFixed(2)} m into the step while its chunk rebuilt (x ${pressed.toFixed(2)} -> ${S.p.body.translation().x.toFixed(2)})`).toBe(0);
    });
  }

  it('a far chunk streaming in, its first mount between a step and the sweep, does not cut the walk of a player over the world origin', () => {
    // Mounted the first time (mountChunks), the far chunk's trimesh lies in chunk-local coordinates over chunk 0_0, where
    // the player stands, until its body's move reaches it. Its land is a block higher than here, so laid over the origin
    // its top face crosses the capsule.
    const FAR = [4, 0];
    const highLand = () => {
      const b = new Uint8Array(CHUNK_VOLUME);
      for (let lx = 0; lx < CHUNK_SIZE; lx++) for (let lz = 0; lz < CHUNK_SIZE; lz++)
        for (let y = 0; y <= LAND_TOP; y++) b[voxelIndex(lx, y, lz)] = y >= LAND_TOP - 2 ? SAND : STONE;
      return b;
    };
    // Three runs of one scene, holding W: two frames, then the chunk event (none, the trimesh laid over the origin, the
    // real first mount), then the frame it lands on. Each run's third frame against the run with no event.
    const thirdWalk = (event) => {
      const S = makeScene();
      for (let i = 0; i < 2; i++) frame(S.p, { mz: 1 });
      const seen = event(S);
      const a = S.p.body.translation();
      frame(S.p, { mz: 1 });
      const b = S.p.body.translation();
      return { S, seen, walk: Math.hypot(b.x - a.x, b.z - a.z) };
    };
    const open = thirdWalk(() => null).walk;
    expect(open, 'SETUP: the player does not walk most of a frame\'s run on open land').toBeGreaterThan(0.9 * BASE_MOVE_SPEED / 60);

    // The instrument sees a cut: the same mesh laid over the origin and handed to the cut as a new trimesh is.
    const phantom = thirdWalk((S) => {
      const mesh = generateMesh(FAR[0], FAR[1], highLand(), undefined);
      S.cells.landed(FAR[0], FAR[1], 0, S.world.createCollider(RAPIER.ColliderDesc.trimesh(mesh.positions, mesh.indices)));
    });
    expect(phantom.walk, `SETUP: the far chunk's land laid over the origin did not cut the walk (${phantom.walk.toFixed(3)} of ${open.toFixed(3)} m), so this cannot see a cut`).toBeLessThan(open / 2);

    const key = FAR.join('_');
    const real = thirdWalk((S) => {
      S.chunks.set(key, highLand());
      mountChunk(S, key);
      const far = S.recs.get(key).collider;
      return { listed: S.cells.unindexed().map((c) => c.handle), far: far.handle, xAtSweep: far.translation().x };
    });
    expect(real.seen.listed, 'SETUP: the far chunk\'s new trimesh is not handed to the cut').toEqual([real.seen.far]);
    expect(real.walk, `the far chunk's first trimesh, at x ${real.seen.xAtSweep} when the sweep ran, cut the walk over the origin to ${real.walk.toFixed(3)} of ${open.toFixed(3)} m`).toBeCloseTo(open, 4);
    expect(real.S.recs.get(key).collider.translation().x, 'SETUP: the far chunk\'s trimesh is not at its place after the step').toBe(FAR[0] * CHUNK_SIZE);

    // Two far chunks streaming in together, first-mounted in one commit in that one window: the second lands with the
    // first's trimesh already listed, and its own trimesh must be put where its body is as well.
    const key2 = [FAR[0] + 1, FAR[1]].join('_');
    const two = thirdWalk((S) => {
      S.chunks.set(key, highLand());
      S.chunks.set(key2, highLand());
      mountChunks(S, [{ key, editSeq: 0 }, { key: key2, editSeq: 0 }]);
      const far = [key, key2].map((k) => S.recs.get(k).collider);
      return { listed: S.cells.unindexed().map((c) => c.handle), far: far.map((c) => c.handle), xAtSweep: far.map((c) => c.translation().x) };
    });
    expect(two.seen.listed, 'SETUP: the two far chunks\' new trimeshes are not both handed to the cut').toEqual(two.seen.far);
    expect(two.walk, `two far chunks' first trimeshes, at x ${two.seen.xAtSweep.join(' and ')} when the sweep ran, cut the walk over the origin to ${two.walk.toFixed(3)} of ${open.toFixed(3)} m`).toBeCloseTo(open, 4);
  });

  it('between its trimesh landing and the next step, a ray at the placed cell still meets it', () => {
    // The rebuilt trimesh is not in the broad phase until a step, and inherits a leaf that may not reach the new block; a
    // build ray cast in that window must still meet the cell, so its stand-in stays until the step.
    const S = makeScene({ x: 6.5, z: 8.5 });
    const r = rightClick(S, { hitPoint: new THREE.Vector3(3.5, LAND_TOP, 8.5), normal: { x: 0, y: 1, z: 0 }, direction: new THREE.Vector3(0, -1, 0) }, 2);
    expect(r.cells, 'SETUP: the block did not go on the ground at x 3').toEqual([[3, LAND_TOP, 8]]);
    tick(S);
    tick(S);
    landDue(S);
    expect(S.worker.queue.length, 'SETUP: the edit did not land').toBe(0);
    const ray = new RAPIER.Ray({ x: 6.5, y: LAND_TOP + 0.5, z: 8.5 }, { x: -1, y: 0, z: 0 });
    const hit = S.world.castRay(ray, 8, true, undefined, undefined, undefined, S.p.body, S.p.filter);
    expect(hit && +hit.timeOfImpact.toFixed(3), 'a ray at the placed cell passed through it before the step that indexes its trimesh').toBe(2.5);
    tick(S);
    expect(S.cells.size(), 'the stand-in outlived the step after its trimesh landed').toBe(0);
  });

  it('no stand-in outlives its chunk, the terrain, or one step past the mesh that holds its cell, and none is made where the worker drops the edit', () => {
    const world = new RAPIER.World({ x: 0, y: -30, z: 0 });
    const cells = createPlacedCellColliders(world, RAPIER, createEditSeq());
    const n0 = world.colliders.len();
    cells.add(3, 31, 8);
    const b = cells.add(20, 31, 8);
    cells.add(21, 31, 8);
    cells.add(3, 256, 8); // above the chunk: terrain.worker.js drops it, so no mesh would ever retire a cuboid there
    cells.add(3, -1, 8);
    expect([cells.size(), world.colliders.len() - n0], 'three in-range cells, three cuboids').toEqual([3, 3]);
    expect(cells.unindexed().length, 'a cuboid made since the last step is not listed as unindexed').toBe(3);
    world.step();
    cells.afterStep();
    expect(cells.unindexed().length, 'a cuboid is still listed as unindexed after a step').toBe(0);
    cells.landed(1, 0, b, null); // chunk 1_0's mesh holds the edit b, not the later one
    expect(cells.size(), 'a cuboid went before the step that indexes its trimesh').toBe(3);
    world.step();
    cells.afterStep();
    expect(cells.size(), 'the mesh holding b retired the wrong cuboids').toBe(2);
    cells.dropChunk(0, 0);
    expect(cells.size(), 'an unloaded chunk kept its cuboid').toBe(1);
    cells.clear();
    expect([cells.size(), world.colliders.len() - n0], 'a cleared terrain kept a cuboid').toEqual([0, 0]);
  });

  it('a world mounted again over the same worker numbers its placements on, so a mesh stamped before them never retires their stand-ins', () => {
    // terrain.worker.js keeps the last placement seq it applied for as long as it lives; Terrain.jsx makes the numbering
    // beside it, at module scope, and hands it to the registry each mount of the world makes. Handed that way, a second
    // mount's first placement must number past the first mount's last.
    const world = new RAPIER.World({ x: 0, y: -30, z: 0 });
    const nextSeq = createEditSeq();
    const first = createPlacedCellColliders(world, RAPIER, nextSeq);
    first.add(3, 31, 8);
    first.add(4, 31, 8);
    const stamped = first.add(5, 31, 8); // the worker's last seq once these reach it: every mesh it posts carries it
    first.clear(); // the world unmounts
    const again = createPlacedCellColliders(world, RAPIER, nextSeq);
    const seq = again.add(3, 31, 8);
    expect(seq, `the remounted world numbered its first placement ${seq}, at or below the worker's last seq ${stamped}`).toBeGreaterThan(stamped);
    // A mesh of that chunk the worker made before the new placement reached it (a mine just before) carries `stamped`.
    again.landed(0, 0, stamped, null);
    world.step();
    again.afterStep();
    expect(again.size(), 'a mesh stamped before the placement reached the worker retired its stand-in').toBe(1);
    again.landed(0, 0, seq, null);
    world.step();
    again.afterStep();
    expect(again.size(), 'SETUP: the mesh holding the placement did not retire its stand-in, so the hold above shows nothing').toBe(0);
  });
});

// ---- a chaotic clicker -------------------------------------------------------------------------------------------------
function mulberry32(a) {
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** At the shore: a random walk at full speed with jumps, and between frames random left and right clicks (two between one
 *  pair of frames a fifth of the time, cube footprints a seventh), every edit landing `lag` frames late. Every frame, how
 *  far the capsule reaches into any block a right-click placed and no click has mined since. */
function chaoticClicker(seed, lag, frames = 240) {
  const rnd = mulberry32(seed * 7919 + lag);
  const start = { x: 9.5 + rnd() * 2, z: 4.5 + rnd() * 8 };
  useGameStore.setState({ worldBlocks: new Map() }); // a run's world starts with no placed blocks
  const S = makeScene(start);
  let dir = rnd() * 2 * Math.PI;
  const st = { rights: 0, placed: 0, near: 0, lefts: 0, intrusions: [], anySolid: [] };
  for (let f = 0; f < frames; f++) {
    if (f % 30 === 0) dir = rnd() * 2 * Math.PI;
    const t = S.p.body.translation();
    if (Math.hypot(t.x - start.x, t.z - start.z) > 5) dir = Math.atan2(start.z - t.z, start.x - t.x);
    if (rnd() < 0.35) {
      for (let k = rnd() < 0.2 ? 2 : 1; k > 0; k--) {
        const yaw = rnd() * 2 * Math.PI, pitch = -1.55 + rnd() * 2.0;
        const h = buildRay(S, { x: Math.cos(pitch) * Math.cos(yaw), y: Math.sin(pitch), z: Math.cos(pitch) * Math.sin(yaw) });
        if (!h) continue;
        if (rnd() < 0.55) {
          st.rights++;
          const mode = rnd() < 0.15 ? 'cube' : 'single';
          useGameStore.setState((s) => ({ buildingMode: mode, buildSize: 3, inventory: { ...s.inventory, blocks: { ...s.inventory.blocks, grass: 64 } } }));
          const r = rightClick(S, h, lag);
          st.placed += r.placed;
          // A cell placed within one frame's run (0.25 m) of the capsule is the hazard: the body can be in it next frame.
          st.near += r.cells.filter((c) => nearBody(S, c, 0.25)).length;
        } else {
          st.lefts++;
          leftClick(S, h, lag);
        }
      }
    }
    const moving = rnd() < 0.8;
    tick(S, { mx: moving ? Math.cos(dir) : 0, mz: moving ? Math.sin(dir) : 0, jump: rnd() < 0.04 });
    for (const [k, id] of useGameStore.getState().worldBlocks) {
      if (!id) continue;
      const d = depth(S, k.split('_').map(Number));
      if (d > 0.001) st.intrusions.push({ f, cell: k, depth: +d.toFixed(3) });
    }
    const t1 = S.p.body.translation();
    for (let x = Math.floor(t1.x) - 1; x <= Math.floor(t1.x) + 1; x++) for (let y = Math.floor(t1.y) - 2; y <= Math.floor(t1.y) + 2; y++) for (let z = Math.floor(t1.z) - 1; z <= Math.floor(t1.z) + 1; z++) {
      const d = solidAt(S, [x, y, z]) ? depth(S, [x, y, z]) : 0;
      if (d > 0.001) st.anySolid.push({ f, cell: `${x}_${y}_${z}`, depth: +d.toFixed(3) });
    }
  }
  for (let i = 0; i < 20 && S.worker.queue.length; i++) tick(S);
  for (let i = 0; i < 5; i++) tick(S);
  st.landed = S.worker.queue.length === 0;
  st.eyeInSolid = solidAt(S, eyeCell(S));
  st.inBody = solidInBody(S);
  // Held is allowed: a cube footprint around the body builds a shell the player stands inside, every face of it drawn
  // toward the eye and each block mineable. Held by a block inside the body, or with the eye in one, is the defect.
  st.free = escape(S).free;
  st.standIns = S.cells.size();
  return st;
}

/** Whether the capsule, grown by `margin`, reaches the unit cell. */
function nearBody(S, [x, y, z], margin) {
  const t = S.p.body.translation();
  const hh = S.p.collider.halfHeight(), r = S.p.collider.radius() + margin;
  const dx = Math.max(x - t.x, 0, t.x - (x + 1));
  const dz = Math.max(z - t.z, 0, t.z - (z + 1));
  const dy = Math.max(y - (t.y + hh), 0, (t.y - hh) - (y + 1));
  return Math.hypot(dx, dy, dz) < r;
}

describe('a chaotic clicker at the shore never ends up inside a block it placed, however late the trimesh lands', () => {
  for (const lag of [2, 4, 8]) {
    it(`edits landing ${lag} frames late`, () => {
      const runs = [1, 2].map((seed) => ({ seed, ...chaoticClicker(seed, lag) }));
      const sum = (k) => runs.reduce((a, r) => a + (Array.isArray(r[k]) ? r[k].length : r[k]), 0);
      const brief = JSON.stringify(runs.map(({ intrusions, anySolid, ...r }) => ({ ...r, intrusions: intrusions.length, anySolid: anySolid.length, first: [...intrusions, ...anySolid].slice(0, 3) })));
      expect(sum('placed'), `SETUP: the clicker placed nothing (${brief})`).toBeGreaterThan(20);
      expect(sum('near'), `SETUP: no block was placed within a frame's run of the body, so the clicker never tested the hazard (${brief})`).toBeGreaterThan(0);
      expect(runs.every((r) => r.landed), `SETUP: an edit never landed (${brief})`).toBe(true);
      expect(sum('intrusions'), `the player was inside a block a right-click placed (${brief})`).toBe(0);
      expect(runs.filter((r) => r.eyeInSolid).length, `a run ended with the eye inside a solid cell (${brief})`).toBe(0);
      expect(sum('anySolid'), `the player was inside a solid cell (${brief})`).toBe(0);
      expect(sum('inBody'), `a run ended with a solid cell inside the player (${brief})`).toBe(0);
      expect(sum('standIns'), `a stand-in collider outlived its trimesh (${brief})`).toBe(0);
    });
  }
});
