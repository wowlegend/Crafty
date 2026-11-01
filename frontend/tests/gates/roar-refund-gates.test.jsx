// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

/**
 * A ROAR WHOSE FORM LOSES ITS ROOM BEFORE THE SWAP COSTS NOTHING (src/Components.jsx roarPaidRef; game/formRefusal.js).
 *
 * The roar's commit asks whether the form has room before it spends the bar (game/formFit.js formHasRoom), but the swap
 * runs on a later frame, after React's activeBeastForm effect, and a block placed in between can take the room: the swap is
 * refused there, and the bar the roar spent for that form is given back (refuseFormSwap). Components.jsx carries the price
 * from the spend to the swap in roarPaidRef; the unit (game/formRefusal.test.js) is handed the price, so nothing proved the
 * Player hands it over (registry REVIEW:chaos-play:roar-refund-wiring-unit-only).
 *
 * This mounts the real Player with the real Rapier (@dimforge/rapier3d-compat 0.19.2: a floor, the kinematic capsule body
 * and the loop's own controller) and the real placed-cell registry (world/placedCellColliders.js) as GameMethods.placedCells,
 * and drives the roar with the real input intent on a full bar and the talent. On the frame the roar commits, four cells
 * are placed over the player's head, where the golem's capsule would stand (stand-ins made since the last step, as a click
 * between the two frames makes them); the next frame's swap is refused, and the bar is read.
 * BLIND SPOT: R3F's loop is a stub (the Player's frame is called directly, a world step after it); the click is stood in for
 * by the registry's add; sound and the reveal camera are not read here (formRefusal.test.js reads the camera's cut).
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
const { setIntent, setActive, resetInput } = await import('../../src/input/inputState');
const { ROAR_COST } = await import('../../src/game/ember.js');
const { BASE_CAPSULE, BEAST_FORMS } = await import('../../src/game/beasts.js');
const { GameMethods } = await import('../../src/GameMethods.js');
const { createPlacedCellColliders, createEditSeq } = await import('../../src/world/placedCellColliders.js');

beforeAll(async () => {
  await RAPIER.init();
});

let t = 0, cells = null;
/** One frame of the Player's loop at 60 Hz, then one world step and the registry's afterStep (Terrain.jsx's order). */
function frame() {
  t += 1 / 60;
  h.frame({ camera: h.camera, clock: { getElapsedTime: () => t, elapsedTime: t } }, 1 / 60);
  h.world.step();
  cells.afterStep();
}

const saved = useGameStore.getState();
beforeEach(() => {
  h.world = new RAPIER.World({ x: 0, y: -30, z: 0 });
  const floor = h.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 49.5, 0));
  h.world.createCollider(RAPIER.ColliderDesc.cuboid(50, 0.5, 50), floor);
  h.body = h.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 51, 0));
  h.world.createCollider(RAPIER.ColliderDesc.capsule(BASE_CAPSULE.halfHeight, BASE_CAPSULE.radius), h.body);
  h.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 500);
  t = 0;
  resetInput();
  cells = createPlacedCellColliders(h.world, RAPIER, createEditSeq());
  GameMethods.placedCells = cells;
  useGameStore.setState({ isCaptureMode: false, isAlive: true, getMobGroundLevel: () => 50, addNotification: () => {} });
});
afterEach(() => {
  cleanup();
  resetInput();
  delete GameMethods.placedCells;
  useGameStore.setState({
    isAlive: saved.isAlive, getMobGroundLevel: saved.getMobGroundLevel, ember: saved.ember, unlockedTalents: saved.unlockedTalents,
    activeSpell: saved.activeSpell, beastFormActive: false, activeBeastForm: null, beastCharging: false,
  });
});

describe('a roar whose form loses its room between the commit and the swap gives the bar back', () => {
  it('cells placed over the head on the commit frame refuse the golem\'s swap, and the full bar comes back', () => {
    render(<Player isWorldBuilt />);
    for (let i = 0; i < 30; i++) frame();
    expect(h.body.translation().y, 'SETUP: the player does not stand on the floor').toBeCloseTo(50.95, 1);
    useGameStore.setState({ unlockedTalents: { ...(saved.unlockedTalents || {}), wildheart_roar: 1 }, ember: ROAR_COST, activeSpell: 'arcane' });
    setActive(true);
    setIntent('roar', true);
    let committed = null;
    for (let i = 0; i < 240 && committed === null; i++) {
      act(() => frame()); // the frame's store writes render inside act, so React's effects run before the next frame
      if (useGameStore.getState().beastFormActive) committed = i;
    }
    setIntent('roar', false);
    const st = useGameStore.getState();
    expect(committed, 'SETUP: the held roar never committed').not.toBeNull();
    expect([st.activeBeastForm, st.ember], 'SETUP: the roar did not commit to the golem and spend the bar').toEqual(['arcane', 0]);
    expect(h.body.collider(0).radius(), 'SETUP: the swap ran on the commit frame, so nothing can take its room before it').toBeCloseTo(BASE_CAPSULE.radius, 6);
    // Between the commit frame and the next (React has run the activeBeastForm effect: the swap is queued), a click
    // places four cells over the spawn corner, over the base capsule's head and inside the golem's height.
    const head = h.body.translation().y + BASE_CAPSULE.halfHeight + BASE_CAPSULE.radius;
    for (const [x, z] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) cells.add(x, Math.floor(head) + 1, z);
    expect(Math.floor(head) + 1 - head, 'SETUP: the cells do not clear the base capsule\'s head').toBeGreaterThan(0.05);
    const golemTop = h.body.translation().y - BASE_CAPSULE.halfHeight - BASE_CAPSULE.radius + 2 * (BEAST_FORMS.arcane.halfHeight + BEAST_FORMS.arcane.radius);
    expect(golemTop, 'SETUP: the cells are not inside the golem\'s height').toBeGreaterThan(Math.floor(head) + 1 + 0.15);
    act(() => frame());
    const after = useGameStore.getState();
    const r = { form: after.activeBeastForm, active: after.beastFormActive, ember: after.ember, radius: +h.body.collider(0).radius().toFixed(2) };
    expect([r.active, r.radius], `SETUP: the swap was not refused ${JSON.stringify(r)}`).toEqual([false, BASE_CAPSULE.radius]);
    expect(r.ember, `the refused roar kept the bar it spent ${JSON.stringify(r)}`).toBe(ROAR_COST);
  });
});
