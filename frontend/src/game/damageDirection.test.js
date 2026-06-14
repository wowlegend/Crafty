import { describe, it, expect } from 'vitest';
import { hitDirection } from './damageDirection';

const P = { x: 0, y: 0, z: 0 };
const near = (a, b) => Math.abs(a - b) < 1e-6;

describe('hitDirection — screen-relative incoming-hit angle', () => {
  it('yaw 0: front=0, right=+pi/2, left=-pi/2, behind=+/-pi', () => {
    expect(near(hitDirection(P, { x: 0, y: 0, z: -1 }, 0), 0)).toBe(true);          // ahead -> top
    expect(near(hitDirection(P, { x: 1, y: 0, z: 0 }, 0), Math.PI / 2)).toBe(true);  // right
    expect(near(hitDirection(P, { x: -1, y: 0, z: 0 }, 0), -Math.PI / 2)).toBe(true); // left
    expect(Math.abs(Math.abs(hitDirection(P, { x: 0, y: 0, z: 1 }, 0)) - Math.PI) < 1e-6).toBe(true); // behind
  });
  it('camera yaw rotates the cue: +yaw is a LEFT turn (three.js +Y), so a world-front hit reads to your RIGHT', () => {
    // source dead ahead in world (-z); turn the camera +pi/2 (yaw, a left turn) -> the hit is now screen-RIGHT
    expect(near(hitDirection(P, { x: 0, y: 0, z: -1 }, Math.PI / 2), Math.PI / 2)).toBe(true);
  });
  it('accepts arrays or {x,z}; null source -> null; co-located -> 0', () => {
    expect(hitDirection([0, 0, 0], [1, 0, 0], 0)).toBeCloseTo(Math.PI / 2);
    expect(hitDirection(P, null, 0)).toBe(null);
    expect(hitDirection(P, P, 0)).toBe(0);
  });
});
