// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import * as THREE from 'three';

/**
 * THE PLAYER UNDER A LOOKBOOK POSE (src/Components.jsx; review of PR #23, item 5). lookbook-seam-gates drives the
 * seam's own state (pose, clear, applyLookbookPose on a bare camera), which says nothing about the two places the game
 * reads it: the Player's useFrame, where a pose must pin the camera and RETURN before the controller (movement, the
 * KCC, the death branch, the void guard, the beast / voidhand / imbue ticks), and the Player's render, which must hide
 * the first-person hands while posed. Deleting either left every unit test green.
 *
 * This mounts the real Player with R3F and Rapier stubbed: useFrame hands this test the Player's frame callback,
 * useThree a real THREE.PerspectiveCamera, RigidBody a body whose wakeUp() is a spy. wakeUp() is the controller's
 * first statement after the pose branch, so "was it called" is "did the controller run this frame". The hands and the
 * Player's child systems are stubbed to a marker or nothing. The pose goes in through the seam's own API (installed on a
 * stand-in window), as the probe's does.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh on src/Components.jsx, 3 tests each, every RED confirmed against a green baseline:
 *   P1 the pose branch never taken (`if (false && lookPose)`) -> "pins the camera and stops the controller"
 *   P2 plausible-wrong: the pose applied but the frame not returned (the controller runs under it) -> the same test
 *   P3 plausible-wrong: the pose branch moved below wakeUp() (the controller starts, then the camera is pinned) -> the same test
 *   P4 the hands no longer hide for a pose (`!inCapture && (`) -> "hides the first-person hands"
 *   P5 plausible-wrong: the hands read the pose once, not subscribed (a no-op subscribe) -> the same test
 *   I0 identity (a comment edit in Components.jsx) SURVIVED.
 *
 * BLIND SPOT: the controller BELOW wakeUp() is not driven (the body stub has only what reaching it needs), so what a
 * pose stops is proven only as "the controller did not start"; that PositionTracker then publishes the posed camera is
 * the seam's docblock and the e2e's (tests/e2e/lookbook-seam.spec.js). Rapier and the R3F loop are stubs.
 */

const h = vi.hoisted(() => ({ frame: null, camera: null, body: null }));
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
    useRapier: () => ({ rapier: {}, world: null }),
  };
});
vi.mock('../../src/render/playerRender', () => ({ StableMagicHands: () => <i data-testid="hands" /> }));
// The hands mount through the viewmodel portal; here it passes them straight through, so the DOM shows whether the
// Player mounts them, and its own frame callback stays the one this file drives.
vi.mock('../../src/render/ViewmodelLayer.jsx', () => ({ ViewmodelLayer: ({ children }) => <>{children}</> }));
vi.mock('../../src/render/BeastAvatar', () => ({ BeastAvatar: () => null }));
vi.mock('../../src/world/PhantomBlockSystem', () => ({ PhantomBlockSystem: () => null, phantomWorldPos: { x: 0, y: 0, z: 0 } }));
vi.mock('../../src/world/HurlSystem', () => ({ HurlSystem: () => null }));
vi.mock('../../src/world/SnareTetherSystem.jsx', () => ({ SnareTetherSystem: () => null }));
vi.mock('../../src/world/SquadAISystem.jsx', () => ({ SquadAISystem: () => null }));
vi.mock('../../src/world/ElementZoneSystem.jsx', () => ({ ElementZoneSystem: () => null }));

const { Player } = await import('../../src/Components.jsx');
const seamMod = await import('../../src/render/lookbookSeam.js');
const { useGameStore } = await import('../../src/store/useGameStore.jsx');

const POSE = { position: [13, 81, 13], lookAt: [0, 51, 0] };
let seam = null;

/**
 * Run the Player's frame callback once: { started } is whether the controller started (wakeUp called this frame),
 * { threw } what it threw. Past wakeUp() the controller reaches parts of the body and world this stub does not model,
 * so an unposed frame may throw THERE (see BLIND SPOT); a posed frame must not throw at all — the pose branch is camera
 * writes and a return, so a throw there would be the branch failing, not finishing.
 */
function frame() {
  const before = h.body.wakeUp.mock.calls.length;
  let threw = null;
  try {
    h.frame({ camera: h.camera, clock: { getElapsedTime: () => 0 } }, 1 / 60);
  } catch (e) {
    threw = String(e && e.message);
  }
  return { started: h.body.wakeUp.mock.calls.length > before, threw };
}
const hands = () => document.querySelector('[data-testid="hands"]');

beforeEach(() => {
  seamMod._resetLookbookForTest();
  const win = { location: { search: '?lookbook=1' } };
  seamMod.installLookbookSeam(win, {
    store: useGameStore, setActive: () => {}, getActive: () => true, cycleOf: () => 0, glInfo: () => null, contextLosses: () => 0,
  });
  seam = win.__craftyLookbook;
  h.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
  h.camera.position.set(0, 100, 0);
  h.body = { wakeUp: vi.fn(), translation: () => ({ x: 0, y: 100, z: 0 }) };
  useGameStore.setState({ isCaptureMode: false });
});
afterEach(() => {
  cleanup();
  seamMod._resetLookbookForTest();
});

describe('the Player under a lookbook pose', () => {
  it('pins the camera and stops the controller while posed; clear() hands the frame back', () => {
    render(<Player isWorldBuilt />);
    expect(h.frame, 'the Player registered no frame callback').toBeTypeOf('function');
    expect(frame().started, 'presence: unposed, the controller must start (wakeUp) — else nothing below is measured').toBe(true);

    act(() => { seam.pose(POSE); });
    expect(frame(), 'posed: the controller must not start, and the pose branch must finish cleanly')
      .toEqual({ started: false, threw: null });
    expect(h.camera.position.toArray(), 'the camera is not at the pose').toEqual(POSE.position);
    expect(h.camera.fov).toBe(75);
    const look = new THREE.Vector3();
    h.camera.getWorldDirection(look);
    const want = new THREE.Vector3(...POSE.lookAt).sub(new THREE.Vector3(...POSE.position)).normalize();
    expect(look.distanceTo(want), 'the camera does not look at the pose target').toBeLessThan(1e-6);

    act(() => { seam.clear(); });
    expect(frame().started, 'cleared, the controller did not take the frame back').toBe(true);
  });

  it('hides the first-person hands while posed, and shows them again on clear()', () => {
    render(<Player isWorldBuilt />);
    expect(hands(), 'presence: unposed, the hands are drawn').not.toBeNull();
    act(() => { seam.pose(POSE); });
    expect(hands(), 'a hero shot with the hands in the corner').toBeNull();
    act(() => { seam.clear(); });
    expect(hands(), 'the hands did not come back after clear()').not.toBeNull();
  });

  it('an eye pose (hands: true) keeps the hands, and still stops the controller', () => {
    render(<Player isWorldBuilt />);
    act(() => { seam.pose({ ...POSE, hands: true }); });
    expect(hands(), 'an eye pose hid the hands the still is meant to show').not.toBeNull();
    expect(frame().started, 'under an eye pose the controller (and the beast state machine) ran').toBe(false);
    act(() => { seam.pose(POSE); });
    expect(hands(), 'a hero pose after an eye pose kept the hands').toBeNull();
    act(() => { seam.clear(); });
  });

  it('keeps the capture-mode hand hiding it already had (a control for the pose case)', () => {
    useGameStore.setState({ isCaptureMode: true });
    render(<Player isWorldBuilt />);
    expect(hands(), 'capture mode draws the hands').toBeNull();
  });
});
