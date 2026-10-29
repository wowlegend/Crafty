// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

/**
 * WHO PLACED THE CAMERA (src/Components.jsx, the Player's loop; render/followView.js).
 *
 * The player's own beast hides in first person (render/BeastAvatar.jsx, tests/gates/beast-self-view-gates.test.jsx), and
 * first person is the follow placing the camera, not the camera standing near the eye: a crit's shake carries the
 * follow's camera more than FIRST_PERSON_M off the eye, and the roar's reveal starts and ends inside it. So the loop
 * marks, every frame, whether its follow branch placed the camera. This mounts the real Player with the real Rapier
 * (@dimforge/rapier3d-compat 0.19.2: a world, a floor, a kinematic capsule body and the loop's own character
 * controller); R3F is stubbed so this test drives the Player's frame callback, the body is handed to the RigidBody ref,
 * and the hands and child systems are stubbed out. It reads the mark after each frame:
 *   - in the follow, under a crit's shake that puts the camera outside FIRST_PERSON_M, the mark is set;
 *   - through the roar's reveal (the real input intents, the talent and a full ember bar) the mark is clear while the
 *     reveal places the camera, and set again on the frame the follow takes it back;
 *   - dead, where the loop's death branch places the camera, the mark is clear;
 *   - in capture mode (devtest/captureMode.js, the e2e fixtures' frozen camera), the mark is clear;
 *   - under a lookbook hero pose (the lookbook's reveal shots, render/lookbookSeam.js), the mark is clear.
 * BLIND SPOT: R3F's loop and the render are stubs, so that the mark is read as the frame DRAWS (after every frame
 * callback) is BeastAvatar's onBeforeRender and its gate; the reveal's frames are counted, not timed against a clock.
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
const { followHoldsView } = await import('../../src/render/followView.js');
const { FIRST_PERSON_M } = await import('../../src/render/beastAvatarParts.js');
const { EYE_HEIGHT_M } = await import('../../src/combat/swingOrigin.js');
const { TRANSFORM_CAM_SEC } = await import('../../src/game/transformCam.js');
const { setIntent, setActive, resetInput } = await import('../../src/input/inputState');
const { _resetShake } = await import('../../src/game/cameraShakeChannel.js');
const { ROAR_COST } = await import('../../src/game/ember.js');
const seamMod = await import('../../src/render/lookbookSeam.js');
const { enterCaptureMode, exitCaptureMode } = await import('../../src/devtest/captureMode.js');

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
/** The drawn camera's distance from the body's steady eye. */
function offEye() {
  const b = h.body.translation();
  return h.camera.position.distanceTo(new THREE.Vector3(b.x, b.y + EYE_HEIGHT_M, b.z));
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
  // A placed block at the origin column is where the loop stands the player (game/spawnPlacement.js).
  useGameStore.setState({ isCaptureMode: false, isAlive: true, worldBlocks: new Map([['0_50_0', 1]]) });
});
afterEach(() => {
  cleanup();
  seamMod._resetLookbookForTest();
  _resetShake();
  resetInput();
  useGameStore.setState({
    isAlive: saved.isAlive, worldBlocks: saved.worldBlocks, ember: saved.ember, unlockedTalents: saved.unlockedTalents,
    beastFormActive: false, activeBeastForm: null, beastCharging: false,
  });
});

/** Mount the Player and run it until it has stood the player on the floor and the follow holds the view. */
function standPlayer() {
  render(<Player isWorldBuilt />);
  expect(h.frame, 'the Player registered no frame callback').toBeTypeOf('function');
  for (let i = 0; i < 30; i++) frame();
  expect(followHoldsView(), 'SETUP: standing still, the follow does not hold the view').toBe(true);
  expect(offEye(), 'SETUP: standing still, the camera is not at the eye').toBeLessThan(0.1);
}

describe('the Player\'s loop marks the frames its follow places the camera', () => {
  it('under a crit\'s shake the follow carries the camera outside FIRST_PERSON_M, and the frame is still marked as the follow', () => {
    standPlayer();
    const now = vi.spyOn(performance, 'now').mockReturnValue(2508.6); // the shake's noise seed is performance.now() * 0.05
    try {
      useGameStore.getState().triggerCameraShake(1.6, 1, 0); // CombatSystem.jsx: a crit, from +x
      frame();
      expect(offEye(), 'SETUP: this crit must carry the drawn camera outside first person').toBeGreaterThan(FIRST_PERSON_M);
      expect(followHoldsView(), 'a shaken follow frame is not marked as the follow').toBe(true);
    } finally {
      now.mockRestore();
    }
  });

  it('through the roar\'s reveal the mark is clear, and the follow sets it again on the frame it takes the view back', () => {
    standPlayer();
    useGameStore.setState({ unlockedTalents: { ...(saved.unlockedTalents || {}), wildheart_roar: 1 }, ember: ROAR_COST });
    setActive(true);
    setIntent('roar', true);
    const marks = [];
    let farthest = 0;
    const frames = Math.ceil(TRANSFORM_CAM_SEC * 60) + 3;
    for (let i = 0; i < frames; i++) {
      frame();
      marks.push(followHoldsView());
      farthest = Math.max(farthest, offEye());
    }
    expect(useGameStore.getState().beastFormActive, 'SETUP: the roar did not transform the player').toBe(true);
    expect(farthest, 'SETUP: the reveal never took the camera off the eye').toBeGreaterThan(4);
    const clear = marks.indexOf(false);
    const back = marks.indexOf(true, clear);
    expect(clear, 'the reveal\'s frames are marked as the follow').toBe(0);
    // The window runs TRANSFORM_CAM_SEC: 72 frames at 60 Hz, the last of them the follow's.
    expect(back - clear, `the mark came back after ${back - clear} frames`).toBe(Math.ceil(TRANSFORM_CAM_SEC * 60) - 1);
    expect(marks.slice(back).every(Boolean), 'after the reveal the follow\'s frames are not all marked').toBe(true);
  });

  it('dead, the death branch places the camera, and the mark is clear', () => {
    standPlayer();
    useGameStore.setState({ isAlive: false });
    frame();
    expect(offEye(), 'SETUP: the death branch keeps the camera at the eye').toBeLessThan(0.1);
    expect(followHoldsView(), 'the death branch\'s frame is marked as the follow').toBe(false);
  });

  it('in capture mode, which pins the camera before the controller runs, the mark is clear', () => {
    standPlayer();
    // App.jsx's beast fixtures capture the roar's reveal camera, so a mark left set would hide the beast they frame.
    enterCaptureMode({ camera: { position: [-4.5, 53.2, 0], lookAt: [0, 51.6, 0] } });
    try {
      frame();
      expect(h.camera.position.toArray(), 'SETUP: capture did not pin the camera').toEqual([-4.5, 53.2, 0]);
      expect(followHoldsView(), 'a captured frame is marked as the follow, so a capture fixture would hide the beast').toBe(false);
    } finally {
      exitCaptureMode();
    }
  });

  it('under a lookbook hero pose, which pins the camera before the controller runs, the mark is clear', () => {
    standPlayer();
    const win = { location: { search: '?lookbook=1' } };
    seamMod.installLookbookSeam(win, {
      store: useGameStore, setActive: () => {}, getActive: () => true, cycleOf: () => 0, glInfo: () => null, contextLosses: () => 0,
    });
    win.__craftyLookbook.pose({ position: [-4.5, 53.2, 0], lookAt: [0, 51.6, 0] });
    frame();
    expect(h.camera.position.toArray(), 'SETUP: the pose did not pin the camera').toEqual([-4.5, 53.2, 0]);
    expect(followHoldsView(), 'a posed frame is marked as the follow, so the reveal\'s hero shot would hide the beast').toBe(false);
  });
});
