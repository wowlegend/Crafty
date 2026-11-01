// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

/**
 * HELD C MAKES A RIGHT CLICK A PLACEMENT, THROUGH THE REAL PLAYER (src/Components.jsx: the keydown and keyup, and the
 * click's performVerb; input/verbRouter.js; registry QUEUE:Q26/b).
 *
 * The router's ladder is verbRouter.test.js's. This is the seam it cannot see: the window's real keydown and keyup on C
 * reaching the `forcePlace` intent, and performVerb handing that intent to the router. It mounts the real Player with the
 * real Rapier, as tests/gates/player-view-hold-gates.test.jsx does (R3F stubbed), opens the input gate, and stands in
 * for Terrain's build ray (GameMethods.castBuildRay: a chest 3 m ahead) and its verbs (GameMethods.terrainVerbs, which
 * count what they are handed). A right click is the store's performVerb(2), the call the mouse pair and the touch cast
 * button make.
 *
 * PRESENCE: without C the same click opens the chest. BLIND SPOT: the real mouse pair, the real ray and the worker's
 * placement are the e2e's (tests/e2e/build-placement.spec.js, "hold C with a right click").
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
const { GameMethods } = await import('../../src/GameMethods.js');
const { getInput, setActive, resetInput } = await import('../../src/input/inputState');

beforeAll(async () => {
  await RAPIER.init();
});

let t = 0;
function frame() {
  t += 1 / 60;
  h.frame({ camera: h.camera, clock: { getElapsedTime: () => t, elapsedTime: t } }, 1 / 60);
  h.world.step();
}

const saved = useGameStore.getState();
const savedMethods = { castBuildRay: GameMethods.castBuildRay, terrainVerbs: GameMethods.terrainVerbs };
let handed;
beforeEach(() => {
  h.world = new RAPIER.World({ x: 0, y: -30, z: 0 });
  const floor = h.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 49.5, 0));
  h.world.createCollider(RAPIER.ColliderDesc.cuboid(50, 0.5, 50), floor);
  h.body = h.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 51, 0));
  h.world.createCollider(RAPIER.ColliderDesc.capsule(0.5, 0.4), h.body);
  h.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 500);
  t = 0;
  resetInput();
  handed = [];
  GameMethods.castBuildRay = () => ({ toi: 3, normal: { x: 0, y: 1, z: 0 }, targetCoords: '0_50_-3', chestTargeted: true, chestHasItems: true });
  GameMethods.terrainVerbs = { place: () => handed.push('place'), open: () => handed.push('open'), mine: () => handed.push('mine') };
  useGameStore.setState({ isCaptureMode: false, isAlive: true, gameStarted: true, getMobGroundLevel: () => 50 });
});
afterEach(() => {
  cleanup();
  resetInput();
  GameMethods.castBuildRay = savedMethods.castBuildRay;
  GameMethods.terrainVerbs = savedMethods.terrainVerbs;
  useGameStore.setState({ isAlive: saved.isAlive, gameStarted: saved.gameStarted, getMobGroundLevel: saved.getMobGroundLevel });
});

const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));

describe('held C through the real Player', () => {
  it('the window\'s C sets and clears forcePlace, and a right click held on it places on the chest it would open', () => {
    render(<Player isWorldBuilt />);
    for (let i = 0; i < 10; i++) frame();
    setActive(true);
    const click = () => useGameStore.getState().performVerb?.(2);
    expect(useGameStore.getState().performVerb, 'SETUP: the Player published no performVerb').toBeTypeOf('function');

    expect(click(), 'SETUP: without C the click on the chest is not the chest\'s').toBe('interact');
    expect(handed, 'SETUP: the interact did not reach the terrain verbs').toEqual(['open']);

    key('keydown', 'KeyC');
    expect(getInput().forcePlace, 'the window\'s C keydown did not set forcePlace').toBe(true);
    expect(click(), 'a right click held on C was not a placement').toBe('place');
    expect(handed, 'the placement did not reach the terrain verbs').toEqual(['open', 'place']);

    key('keyup', 'KeyC');
    expect(getInput().forcePlace, 'the window\'s C keyup did not clear forcePlace').toBe(false);
    expect(click(), 'after C was let go the click still placed').toBe('interact');
  });
});
