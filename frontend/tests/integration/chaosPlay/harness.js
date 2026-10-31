// The chaos-play harness: a seeded player who uses every verb that edits the world or moves the body, in the game's own
// frame order, against the real Rapier build, the real greedy mesher and the real verb executors. The gate
// (tests/integration/chaos-play-*.test.jsx) reads six invariants as the session plays; what each reads is in
// chaos-play-instruments.test.jsx's header.
//
// Wired as the game wires it:
//  - terrain: one fixed body and one trimesh collider per chunk over the drawn positions and indices (Terrain.jsx
//    ChunkMesh); a chunk mounted the first time is mounted as @react-three/rapier 2.2 mounts it (the body made at the
//    origin, the trimesh on it, then the body moved with setTranslation(position, false)), then `landed`;
//  - the worker (terrain.worker.js): each edit applied and its chunk re-meshed with the last placement seq it has seen,
//    the mesh reaching the main thread `lag` frames later, never before an earlier one; meshes due together land as one
//    React commit (every old trimesh removed, then each new one created, then landed);
//  - each placed cell held solid from the click by world/placedCellColliders.js, retired one step after its trimesh;
//  - a display frame: @react-three/rapier's stepper first (a fixed 1/60 s accumulator, so at 120 Hz every other frame
//    takes no step, each step followed by placedCells.afterStep), then the Player frame (Components.jsx): the void guard,
//    the spawn branch, the blind drop's follow and the stuck-in-rock recovery, grounded from the last sweep, the ledge
//    vault, jump / glue / gravity with the form's multipliers, the queued form swap, and one moveKinematic write with the
//    unindexed colliders;
//  - clicks between frames: the build ray from the steady eye (Terrain.jsx castBuildRay, its direction scaled by the
//    hit's toi), the real placeAtHit and the real mineTarget with the mine verb's worker post and store write, and the
//    Delete Tool's left click through the real mineAtHit; the worker's answer to a batched edit (world/cellEdits.js) is
//    given at the click, from the logical world;
//  - a form swap through the store (enterBeastForm / exitBeastForm) and Components.jsx's activeBeastForm effect;
//  - a save written by buildSaveData and loaded by the store's loadWorldData, its worker answered as terrain.worker.js
//    answers it and its wipe done as Terrain.jsx does it.
//
// NOT MODELLED: the walk's accel ramp, coyote time and the jump buffer, dodge, knockback from mobs, the camera's bob and
// shake (the build ray starts at the steady eye), chunk streaming by distance (the 25 chunks stay loaded, so the spawn's
// probe always answers and its blind drop and the follow after it never run here: tests/gates/stuck-in-rock-gates.test.jsx).
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { useGameStore } from '../../../src/store/useGameStore.jsx';
import { placeAtHit } from '../../../src/world/placeAtHit.js';
import { mineAtHit } from '../../../src/world/mineAtHit.js';
import { mineTarget } from '../../../src/world/buildTarget.js';
import { buildFootprint } from '../../../src/game/buildFootprint.js';
import { createPlacedCellColliders, createEditSeq } from '../../../src/world/placedCellColliders.js';
import { generateMesh } from '../../../src/world/mesher.js';
import { voxelIndex, CHUNK_SIZE, CHUNK_VOLUME, CHUNK_HEIGHT, chunkOf } from '../../../src/world/chunkLayout.js';
import { moveKinematic, placeBody } from '../../../src/game/kinematicMove.js';
import { BASE_CAPSULE, BEAST_FORMS, formLocomotion } from '../../../src/game/beasts.js';
import { moveSpeed, jumpVelocity, GLUE_VELOCITY, VAULT_VELOCITY, applyGravity } from '../../../src/game/locomotion.js';
import { steadyEye, EYE_HEIGHT_M } from '../../../src/combat/swingOrigin.js';
import { SEA_LEVEL, DEEP_FLOOR } from '../../../src/world/oceanProfile.js';
import { resolveSpawnGround, resolveResumeSpawn, resumeColumnProbe, spawnTargetY, spawnCornerGround, isVoidFall, returnToSpawn, followBlindDrop, SPAWN_FREEZE_Y, SPAWN_PROBE_MAX_SEC } from '../../../src/game/spawnPlacement.js';
import { makeStuckWatch, stuckInRock } from '../../../src/game/stuckInRock.js';
import { formHasRoom, enterFormFitted, restoreBaseFitted, fitLoadedSpot } from '../../../src/game/formFit.js';
import { buildSaveData, savePosition } from '../../../src/game/saveSchema.js';

const DT = 1 / 60;
export const AIR = 0, STONE = 3;
const SAND = 4, WATER = 9;
export const LAND_TOP = 30; // the land's top face: solid cells y < 30
// The void guard reset a body whose centre was under y 10 until DECISIONS 2026-10-30 item 207: the frames a player stood
// under it in the world are counted, so a driver that stops reaching the deep seabed fails as SETUP.
const OLD_VOID_LINE = 10;
// Five by five chunks (x and z -32 to 47): every place's roam, and the cells a click there reaches, stay a chunk inside the
// edge, so no placement lands where no chunk will ever mesh it and retire its stand-in.
const CHUNKS = [-2, -1, 0, 1, 2];
const KEYS = CHUNKS.flatMap((cx) => CHUNKS.map((cz) => `${cx}_${cz}`));

// ---- the world: one map with the places a player gets stuck -------------------------------------------------------
// The shore (Kevin's): from x = 6 the land steps down a block every two columns to a seabed at 22, under water to
// SEA_LEVEL. The deep ocean: from x = 24 the seabed drops to DEEP_FLOOR, 6, the deepest of oceanProfile.js's full-ocean
// seabed (6 to 10), under the ground probe's floor of 15 and under the y 10 the void guard reset at until DECISIONS
// 2026-10-30 item 207 (game/spawnPlacement.js isVoidFall).
// The cliff: south of z = -6 the land stands six blocks higher, a sheer face at z = -5. The cave: a tunnel two wide and
// two high (ceiling at 32) runs into the cliff at x = -6..-5. The overhang: a stone slab at y = 32 over open land, two
// metres of headroom. The field: open flat land. The origin column, where every respawn lands.
export const DEEP_SEABED = DEEP_FLOOR;
// The cave under the field: a chamber in the rock, its floor at y 2 and its ceiling at 5 (cells 2 to 4 are air), where the
// real world has one under 23% of the columns round the spawn (DECISIONS 2026-10-30 item 213). A body that clips into the
// ground over it falls through the hollow rock onto the back of its ceiling, above the void guard's line, and stays there
// unless something stands it clear; the field's sessions clip once each. It lies inside chunk -1_1, the field's: a chunk's
// trimesh decides where a body slides, so a cave in another place's chunk would move that place's sessions.
export const FIELD_CAVE = { x: [-15, -2], z: [16, 29], floor: 2, ceiling: 5 };
const inFieldCave = (x, y, z) => x >= FIELD_CAVE.x[0] && x <= FIELD_CAVE.x[1] && z >= FIELD_CAVE.z[0] && z <= FIELD_CAVE.z[1]
  && y >= FIELD_CAVE.floor && y < FIELD_CAVE.ceiling;
function columnTop(x, z) {
  if (x >= 24) return DEEP_SEABED;
  if (x >= 6) return Math.max(22, LAND_TOP - Math.ceil((x - 5) / 2));
  if (z <= -6 && x >= -14 && x <= 2) return 36;
  return LAND_TOP;
}
export function genCell(x, y, z) {
  if (y === 32 && x >= -14 && x <= -7 && z >= 6 && z <= 12) return STONE;
  if ((x === -6 || x === -5) && z >= -14 && z <= -6 && (y === 30 || y === 31)) return AIR;
  if (inFieldCave(x, y, z)) return AIR;
  const top = columnTop(x, z);
  if (y < top) return y >= top - 3 ? SAND : STONE;
  if (y <= SEA_LEVEL) return WATER;
  return AIR;
}

/** Where a session starts: a box of body x / z, and the wander radius around its start. */
export const SPOTS = {
  shore: { x: [6.3, 10.7], z: [2.5, 13.5], roam: 4 },
  deep: { x: [26.3, 29.7], z: [2.5, 13.5], roam: 3 },
  cliff: { x: [-11, -2], z: [-4.6, -4.4], roam: 4 },
  cave: { x: [-5.6, -5.4], z: [-12.5, -7.5], roam: 3 },
  overhang: { x: [-11.5, -8.5], z: [7.5, 10.5], roam: 3 },
  field: { x: [-12, -4], z: [18, 24], roam: 4 },
  origin: { x: [0.3, 0.7], z: [0.3, 0.7], roam: 3 },
};

let BASE = null; // the generated chunks and their meshes, made once
function base() {
  if (BASE) return BASE;
  const chunks = new Map(), meshes = new Map();
  for (const key of KEYS) {
    const [cx, cz] = key.split('_').map(Number);
    const b = new Uint8Array(CHUNK_VOLUME);
    for (let lx = 0; lx < CHUNK_SIZE; lx++) for (let lz = 0; lz < CHUNK_SIZE; lz++)
      for (let y = 0; y < 40; y++) b[voxelIndex(lx, y, lz)] = genCell(cx * CHUNK_SIZE + lx, y, cz * CHUNK_SIZE + lz);
    chunks.set(key, b);
    meshes.set(key, generateMesh(cx, cz, b, undefined));
  }
  BASE = { chunks, meshes };
  return BASE;
}
const copyChunks = (chunks) => new Map([...chunks].map(([k, b]) => [k, b.slice()]));

function cellOf(chunks, x, y, z) {
  if (y < 0 || y >= CHUNK_HEIGHT) return AIR;
  const cx = chunkOf(x), cz = chunkOf(z);
  const b = chunks.get(`${cx}_${cz}`);
  return b ? b[voxelIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)] : AIR;
}
function writeCell(chunks, x, y, z, t) {
  if (y < 0 || y >= CHUNK_HEIGHT) return;
  const cx = chunkOf(x), cz = chunkOf(z);
  const b = chunks.get(`${cx}_${cz}`);
  if (b) b[voxelIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)] = t;
}
const isSolid = (t) => t !== AIR && t !== WATER;
/** The world as the player's verbs have made it: every edit applied at its click (a placed cell is solid from the click,
 *  through its stand-in), independent of any collider. The invariants read this. */
export const solidAt = (S, x, y, z) => isSolid(cellOf(S.logical, x, y, z));

// ---- the worker and the chunk meshes -------------------------------------------------------------------------------
function mountChunks(S, landing) {
  const built = landing.map(({ key, editSeq }) => {
    const [cx, cz] = key.split('_').map(Number);
    const fresh = S.gen.get(key) === BASE.chunks.get(key) && BASE.meshes.has(key);
    return { key, cx, cz, editSeq, mesh: fresh ? BASE.meshes.get(key) : generateMesh(cx, cz, S.gen.get(key), undefined) };
  });
  for (const { key } of built) {
    const rec = S.recs.get(key);
    if (rec?.collider) { S.world.removeCollider(rec.collider, true); rec.collider = null; }
  }
  for (const b of built) {
    let rec = S.recs.get(b.key);
    const first = !rec;
    if (first) S.recs.set(b.key, (rec = { body: S.world.createRigidBody(RAPIER.RigidBodyDesc.fixed()), collider: null }));
    rec.collider = b.mesh.indices.length ? S.world.createCollider(RAPIER.ColliderDesc.trimesh(b.mesh.positions, b.mesh.indices), rec.body) : null;
    rec.mesh = b.mesh;
    if (first) rec.body.setTranslation({ x: b.cx * CHUNK_SIZE, y: 0, z: b.cz * CHUNK_SIZE }, false);
    S.cells.landed(b.cx, b.cz, b.editSeq, rec.collider);
    for (const r of S.standIns) if (r.due === null && r.cx === b.cx && r.cz === b.cz && r.seq <= b.editSeq) r.due = S.steps + 1;
  }
}

function post(S, msg) {
  const { cx, cz, x, y, z, blockType, seq } = msg.payload;
  if (typeof seq === 'number') S.worker.seq = seq;
  const item = { due: Math.max(S.f + S.lag, S.worker.lastDue), wx: cx * CHUNK_SIZE + x, y, wz: cz * CHUNK_SIZE + z, t: blockType, editSeq: S.worker.seq };
  S.worker.lastDue = item.due;
  S.worker.queue.push(item);
}

/** What lands between two frames: a load's wipe and its re-mesh, then the edit meshes due by now as one commit. */
function landDue(S) {
  const R = S.reload;
  if (R && !R.wiped && S.f >= R.doneAt) {
    // terrain.worker.js load_modifications: the edit table replaced; Terrain.jsx load_modifications_done: every chunk
    // unmounted (its body and trimesh removed) and the stand-ins cleared, then the chunks streamed in again.
    for (const rec of S.recs.values()) S.world.removeRigidBody(rec.body);
    S.recs.clear();
    S.cells.clear();
    S.standIns.length = 0;
    S.worker.queue.length = 0;
    S.gen = withMods(R.mods);
    R.wiped = true;
    useGameStore.setState({ worldReloading: false }); // Terrain.jsx's effect once the wipe has committed
    R.remountAt = S.f + S.lag;
  }
  if (R && R.wiped && S.f >= R.remountAt && !R.mounted) {
    // The streamer brings the chunks back nearest first: `late` ones (a load's option) come `lateBy` frames after the rest.
    mountChunks(S, KEYS.filter((key) => !R.late.includes(key)).map((key) => ({ key, editSeq: S.worker.seq })));
    R.mounted = true;
  }
  if (R && R.mounted && S.f >= R.remountAt + R.lateBy) {
    if (R.late.length) mountChunks(S, R.late.map((key) => ({ key, editSeq: S.worker.seq })));
    S.reload = null;
  }
  const due = S.worker.queue.filter((q) => q.due <= S.f);
  if (!due.length) return;
  S.worker.queue = S.worker.queue.filter((q) => q.due > S.f);
  const byChunk = new Map();
  for (const q of due) {
    const key = `${chunkOf(q.wx)}_${chunkOf(q.wz)}`;
    if (!S.gen.has(key)) continue; // beyond the world: nothing streamed there to re-mesh
    if (S.gen.get(key) === BASE.chunks.get(key)) S.gen.set(key, BASE.chunks.get(key).slice()); // copy on first write
    // A cell the worker refused changes no voxel; its chunk is re-meshed all the same (terrain.worker.js edit_cells).
    if (q.t !== null) writeCell(S.gen, q.wx, q.y, q.wz, q.t);
    byChunk.set(key, q.editSeq);
  }
  if (!byChunk.size) return;
  mountChunks(S, [...byChunk].map(([key, editSeq]) => ({ key, editSeq })));
}

/** A cell set in the world directly (as the generator would have made it, not by a verb): the logical grid and the
 *  worker's chunk, its trimesh rebuilt at once. */
export function setCell(S, x, y, z, t) {
  const key = `${chunkOf(x)}_${chunkOf(z)}`;
  writeCell(S.logical, x, y, z, t);
  if (S.gen.get(key) === BASE.chunks.get(key)) S.gen.set(key, BASE.chunks.get(key).slice());
  writeCell(S.gen, x, y, z, t);
  mountChunks(S, [{ key, editSeq: S.worker.seq }]);
}

// ---- the player ------------------------------------------------------------------------------------------------------
function makeKcc(world) {
  const kcc = world.createCharacterController(0.05);
  kcc.enableAutostep(1.05, 0.2, true);
  kcc.enableSnapToGround(0.5);
  kcc.setMaxSlopeClimbAngle(Math.PI / 4);
  return kcc;
}
function playerParts(world, body, collider) {
  const handle = body.handle;
  return { world, body, collider, kcc: makeKcc(world), filter: (c) => { const p = c.parent(); return !p || p.handle !== handle; } };
}

/** Terrain.jsx getMobGroundLevel: a ray straight down from y = 255 at (x + 0.1, z + 0.1), the player's body excluded. */
function groundProbe(S, x, z) {
  const body = S.p.body;
  const hit = S.world.castRay(new RAPIER.Ray({ x: x + 0.1, y: 255, z: z + 0.1 }, { x: 0, y: -1, z: 0 }), 300, true, undefined, undefined, undefined, body, S.p.filter);
  return hit ? 255 - hit.timeOfImpact : null;
}

/** Components.jsx's spawn branch once the world is built: a loaded save's position held until its column's colliders
 *  answer (never while the old world's wipe is uncommitted), else the ground probe over the four columns the spawn
 *  corner stands across, through resolveSpawnGround. */
function spawnBranch(S) {
  const store = useGameStore.getState();
  if (store.resumeSpawn) {
    const r = store.resumeSpawn;
    const probeY = store.worldReloading ? null : resumeColumnProbe((x, z) => groundProbe(S, x, z), r);
    const resume = resolveResumeSpawn(r, probeY, S.resumeFails);
    if (resume.hold) {
      S.resumeFails += 1;
      S.p.body.setTranslation({ x: r.x, y: r.y, z: r.z }, true);
      S.stats.loadHoldFrames++;
      S.held = true;
      return;
    }
    useGameStore.setState({ resumeSpawn: null });
    S.resumeFails = 0;
    if (resume.place) {
      const spot = fitLoadedSpot(S.world, RAPIER, S.p.body, resume.place, (x, z) => groundProbe(S, x, z), { unindexed: S.cells.unindexed() });
      const at = { x: spot.x, y: spot.y, z: spot.z };
      placeBody(S.world, S.p.body, at);
      S.spawn.placed.current = true;
      S.stats[`loadsPlaced_${spot.by}`] = (S.stats[`loadsPlaced_${spot.by}`] || 0) + 1;
      released(S, at);
      return;
    }
    released(S, null);
  }
  const physicsY = spawnCornerGround((x, z) => groundProbe(S, x, z));
  const spawn = resolveSpawnGround(null, physicsY, S.spawn.probeWait.current, true, 1 / S.hz);
  if (spawn.incFails) S.spawn.probeWait.current += 1 / S.hz;
  if (spawn.retry) {
    S.p.body.setTranslation({ x: 0, y: SPAWN_FREEZE_Y, z: 0 }, true);
    return;
  }
  placeBody(S.world, S.p.body, { x: 0, y: spawnTargetY(spawn.groundY), z: 0 });
  S.spawn.placed.current = true;
  S.stats.respawns++;
  if (spawn.blind) S.blind.left = SPAWN_PROBE_MAX_SEC;
}

/** A load's hold ends: I5 reads whether it let the player go within its frame bound, or gave up for the origin spawn.
 *  (How near the saved spot the player stands is chaos-play-loads.test.jsx's, case by case: the load fit moves the body
 *  at most 0.6 m sideways, and the column it falls back to is the saved one.) */
export const LOAD_RELEASE_FRAMES = (lag) => 2 * lag + 12;
function released(S, spot) {
  const L = S.loadPending;
  if (!L) return;
  S.loadPending = null;
  const frames = S.f - L.f;
  S.stats.loadsReleased++;
  if (!spot) note(S, 'I5', { why: 'the hold gave up: the origin spawn', saved: L.saved, frames });
  else if (frames > LOAD_RELEASE_FRAMES(S.lag) && !L.late) note(S, 'I5', { why: `held ${frames} frames`, saved: L.saved, spot: vec(spot) });
}

/** One Player frame (Components.jsx useFrame, after the stepper), in its order. */
function playerFrame(S, input) {
  const dt = 1 / S.hz;
  const { body, kcc, filter } = S.p;
  body.wakeUp();
  const t = body.translation();
  if (S.spawn.placed.current && isVoidFall(t.y)) {
    voidReset(S);
    return;
  }
  if (!S.spawn.placed.current || useGameStore.getState().resumeSpawn) {
    spawnBranch(S);
    return;
  }
  // A body left in the rock is stood clear where it is: after a blind drop on the corner's ground once it answers, else
  // once its centre has read solid long enough (the stuck-in-rock recovery, which I7 reads).
  const probe = (x, z) => groundProbe(S, x, z);
  let standAt = null;
  if (S.blind.left > 0) {
    const c = body.collider(0);
    const y = followBlindDrop(S.blind, spawnCornerGround(probe), t, c.halfHeight() + c.radius(), dt);
    if (y !== null) { standAt = { x: 0, y, z: 0 }; S.stats.blindDropsFollowed++; }
  }
  if (!standAt) {
    standAt = stuckInRock(S.stuck, S.world, RAPIER, body, dt, probe, S.cells.unindexed());
    if (standAt) recovered(S, standAt);
  }
  if (standAt) {
    placeBody(S.world, body, standAt);
    S.vy = 0;
    S.camera.position.set(standAt.x, standAt.y + EYE_HEIGHT_M, standAt.z);
    return;
  }
  const store = useGameStore.getState();
  const loco = formLocomotion(store.beastFormActive ? store.activeBeastForm : null);
  const grounded = kcc.computedGrounded();
  const look = { x: Math.cos(input.yaw ?? 0), z: Math.sin(input.yaw ?? 0) };
  // Phase 23 ledge vault: in the air, walking forward, a chest ray meets a wall within 0.8 m and a head ray finds none.
  if (!grounded && input.forward && S.vy <= 2.0) {
    const chest = S.world.castRay(new RAPIER.Ray({ x: t.x, y: t.y - 0.2, z: t.z }, { x: look.x, y: 0, z: look.z }), 0.8, true, undefined, undefined, undefined, body, filter);
    if (chest) {
      const head = S.world.castRay(new RAPIER.Ray({ x: t.x, y: t.y + 0.8, z: t.z }, { x: look.x, y: 0, z: look.z }), 1.0, true, undefined, undefined, undefined, body, filter);
      if (!head) {
        S.vy = VAULT_VELOCITY;
        S.kb = { x: look.x * 3.5, z: look.z * 3.5 };
        S.stats.vaults++;
      }
    }
  }
  if (input.jump && grounded) S.vy = jumpVelocity(loco);
  else if (grounded) S.vy = GLUE_VELOCITY;
  else S.vy = applyGravity(S.vy, loco.gravityMult, dt);
  S.kb.x *= Math.exp(-dt * 8); S.kb.z *= Math.exp(-dt * 8);
  if (Math.abs(S.kb.x) < 0.05) S.kb.x = 0;
  if (Math.abs(S.kb.z) < 0.05) S.kb.z = 0;
  const speed = input.forward ? moveSpeed(loco) : 0;
  const d = { x: (look.x * speed + S.kb.x) * dt, y: S.vy * dt, z: (look.z * speed + S.kb.z) * dt };
  FORM_SWAP.consume(S);
  moveKinematic(body, kcc, body.collider(0), d, 0, filter, S.cells.unindexed());
  for (let i = 0; i < kcc.numComputedCollisions(); i++) {
    const c = kcc.computedCollision(i);
    if (c && Math.abs(c.normal1.y) < 0.3) { S.stats.wallContactFrames++; break; }
  }
}

/** The void guard's reset (Components.jsx): I6 reads whether the player had ground under their feet when it fired (the guard
 *  took them out of a world they stood in, to the origin), then the body goes back to the origin spawn's wait the game's
 *  way (game/spawnPlacement.js returnToSpawn; the harness's camera is a stand-in, since nothing here streams by it). */
export function voidReset(S) {
  const ground = groundUnder(S);
  S.stats.voidResets++;
  if (ground) note(S, 'I6', { at: vec(S.p.body.translation()), groundCell: ground });
  if (S.clip) {
    note(S, 'I7', { why: 'the clipped body fell out of the world before it was stood clear', clip: S.clip.at, at: vec(S.p.body.translation()) });
    S.clip = null;
  }
  S.recent.push(`f${S.f} void reset${ground ? ` over ground at ${ground.join(',')}` : ''}`);
  returnToSpawn(S.world, S.p.body, S.camera, EYE_HEIGHT_M, S.spawn);
}
/** The highest solid cell of the logical world under the capsule's feet, in the columns its footprint covers, or null: a
 *  body under the world has none, and one inside the cells at y 0 (fallen through the hollow trimesh onto the world's
 *  bottom face) has its feet in the last cell, not over it. */
export function groundUnder(S) {
  const t = S.p.body.translation(), c = S.p.body.collider(0);
  const r = c.radius(), feet = t.y - c.halfHeight() - r;
  let best = null;
  for (let x = Math.floor(t.x - r); x <= Math.floor(t.x + r); x++)
    for (let z = Math.floor(t.z - r); z <= Math.floor(t.z + r); z++)
      for (let y = Math.min(Math.floor(feet) - 1, CHUNK_HEIGHT - 1); y >= 0; y--) {
        if (!solidAt(S, x, y, z)) continue;
        if (!best || y > best[1]) best = [x, y, z];
        break;
      }
  return best;
}

/** Whether every cell the body's capsule would reach into, centred at `p`, is solid: wholly inside the rock. */
export function wholeInRock(S, p) {
  const c = S.p.body.collider(0);
  const hh = c.halfHeight(), r = c.radius();
  for (let x = Math.floor(p.x - r); x <= Math.floor(p.x + r); x++)
    for (let y = Math.floor(p.y - hh - r); y <= Math.floor(p.y + hh + r); y++)
      for (let z = Math.floor(p.z - r); z <= Math.floor(p.z + r); z++) if (!solidAt(S, x, y, z)) return false;
  return true;
}
/** A clipped body is stood clear within this many frames of the clip (I7): half a second, at any frame rate. */
export const CLIP_RECOVERY_FRAMES = (hz) => Math.ceil(0.5 * hz);
/** A clip into the ground: the body and its collider put at `p` in the rock, as a chunk that lands round a player leaves
 *  them. From here until the body is stood clear, I1 and I2 do not read it (it is in the rock by construction) and I7
 *  bounds how long that lasts. */
export function clipInto(S, p) {
  placeBody(S.world, S.p.body, p);
  S.vy = 0;
  S.clip = { f: S.f, at: vec(p), late: false };
  S.stats.clips++;
  S.recent.push(`f${S.f} clip into the rock at ${JSON.stringify(vec(p))}`);
}
/** The Player stood a body it read in the rock at `spot` (Components.jsx's stuck-in-rock recovery): I7 reads whether the
 *  body had clipped, and whether the spot is near where it clipped, not the origin. */
export function recovered(S, spot) {
  S.stats.stuckRecoveries++;
  S.recent.push(`f${S.f} stood clear of the rock at ${JSON.stringify(vec(spot))}`);
  if (!S.clip) {
    note(S, 'I7', { why: 'a stuck-in-rock recovery fired on a player who had not clipped', spot: vec(spot) });
    return;
  }
  const away = Math.hypot(spot.x - S.clip.at.x, spot.z - S.clip.at.z);
  if (away > 1) note(S, 'I7', { why: `stood ${away.toFixed(2)} m from where the body clipped`, clip: S.clip.at, spot: vec(spot) });
  S.clip = null;
}

// Components.jsx: the activeBeastForm effect queues an enter for the frame and restores the base shape at once on exit,
// placed where it fits; the frame consumes the queued enter immediately before its sweep, placed where it fits or refused.
const FORM_SWAP = {
  effect(S) {
    const form = useGameStore.getState().activeBeastForm;
    if (form === S.form.last) return;
    S.form.last = form;
    if (form) S.form.pending = BEAST_FORMS[form] || BASE_CAPSULE;
    else {
      S.form.pending = null;
      restoreBaseFitted(S.world, RAPIER, S.p.body, S.p.kcc, { unindexed: S.cells.unindexed() });
    }
  },
  consume(S) {
    if (!S.form.pending) return;
    const target = S.form.pending;
    S.form.pending = null;
    if (!enterFormFitted(S.world, RAPIER, S.p.body, target, { unindexed: S.cells.unindexed() })) {
      useGameStore.getState().exitBeastForm();
      S.stats.swapsRefused++;
      S.effectDue = true; // React runs the activeBeastForm effect after this frame
    }
  },
};

/** The display frame: what lands between frames, the stepper's steps, then the Player frame. */
function tick(S, input) {
  if (S.effectDue) { S.effectDue = false; FORM_SWAP.effect(S); }
  landDue(S);
  S.acc += 1 / S.hz;
  while (S.acc >= DT - 1e-9) {
    S.world.step();
    S.cells.afterStep();
    S.steps++;
    S.acc -= DT;
    afterStepChecks(S);
  }
  S.held = false;
  playerFrame(S, input);
  S.f++;
  S.stats.frames++;
  // PositionTracker: the camera's position, rounded, is the store's playerPosition (a manual save writes it).
  const e = steadyEye(S.p.body.translation(), {});
  useGameStore.getState().setPlayerPosition({ x: Math.round(e.x), y: Math.round(e.y), z: Math.round(e.z) });
  frameChecks(S);
}

// ---- the invariants ------------------------------------------------------------------------------------------------
/** How far the live capsule reaches into the unit cell: its radius less the core segment's distance to the box. */
function depthInCell(body, collider, x, y, z) {
  const t = body.translation();
  const hh = collider.halfHeight(), r = collider.radius();
  const dx = Math.max(x - t.x, 0, t.x - (x + 1));
  const dz = Math.max(z - t.z, 0, t.z - (z + 1));
  const dy = Math.max(y - (t.y + hh), 0, (t.y - hh) - (y + 1));
  return r - Math.hypot(dx, dy, dz);
}
/** The deepest the live capsule reaches into any solid cell of the logical world, and which cell. */
export function deepestSolid(S, body = S.p.body) {
  const collider = body.collider(0);
  const t = body.translation();
  const hh = collider.halfHeight(), r = collider.radius();
  let worst = { depth: 0, cell: null };
  for (let x = Math.floor(t.x - r); x <= Math.floor(t.x + r); x++)
    for (let y = Math.floor(t.y - hh - r); y <= Math.floor(t.y + hh + r); y++)
      for (let z = Math.floor(t.z - r); z <= Math.floor(t.z + r); z++) {
        if (!solidAt(S, x, y, z)) continue;
        const d = depthInCell(body, collider, x, y, z);
        if (d > worst.depth) worst = { depth: d, cell: [x, y, z] };
      }
  return worst;
}
export const eyeCell = (body) => { const e = steadyEye(body.translation(), {}); return [Math.floor(e.x), Math.floor(e.y), Math.floor(e.z)]; };
const centreCell = (body) => { const t = body.translation(); return [Math.floor(t.x), Math.floor(t.y), Math.floor(t.z)]; };

/** A violation: every frame is counted; the first frame of each run of them is kept (up to 8) with the verbs before it. */
function note(S, kind, detail) {
  const list = S.violations[kind];
  const last = S.lastNoted[kind];
  if (last !== S.f - 1 && list.length < 8) list.push({ f: S.f, ...detail, recent: S.recent.slice(-6) });
  S.lastNoted[kind] = S.f;
  S.counts[kind]++;
}

function frameChecks(S) {
  const w = deepestSolid(S);
  if (S.held) {
    // A load's hold keeps the body at the saved spot, input ignored, until the new world's column is in; only then can
    // the load fit (game/formFit.js fitLoadedSpot) read where the base capsule stands clear. A save from before item 153
    // puts that spot in the ground by construction, so I1 and I2 read the player from the release on, and these frames
    // are counted (and the bound on them is I5).
    S.stats.heldFrames++;
    if (w.depth > S.tol) S.stats.heldInSolidFrames++;
    if (S.loadPending && S.f - S.loadPending.f > LOAD_RELEASE_FRAMES(S.lag) && !S.loadPending.late) {
      S.loadPending.late = true;
      note(S, 'I5', { why: `still held after ${LOAD_RELEASE_FRAMES(S.lag)} frames`, saved: S.loadPending.saved });
    }
    return;
  }
  if (S.clip) {
    S.stats.clippedFrames++;
    if (!S.clip.late && S.f - S.clip.f > CLIP_RECOVERY_FRAMES(S.hz)) {
      S.clip.late = true;
      note(S, 'I7', { why: `still in the rock ${CLIP_RECOVERY_FRAMES(S.hz)} frames after the clip`, clip: S.clip.at, at: vec(S.p.body.translation()), centreSolid: solidAt(S, ...centreCell(S.p.body)) });
    }
    return;
  }
  if (w.depth > S.maxDepth.value) S.maxDepth = { value: w.depth, f: S.f, cell: w.cell };
  if (S.p.body.translation().y < OLD_VOID_LINE) S.stats.framesUnderOldVoidLine++;
  if (w.depth > S.tol) note(S, 'I1', { depth: +w.depth.toFixed(3), cell: w.cell, at: vec(S.p.body.translation()) });
  const ec = eyeCell(S.p.body);
  if (solidAt(S, ...ec)) note(S, 'I2', { eyeCell: ec, at: vec(S.p.body.translation()) });
}
function afterStepChecks(S) {
  for (let i = S.standIns.length - 1; i >= 0; i--) {
    const r = S.standIns[i];
    const alive = !!S.world.getCollider(r.handle);
    if (!alive) { S.standIns.splice(i, 1); continue; }
    if (r.due !== null && S.steps > r.due) note(S, 'I4', { standIn: r.cell, landedAtStep: r.due - 1, step: S.steps });
  }
}
const vec = (t) => ({ x: +t.x.toFixed(2), y: +t.y.toFixed(2), z: +t.z.toFixed(2) });

// ---- leaving: can the player get out? -------------------------------------------------------------------------------
export const ESCAPE_M = 1.0; // a metre's move, along or up or down: out of the cell the player stands in
const ESCAPE_FRAMES = 60;

/** A world holding what the player could touch in the next second: the trimesh of every chunk within REACH of the body
 *  (each chunk's latest mesh, where its live collider was built from), every live stand-in, and the player's capsule in
 *  its live shape. `meshes` overrides a chunk's mesh (a dig). Built fresh rather than restored from a snapshot of the
 *  whole world, which cost ~0.2 s an attempt. */
const REACH = 3;
function sandbox(S, meshes = new Map(), mined = []) {
  const w = new RAPIER.World({ x: 0, y: -30, z: 0 });
  const t = S.p.body.translation();
  const chunks = new Map();
  for (const [key, rec] of S.recs) {
    const [cx, cz] = key.split('_').map(Number);
    const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
    if (t.x < ox - REACH || t.x > ox + CHUNK_SIZE + REACH || t.z < oz - REACH || t.z > oz + CHUNK_SIZE + REACH) continue;
    const mesh = meshes.get(key) || rec.mesh;
    const body = w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(ox, 0, oz));
    const collider = mesh && mesh.indices.length ? w.createCollider(RAPIER.ColliderDesc.trimesh(mesh.positions, mesh.indices), body) : null;
    chunks.set(key, { body, collider });
  }
  for (const r of S.standIns) {
    if (!S.world.getCollider(r.handle) || mined.some((c) => c.x === r.cell[0] && c.y === r.cell[1] && c.z === r.cell[2])) continue;
    w.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5).setTranslation(r.cell[0] + 0.5, r.cell[1] + 0.5, r.cell[2] + 0.5));
  }
  const live = S.p.body.collider(0);
  const body = w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(t.x, t.y, t.z));
  const collider = w.createCollider(RAPIER.ColliderDesc.capsule(live.halfHeight(), live.radius()), body);
  w.step();
  return { w, body, collider, chunks, filter: (c) => { const p = c.parent(); return !p || p.handle !== body.handle; } };
}
/** From the start, walk (or jump-walk) heading k for a second; true once the body has moved ESCAPE_M in any direction (a
 *  player sliding down a hole they dug is not held). */
function walkOut(sb, k, jump, t0) {
  sb.body.setTranslation(t0, true);
  const kcc = makeKcc(sb.w);
  const a = (k * Math.PI) / 4;
  const s = moveSpeed(formLocomotion(null)) * DT;
  let vy = 0, out = false;
  for (let i = 0; i < ESCAPE_FRAMES && !out; i++) {
    sb.w.step();
    const g = kcc.computedGrounded();
    if (jump && g) vy = jumpVelocity(formLocomotion(null)); else if (g) vy = GLUE_VELOCITY; else vy = applyGravity(vy, 1, DT);
    moveKinematic(sb.body, kcc, sb.collider, { x: Math.cos(a) * s, y: vy * DT, z: Math.sin(a) * s }, 0, sb.filter);
    const e = sb.body.nextTranslation();
    out = Math.hypot(e.x - t0.x, e.z - t0.z) >= ESCAPE_M || Math.abs(e.y - t0.y) >= ESCAPE_M;
  }
  sb.w.removeCharacterController(kcc);
  return out;
}
/** The player's own blocks near the body: cells the store's worldBlocks holds as placed (a nonzero block) and the world
 *  still holds solid, within OWN_REACH on each axis. */
const OWN_REACH = 4;
function ownCells(S, t0) {
  const out = [];
  for (const [k, v] of useGameStore.getState().worldBlocks) {
    if (!v) continue;
    const [x, y, z] = k.split('_').map(Number);
    if (Math.abs(x + 0.5 - t0.x) > OWN_REACH || Math.abs(y + 0.5 - t0.y) > OWN_REACH || Math.abs(z + 0.5 - t0.z) > OWN_REACH) continue;
    if (solidAt(S, x, y, z)) out.push({ x, y, z });
  }
  return out;
}
/** The world with the player's own blocks near them mined, as many clicks as that takes (each one's chunk re-meshed from
 *  the world as the verbs have made it, and their stand-ins gone): a shell the player built is drawn, and its blocks can be
 *  mined from inside. Generated ground is never mined here: a state only mining it would leave is held. */
function sandboxWithoutOwn(S, own) {
  const chunks = new Map(), meshes = new Map();
  for (const c of own) {
    const key = `${chunkOf(c.x)}_${chunkOf(c.z)}`;
    if (!S.logical.has(key)) continue;
    if (!chunks.has(key)) chunks.set(key, S.logical.get(key).slice());
    writeCell(chunks, c.x, c.y, c.z, AIR);
  }
  for (const [key, b] of chunks) {
    const [cx, cz] = key.split('_').map(Number);
    meshes.set(key, generateMesh(cx, cz, b, undefined));
  }
  return sandbox(S, meshes, own);
}
/** Can the player leave from this exact state? Walk, then jump-walk, each of 8 headings ('walk'); failing that, the same
 *  with every block of their own near them mined ('own': walk-held by a shell they built). Held otherwise, `own` the
 *  count of their blocks that were tried. */
export function escape(S) {
  const t = S.p.body.translation();
  const t0 = { x: t.x, y: t.y, z: t.z };
  const leaves = (sb) => {
    for (let k = 0; k < 8; k++) if (walkOut(sb, k, false, t0) || walkOut(sb, k, true, t0)) return true;
    return false;
  };
  const sb = sandbox(S);
  let by = leaves(sb) ? 'walk' : null;
  sb.w.free();
  if (!by) {
    const own = ownCells(S, t0);
    if (own.length) {
      const dug = sandboxWithoutOwn(S, own);
      if (leaves(dug)) by = 'own';
      dug.w.free();
    }
  }
  return { free: !!by, by };
}

// ---- the verbs ------------------------------------------------------------------------------------------------------
/** Terrain.jsx castBuildRay from the steady eye: the hit, its normal, and the direction scaled by toi (the quirk). */
export function buildRay(S, dir) {
  const from = steadyEye(S.p.body.translation(), {});
  const d = new THREE.Vector3(dir.x, dir.y, dir.z).normalize();
  const hit = S.world.castRayAndGetNormal(new RAPIER.Ray(from, d), 8.0, true, undefined, undefined, undefined, S.p.body, S.p.filter);
  if (!hit) return null;
  const toi = hit.timeOfImpact;
  const scaled = d.multiplyScalar(toi);
  return { toi, normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z }, direction: scaled, hitPoint: new THREE.Vector3(from.x, from.y, from.z).add(scaled) };
}
const lookDir = (yaw, pitch) => ({ x: Math.cos(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.sin(yaw) * Math.cos(pitch) });

/** Whether the capsule, at its stepped place or its pending target, reaches the cell (the harness's own geometry). */
function cellInBody(S, [x, y, z]) {
  const { body } = S.p;
  const collider = body.collider(0);
  const at = body.translation(), next = body.nextTranslation();
  for (const p of [at, next]) {
    const dx = Math.max(x - p.x, 0, p.x - (x + 1));
    const dz = Math.max(z - p.z, 0, p.z - (z + 1));
    const dy = Math.max(y - (p.y + collider.halfHeight()), 0, (p.y - collider.halfHeight()) - (y + 1));
    if (Math.hypot(dx, dy, dz) < collider.radius()) return true;
  }
  return false;
}

/** terrain.worker.js's edit_cells, answered at the click against the logical world (the worker's voxels: every edit
 *  is applied there at its click, as the worker applies messages in order): a cell changes only into the other kind, a
 *  block filling air or water and a removal taking a solid block, and every sent cell's chunk is re-meshed. Each sent
 *  cell's stand-in (the click's cuboids are the last ones unindexed, in the order sent) is tracked for I4. */
function editCells(S, edit, done) {
  const u = S.cells.unindexed();
  const cuboids = u.slice(u.length - edit.cells.filter((c) => typeof c.seq === 'number').length);
  const applied = [];
  edit.cells.forEach((c, i) => {
    const cx = chunkOf(c.x), cz = chunkOf(c.z);
    const was = cellOf(S.logical, c.x, c.y, c.z);
    const empty = was === AIR || was === WATER;
    const changes = edit.blockType === AIR ? !empty : empty;
    if (changes) {
      writeCell(S.logical, c.x, c.y, c.z, edit.blockType);
      applied.push(i);
    }
    if (typeof c.seq === 'number') {
      const cuboid = cuboids.shift();
      if (cuboid) S.standIns.push({ handle: cuboid.handle, cx, cz, seq: c.seq, due: null, cell: [c.x, c.y, c.z] });
    }
    post(S, { type: 'update_block', payload: { cx, cz, x: c.x - cx * CHUNK_SIZE, y: c.y, z: c.z - cz * CHUNK_SIZE, blockType: changes ? edit.blockType : null, seq: c.seq } });
  });
  done(applied);
  return applied.length;
}

/** The right click: the real placeAtHit, its batched edit answered against the logical world at the click. */
export function rightClick(S, h, mode = 'single', size = 1) {
  useGameStore.setState((s) => ({ buildingMode: mode, buildSize: size, inventory: { ...s.inventory, blocks: { ...s.inventory.blocks, grass: 64 } } }));
  const n = h.normal ? new THREE.Vector3(h.normal.x, h.normal.y, h.normal.z) : h.direction.clone().normalize().multiplyScalar(-1);
  const p = h.hitPoint.clone().add(n.multiplyScalar(0.01));
  const aimed = buildFootprint(mode, size, { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) }, h.normal);
  const intoBody = aimed.filter((c) => cellInBody(S, [c.x, c.y, c.z])).length;
  if (intoBody) S.stats.rightClicksIntoBody++;
  let placed = 0;
  placeAtHit(h, { cells: S.cells, editCells: (edit, done) => { placed = editCells(S, edit, done); } });
  if (S.lag === 0) landDue(S); // at once: the click's meshes land as one commit before the next frame
  S.stats.rightClicks++;
  S.stats.cellsPlaced += placed;
  S.recent.push(`f${S.f} R ${mode}${size} -> ${placed}${intoBody ? ` (${intoBody} aimed into the body)` : ''}`);
  if (aimed.some((c) => c.x === 0 && c.z === 0)) S.stats.originColumnEdits++;
  return placed;
}

/** The left click as Terrain.jsx's mine verb makes it: the cell mineTarget takes, mined in the store and the worker. */
export function leftClick(S, h) {
  const c = mineTarget(h.hitPoint, h.direction, useGameStore.getState());
  if (c.y < 0 || c.y >= CHUNK_HEIGHT) return null;
  const cx = chunkOf(c.x), cz = chunkOf(c.z);
  writeCell(S.logical, c.x, c.y, c.z, AIR);
  post(S, { type: 'update_block', payload: { cx, cz, x: c.x - cx * CHUNK_SIZE, y: c.y, z: c.z - cz * CHUNK_SIZE, blockType: AIR } });
  const store = useGameStore.getState();
  store.setWorldBlocks(new Map(store.worldBlocks).set(`${c.x}_${c.y}_${c.z}`, 0));
  if (S.lag === 0) landDue(S);
  S.stats.leftClicks++;
  const t = S.p.body.translation();
  if (c.x === Math.floor(t.x) && c.z === Math.floor(t.z) && c.y < t.y) S.stats.minesUnderFeet++;
  if (c.x === 0 && c.z === 0) S.stats.originColumnEdits++;
  S.recent.push(`f${S.f} L ${c.x},${c.y},${c.z}`);
  return c;
}

/** The Delete Tool's left click (world/mineAtHit.js): the real executor, the cell mineTarget takes as Terrain.jsx
 *  castBuildRay names it, its batched removal answered against the logical world at the click. */
export function deleteClick(S, h, size) {
  const store = useGameStore.getState();
  const c = mineTarget(h.hitPoint, h.direction, store);
  useGameStore.setState({ buildingMode: 'delete', buildSize: size });
  let removed = 0;
  mineAtHit({ ...h, targetedX: c.x, targetedY: c.y, targetedZ: c.z, targetCoords: `${c.x}_${c.y}_${c.z}` }, {
    post: () => { throw new Error('the Delete Tool sent a lone update_block'); },
    editCells: (edit, done) => { removed = editCells(S, edit, done); },
  });
  useGameStore.setState({ buildingMode: 'single', buildSize: 1 });
  if (S.lag === 0) landDue(S);
  S.stats.deleteClicks++;
  S.stats.cellsDeleted += removed;
  const t = S.p.body.translation();
  if (Math.abs(c.x + 0.5 - t.x) < 2 && Math.abs(c.z + 0.5 - t.z) < 2 && c.y < t.y) S.stats.deletesUnderFeet++;
  S.recent.push(`f${S.f} D${size} ${c.x},${c.y},${c.z} -> ${removed}`);
  return removed;
}

/** Whether a solid cell lies within `gap` of the base capsule's top, above it (a ceiling the swap grows into). */
function underCeiling(S, gap) {
  const t = S.p.body.translation();
  const c = S.p.body.collider(0);
  const top = t.y + c.halfHeight() + c.radius();
  for (let x = Math.floor(t.x - c.radius()); x <= Math.floor(t.x + c.radius()); x++)
    for (let z = Math.floor(t.z - c.radius()); z <= Math.floor(t.z + c.radius()); z++)
      if (solidAt(S, x, Math.floor(top + gap), z) || solidAt(S, x, Math.floor(top), z)) return true;
  return false;
}
/** Whether a solid cell at body height lies within `gap` of the capsule's side. */
function againstWall(S, gap) {
  const t = S.p.body.translation();
  const r = S.p.body.collider(0).radius() + gap;
  for (const y of [Math.floor(t.y - 0.4), Math.floor(t.y + 0.4)])
    for (let x = Math.floor(t.x - r); x <= Math.floor(t.x + r); x++)
      for (let z = Math.floor(t.z - r); z <= Math.floor(t.z + r); z++) {
        if (!solidAt(S, x, y, z)) continue;
        const dx = Math.max(x - t.x, 0, t.x - (x + 1)), dz = Math.max(z - t.z, 0, t.z - (z + 1));
        if (Math.hypot(dx, dz) < r) return true;
      }
  return false;
}

/** The roar's commit (Components.jsx 'enter'): refused where the form has no room, else the store's enterBeastForm. */
export function enterForm(S, element) {
  const ceiling = underCeiling(S, 0.6), wall = againstWall(S, 0.1);
  if (useGameStore.getState().beastFormActive) return false;
  S.stats.swaps++;
  if (ceiling) S.stats.swapsUnderCeiling++;
  if (wall) S.stats.swapsAgainstWall++;
  if (!formHasRoom(S.world, RAPIER, S.p.body, BEAST_FORMS[element], { unindexed: S.cells.unindexed() })) {
    S.stats.swapsRefused++;
    S.recent.push(`f${S.f} enter ${element} refused (no room)${ceiling ? ' under a ceiling' : ''}${wall ? ' against a wall' : ''}`);
    return false;
  }
  if (!useGameStore.getState().enterBeastForm(element)) return false;
  S.recent.push(`f${S.f} enter ${element}${ceiling ? ' under a ceiling' : ''}${wall ? ' against a wall' : ''}`);
  FORM_SWAP.effect(S);
  return true;
}
export function exitForm(S) {
  const was = useGameStore.getState().activeBeastForm;
  useGameStore.getState().exitBeastForm();
  if (was) {
    S.stats.formExits++;
    S.recent.push(`f${S.f} exit ${was}${underCeiling(S, 0.4) ? ' under a ceiling' : ''}${againstWall(S, 0.1) ? ' against a wall' : ''}`);
  }
  FORM_SWAP.effect(S);
}

/** A fall through the world: the body under it, as a fall where no ground has streamed in leaves it. (A clip into the
 *  ground leaves the body in the rock instead, where it falls through the hollow trimesh until a face stops it: clipInto,
 *  and the field's sessions clip over the cave under the field.) */
export function voidFall(S) {
  const store = useGameStore.getState();
  const column = [...store.worldBlocks].filter(([k]) => /^0_-?\d+_0$/.test(k));
  if (column.some(([, v]) => !v)) S.stats.respawnsAfterOriginMine++;
  if (column.some(([, v]) => v)) S.stats.respawnsAfterOriginPlace++;
  const t = S.p.body.translation();
  S.p.body.setTranslation({ x: t.x, y: -2, z: t.z }, true);
  S.recent.push(`f${S.f} void fall (origin column ${JSON.stringify(column)})`);
}

/** A save, as the autosave (App.jsx) and the World Manager's Save button (WorldManager.jsx) write it; `legacy` as the
 *  Save button wrote it before DECISIONS 2026-10-30 item 153 (the store's playerPosition: the camera, rounded), which
 *  saves on disk still hold. */
export function writeSave(S, kind) {
  const store = useGameStore.getState();
  const position = kind === 'legacy' ? { ...store.playerPosition } : savePosition(store);
  const form = store.beastFormActive ? store.activeBeastForm : null;
  S.stats.saves++;
  if (kind === 'legacy') S.stats.savesLegacy++;
  if (form) S.stats.savesInForm++;
  S.savedForms.add(form || 'base');
  S.recent.push(`f${S.f} save (${kind}) at ${JSON.stringify(position)}${form ? ` form=${form}` : ''}`);
  return buildSaveData(store, { position });
}
/** The generated world with a save's edits applied (terrain.worker.js applies its edit table as it generates). */
function withMods(mods) {
  const chunks = copyChunks(BASE.chunks);
  for (const [cx, cz, index, t] of mods) {
    const b = chunks.get(`${cx}_${cz}`);
    if (b) b[index] = t;
  }
  return chunks;
}
/** The World Manager's Load: the store's loadWorldData, its worker message answered `lag` frames on. */
export function loadSave(S, data, { late = [], lateBy = 0 } = {}) {
  const inbox = [];
  useGameStore.setState({ terrainWorker: { postMessage: (m) => inbox.push(m) } });
  useGameStore.getState().loadWorldData(data);
  FORM_SWAP.effect(S);
  const msg = inbox.find((m) => m.type === 'load_modifications');
  const mods = msg ? msg.payload.modifications : [];
  // From the Load on the player is in the saved world: the invariants read it, whatever the old colliders still hold
  // until the wipe.
  S.logical = withMods(mods);
  S.reload = { doneAt: S.f + S.lag, mods, wiped: false, remountAt: null, mounted: false, late, lateBy };
  const pos = data.player_data && data.player_data.position;
  if (pos) S.loadPending = { f: S.f, saved: { x: pos.x, y: pos.y, z: pos.z } };
  S.stats.loads++;
  S.recent.push(`f${S.f} load`);
  if (S.lag === 0) landDue(S);
}

// ---- a session ------------------------------------------------------------------------------------------------------
export function mulberry32(a) {
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh session at a spot: the world, the stand-in registry, the player settled on the ground. */
export function makeSession({ spot, rnd, hz, lag, tol }) {
  base();
  // The world is the generated one, so the store records no edit and no chest in it: placeAtHit holds back a cell the
  // store records as built, and a test that plays two sessions on one store would otherwise carry the first one's in.
  useGameStore.setState({ worldBlocks: new Map(), chests: new Map() });
  const world = new RAPIER.World({ x: 0, y: -30, z: 0 });
  const S = {
    world, hz, lag, tol, f: 0, steps: 0, acc: 0, vy: 0, kb: { x: 0, z: 0 }, resumeFails: 0,
    spawn: { placed: { current: true }, probeWait: { current: 0 } }, camera: { position: new THREE.Vector3() },
    gen: new Map(base().chunks), logical: copyChunks(base().chunks), recs: new Map(), reload: null,
    worker: { seq: 0, lastDue: 0, queue: [] }, standIns: [], recent: [], form: { pending: null, last: null },
    maxDepth: { value: 0, f: null, cell: null },
    violations: { I1: [], I2: [], I3: [], I4: [], I5: [], I6: [], I7: [] }, counts: { I1: 0, I2: 0, I3: 0, I4: 0, I5: 0, I6: 0, I7: 0 }, lastNoted: {},
    held: false, loadPending: null, clip: null, stuck: makeStuckWatch(), blind: { left: 0 },
    stats: { frames: 0, rightClicks: 0, rightClicksIntoBody: 0, cellsPlaced: 0, leftClicks: 0, minesUnderFeet: 0,
      deleteClicks: 0, cellsDeleted: 0, deletesUnderFeet: 0,
      originColumnEdits: 0, wallContactFrames: 0, swaps: 0, swapsUnderCeiling: 0, swapsAgainstWall: 0, swapsRefused: 0, formExits: 0,
      clickPairs: 0, respawns: 0, loadHoldFrames: 0, respawnsAfterOriginMine: 0, respawnsAfterOriginPlace: 0, loads: 0, vaults: 0, escapes: 0, ownShellOut: 0,
      saves: 0, savesLegacy: 0, savesInForm: 0, loadsReleased: 0, heldFrames: 0, heldInSolidFrames: 0,
      voidResets: 0, framesUnderOldVoidLine: 0, shaftDigs: 0, shaftsThroughWorld: 0, clips: 0, clippedFrames: 0, stuckRecoveries: 0, blindDropsFollowed: 0 },
  };
  S.cells = createPlacedCellColliders(world, RAPIER, createEditSeq());
  // A collider far below the world, always present. Without it a load's wipe leaves the player's capsule alone in the
  // broad phase, and on some histories the next collider created made rapier3d-compat 0.19.2 panic in world.step
  // ("unreachable"); replaying the same world ops on a fresh world did not, and the game's own load e2e
  // (tests/e2e/world-rebuild-after-load.spec.js) passes. Registry REVIEW:chaos-play:rapier-panic-after-wipe.
  world.createCollider(RAPIER.ColliderDesc.cuboid(1, 1, 1).setTranslation(0, -100, 0));
  mountChunks(S, KEYS.map((key) => ({ key, editSeq: 0 })));
  const box = SPOTS[spot];
  const x = box.x[0] + rnd() * (box.x[1] - box.x[0]), z = box.z[0] + rnd() * (box.z[1] - box.z[0]);
  // The ground under the start: the highest of the columns the capsule stands across, each found up through solid from
  // the land's top, or down through air and water (the shore's steps, the deep ocean).
  let top = -Infinity;
  for (let cx = Math.floor(x - BASE_CAPSULE.radius); cx <= Math.floor(x + BASE_CAPSULE.radius); cx++) {
    for (let cz = Math.floor(z - BASE_CAPSULE.radius); cz <= Math.floor(z + BASE_CAPSULE.radius); cz++) {
      let y = LAND_TOP;
      while (solidAt(S, cx, y, cz)) y++;
      while (y > 0 && !solidAt(S, cx, y - 1, cz)) y--;
      top = Math.max(top, y);
    }
  }
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, top + 0.95, z));
  world.createCollider(RAPIER.ColliderDesc.capsule(BASE_CAPSULE.halfHeight, BASE_CAPSULE.radius), body);
  S.p = playerParts(world, body, body.collider(0));
  S.home = { x, z, roam: box.roam };
  S.savedForms = new Set();
  S.walkHeld = [];
  useGameStore.setState({ playerRigidBodyRef: { current: body } });
  world.step();
  for (let i = 0; i < 30; i++) tick(S, {});
  return S;
}

/** The end-of-session reads that are not per frame: a load the session ended still holding is I5. */
export function finishSession(S) {
  if (S.loadPending) note(S, 'I5', { why: 'the session ended with the load still holding', saved: S.loadPending.saved, frames: S.f - S.loadPending.f });
  if (S.clip) note(S, 'I7', { why: 'the session ended with the clipped body still in the rock', clip: S.clip.at, at: vec(S.p.body.translation()) });
}

export function checkEscape(S) {
  // One held reading is the finding; another escape test in the same session adds seconds and no information. A body a
  // load's hold keeps still is not the player's to move (I5 bounds that), nor is one clipped into the rock (I7 does).
  if (S.counts.I3 > 0 || S.held || S.clip) return { free: false, by: null };
  const e = escape(S);
  S.stats.escapes++;
  if (e.by === 'own') S.stats.ownShellOut++;
  // Every reading walking and jumping could not leave, with its class: a shell the player built, or held.
  if (e.by !== 'walk') S.walkHeld.push({ f: S.f, at: vec(S.p.body.translation()), class: e.by === 'own' ? 'own shell' : 'held' });
  if (!e.free) note(S, 'I3', { at: vec(S.p.body.translation()), deepest: deepestSolid(S), eyeCell: eyeCell(S.p.body) });
  return e;
}

export { tick, landDue, lookDir, againstWall, underCeiling };
