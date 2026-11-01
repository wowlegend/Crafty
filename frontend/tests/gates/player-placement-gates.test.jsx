// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

/**
 * WHERE THE PLAYER'S LOOP PLACES THE BODY (src/Components.jsx, the Player's spawn branch, its void guard and the respawn).
 *
 * Rapier moves a body's collider only at the next world step (rapier3d-compat 0.19.2), and @react-three/rapier 2.2.0
 * steps on a fixed 1/60 s accumulator, so at 120 Hz every other frame takes no step. The frame after a placement sweeps
 * the controller from the collider (game/kinematicMove.js), so a placement that left the collider behind had that frame
 * sweep from the old spot and write the movement onto the new one. This mounts the real Player with the real Rapier,
 * terrain trimeshes made by the real mesher from the chaos harness's world (tests/integration/chaosPlay/harness.js
 * genCell), and a copy of the game's ground probe (Terrain.jsx getMobGroundLevel); it steps the world on that 1/60 s
 * accumulator before each call of the Player's frame callback (the chaos harness's order; the defect needs only a frame
 * with no step between a placement and the next sweep, which either order has at 120 Hz), and reads the capsule against
 * the voxel grid (the harness's deepestSolid and eyeCell), never the colliders:
 *   - a save from the old Save button at the tunnel's mouth (-4, 32, -8), in the wall and the ceiling, is fitted clear
 *     and stays clear on both frame phases at 120 Hz (the load's release, game/formFit.js fitLoadedSpot);
 *   - a fall through the world at terminal speed respawns on the origin's ground, not 0.12 m into it, on both phases;
 *   - a load's hold waits while a chunk the fit reads across a border has not streamed back
 *     (game/spawnPlacement.js resumeColumnProbe), and once it is in, the player stands on the saved column's top;
 *   - the void guard leaves a player on the deepest seabed (world/oceanProfile.js DEEP_FLOOR) where they stand and walk,
 *     and resets one on the world's bottom face, inside its last cells (game/spawnPlacement.js isVoidFall: the line is the
 *     world's, not y 10); a player clipped into the ground over the cave under the field, whom the hollow rock lets fall
 *     onto the back of its ceiling above that line, is stood on their column's top where they clipped
 *     (game/stuckInRock.js), not left on the ceiling and not sent to the origin (DECISIONS 2026-10-30 item 213);
 *   - the void guard's reset and the respawn after a death go back to the origin spawn's wait one way
 *     (game/spawnPlacement.js returnToSpawn): on their own frame the camera is at the origin's hold, where chunk streaming
 *     follows it (Terrain.jsx), and the collider with the body; the spawn's wait for the origin's ground starts again.
 * Each 120 Hz case asserts that one of its two phases placed the body on a frame followed by one with no world step.
 * BLIND SPOT: R3F's loop is a stub and the frame rate is fixed; loadWorldData's world wipe and the chunk streamer are
 * stood in for (worldReloading is cleared after a few held frames, and the late chunk's collider is made by the test);
 * mobs and the camera's follow are not read, and the seabed walk is the only input (the forward intent).
 */

const h = vi.hoisted(() => ({ frame: null, camera: null, body: null, world: null }));
vi.mock('@react-three/fiber', () => ({
  useFrame: (cb) => { h.frame = cb; },
  useThree: (sel) => (sel ? sel({ camera: h.camera }) : { camera: h.camera }),
}));
vi.mock('@react-three/rapier', async () => {
  const R = await import('react');
  return {
    RigidBody: R.forwardRef(function RigidBody(_props, ref) {
      R.useImperativeHandle(ref, () => h.body);
      return null;
    }),
    CapsuleCollider: () => null,
    useRapier: () => ({ rapier: RAPIER, world: h.world }),
  };
});
vi.mock('../../src/render/playerRender', () => ({ StableMagicHands: () => null }));
vi.mock('../../src/render/ViewmodelLayer.jsx', () => ({ ViewmodelLayer: ({ children }) => <>{children}</> }));
vi.mock('../../src/render/BeastAvatar', () => ({ BeastAvatar: () => null }));
vi.mock('../../src/world/PhantomBlockSystem', () => ({ PhantomBlockSystem: () => null, phantomWorldPos: { x: 0, y: 0, z: 0 } }));
vi.mock('../../src/world/HurlSystem', () => ({ HurlSystem: () => null }));
vi.mock('../../src/world/SnareTetherSystem.jsx', () => ({ SnareTetherSystem: () => null }));
vi.mock('../../src/world/SquadAISystem.jsx', () => ({ SquadAISystem: () => null }));
vi.mock('../../src/world/ElementZoneSystem.jsx', () => ({ ElementZoneSystem: () => null }));

const { Player } = await import('../../src/Components.jsx');
const { useGameStore } = await import('../../src/store/useGameStore.jsx');
const { buildSaveData } = await import('../../src/game/saveSchema.js');
const { BASE_CAPSULE, BEAST_FORMS } = await import('../../src/game/beasts.js');
const { spawnTargetY, SPAWN_FREEZE_Y, SPAWN_PROBE_MAX_SEC } = await import('../../src/game/spawnPlacement.js');
const { EYE_HEIGHT_M } = await import('../../src/combat/swingOrigin.js');
const { setIntent, setActive, resetInput } = await import('../../src/input/inputState.js');
const { generateMesh } = await import('../../src/world/mesher.js');
const { CHUNK_SIZE, CHUNK_VOLUME, voxelIndex } = await import('../../src/world/chunkLayout.js');
const { genCell, deepestSolid, eyeCell, solidAt, LAND_TOP, DEEP_SEABED, FIELD_CAVE } = await import('../integration/chaosPlay/harness.js');

const TOL = 0.05 / 10; // the chaos gate's I1 tolerance (tests/integration/chaosPlay/suite.js says why)
const DT = 1 / 60; // @react-three/rapier 2.2.0's fixed step

beforeAll(async () => {
  await RAPIER.init();
});

// The chunks: x -16 to 15, z -16 to 31, and the shore and deep ocean at x 16 to 31, z 0 to 15, the harness's world. Their
// voxels are what the capsule is read against.
const KEYS = [...[-1, 0].flatMap((cx) => [-1, 0, 1].map((cz) => `${cx}_${cz}`)), '1_0'];
const grid = { logical: new Map() };
const meshes = new Map();
for (const key of KEYS) {
  const [cx, cz] = key.split('_').map(Number);
  const b = new Uint8Array(CHUNK_VOLUME);
  for (let lx = 0; lx < CHUNK_SIZE; lx++) for (let lz = 0; lz < CHUNK_SIZE; lz++)
    for (let y = 0; y < 40; y++) b[voxelIndex(lx, y, lz)] = genCell(cx * CHUNK_SIZE + lx, y, cz * CHUNK_SIZE + lz);
  grid.logical.set(key, b);
  meshes.set(key, generateMesh(cx, cz, b, undefined));
}

let t = 0, acc = 0, steps = 0;
const chunks = new Map();
function mountChunk(key) {
  const [cx, cz] = key.split('_').map(Number);
  const body = h.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE));
  const m = meshes.get(key);
  chunks.set(key, { body, collider: h.world.createCollider(RAPIER.ColliderDesc.trimesh(m.positions, m.indices), body) });
}
/** Terrain.jsx getMobGroundLevel: a ray straight down from y = 255 at (x + 0.1, z + 0.1), the player's body excluded. */
function groundProbe(x, z) {
  const hit = h.world.castRay(new RAPIER.Ray({ x: x + 0.1, y: 255, z: z + 0.1 }, { x: 0, y: -1, z: 0 }), 300, true, undefined, undefined, undefined, h.body);
  return hit ? 255 - hit.timeOfImpact : null;
}
/** One display frame at `hz`: @react-three/rapier's stepper (the 1/60 s accumulator), then the Player's frame. Returns
 *  the world steps it took. */
function frame(hz) {
  const before = steps;
  acc += 1 / hz;
  while (acc >= DT - 1e-9) { h.world.step(); steps++; acc -= DT; }
  t += 1 / hz;
  h.frame({ camera: h.camera, clock: { getElapsedTime: () => t, elapsedTime: t } }, 1 / hz);
  return steps - before;
}
/** Frames until the stepper's accumulator is empty (the frame just took a step), then `phase` more: the two phases put
 *  what follows on frames of opposite step parity at 120 Hz. */
function align(hz, phase) {
  for (let i = 0; i < 4 && acc > 1e-9; i++) frame(hz);
  for (let i = 0; i < phase; i++) frame(hz);
}
/** What the capsule reaches into this frame: the deepest into any solid cell, and whether the eye is in one. */
function reading() {
  return { depth: deepestSolid(grid, h.body).depth, eyeIn: solidAt(grid, ...eyeCell(h.body)) };
}
const at = () => { const p = h.body.translation(); return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) }; };

const initial = useGameStore.getInitialState();
beforeEach(() => {
  useGameStore.setState(initial, true);
  h.world = new RAPIER.World({ x: 0, y: -30, z: 0 });
  chunks.clear();
  for (const key of KEYS) mountChunk(key);
  h.body = h.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 40, 0));
  h.world.createCollider(RAPIER.ColliderDesc.capsule(BASE_CAPSULE.halfHeight, BASE_CAPSULE.radius), h.body);
  h.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 500);
  t = 0; acc = 0; steps = 0;
  useGameStore.setState({
    isCaptureMode: false, isAlive: true, getMobGroundLevel: groundProbe, addNotification: () => {}, terrainWorker: { postMessage: () => {} },
    worldBlocks: new Map(), chests: new Map(),
  });
});
afterEach(() => {
  cleanup();
  resetInput();
  vi.restoreAllMocks();
  useGameStore.setState(initial, true);
});

/** Mount the Player and run it until it stands on the origin's ground. */
function standPlayer(hz) {
  render(<Player isWorldBuilt />);
  expect(h.frame, 'the Player registered no frame callback').toBeTypeOf('function');
  for (let i = 0; i < 40; i++) frame(hz);
  expect(h.body.translation().y, `SETUP: the Player did not stand the player on the origin's ground ${JSON.stringify(at())}`).toBeCloseTo(LAND_TOP + 0.95, 1);
}
/** The World Manager's Load: the store's loadWorldData with the save made at `position`, then the frames its world wipe
 *  takes (worldReloading, cleared as Terrain.jsx clears it once the wipe has committed). */
function load(position, hz, wipeFrames = 4) {
  useGameStore.getState().loadWorldData(buildSaveData(useGameStore.getState(), { position }));
  expect(useGameStore.getState().resumeSpawn, 'SETUP: the load set no resume spot').toEqual(position);
  for (let i = 0; i < wipeFrames; i++) frame(hz);
  useGameStore.setState({ worldReloading: false });
}
/** Play `n` frames from a placement: whether the frame after it took no world step, and the deepest reading. */
function playFrom(hz, placedOn, n) {
  let noStepAfter = null;
  const worst = { depth: 0, eyeIn: false, at: null };
  for (let i = 0; i < n; i++) {
    const took = frame(hz);
    if (i === 0) noStepAfter = took === 0;
    const r = reading();
    if (r.depth > worst.depth || (r.eyeIn && !worst.eyeIn)) Object.assign(worst, { depth: +Math.max(r.depth, worst.depth).toFixed(3), eyeIn: worst.eyeIn || r.eyeIn, at: at() });
  }
  return { placedOn, noStepAfter, worst, end: at() };
}

describe('the Player\'s loop places the body where its next sweep starts from', () => {
  it('a save from the old Save button at the tunnel\'s mouth, (-4, 32, -8), is fitted clear and stays clear on either frame phase at 120 Hz', () => {
    const hz = 120;
    standPlayer(hz);
    const saved = { x: -4, y: 32, z: -8 };
    const rows = [];
    for (const phase of [0, 1]) {
      align(hz, phase);
      load(saved, hz);
      let placedOn = null;
      for (let i = 0; i < 20 && placedOn === null; i++) {
        frame(hz);
        if (!useGameStore.getState().resumeSpawn) placedOn = i;
      }
      expect(placedOn, `SETUP: the load never released the player (phase ${phase}) ${JSON.stringify(at())}`).not.toBeNull();
      rows.push({ phase, ...playFrom(hz, placedOn, 30) });
    }
    expect(rows.map((r) => r.noStepAfter), `SETUP: neither phase released the player on a frame followed by one with no world step ${JSON.stringify(rows)}`).toContain(true);
    for (const r of rows) {
      expect(r.worst.depth, `the capsule reached into solid after the release (phase ${r.phase}) ${JSON.stringify(r)}`).toBeLessThanOrEqual(TOL);
      expect(r.worst.eyeIn, `the eye was in solid after the release (phase ${r.phase}) ${JSON.stringify(r)}`).toBe(false);
      expect(Math.hypot(r.end.x - saved.x, r.end.z - saved.z), `the player was not stood near the save (phase ${r.phase}) ${JSON.stringify(r)}`).toBeLessThan(0.75);
    }
  });

  it('a fall through the world at terminal speed respawns the player on the origin\'s ground, not in it, on either frame phase at 120 Hz', () => {
    const hz = 120;
    standPlayer(hz);
    const rows = [];
    for (const phase of [0, 1]) {
      align(hz, phase);
      const p = h.body.translation();
      h.body.setTranslation({ x: p.x, y: 200, z: p.z }, true);
      // The fall's speed: the frame's own move, read from the target each frame's move is added to (nextTranslation), not from
      // translation(), which at 120 Hz moves only on the frames that step, two frames' fall at a time.
      let fall = 0;
      for (let i = 0; i < 200; i++) {
        const y0 = h.body.nextTranslation().y;
        frame(hz);
        fall = Math.max(fall, (y0 - h.body.nextTranslation().y) * hz);
      }
      expect(fall, 'SETUP: the fall never reached terminal speed').toBeGreaterThan(45);
      expect(fall, 'SETUP: the fall read faster than terminal speed: the reading is not the speed').toBeLessThan(50.5);
      expect(h.body.translation().y, 'SETUP: the fall reached the ground').toBeGreaterThan(LAND_TOP + 20);
      // Through the world: the body under it, as a fall at that speed where no ground has streamed in leaves it.
      const q = h.body.translation();
      h.body.setTranslation({ x: q.x, y: -2, z: q.z }, true);
      let placedOn = null;
      for (let i = 0; i < 20 && placedOn === null; i++) {
        frame(hz);
        const b = h.body.translation();
        if (Math.abs(b.y - spawnTargetY(LAND_TOP)) < 1e-3 && b.x === 0 && b.z === 0) placedOn = i;
      }
      expect(placedOn, `SETUP: the void guard never respawned the player at the origin ${JSON.stringify(at())}`).not.toBeNull();
      rows.push({ phase, ...playFrom(hz, placedOn, 30) });
    }
    expect(rows.map((r) => r.noStepAfter), `SETUP: neither phase spawned the player on a frame followed by one with no world step ${JSON.stringify(rows)}`).toContain(true);
    for (const r of rows) {
      expect(r.worst.depth, `the respawn left the capsule in the origin's ground (phase ${r.phase}) ${JSON.stringify(r)}`).toBeLessThanOrEqual(TOL);
      expect(r.end.y, `the player does not stand on the origin's ground (phase ${r.phase}) ${JSON.stringify(r)}`).toBeCloseTo(LAND_TOP + 0.95, 1);
    }
  });

  it('a load\'s hold waits while a chunk the fit reads across a border is not back, then stands the player on the saved column\'s top', () => {
    const hz = 60;
    standPlayer(hz);
    // A save in the ground 0.05 m from the border at z = 16, the chunk across it (-1_0) not streamed back yet.
    const late = chunks.get('-1_0');
    h.world.removeRigidBody(late.body);
    chunks.delete('-1_0');
    const saved = { x: -8.5, y: 21, z: 16.05 };
    load(saved, hz, 2);
    expect(groundProbe(saved.x, saved.z), 'SETUP: the saved column has not answered').toBeCloseTo(LAND_TOP, 3);
    for (let i = 0; i < 20; i++) {
      frame(hz);
      expect(useGameStore.getState().resumeSpawn, `the hold let the player go on frame ${i} with chunk -1_0 not back ${JSON.stringify(at())}`).toEqual(saved);
    }
    mountChunk('-1_0');
    let placedOn = null;
    for (let i = 0; i < 5 && placedOn === null; i++) {
      frame(hz);
      if (!useGameStore.getState().resumeSpawn) placedOn = i;
    }
    expect(placedOn, `the hold did not let the player go once chunk -1_0 was back ${JSON.stringify(at())}`).not.toBeNull();
    const r = playFrom(hz, placedOn, 30);
    expect(r.worst.depth, `the capsule reached into solid after the release ${JSON.stringify(r)}`).toBeLessThanOrEqual(TOL);
    expect(r.end.y, `the player does not stand on the saved column's top ${JSON.stringify(r)}`).toBeCloseTo(LAND_TOP + 0.95, 1);
  });

  it('a load whose column never streams in is held the same time at 60 and 120 Hz, longer than the origin spawn\'s wait, then gives up for the origin', () => {
    // A save far outside the loaded chunks: its column never answers, so the hold runs to its end (game/spawnPlacement.js
    // resolveResumeSpawn). The wait is time, so a 120 Hz display holds as long as a 60 Hz one.
    const held = {};
    for (const hz of [60, 120]) {
      cleanup();
      standPlayer(hz);
      const saved = { x: 200.5, y: 40, z: 200.5 };
      load(saved, hz, 2);
      expect(groundProbe(saved.x, saved.z), 'SETUP: the saved column answers').toBeNull();
      let frames = 0;
      while (useGameStore.getState().resumeSpawn && frames < 60 * hz) { frame(hz); frames++; }
      expect(useGameStore.getState().resumeSpawn, `SETUP: the hold never gave up at ${hz} Hz`).toBeNull();
      held[hz] = +(frames / hz).toFixed(3);
      for (let i = 0; i < 2 * hz && !(h.body.translation().y < LAND_TOP + 2); i++) frame(hz);
      expect(at(), `the player was not sent to the origin spawn at ${hz} Hz once the hold gave up`).toMatchObject({ x: 0, z: 0 });
    }
    expect(Math.abs(held[60] - held[120]), `the hold's length depends on the frame rate ${JSON.stringify(held)}`).toBeLessThanOrEqual(2 / 60);
    expect(held[120], `the hold at 120 Hz is no longer than the origin spawn's wait (${SPAWN_PROBE_MAX_SEC} s) ${JSON.stringify(held)}`).toBeGreaterThan(SPAWN_PROBE_MAX_SEC);
  });
});

/** The player dug these columns out of the world, every cell from y 0 up: the voxels deepestSolid reads and their
 *  chunks' trimeshes, re-mounted as a React commit re-mounts them. Returns the undo for the voxels (the trimeshes are
 *  made again by the next test's beforeEach). */
function digColumns(cols) {
  const undo = [];
  for (const key of new Set(cols.map(([x, z]) => `${Math.floor(x / CHUNK_SIZE)}_${Math.floor(z / CHUNK_SIZE)}`))) {
    const [cx, cz] = key.split('_').map(Number);
    const was = grid.logical.get(key);
    const b = was.slice();
    for (const [x, z] of cols) {
      if (Math.floor(x / CHUNK_SIZE) !== cx || Math.floor(z / CHUNK_SIZE) !== cz) continue;
      for (let y = 0; y < 40; y++) b[voxelIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)] = 0;
    }
    grid.logical.set(key, b);
    undo.push(() => grid.logical.set(key, was));
    h.world.removeRigidBody(chunks.get(key).body);
    const body = h.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE));
    const m = generateMesh(cx, cz, b, undefined);
    chunks.set(key, { body, collider: h.world.createCollider(RAPIER.ColliderDesc.trimesh(m.positions, m.indices), body) });
  }
  return () => undo.forEach((u) => u());
}

// A save made in a shaft the player dug through the world (a fall down it, or standing on its rim with the centre over
// it): every chunk the load fit reads streams back, and the saved column answers nothing because there is nothing in it.
// The hold waited its whole 10 s for that column and then sent the player to the origin spawn (registry
// REVIEW:l6:load-hold-empty-column). Once the chunks round it have answered, the load stands the player on the nearest
// column that has ground.
describe('a load whose saved column was dug out of the world stands the player beside it once its chunks answer', () => {
  for (const hz of [60, 120]) {
    it(`${hz} Hz: the save in a shaft through the world is let go within half a second, on the ground of a column beside it`, () => {
      standPlayer(hz);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const saved = { x: -3.5, y: 20, z: 3.5 };
      const undo = digColumns([[-4, 3]]);
      try {
        expect(groundProbe(saved.x - 0.1, saved.z - 0.1), 'SETUP: the dug column still answers').toBeNull();
        for (const [x, z] of [[-5, 3], [-3, 3], [-4, 2], [-4, 4]]) {
          expect(groundProbe(x, z), `SETUP: the column (${x}, ${z}) beside the shaft does not answer the land`).toBeCloseTo(LAND_TOP, 3);
        }
        load(saved, hz, 2);
        let placedOn = null;
        for (let i = 0; i < 12 * hz && placedOn === null; i++) {
          frame(hz);
          if (!useGameStore.getState().resumeSpawn) placedOn = i;
        }
        const held = placedOn === null ? null : +((placedOn + 1) / hz).toFixed(3);
        const r = { held, ...playFrom(hz, placedOn, hz), voids: voidWarnings(warn) };
        expect(placedOn, `SETUP: the hold never let the player go ${JSON.stringify(r)}`).not.toBeNull();
        expect(held, `the hold waited for a column with nothing in it ${JSON.stringify(r)}`).toBeLessThanOrEqual(0.5);
        expect(r.voids, `the player fell out of the world after the load ${JSON.stringify(r)}`).toBe(0);
        expect(Math.hypot(r.end.x - saved.x, r.end.z - saved.z), `the player was not stood beside the shaft ${JSON.stringify(r)}`).toBeLessThan(1.5);
        expect(r.end.y, `the player does not stand on the land beside the shaft ${JSON.stringify(r)}`).toBeCloseTo(LAND_TOP + 0.95, 1);
        expect(r.worst.depth, `the capsule reached into solid after the release ${JSON.stringify(r)}`).toBeLessThanOrEqual(TOL);
        expect(r.worst.eyeIn, `the eye was in solid after the release ${JSON.stringify(r)}`).toBe(false);
      } finally {
        undo();
      }
    });
  }
});

/** Whether the void guard said it fired (Components.jsx warns once a reset). */
const voidWarnings = (warn) => warn.mock.calls.filter((c) => /fell into void/.test(String(c[0]))).length;
const HOLD = { x: 0, y: SPAWN_FREEZE_Y, z: 0 };
const HOLD_EYE = [0, SPAWN_FREEZE_Y + EYE_HEIGHT_M, 0];
/** Where the body, its collider and the camera are, to 4 places (+ 0: a -0 is not toEqual's 0). */
const r4 = (v) => +v.toFixed(4) + 0;
const spot = (p) => ({ x: r4(p.x), y: r4(p.y), z: r4(p.z) });
function placement() {
  return { body: spot(h.body.translation()), collider: spot(h.body.collider(0).translation()), eye: h.camera.position.toArray().map(r4) };
}

/** The player dug the spawn corner's four columns (x and z -1 and 0) out of the world: their chunks re-meshed, as a
 *  React commit re-mounts them. */
function digSpawnCorner() {
  for (const key of ['-1_-1', '0_-1', '-1_0', '0_0']) {
    const [cx, cz] = key.split('_').map(Number);
    const b = grid.logical.get(key).slice();
    for (const [x, z] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
      if (Math.floor(x / CHUNK_SIZE) !== cx || Math.floor(z / CHUNK_SIZE) !== cz) continue;
      for (let y = 0; y < 40; y++) b[voxelIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)] = 0;
    }
    h.world.removeRigidBody(chunks.get(key).body);
    const body = h.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE));
    const m = generateMesh(cx, cz, b, undefined);
    chunks.set(key, { body, collider: h.world.createCollider(RAPIER.ColliderDesc.trimesh(m.positions, m.indices), body) });
  }
}

describe('the respawn over a spawn corner dug out of the world stands on the nearest ground, and does not loop', () => {
  for (const hz of [60, 120]) {
    it(`${hz} Hz: with the corner's four columns dug through y 0, a minute idle resets the player at most once`, () => {
      standPlayer(hz);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      digSpawnCorner();
      for (const [x, z] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        expect(groundProbe(x, z), `SETUP: the corner column (${x}, ${z}) still answers after the dig`).toBeNull();
      }
      for (let i = 0; i < 60 * hz; i++) frame(hz);
      const end = at();
      const r = { resets: voidWarnings(warn), end };
      expect(r.resets, `SETUP: the dig did not drop the player out of the world ${JSON.stringify(r)}`).toBeGreaterThan(0);
      expect(r.resets, `the respawn over the dug corner looped ${JSON.stringify(r)}`).toBeLessThanOrEqual(1);
      expect(end.y, `the player does not stand on the land after the minute ${JSON.stringify(r)}`).toBeCloseTo(LAND_TOP + 0.95, 1);
      expect(Math.hypot(end.x, end.z), `the player stands far from the spawn corner ${JSON.stringify(r)}`).toBeLessThan(3);
    });
  }
});

/** Column (x, z) one cell higher than the land: the cell at LAND_TOP is ground in the voxels deepestSolid reads, and
 *  digSpawnCorner, which meshes from those voxels, builds it into the chunk's trimesh. Returns the undo for the voxels. */
function raiseColumn(x, z) {
  const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE), key = `${cx}_${cz}`;
  const was = grid.logical.get(key);
  const b = was.slice();
  b[voxelIndex(x - cx * CHUNK_SIZE, LAND_TOP, z - cz * CHUNK_SIZE)] = genCell(x, LAND_TOP - 1, z);
  grid.logical.set(key, b);
  return () => grid.logical.set(key, was);
}

// The respawn's wait runs out over the dug corner while the bull form is on (a form outlives the void guard's reset), and
// the column nearest the corner stands beside one a block higher. The bull's radius, 0.62 m, reaches 0.12 m past the
// column it stands over into that one (game/spawnPlacement.js spawnSpot reads every column the body's capsule reaches).
describe('the respawn over the dug corner stands the body\'s own capsule clear of every column it reaches', () => {
  for (const hz of [60, 120]) {
    it(`${hz} Hz: in the bull form, beside a column a block higher, the respawn does not stand the capsule in it`, () => {
      const bull = BEAST_FORMS.ice;
      standPlayer(hz);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      act(() => { useGameStore.setState({ beastFormActive: true, activeBeastForm: 'ice' }); });
      for (let i = 0; i < 4; i++) frame(hz);
      expect(h.body.collider(0).radius(), 'SETUP: the bull form did not swap in').toBeCloseTo(bull.radius, 6);
      const undo = raiseColumn(-3, -1);
      try {
        digSpawnCorner();
        expect(groundProbe(-3, -1), 'SETUP: the raised column does not stand a block over the land').toBeCloseTo(LAND_TOP + 1, 4);
        let placed = null, worst = { depth: 0, cell: null };
        for (let i = 0; i < 12 * hz && !(placed && i > placed.frame + hz); i++) {
          frame(hz);
          if (!placed && voidWarnings(warn) > 0 && h.body.translation().y < SPAWN_FREEZE_Y - 1) {
            placed = { frame: i, at: at(), radius: +h.body.collider(0).radius().toFixed(2) };
          }
          if (placed) {
            const d = deepestSolid(grid, h.body);
            if (d.depth > worst.depth) worst = { depth: +d.depth.toFixed(3), cell: d.cell, at: at() };
          }
        }
        const r = { placed, worst, resets: voidWarnings(warn), end: at() };
        expect(placed, `SETUP: the respawn never stood the player down ${JSON.stringify(r)}`).not.toBeNull();
        expect(placed.radius, `SETUP: the bull form had ended when the wait ran out ${JSON.stringify(r)}`).toBe(bull.radius);
        expect(worst.depth, `the respawn stood the bull's capsule in a column it reaches ${JSON.stringify(r)}`).toBeLessThanOrEqual(TOL);
        expect(r.resets, `the respawn beside the dug corner looped ${JSON.stringify(r)}`).toBe(1);
      } finally {
        undo();
      }
    });
  }
});

describe('the void guard fires under the world, never in it, and it and the respawn go back to the spawn one way', () => {
  it('a player on the deepest seabed (world/oceanProfile.js DEEP_FLOOR) stands and walks there, and is not reset to the origin', () => {
    const hz = 60;
    standPlayer(hz);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Sunk through the deep ocean onto its seabed, as a player who walks off the shore's foot sinks: water has no collider.
    h.body.setTranslation({ x: 28.5, y: DEEP_SEABED + 4, z: 3.5 }, true);
    for (let i = 0; i < 60; i++) frame(hz);
    const stood = at();
    expect(Math.hypot(stood.x - 28.5, stood.z - 3.5), `the player on the deep seabed was moved off it ${JSON.stringify(stood)}`).toBeLessThan(0.1);
    expect(stood.y, `the player does not stand on the deep seabed ${JSON.stringify(stood)}`).toBeCloseTo(DEEP_SEABED + 0.95, 1);
    // A second's walk north along the seabed: the camera looks +z, and the walk takes the camera's heading.
    h.camera.rotation.set(0, Math.PI, 0);
    setActive(true);
    setIntent('moveF', true);
    let lowest = Infinity;
    for (let i = 0; i < 60; i++) { frame(hz); lowest = Math.min(lowest, h.body.translation().y); }
    setIntent('moveF', false);
    const walked = at();
    expect(walked.z - stood.z, `SETUP: the walk did not take the player along the seabed ${JSON.stringify(walked)}`).toBeGreaterThan(2);
    expect(Math.abs(walked.x - 28.5), `the walk left the seabed's column line ${JSON.stringify(walked)}`).toBeLessThan(0.1);
    expect(walked.y, `the player does not stand on the deep seabed after the walk ${JSON.stringify(walked)}`).toBeCloseTo(DEEP_SEABED + 0.95, 1);
    expect(lowest, 'the player sank under the deep seabed on the walk').toBeGreaterThan(DEEP_SEABED + 0.9);
    expect(voidWarnings(warn), 'the void guard fired on the deep seabed').toBe(0);
  });

  it('a player clipped into the ground over the cave under the field is stood on their column\'s top where they clipped, not left on the cave\'s ceiling', () => {
    const hz = 60;
    standPlayer(hz);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // In the rock over the cave under the field, as a clip through the floor leaves the body: a chunk's trimesh is hollow,
    // and the body falls through the rock towards the back of the cave's ceiling at y 5.
    const clip = { x: -8.5, y: 15, z: 20.5 };
    expect(FIELD_CAVE.ceiling, 'SETUP: the field\'s cave ceiling is not between the void line and the clip').toBeLessThan(clip.y);
    h.body.setTranslation(clip, true);
    let lowest = Infinity;
    for (let i = 0; i < 90; i++) { frame(hz); lowest = Math.min(lowest, h.body.translation().y); }
    const end = at();
    const r = { clip, lowest: +lowest.toFixed(2), end, ...reading(), voids: voidWarnings(warn) };
    expect(Math.hypot(end.x - clip.x, end.z - clip.z), `the player was moved away from where they clipped ${JSON.stringify(r)}`).toBeLessThan(0.5);
    expect(end.y, `the player does not stand on their column's top ${JSON.stringify(r)}`).toBeCloseTo(LAND_TOP + 0.95, 1);
    expect(r.depth, `the capsule reaches into the ground ${JSON.stringify(r)}`).toBeLessThanOrEqual(TOL);
    expect(r.voids, `the void guard reset the player to the origin ${JSON.stringify(r)}`).toBe(0);
  });

  it('a player on the world\'s bottom face, inside its last cells, is reset by the void guard and stood on the origin\'s ground', () => {
    const hz = 60;
    standPlayer(hz);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Under the cave's floor, in the cells at y 0 and 1: the centre is under the void line, the feet on the bottom face.
    h.body.setTranslation({ x: -8.5, y: 0.95, z: 20.5 }, true);
    let resetOn = null;
    for (let i = 0; i < 90 && resetOn === null; i++) {
      frame(hz);
      if (voidWarnings(warn)) resetOn = i;
    }
    expect(resetOn, `the player on the world's bottom face was never reset ${JSON.stringify(at())}`).not.toBeNull();
    for (let i = 0; i < 20; i++) frame(hz);
    const end = spot(h.body.translation());
    expect([end.x, end.z], `the reset did not stand the player at the origin ${JSON.stringify(end)}`).toEqual([0, 0]);
    expect(end.y, `the reset did not stand the player on the origin's ground ${JSON.stringify(end)}`).toBeCloseTo(LAND_TOP + 0.95, 1);
  });

  it('the void guard\'s reset puts the camera at the origin\'s hold and the collider with the body, on its own frame', () => {
    const hz = 120;
    standPlayer(hz);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Under the world at the far side of the field, the camera with the body as the follow-cam leaves it.
    h.body.setTranslation({ x: -8.5, y: -2, z: 20.5 }, true);
    h.camera.position.set(-8.5, -2 + EYE_HEIGHT_M, 20.5);
    frame(hz);
    const p = placement();
    expect(p.body, `SETUP: the void guard did not reset the body to the origin's hold ${JSON.stringify(p)}`).toEqual(HOLD);
    expect(p.eye, `the camera stayed at the fall site, where chunk streaming follows it ${JSON.stringify(p)}`).toEqual(HOLD_EYE);
    expect(p.collider, `the collider stayed at the fall site until the next world step ${JSON.stringify(p)}`).toEqual(HOLD);
  });

  it('after a void reset the spawn waits its whole bound for the origin\'s ground, however long the first spawn waited', () => {
    const hz = 60;
    let streamed = false;
    useGameStore.setState({ getMobGroundLevel: (x, z) => (streamed ? groundProbe(x, z) : null) });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Player isWorldBuilt />);
    // The first spawn waits all but two frames of its bound for the origin's chunks (a slow stream at boot).
    for (let i = 0; i < Math.round(SPAWN_PROBE_MAX_SEC * hz) - 2; i++) frame(hz);
    expect(spot(h.body.translation()), 'SETUP: the first spawn did not wait at the origin\'s hold').toEqual(HOLD);
    streamed = true;
    for (let i = 0; i < 10; i++) frame(hz);
    expect(at().y, 'SETUP: the first spawn did not stand the player on the origin\'s ground').toBeCloseTo(LAND_TOP + 0.95, 1);
    // A fall through the world far away: the origin's chunks gone, as the streamer culls them behind a far camera.
    streamed = false;
    h.body.setTranslation({ x: -8.5, y: -2, z: 20.5 }, true);
    let held = 0;
    for (let i = 0; i < 100; i++) {
      frame(hz);
      if (Math.abs(h.body.translation().y - SPAWN_FREEZE_Y) < 1e-3) held++;
    }
    expect(held, `the reset held the player ${held} of 100 frames, then dropped them over no ground`).toBe(100);
    streamed = true;
    for (let i = 0; i < 10; i++) frame(hz);
    expect(at().y, 'the player was not stood on the origin\'s ground once it streamed in').toBeCloseTo(LAND_TOP + 0.95, 1);
  });

  // Chunk streaming asks for two chunks every 150 ms in rows across the box round the camera (world/Terrain.jsx), so after a
  // respawn the last of the spawn corner's four chunks is asked for 3.15 s on at the top tier (render distance 4). Here the
  // chunks are mounted and the ground probe answers nothing until then, as it answers while they stream.
  for (const hz of [60, 120]) {
    it(`the respawn waits at the origin's hold until the corner's ground answers, 3.2 s on, and is not dropped blind (${hz} Hz)`, () => {
      let streamedAt = 0;
      useGameStore.setState({ getMobGroundLevel: (x, z) => (t >= streamedAt ? groundProbe(x, z) : null) });
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      standPlayer(hz);
      act(() => { useGameStore.setState({ isAlive: false }); });
      for (let i = 0; i < 10; i++) frame(hz);
      streamedAt = t + 3.2;
      act(() => { useGameStore.setState({ isAlive: true }); });
      let leftHoldAt = null;
      // every frame on which the probe still answers nothing (the frame clock passes streamedAt on the next one)
      while (t + 1 / hz < streamedAt - 1e-9) {
        frame(hz);
        if (leftHoldAt === null && Math.abs(h.body.translation().y - SPAWN_FREEZE_Y) > 1e-3) leftHoldAt = +(t - (streamedAt - 3.2)).toFixed(2);
      }
      expect(leftHoldAt, `the player left the origin's hold ${leftHoldAt} s after the respawn, before the corner's ground answered ${JSON.stringify(at())}`).toBeNull();
      for (let i = 0; i < 0.5 * hz; i++) frame(hz);
      expect(at().y, 'the player was not stood on the origin\'s ground once it answered').toBeCloseTo(LAND_TOP + 0.95, 1);
      expect(deepestSolid(grid, h.body).depth, 'the respawn left the capsule in the origin\'s ground').toBeLessThanOrEqual(TOL);
    });
  }

  it('the respawn after a death leaves the body, its collider and the camera where the void guard\'s reset does', () => {
    const hz = 120;
    standPlayer(hz);
    // Across the field from the origin, so the respawn has somewhere to move the camera from.
    h.body.setTranslation({ x: -8.5, y: LAND_TOP + 0.95, z: 20.5 }, true);
    for (let i = 0; i < 10; i++) frame(hz);
    act(() => { useGameStore.setState({ isAlive: false }); });
    for (let i = 0; i < 10; i++) frame(hz);
    act(() => { useGameStore.setState({ isAlive: true }); });
    const p = placement();
    expect(p.body, `SETUP: the respawn did not put the body at the origin's hold ${JSON.stringify(p)}`).toEqual(HOLD);
    expect(p.eye, `the respawn left the camera off the origin's hold ${JSON.stringify(p)}`).toEqual(HOLD_EYE);
    expect(p.collider, `the respawn left the collider where the player died ${JSON.stringify(p)}`).toEqual(HOLD);
    for (let i = 0; i < 40; i++) frame(hz);
    expect(at().y, 'the respawn did not stand the player on the origin\'s ground').toBeCloseTo(LAND_TOP + 0.95, 1);
  });
});
