import { describe, it, expect } from 'vitest';
import { applyMouseLook } from './pointerLook.js';

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
