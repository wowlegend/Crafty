// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { placeAtHit } from '../../src/world/placeAtHit.js';
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
// EYE_HEIGHT_M over the body; the build ray as Terrain.jsx castBuildRay casts it (8 m, the player's body excluded); and
// the real placeAtHit against the real store, its worker post applied to the voxels here. @dimforge/rapier3d-compat is
// the build the app ships.
//
// WHAT THIS DOES NOT CHECK: the build ray inside Terrain.jsx itself, the verb router and React's collider rebuild (the
// e2e tests/e2e/place-clear-of-player.spec.js drives real clicks in the booted game), or a player who walks into a cell
// before its collider lands: here every edit's collider lands at once (registry
// REVIEW:fix-invisible-box:collider-lands-late).
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

function mountChunk(S, key) {
  const [cx, cz] = key.split('_').map(Number);
  const mesh = generateMesh(cx, cz, S.chunks.get(key), undefined);
  let rec = S.recs.get(key);
  if (!rec) {
    rec = { body: S.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE)), collider: null };
    S.recs.set(key, rec);
  }
  if (rec.collider) S.world.removeCollider(rec.collider, true);
  rec.collider = mesh.indices.length ? S.world.createCollider(RAPIER.ColliderDesc.trimesh(mesh.positions, mesh.indices), rec.body) : null;
}

function setVoxel(S, x, y, z, t) {
  const cx = chunkOf(x), cz = chunkOf(z);
  S.chunks.get(`${cx}_${cz}`)[voxelIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)] = t;
  mountChunk(S, `${cx}_${cz}`);
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

function playerParts(world, body, collider) {
  const handle = body.handle;
  return { world, body, collider, kcc: makeKcc(world), vy: 0, filter: (c) => { const p = c.parent(); return !p || p.handle !== handle; } };
}

/** A world with the player standing at (x, z) on the land, its body published where placeAtHit reads it. */
function makeScene({ x = 4.5, z = 8.5, edits = [] } = {}) {
  const world = new RAPIER.World({ x: 0, y: -30, z: 0 });
  const S = { world, chunks: makeChunks(), recs: new Map() };
  for (const [ex, ey, ez, t] of edits) {
    const cx = chunkOf(ex), cz = chunkOf(ez);
    S.chunks.get(`${cx}_${cz}`)[voxelIndex(ex - cx * CHUNK_SIZE, ey, ez - cz * CHUNK_SIZE)] = t;
  }
  for (const key of S.chunks.keys()) mountChunk(S, key);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, LAND_TOP + 1.2, z));
  const collider = world.createCollider(RAPIER.ColliderDesc.capsule(BASE_CAPSULE.halfHeight, BASE_CAPSULE.radius), body);
  S.p = playerParts(world, body, collider);
  world.step();
  for (let i = 0; i < 60; i++) frame(S.p); // settle onto the land
  useGameStore.setState({ playerRigidBodyRef: { current: body } });
  return S;
}

/** One Player frame: grounded from the last sweep, jump / glue / gravity, one moveKinematic write, one world step. */
function frame(P, { mx = 0, mz = 0, jump = false } = {}) {
  const grounded = P.kcc.computedGrounded();
  if (jump && grounded) P.vy = JUMP_VELOCITY;
  else if (grounded) P.vy = GLUE_VELOCITY;
  else P.vy = applyGravity(P.vy, 1, DT);
  moveKinematic(P.body, P.kcc, P.collider, { x: mx * BASE_MOVE_SPEED * DT, y: P.vy * DT, z: mz * BASE_MOVE_SPEED * DT }, 0, P.filter);
  P.world.step();
}

const eye = (S) => { const t = S.p.body.translation(); return new THREE.Vector3(t.x, t.y + EYE_HEIGHT_M, t.z); };

/** Terrain.jsx castBuildRay: the hit the place verb is handed (the direction scaled by toi, as there). */
function buildRay(S, dir) {
  const from = eye(S);
  const d = new THREE.Vector3(dir.x, dir.y, dir.z).normalize();
  const ray = new RAPIER.Ray({ x: from.x, y: from.y, z: from.z }, { x: d.x, y: d.y, z: d.z });
  const hit = S.world.castRayAndGetNormal(ray, 8.0, true, undefined, undefined, undefined, S.p.body, S.p.filter);
  if (!hit) return null;
  const toi = hit.timeOfImpact;
  const hitPoint = from.clone().add(d.multiplyScalar(toi));
  return { toi, normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z }, direction: d, hitPoint };
}

/** The right-click: the real placeAtHit, its worker edits applied to the voxels and the chunk re-meshed. */
function rightClick(S, h) {
  const posted = [];
  const placed = placeAtHit(h, {
    post: (msg) => {
      posted.push(msg);
      const { cx, cz, x, y, z, blockType } = msg.payload;
      setVoxel(S, cx * CHUNK_SIZE + x, y, cz * CHUNK_SIZE + z, blockType);
    },
  });
  return { placed, cells: posted.map((m) => [m.payload.cx * CHUNK_SIZE + m.payload.x, m.payload.y, m.payload.cz * CHUNK_SIZE + m.payload.z]) };
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
    // The form swap lifts the body by the growth (Components.jsx, kinematicMove's `lift`), so the wider capsule starts clear.
    const t = S.p.body.translation();
    const grow = bull.halfHeight + bull.radius - (BASE_CAPSULE.halfHeight + BASE_CAPSULE.radius);
    S.p.collider.setShape(new RAPIER.Capsule(bull.halfHeight, bull.radius));
    S.p.body.setTranslation({ x: t.x, y: t.y + grow, z: t.z }, true);
    for (let i = 0; i < 30; i++) frame(S.p);
    const beside = { hitPoint: new THREE.Vector3(5.5, LAND_TOP, 8.5), normal: { x: 0, y: 1, z: 0 }, direction: new THREE.Vector3(0, -1, 0) };
    expect(overlaps(S, [5, LAND_TOP, 8]), 'SETUP: the bull does not reach into the cell beside it').toBe(true);
    const r = rightClick(S, beside);
    expect(r.placed, 'a cell inside the bull\'s body was placed').toBe(0);
    expect(solidInBody(S), 'a block was placed inside the bull').toEqual([]);
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
