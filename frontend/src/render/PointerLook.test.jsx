// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';

/**
 * PointerLook.test.jsx — the WIRING between the store setting and the look handler, driven.
 *
 * WHY THIS EXISTS. `tests/gates/look-sensitivity-gate.test.js` asserted this wiring by grepping
 * GameScene.jsx for `attachPointerLook({ ... lookSensitivity`. That gate was on the 2026-09-22 audit's
 * DELETE list as a "pure source-grep", and deleting it would have left the property with nothing watching
 * it — so the verdict was CONVERT. This file is the conversion: the same claims, executed.
 *
 * The grep could not see any of these, and each is a live failure mode:
 *   - the handler reading a value CAPTURED AT MOUNT instead of the live one (the text is identical)
 *   - capture mode failing to disable it — a pointer-lock listener mutating the camera mid-capture is
 *     exactly the class of nondeterminism the 31-frame oracle cannot tolerate, and NO gate asserted it
 *   - the effect returning without its cleanup, leaking a document listener per mount
 *
 * `applyMouseLook` / `attachPointerLook` math and lock-gating are already driven in
 * `src/input/pointerLook.test.js`. This file deliberately does not restate them; it tests the component.
 *
 * Mutation-Proof: MEASURED matrix, not a predicted one. First draft of this receipt said "each mutation
 * reddens only its own case" and the run disproved it — the cases share a document listener, so a mutation
 * that leaks one contaminates its neighbours. That cross-talk is reported here rather than tuned away,
 * because it IS the leak the last case exists to catch.
 *
 *   M1  delete the attachPointerLook(...) call        -> 5 of 6 RED
 *   M2  getSensitivity: () => 1                        -> 3 RED (live-value, after-mount, unmount)
 *   M4  drop the `isCaptureMode ||` guard              -> 2 RED (capture-mode, unmount)
 *   M5  drop the returned cleanup                      -> 3 RED (live-value, capture-mode, unmount)
 *
 * Subject restored from a cp backup and diffed byte-identical after each. Two vacuous passes were found in
 * THIS file by that matrix and fixed before it was committed: the after-mount case read `0 ≈ 0*2` and held
 * with no handler attached at all, and the two absence cases (`rotation.y === 0`) passed under M1 for the
 * same reason a dead instrument passes them. Both now prove the PRESENCE with the same harness, in the same
 * run, before asserting the absence.
 *
 * Blind spot, stated: nothing here proves GameScene MOUNTS <PointerLook/>. That is one line of JSX in a
 * component no jsdom harness can render (R3F canvas + Rapier WASM), so the grep for it survives in the
 * gate file, labelled as the wiring-only assertion it is.
 */

const camera = { rotation: { x: 0, y: 0, order: 'XYZ' } };
vi.mock('@react-three/fiber', () => ({ useThree: (sel) => sel({ camera }) }));

const { useGameStore } = await import('../store/useGameStore');
const { PointerLook } = await import('./PointerLook');

const lockDesc = Object.getOwnPropertyDescriptor(document, 'pointerLockElement');
const setLock = (el) => Object.defineProperty(document, 'pointerLockElement', { value: el, configurable: true });
const move = (mx) => document.dispatchEvent(Object.assign(new Event('mousemove'), { movementX: mx, movementY: 0 }));

/** Fresh camera + known store state per case, so no case inherits another's rotation (R12). */
function setup({ sensitivity = 1, capture = false, locked = true } = {}) {
  camera.rotation.x = 0;
  camera.rotation.y = 0;
  camera.rotation.order = 'XYZ';
  useGameStore.setState({ lookSensitivity: sensitivity, isCaptureMode: capture });
  setLock(locked ? document.body : null);
  return render(<PointerLook />);
}

afterEach(() => {
  if (lockDesc) Object.defineProperty(document, 'pointerLockElement', lockDesc);
  else delete document.pointerLockElement;
  useGameStore.setState({ lookSensitivity: 1, isCaptureMode: false });
});

describe('PointerLook — the store setting reaches the look handler', () => {
  it('attaches on mount: a locked mousemove rotates the camera from useThree', () => {
    const { unmount } = setup();
    move(100);
    expect(camera.rotation.y).not.toBe(0);
    expect(camera.rotation.order).toBe('YXZ'); // the handler ran, not just any listener
    unmount();
  });

  it('feeds the LIVE store lookSensitivity, not a hardcoded 1 (2x setting => 2x yaw)', () => {
    const a = setup({ sensitivity: 1 });
    move(50);
    const oneX = Math.abs(camera.rotation.y);
    a.unmount();

    const b = setup({ sensitivity: 2 });
    move(50);
    expect(Math.abs(camera.rotation.y)).toBeCloseTo(oneX * 2, 6);
    b.unmount();

    expect(oneX).toBeGreaterThan(0); // the comparison is against a real rotation, not 0 === 0
  });

  it('picks up a sensitivity change made AFTER mount, without a remount', () => {
    const { unmount } = setup({ sensitivity: 1 });
    move(50);
    const before = Math.abs(camera.rotation.y);
    expect(before).toBeGreaterThan(0); // else `after ≈ before*2` is 0 ≈ 0 and holds with NO handler attached

    camera.rotation.x = 0;
    camera.rotation.y = 0;
    useGameStore.getState().setLookSensitivity(2); // live edit, e.g. the settings slider mid-session
    move(50);
    expect(Math.abs(camera.rotation.y)).toBeCloseTo(before * 2, 6);
    unmount();
  });

  it('does NOT attach in capture mode (a live look handler would make the visual oracle nondeterministic)', () => {
    // PRESENCE FIRST. `rotation.y === 0` is also what a dead instrument reads, so the same harness must be
    // shown seeing the positive case in this run before its zero is allowed to mean anything.
    const live = setup({ capture: false });
    move(100);
    expect(camera.rotation.y).not.toBe(0);
    live.unmount();

    const captured = setup({ capture: true });
    move(100);
    expect(camera.rotation.y).toBe(0);
    captured.unmount();
  });

  it('unmount detaches the document listener (no rotation after unmount, even while locked)', () => {
    const { unmount } = setup();
    move(100);
    expect(camera.rotation.y).not.toBe(0); // presence: it WAS attached, so the zero below is a detach
    unmount();

    camera.rotation.x = 0;
    camera.rotation.y = 0;
    move(100);
    expect(camera.rotation.y).toBe(0);
  });

  it('control: with no pointer lock held, a mounted PointerLook rotates nothing', () => {
    const { unmount } = setup({ locked: false });
    move(100);
    expect(camera.rotation.y).toBe(0);
    unmount();
  });
});
