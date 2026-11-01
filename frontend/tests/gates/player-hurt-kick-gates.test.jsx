// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

/**
 * BEING HIT KICKS THE CAMERA AWAY FROM THE BLOW (src/Components.jsx, the Player's loop; game/cameraKick.js hurtKick;
 * registry OPEN_ITEMS:OI-37).
 *
 * The store stamps every accepted hit as lastHitDir = { angle, t }, the angle screen-relative (game/damageDirection.js: 0
 * ahead, +pi/2 right), and the loop edge-detects the stamp and kicks the follow camera. This mounts the real Player with
 * the real Rapier, as tests/gates/player-view-hold-gates.test.jsx does (R3F stubbed so the test drives the frame callback;
 * a floor, a kinematic capsule and the loop's own character controller), stands the player on the floor facing -z, and
 * stamps one hit per case the way damagePlayer does (a store write, no shake: the kick is read alone). One frame later
 * the drawn camera's offset from the steady eye is read along the camera's right and forward.
 *
 * Each side is first measured against the same frame with no hit (PRESENCE: the offset at rest is under a millimetre).
 *
 * BLIND SPOT: R3F's loop and the render are stubs; the kick's size and decay are cameraKick.test.js's; whether the kick
 * FEELS right is a look judged on frames, not here.
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
const { EYE_HEIGHT_M } = await import('../../src/combat/swingOrigin.js');
const { resetInput } = await import('../../src/input/inputState');
const { _resetShake } = await import('../../src/game/cameraShakeChannel.js');

beforeAll(async () => {
  await RAPIER.init();
});

let t = 0;
/** One frame of the Player's loop at 60 Hz, then one world step (the body's kinematic write lands). */
function frame() {
  t += 1 / 60;
  h.frame({ camera: h.camera, clock: { getElapsedTime: () => t, elapsedTime: t } }, 1 / 60);
  h.world.step();
}
/** The drawn camera's offset from the body's steady eye, along the camera's flat right and forward. */
function offset() {
  const b = h.body.translation();
  const d = h.camera.position.clone().sub(new THREE.Vector3(b.x, b.y + EYE_HEIGHT_M, b.z));
  const fwd = new THREE.Vector3();
  h.camera.getWorldDirection(fwd);
  fwd.y = 0; fwd.normalize();
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  return { right: d.dot(right), forward: d.dot(fwd), up: d.y };
}

const saved = useGameStore.getState();
beforeEach(() => {
  h.world = new RAPIER.World({ x: 0, y: -30, z: 0 });
  const floor = h.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 49.5, 0));
  h.world.createCollider(RAPIER.ColliderDesc.cuboid(50, 0.5, 50), floor);
  h.body = h.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 51, 0));
  h.world.createCollider(RAPIER.ColliderDesc.capsule(0.5, 0.4), h.body);
  h.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 500);
  t = 0;
  _resetShake();
  resetInput();
  useGameStore.setState({ isCaptureMode: false, isAlive: true, getMobGroundLevel: () => 50, lastHitDir: null });
});
afterEach(() => {
  cleanup();
  _resetShake();
  resetInput();
  useGameStore.setState({ isAlive: saved.isAlive, getMobGroundLevel: saved.getMobGroundLevel, lastHitDir: saved.lastHitDir });
});

/** Mount the Player, stand it on the floor, and return the camera's offset at rest. */
function standPlayer() {
  render(<Player isWorldBuilt />);
  expect(h.frame, 'the Player registered no frame callback').toBeTypeOf('function');
  for (let i = 0; i < 30; i++) frame();
  return offset();
}

/** One hit from `angle`, stamped as damagePlayer stamps it, and the offset on the frame that takes it. */
function hitFrom(angle) {
  useGameStore.setState({ lastHitDir: { angle, t: 1000 + Math.round(t * 1000) } });
  frame();
  return offset();
}

describe('the hurt kick through the real Player', () => {
  const SIDE_M = 0.05; // the kick moves the follow camera 0.85 of the way to its 0.14 m target on the frame it lands

  it('a hit from the left kicks the camera right, and one from the right kicks it left', () => {
    const sides = {};
    for (const [name, angle] of [['left', -Math.PI / 2], ['right', Math.PI / 2]]) {
      const rest = standPlayer();
      expect(Math.hypot(rest.right, rest.forward), `SETUP: at rest before the ${name} hit the camera is off the eye`).toBeLessThan(1e-3);
      sides[name] = hitFrom(angle);
      expect(sides[name].up, `SETUP: the ${name} hit did not kick the camera at all (no down)`).toBeLessThan(-SIDE_M);
      cleanup();
      h.frame = null;
      h.body.setTranslation({ x: 0, y: 51, z: 0 }, true);
    }
    expect(sides.left.right, `a hit from the left did not push the camera right: ${JSON.stringify(sides.left)}`).toBeGreaterThan(SIDE_M);
    expect(sides.right.right, `a hit from the right did not push the camera left: ${JSON.stringify(sides.right)}`).toBeLessThan(-SIDE_M);
  });

  it('a hit from ahead kicks the camera back, one from behind forward, and a hit with no source back', () => {
    const got = {};
    for (const [name, angle] of [['ahead', 0], ['behind', Math.PI], ['no source', null]]) {
      standPlayer();
      got[name] = hitFrom(angle);
      cleanup();
      h.frame = null;
      h.body.setTranslation({ x: 0, y: 51, z: 0 }, true);
    }
    expect(got.ahead.forward, `a hit from ahead did not push the camera back: ${JSON.stringify(got.ahead)}`).toBeLessThan(-SIDE_M);
    expect(got.behind.forward, `a hit from behind did not push the camera forward: ${JSON.stringify(got.behind)}`).toBeGreaterThan(SIDE_M);
    expect(got['no source'].forward, `a hit with no source did not push the camera back: ${JSON.stringify(got['no source'])}`).toBeLessThan(-SIDE_M);
  });
});
