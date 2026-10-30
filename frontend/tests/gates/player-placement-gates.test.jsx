// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

/**
 * WHERE THE PLAYER'S LOOP PLACES THE BODY (src/Components.jsx, the Player's spawn branch).
 *
 * Rapier moves a body's collider only at the next world step (rapier3d-compat 0.19.2), and @react-three/rapier 2.2.0
 * steps on a fixed 1/60 s accumulator, so at 120 Hz every other frame takes no step. The frame after a placement sweeps
 * the controller from the collider (game/kinematicMove.js), so a placement that left the collider behind had that frame
 * sweep from the old spot and write the movement onto the new one. This mounts the real Player with the real Rapier,
 * terrain trimeshes made by the real mesher from the chaos harness's world (tests/integration/chaosPlay/harness.js
 * genCell), and the game's ground probe (Terrain.jsx getMobGroundLevel), drives the Player's frame callback after the
 * stepper's steps as @react-three/rapier orders them, and reads the capsule against the voxel grid (the harness's
 * deepestSolid and eyeCell), never the colliders:
 *   - a save from the old Save button at the tunnel's mouth (-4, 32, -8), in the wall and the ceiling, is fitted clear
 *     and stays clear on both frame phases at 120 Hz (the load's release, game/formFit.js fitLoadedSpot);
 *   - a fall through the world at terminal speed respawns on the origin's ground, not 0.12 m into it, on both phases;
 *   - a load's hold waits while a chunk the fit reads across a border has not streamed back
 *     (game/spawnPlacement.js resumeColumnProbe), and once it is in, the player stands on the saved column's top.
 * Each 120 Hz case asserts that one of its two phases placed the body on a frame followed by one with no world step.
 * BLIND SPOT: R3F's loop is a stub and the frame rate is fixed; loadWorldData's world wipe and the chunk streamer are
 * stood in for (worldReloading is cleared after a few held frames, and the late chunk's collider is made by the test);
 * mobs, input and the camera's follow are not read.
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
const { BASE_CAPSULE } = await import('../../src/game/beasts.js');
const { spawnTargetY } = await import('../../src/game/spawnPlacement.js');
const { generateMesh } = await import('../../src/world/mesher.js');
const { CHUNK_SIZE, CHUNK_VOLUME, voxelIndex } = await import('../../src/world/chunkLayout.js');
const { genCell, deepestSolid, eyeCell, solidAt, LAND_TOP } = await import('../integration/chaosPlay/harness.js');

const TOL = 0.05 / 10; // the chaos gate's I1 tolerance (tests/integration/chaosPlay/suite.js says why)
const DT = 1 / 60; // @react-three/rapier 2.2.0's fixed step

beforeAll(async () => {
  await RAPIER.init();
});

// The chunks: x -16 to 15, z -16 to 31, the harness's world. Their voxels are what the capsule is read against.
const KEYS = [-1, 0].flatMap((cx) => [-1, 0, 1].map((cz) => `${cx}_${cz}`));
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
      let fall = 0;
      for (let i = 0; i < 200; i++) {
        const y0 = h.body.translation().y;
        frame(hz);
        fall = Math.max(fall, (y0 - h.body.translation().y) * hz);
      }
      expect(fall, 'SETUP: the fall never reached terminal speed').toBeGreaterThan(49);
      expect(h.body.translation().y, 'SETUP: the fall reached the ground').toBeGreaterThan(LAND_TOP + 20);
      // Through the floor: the body below the void line, as a clip at that speed leaves it.
      const q = h.body.translation();
      h.body.setTranslation({ x: q.x, y: 5, z: q.z }, true);
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
});
