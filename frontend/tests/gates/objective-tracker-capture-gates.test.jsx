// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import * as THREE from 'three';
import { ObjectiveTracker } from '../../src/HUD.jsx';
import { useGameStore } from '../../src/store/useGameStore';
import { enterCaptureMode, exitCaptureMode } from '../../src/devtest/captureMode.js';
import { claimHudTick, emitHudTick } from '../../src/ui/hudTicker.js';

/**
 * THE OBJECTIVE TRACKER'S CAPTURE GUARD RESETS, IT DOES NOT FREEZE (review 2026-10-27, steady-cool LOW 7).
 *
 * The tracker checked capture mode once, when its tick subscribed. The harness enters capture AFTER boot, so a tracker
 * mounted in play kept turning through the gated frames, wherever the player's position had left it — run-dependent by
 * construction (CLAUDE.md: "a capture guard must RESET to a declared value, never early-return", and "the check must live
 * INSIDE the callback, since the flag flips after mount"). Now the tick reads it every time and rests the tracker HIDDEN
 * under capture, writing nothing; it shows again when capture ends. This renders the REAL tracker against the real store
 * and drives the real HUD ticker by hand (claimHudTick + emitHudTick: one tick per call, no rAF).
 * Its source-text sibling, tests/gates/objective-tracker-gates.test.js, still pins the mount-time `return null`.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh on src/HUD.jsx, one batch, receipts in the commit:
 *   O1 the in-tick capture guard removed (the mount-time check only, as shipped)  -> RED expected
 *   O2 plausible-wrong: the guard early-returns without hiding (a freeze)         -> RED expected
 *   O3 plausible-wrong: the tracker is never shown again after capture ends        -> RED expected
 *   O0 identity (a comment edit)                                                  -> must SURVIVE
 */
let release = null;
beforeEach(() => {
  exitCaptureMode();
  release = claimHudTick();
  // Identity camera: heading 0. A shrine reached: the objective is the Blight Heart (no landmark scan needed).
  useGameStore.setState({ gameCamera: { matrixWorld: new THREE.Matrix4() }, playerPosition: { x: 0, y: 60, z: 0 }, reachedShrines: ['0_0'] });
});
afterEach(() => {
  cleanup();
  release();
  exitCaptureMode();
});

const tick = () => act(() => { emitHudTick(0); });
const mount = () => {
  const { getByTestId } = render(<ObjectiveTracker />);
  const root = getByTestId('objective-tracker');
  return { root, arrow: root.querySelector('span') };
};

describe('ObjectiveTracker under capture entered after mount', () => {
  it('in play it is shown and its arrow turns as the player moves (the instrument sees motion)', () => {
    const { root, arrow } = mount();
    tick();
    const a = arrow.style.transform;
    useGameStore.setState({ playerPosition: { x: 4000, y: 60, z: -4000 } });
    tick();
    expect(a, 'SETUP: the tick never wrote the arrow').toMatch(/^rotate\(/);
    expect(arrow.style.transform, 'SETUP: the arrow did not turn when the player moved').not.toBe(a);
    expect(root.style.visibility).not.toBe('hidden');
  });

  it('capture hides it at the next tick and nothing is written while it lasts; it shows again after', () => {
    const { root, arrow } = mount();
    tick();
    const before = arrow.style.transform;
    act(() => { enterCaptureMode(); });
    tick();
    expect(root.style.visibility, 'a tracker mounted in play stayed on screen in capture').toBe('hidden');
    useGameStore.setState({ playerPosition: { x: -4000, y: 60, z: 4000 } });
    tick();
    expect(arrow.style.transform, 'the tracker kept turning under capture').toBe(before);
    exitCaptureMode();
    tick();
    expect(root.style.visibility, 'the tracker never came back after capture').not.toBe('hidden');
    expect(arrow.style.transform, 'the tracker did not resume after capture').not.toBe(before);
  });
});
