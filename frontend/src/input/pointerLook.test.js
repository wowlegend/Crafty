// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { applyMouseLook, attachPointerLook } from './pointerLook.js';

// Desktop mouse-look math (the fix for the dead camera: drei PLC was element-match-fragile + untestable).
// applyMouseLook reuses the touch applyLook, so this also guards that desktop + touch look identically.
const cam = (y = 0, x = 0) => ({ rotation: { x, y, order: 'XYZ' } });

describe('applyMouseLook', () => {
  it('moving the mouse right/left turns yaw (camera.rotation.y) and sets YXZ order', () => {
    const c = cam();
    applyMouseLook(c, 100, 0, 1);
    expect(c.rotation.y).not.toBe(0);
    expect(c.rotation.order).toBe('YXZ');
    const c2 = cam();
    applyMouseLook(c2, -100, 0, 1);
    expect(Math.sign(c2.rotation.y)).toBe(-Math.sign(c.rotation.y)); // opposite directions
  });

  it('moving the mouse up/down changes pitch (camera.rotation.x)', () => {
    const c = cam();
    applyMouseLook(c, 0, 100, 1);
    expect(c.rotation.x).not.toBe(0);
  });

  it('sensitivity scales the rotation (2x sens => ~2x yaw for the same delta)', () => {
    const a = cam(); applyMouseLook(a, 50, 0, 1);
    const b = cam(); applyMouseLook(b, 50, 0, 2);
    expect(Math.abs(b.rotation.y)).toBeCloseTo(Math.abs(a.rotation.y) * 2, 6);
  });

  it('pitch is clamped (a huge vertical delta cannot flip the camera past ~vertical)', () => {
    const c = cam();
    applyMouseLook(c, 0, 100000, 1);
    expect(Math.abs(c.rotation.x)).toBeLessThan(Math.PI / 2); // never gimbal-flips
  });

  it('is null-safe (no camera / no rotation -> no throw)', () => {
    expect(() => applyMouseLook(null, 10, 10, 1)).not.toThrow();
    expect(() => applyMouseLook({}, 10, 10, 1)).not.toThrow();
  });
});

describe('attachPointerLook (document mousemove -> camera, gated on pointer lock)', () => {
  const orig = Object.getOwnPropertyDescriptor(document, 'pointerLockElement');
  const setLock = (el) => Object.defineProperty(document, 'pointerLockElement', { value: el, configurable: true });
  const move = (mx, my) => document.dispatchEvent(Object.assign(new Event('mousemove'), { movementX: mx, movementY: my }));
  afterEach(() => { if (orig) Object.defineProperty(document, 'pointerLockElement', orig); else delete document.pointerLockElement; });

  it('rotates the camera on mousemove WHILE a pointer lock is held', () => {
    const c = cam();
    setLock(document.body); // lenient gate: ANY element holding the lock
    const cleanup = attachPointerLook({ camera: c, getSensitivity: () => 1 });
    move(100, 0);
    expect(c.rotation.y).not.toBe(0);
    cleanup();
  });

  it('does NOT rotate when no pointer lock is held (free cursor over menus/UI)', () => {
    const c = cam();
    setLock(null); // no lock
    const cleanup = attachPointerLook({ camera: c, getSensitivity: () => 1 });
    move(100, 0);
    expect(c.rotation.y).toBe(0); // untouched — MUTATION-PROOF: drop the pointerLockElement gate and this goes RED
    cleanup();
  });

  it('the returned cleanup removes the listener (no rotation after cleanup, even while locked)', () => {
    const c = cam();
    setLock(document.body);
    const cleanup = attachPointerLook({ camera: c, getSensitivity: () => 1 });
    cleanup();
    move(100, 0);
    expect(c.rotation.y).toBe(0);
  });

  it('pulls the LIVE sensitivity on each locked move (getSensitivity called per event)', () => {
    const c = cam();
    setLock(document.body);
    const getSens = vi.fn(() => 1);
    const cleanup = attachPointerLook({ camera: c, getSensitivity: getSens });
    move(10, 0); move(10, 0);
    expect(getSens).toHaveBeenCalledTimes(2);
    cleanup();
  });

  it('is a no-op with no camera (returns a cleanup fn, never throws)', () => {
    expect(typeof attachPointerLook({})).toBe('function');
    expect(() => attachPointerLook({})()).not.toThrow();
  });
});
