// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

/**
 * A WALL IS NOT GROUND (src/Components.jsx, the Player's isGrounded; game/grounding.js).
 *
 * The Rapier character controller's computedGrounded() reads true for a contact whose normal is anything short of
 * horizontal-facing-down (rapier 0.19.2 counts a manifold whose normal has an up component over 1e-3), and a capsule pressed
 * into a trimesh wall gets such contacts on some frames. Each one re-armed the jump, so holding Space against a sheer face
 * or inside a one-column shaft climbed it, and each one set the fall to the glue speed, so a fall down a shaft or along a
 * wall slowed to a slide (registry REVIEW:fix-invisible-box:shaft-wall-climb).
 *
 * This mounts the real Player with real Rapier and the real mesher's trimeshes over a world built here: land at y 30, a
 * face six blocks high, a one-column shaft six deep, a one-column shaft and a 4 x 4 pit 28 deep. performance.now follows
 * the simulated clock, so the coyote time and the jump buffer (game/gameFeel.js) run in the frames' time, not the
 * test's. At 60 and 120 Hz (the 1/60 s step accumulator of @react-three/rapier 2.2 before each Player frame):
 *   - the same held Space on open ground rises at least 2 m (the instrument sees a jump), and against the face, in the
 *     shaft, it rises no more than that one jump;
 *   - a second's fall down the shaft and along the pit's wall, W held into it, covers at least 0.9 of the same second's
 *     fall in open air.
 * BLIND SPOT: one capsule (the base shape), no mobs, no knockback, no dodge; the camera's look is the default (-z).
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
const { BASE_CAPSULE } = await import('../../src/game/beasts.js');
const { placeBody } = await import('../../src/game/kinematicMove.js');
const { setIntent, setActive, resetInput } = await import('../../src/input/inputState.js');
const { generateMesh } = await import('../../src/world/mesher.js');
const { CHUNK_SIZE, CHUNK_VOLUME, voxelIndex } = await import('../../src/world/chunkLayout.js');
const { PANEL_FLAGS } = await import('../../src/ui/panelState.js');
const { GameMethods } = await import('../../src/GameMethods.js');
const { createPlacedCellColliders, createEditSeq } = await import('../../src/world/placedCellColliders.js');

const DT = 1 / 60; // @react-three/rapier 2.2.0's fixed step
const TOP = 30; // the land's top face
const STAND = TOP + BASE_CAPSULE.halfHeight + BASE_CAPSULE.radius + 0.05; // the centre of a capsule standing on it, held at the offset
const FACE = { x: [-14, 2], z: -6, top: 36 }; // cells z <= -6 stand to y 36: a face six high at z = -5
const SHAFT = { x: 3, z: 3, floor: 24 }; // cells 24 to 29 of column (3, 3) are air: a one-column shaft six deep
const DEEP = { x: 8, z: 3, floor: 2 }; // a one-column shaft 28 deep
const PIT = { x: [10, 13], z: [8, 11], floor: 2 }; // a 4 x 4 pit 28 deep
function gen(x, y, z) {
  if (x === SHAFT.x && z === SHAFT.z && y >= SHAFT.floor && y < TOP) return 0;
  if (x === DEEP.x && z === DEEP.z && y >= DEEP.floor && y < TOP) return 0;
  if (x >= PIT.x[0] && x <= PIT.x[1] && z >= PIT.z[0] && z <= PIT.z[1] && y >= PIT.floor && y < TOP) return 0;
  const top = z <= FACE.z && x >= FACE.x[0] && x <= FACE.x[1] ? FACE.top : TOP;
  return y < top ? 3 : 0;
}
const KEYS = ['-1_-1', '-1_0', '0_-1', '0_0'];
const meshes = new Map();
for (const key of KEYS) {
  const [cx, cz] = key.split('_').map(Number);
  const b = new Uint8Array(CHUNK_VOLUME);
  for (let lx = 0; lx < CHUNK_SIZE; lx++) for (let lz = 0; lz < CHUNK_SIZE; lz++)
    for (let y = 0; y < 40; y++) b[voxelIndex(lx, y, lz)] = gen(cx * CHUNK_SIZE + lx, y, cz * CHUNK_SIZE + lz);
  meshes.set(key, generateMesh(cx, cz, b, undefined));
}

beforeAll(async () => {
  await RAPIER.init();
});

let t = 0, acc = 0;
let cells = null; // the placed-cell registry (world/placedCellColliders.js), when a case places cells
/** Terrain.jsx getMobGroundLevel: a ray straight down from y = 255 at (x + 0.1, z + 0.1), the player's body excluded. */
function groundProbe(x, z) {
  const hit = h.world.castRay(new RAPIER.Ray({ x: x + 0.1, y: 255, z: z + 0.1 }, { x: 0, y: -1, z: 0 }), 300, true, undefined, undefined, undefined, h.body);
  return hit ? 255 - hit.timeOfImpact : null;
}
/** One display frame at `hz`: the stepper's 1/60 s accumulator, then the Player's frame. */
function frame(hz) {
  acc += 1 / hz;
  let stepped = 0;
  while (acc >= DT - 1e-9) { h.world.step(); cells?.afterStep(); acc -= DT; stepped++; }
  t += 1 / hz;
  h.frame({ camera: h.camera, clock: { getElapsedTime: () => t, elapsedTime: t } }, 1 / hz);
  return stepped;
}
const y = () => h.body.translation().y;

const initial = useGameStore.getInitialState();
const CLEAR = { ...Object.fromEntries(PANEL_FLAGS.map((f) => [f, false])), victoryPending: false, isWebGLContextLost: false };
beforeEach(() => {
  useGameStore.setState(initial, true);
  h.world = new RAPIER.World({ x: 0, y: -30, z: 0 });
  for (const key of KEYS) {
    const [cx, cz] = key.split('_').map(Number);
    const body = h.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE));
    const m = meshes.get(key);
    h.world.createCollider(RAPIER.ColliderDesc.trimesh(m.positions, m.indices), body);
  }
  h.body = h.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 40, 0));
  h.world.createCollider(RAPIER.ColliderDesc.capsule(BASE_CAPSULE.halfHeight, BASE_CAPSULE.radius), h.body);
  h.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 500);
  t = 0; acc = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => t * 1000);
  resetInput();
  useGameStore.setState({
    ...CLEAR, isCaptureMode: false, isAlive: true, getMobGroundLevel: groundProbe, addNotification: () => {},
    terrainWorker: { postMessage: () => {} }, worldBlocks: new Map(), chests: new Map(),
  });
});
afterEach(() => {
  delete GameMethods.placedCells;
  cells = null;
  cleanup();
  resetInput();
  vi.restoreAllMocks();
  useGameStore.setState(initial, true);
});

/** Mount the Player, stand it on the origin's ground, and give it the input. */
function standPlayer(hz) {
  render(<Player isWorldBuilt />);
  expect(h.frame, 'the Player registered no frame callback').toBeTypeOf('function');
  for (let i = 0; i < hz; i++) frame(hz);
  expect(y(), `SETUP: the Player did not stand on the origin's ground (y ${y().toFixed(3)})`).toBeCloseTo(STAND, 1);
  setActive(true);
}
/** Put the body at `p` (its collider with it) and let it settle `n` frames with nothing held. */
function putAt(hz, p, n = 30) {
  placeBody(h.world, h.body, p);
  for (let i = 0; i < n; i++) frame(hz);
}
/** Space held (and W, when `forward`) for `sec`: the OS's key repeat raises the jump intent again each frame the jump
 *  consumed it. Returns how far the body rose above where it started, read until it has left its start by 1.5 m (out of
 *  the shaft, onto the top of the face: W would walk it on, off the edge of this small world). */
function holdJump(hz, sec, forward) {
  const p0 = h.body.translation();
  const x0 = p0.x, y0 = p0.y, z0 = p0.z;
  let top = y0;
  setIntent('moveF', !!forward);
  for (let i = 0; i < Math.round(sec * hz); i++) {
    setIntent('jump', true);
    frame(hz);
    const p = h.body.translation();
    top = Math.max(top, p.y);
    if (Math.hypot(p.x - x0, p.z - z0) > 1.5) break;
  }
  setIntent('jump', false);
  setIntent('moveF', false);
  return top - y0;
}
/** The distance fallen in `sec` from rest at `p`, W held when `forward`. The body stands on open ground first, so the fall
 *  starts from the glue's speed and not the last fall's. */
function fallFrom(hz, p, sec, forward) {
  putAt(hz, { x: -8.5, y: STAND, z: 8.5 });
  expect(y(), 'SETUP: the body does not stand on open ground before the fall').toBeCloseTo(STAND, 1);
  placeBody(h.world, h.body, p);
  setIntent('moveF', !!forward);
  for (let i = 0; i < Math.round(sec * hz); i++) frame(hz);
  setIntent('moveF', false);
  return p.y - y();
}

describe('a wall is not ground: a held jump climbs no sheer face or shaft, and a fall along a wall is not slowed', () => {
  for (const hz of [60, 120]) {
    it(`${hz} Hz: Space held against a six-high face or in a one-column shaft rises no more than one jump on open ground`, () => {
      standPlayer(hz);
      putAt(hz, { x: -8.5, y: STAND, z: 8.5 });
      const open = holdJump(hz, 1, false);
      expect(open, `SETUP: a held Space on open ground rose ${open.toFixed(2)} m: the instrument sees no jump`).toBeGreaterThan(2);
      putAt(hz, { x: -6.5, y: STAND, z: FACE.z + 1.5 });
      expect(y(), 'SETUP: the body does not stand at the foot of the face').toBeCloseTo(STAND, 1);
      const face = holdJump(hz, 4, true);
      putAt(hz, { x: SHAFT.x + 0.5, y: SHAFT.floor + STAND - TOP, z: SHAFT.z + 0.5 });
      expect(y(), 'SETUP: the body does not stand at the foot of the shaft').toBeCloseTo(SHAFT.floor + STAND - TOP, 1);
      const shaft = holdJump(hz, 4, true);
      const rows = { open: +open.toFixed(2), face: +face.toFixed(2), shaft: +shaft.toFixed(2) };
      expect(face, `Space held into the face for 4 s climbed it ${JSON.stringify(rows)}`).toBeLessThanOrEqual(open + 0.1);
      expect(shaft, `Space held in the shaft for 4 s climbed it ${JSON.stringify(rows)}`).toBeLessThanOrEqual(open + 0.1);
    });

    it(`${hz} Hz: a second's fall down a one-column shaft, and along a pit's wall, is not slowed`, () => {
      standPlayer(hz);
      const open = fallFrom(hz, { x: -8.5, y: 60, z: 8.5 }, 1, false);
      expect(open, `SETUP: a second's fall in open air covered ${open.toFixed(2)} m`).toBeGreaterThan(14);
      // The shaft's middle, and 0.03 and 0.08 m off it toward its west wall (the capsule's side then 0.07 and 0.02 m from
      // the wall, either side of the controller's 0.05 m offset); the pit's north wall, the capsule's side 0.03 m from it,
      // and the same with W held into it.
      const rows = { open: +open.toFixed(2) };
      for (const off of [0, 0.03, 0.08]) rows[`shaft${off}`] = +fallFrom(hz, { x: DEEP.x + 0.5 - off, y: 28, z: DEEP.z + 0.5 }, 1, false).toFixed(2);
      const nearWall = PIT.z[0] + BASE_CAPSULE.radius + 0.03;
      rows.wall = +fallFrom(hz, { x: PIT.x[0] + 1.5, y: 28, z: nearWall }, 1, false).toFixed(2);
      rows.wallW = +fallFrom(hz, { x: PIT.x[0] + 2.5, y: 28, z: nearWall }, 1, true).toFixed(2);
      for (const [k, fell] of Object.entries(rows)) {
        if (k !== 'open') expect(fell, `the fall (${k}) was slowed against the wall ${JSON.stringify(rows)}`).toBeGreaterThanOrEqual(0.9 * open);
      }
      expect(Object.keys(rows).length, 'SETUP: a fall was not measured').toBe(6);
    });
  }
});

/** How far the live capsule reaches into the unit cell (x, y, z): its radius less its core segment's distance to the box. */
function depthIn([x, y, z]) {
  const p = h.body.translation(), c = h.body.collider(0);
  const dx = Math.max(x - p.x, 0, p.x - (x + 1)), dz = Math.max(z - p.z, 0, p.z - (z + 1));
  const dy = Math.max(y - (p.y + c.halfHeight()), 0, (p.y - c.halfHeight()) - (y + 1));
  return c.radius() - Math.hypot(dx, dy, dz);
}

// THE PLAYER'S SWEEP IS CUT AT A CELL PLACED SINCE THE LAST STEP (Components.jsx hands moveKinematic
// GameMethods.placedCells.unindexed(); game/kinematicMove.js). The controller's sweep reads Rapier's broad phase, which only a
// world step updates, so at 120 Hz a cell placed between a frame that stepped and one that does not is passed through by
// that frame's sweep unless the move is cut at it (registry REVIEW:fix-invisible-box:cut-argument-ungated).
describe('a cell placed in front of the walking player between two frames stops the walk at 120 Hz', () => {
  it('120 Hz: the cell is placed after a frame that stepped, ahead of the capsule by less than a frame\'s walk, and the capsule never enters it', () => {
    const hz = 120;
    standPlayer(hz);
    cells = createPlacedCellColliders(h.world, RAPIER, createEditSeq());
    GameMethods.placedCells = cells;
    putAt(hz, { x: 6.5, y: STAND, z: 14.5 });
    setIntent('moveF', true);
    for (let i = 0; i < hz / 2; i++) frame(hz); // up to the walk's speed
    // Walk on, two frames at a time, until a frame that stepped leaves the capsule's front (where its pending move puts it)
    // 5 to 100 mm short of a cell boundary ahead: the next frame's walk (14 m/s, 117 mm) crosses it.
    let placed = null;
    for (let i = 0; i < 4 * hz && !placed; i++) {
      if (frame(hz) === 0) continue;
      const front = h.body.nextTranslation().z - BASE_CAPSULE.radius;
      const gap = front - Math.floor(front);
      if (gap > 0.005 && gap < 0.1) placed = [Math.floor(h.body.translation().x), TOP, Math.floor(front) - 1];
    }
    expect(placed, 'SETUP: the walk never came within a frame of a cell boundary after a frame that stepped').not.toBeNull();
    cells.add(...placed);
    const noStep = frame(hz) === 0;
    let worst = depthIn(placed);
    for (let i = 0; i < 30; i++) { frame(hz); worst = Math.max(worst, depthIn(placed)); }
    setIntent('moveF', false);
    const row = { placed, noStep, worst: +worst.toFixed(3), end: h.body.translation().z.toFixed(3) };
    expect(noStep, `SETUP: the frame after the placement took a world step, so the sweep could see the cell ${JSON.stringify(row)}`).toBe(true);
    expect(worst, `the capsule walked into the cell placed in front of it ${JSON.stringify(row)}`).toBeLessThanOrEqual(0.005);
  });
});
