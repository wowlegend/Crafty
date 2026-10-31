// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

/**
 * THE PLAYER LOOP'S OWN QUERIES SEE THE WORLD, NOT THE BLOCK-BREAK DEBRIS (src/Components.jsx: the controller's sweep and
 * the ledge vault's two rays).
 *
 * The debris a mine bursts is the game's only set of dynamic bodies (world/BlockParticleSystem.jsx): eight 0.25 m cubes a
 * block, live for 2 s. The controller swept against them like ground, and with autostep on dynamic bodies it climbed the
 * pile (a 1x2 tunnel walk stalled about 2 s, registry AUDIT:verbs:debris-colliders-catch-mine-rays); the ledge vault's
 * chest ray took a cube in flight for a ledge and threw the player up. This mounts the real Player with the real Rapier
 * world, terrain trimeshes made by the real mesher from the chaos harness's world (tests/integration/chaosPlay/harness.js
 * genCell), and steps the world on @react-three/rapier's 1/60 s accumulator before each call of the Player's frame, as
 * tests/gates/player-placement-gates.test.jsx does. Each row has its control in the same run: the same walk with no
 * debris, and the instrument shown to see the debris (a ray that does not exclude dynamic bodies meets it).
 *
 * WHAT THIS DOES NOT CHECK: Terrain.jsx's queries (tests/gates/verb-ledger-gates.test.jsx), the debris' own bodies
 * (tests/gates/debris-lifecycle-gates.test.jsx), real-device frame timing.
 *
 * Mutation-Proof: see the commit trailer.
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
const { setIntent, setActive, resetInput } = await import('../../src/input/inputState.js');
const { generateMesh } = await import('../../src/world/mesher.js');
const { CHUNK_SIZE, CHUNK_VOLUME, voxelIndex } = await import('../../src/world/chunkLayout.js');
const { genCell, LAND_TOP } = await import('../integration/chaosPlay/harness.js');

const DT = 1 / 60; // @react-three/rapier 2.2.0's fixed step
const STAND_Y = LAND_TOP + BASE_CAPSULE.halfHeight + BASE_CAPSULE.radius + 0.05; // the capsule's centre on flat ground
const DEBRIS_HALF = 0.125; // world/BlockParticleSystem.jsx boxGeometry 0.25

beforeAll(async () => {
  await RAPIER.init();
});

// The origin's chunks (x -16 to 15, z -16 to 31, and x 16 to 31 for z 0 to 15): flat land at LAND_TOP north of the
// cliff (z -6), which the spawn's corner probe reads across.
const KEYS = [...[-1, 0].flatMap((cx) => [-1, 0, 1].map((cz) => `${cx}_${cz}`)), '1_0'];
const meshes = new Map();
for (const key of KEYS) {
  const [cx, cz] = key.split('_').map(Number);
  const b = new Uint8Array(CHUNK_VOLUME);
  for (let lx = 0; lx < CHUNK_SIZE; lx++) for (let lz = 0; lz < CHUNK_SIZE; lz++)
    for (let y = 0; y < 40; y++) b[voxelIndex(lx, y, lz)] = genCell(cx * CHUNK_SIZE + lx, y, cz * CHUNK_SIZE + lz);
  meshes.set(key, generateMesh(cx, cz, b, undefined));
}

let t = 0, acc = 0;
/** Terrain.jsx getMobGroundLevel, fixed bodies only (the spawn's wait reads it; the debris is not ground). */
function groundProbe(x, z) {
  const hit = h.world.castRay(new RAPIER.Ray({ x: x + 0.1, y: 255, z: z + 0.1 }, { x: 0, y: -1, z: 0 }), 300, true,
    RAPIER.QueryFilterFlags.ONLY_FIXED);
  return hit ? 255 - hit.timeOfImpact : null;
}
/** One display frame at 60 Hz: the world's step, then the Player's frame. */
function frame() {
  acc += DT;
  while (acc >= DT - 1e-9) { h.world.step(); acc -= DT; }
  t += DT;
  h.frame({ camera: h.camera, clock: { getElapsedTime: () => t, elapsedTime: t } }, DT);
}
/** A block-break debris cube: a dynamic cuboid of the debris' size and mass. */
function debrisCube(x, y, z, { hover = false } = {}) {
  const body = h.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setGravityScale(hover ? 0 : 1));
  h.world.createCollider(RAPIER.ColliderDesc.cuboid(DEBRIS_HALF, DEBRIS_HALF, DEBRIS_HALF).setMass(0.1), body);
  return body;
}
/** Does a ray that excludes nothing but the player meet a dynamic body? The instrument's presence check. */
function rayMeetsDebris(origin, dir, len) {
  const hit = h.world.castRay(new RAPIER.Ray(origin, dir), len, true, undefined, undefined, undefined, h.body);
  return !!(hit && hit.collider.parent()?.isDynamic());
}

const initial = useGameStore.getInitialState();
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
function standPlayer() {
  render(<Player isWorldBuilt />);
  expect(h.frame, 'the Player registered no frame callback').toBeTypeOf('function');
  for (let i = 0; i < 40; i++) frame();
  expect(h.body.translation().y, 'SETUP: the Player did not stand on the origin\'s ground').toBeCloseTo(STAND_Y, 1);
}
/** A second's walk north (+z) from where the player stands: the most the body's centre rose over its start, and how far
 *  it went. */
function walkNorth(frames = 60) {
  h.camera.rotation.set(0, Math.PI, 0);
  setActive(true);
  setIntent('moveF', true);
  const { y: y0, z: z0 } = h.body.translation();
  let highest = -Infinity;
  for (let i = 0; i < frames; i++) { frame(); highest = Math.max(highest, h.body.translation().y); }
  setIntent('moveF', false);
  return { rise: +(highest - y0).toFixed(3), walked: +(h.body.translation().z - z0).toFixed(2) };
}

describe('the controller sweeps through the debris', () => {
  it('a walk across a pile of debris stays on the ground and goes as far as the same walk with none', () => {
    standPlayer();
    const clear = walkNorth();
    expect(clear.walked, 'SETUP: the control walk did not walk').toBeGreaterThan(2);
    // Back to the start, and a pile where the walk goes: two layers of cubes a block wide across the path, settled.
    h.body.setTranslation({ x: 0, y: STAND_Y, z: 0 }, true);
    for (let i = 0; i < 10; i++) frame();
    const z0 = h.body.translation().z;
    const pile = [];
    for (let layer = 0; layer < 2; layer++) for (let dx = -2; dx <= 2; dx++) for (let dz = 0; dz < 4; dz++) {
      pile.push(debrisCube(h.body.translation().x + dx * 0.26, LAND_TOP + DEBRIS_HALF + layer * 0.26, z0 + 1.2 + dz * 0.26));
    }
    for (let i = 0; i < 20; i++) h.world.step();
    expect(rayMeetsDebris({ x: h.body.translation().x, y: LAND_TOP + 0.1, z: z0 }, { x: 0, y: 0, z: 1 }, 3),
      'SETUP: the pile is not across the walk, so this measured nothing').toBe(true);
    const through = walkNorth();
    expect({ rise: through.rise <= clear.rise + 0.02, walked: through.walked >= clear.walked - 0.05 },
      `the controller stood on or stalled at the debris (pile ${JSON.stringify(through)}, clear ${JSON.stringify(clear)})`)
      .toEqual({ rise: true, walked: true });
  });
});

describe('the ledge vault takes no debris for a ledge', () => {
  /** A cuboid of the debris' size, fixed: a ledge's edge. */
  const ledgeBlock = (x, y, z) => {
    const b = h.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
    h.world.createCollider(RAPIER.ColliderDesc.cuboid(DEBRIS_HALF, DEBRIS_HALF, DEBRIS_HALF), b);
    return b;
  };
  /** Falling, walking north, with what `place` puts ahead of the player (the bodies it returns are removed after): how
   *  far the body rose or fell over 8 frames. The vault's chest ray starts 0.2 m under the centre, its head ray 0.8 m
   *  over it. */
  const fall = (place) => {
    h.body.setTranslation({ x: 0.5, y: LAND_TOP + 6, z: 0.5 }, true);
    for (let i = 0; i < 2; i++) frame();
    const bodies = place(h.body.translation());
    h.world.step();
    h.camera.rotation.set(0, Math.PI, 0);
    setActive(true);
    setIntent('moveF', true);
    const y0 = h.body.translation().y;
    for (let i = 0; i < 8; i++) frame();
    setIntent('moveF', false);
    for (const b of bodies) h.world.removeRigidBody(b);
    return +(h.body.translation().y - y0).toFixed(3);
  };

  it('a cube in flight at chest height throws a falling player nowhere; a block there, or under a cube at head height, vaults', () => {
    standPlayer();
    // The control: a fixed block at chest height is a ledge, and the vault fires (the body rises).
    const ledge = fall((p) => [ledgeBlock(p.x, p.y - 0.2, p.z + 0.65)]);
    expect(ledge, 'SETUP: the vault did not fire on a real ledge, so the rays are not read').toBeGreaterThan(0.2);

    let chestSeen = false;
    const flying = fall((p) => {
      const cube = debrisCube(p.x, p.y - 0.2, p.z + 0.65, { hover: true });
      h.world.step();
      chestSeen = rayMeetsDebris({ x: p.x, y: p.y - 0.2, z: p.z }, { x: 0, y: 0, z: 1 }, 0.8);
      return [cube];
    });
    expect(chestSeen, 'SETUP: the chest ray\'s path does not meet the cube, so this measured nothing').toBe(true);
    expect(flying, 'a debris cube in flight was taken for a ledge and the player was thrown up').toBeLessThan(0);

    let headSeen = false;
    const ledgeUnderCube = fall((p) => {
      const block = ledgeBlock(p.x, p.y - 0.2, p.z + 0.65);
      const cube = debrisCube(p.x, p.y + 0.8, p.z + 0.65, { hover: true });
      h.world.step();
      headSeen = rayMeetsDebris({ x: p.x, y: p.y + 0.8, z: p.z }, { x: 0, y: 0, z: 1 }, 1.0);
      return [block, cube];
    });
    expect(headSeen, 'SETUP: the head ray\'s path does not meet the cube, so this measured nothing').toBe(true);
    expect(ledgeUnderCube, 'a debris cube in flight at head height took a real ledge\'s vault away').toBeGreaterThan(0.2);
  });
});
