// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { isPointInCone } from './cone.js';

// Cone semantics MIRROR SimplifiedNPCSystem.jsx checkMobsInMeleeCone:
//   - 2D (xz-plane) angle test via dot-product against the look direction
//   - minDot = cos(angleRad / 2)  (angleRad is the FULL arc; half-angle is angleRad/2)
//   - a vertical cutoff: |dy| > 2.2 fails
//   - a range check: dist(3D) > range fails
// Fixture: origin {0,0,0}, dir {0,0,-1} (-Z forward), range 4.5,
//          angleRad = Math.PI/2 (90deg total -> +/-45deg half-angle).
describe('isPointInCone — melee cone helper (mirrors checkMobsInMeleeCone)', () => {
  const origin = { x: 0, y: 0, z: 0 };
  const dir = { x: 0, y: 0, z: -1 };
  const range = 4.5;
  const angleRad = Math.PI / 2;

  it('point dead-ahead within range -> true', () => {
    expect(isPointInCone(origin, dir, { x: 0, y: 0, z: -3 }, range, angleRad)).toBe(true);
  });

  it('point directly behind -> false', () => {
    expect(isPointInCone(origin, dir, { x: 0, y: 0, z: 3 }, range, angleRad)).toBe(false);
  });

  it('point in range but outside the 45deg half-arc -> false', () => {
    // {4,0,-0.2}: dist ~4.005 (in range) but ~87deg off-axis -> dot ~0.05 < cos(45deg)
    expect(isPointInCone(origin, dir, { x: 4, y: 0, z: -0.2 }, range, angleRad)).toBe(false);
  });

  it('point beyond range -> false', () => {
    expect(isPointInCone(origin, dir, { x: 0, y: 0, z: -9 }, range, angleRad)).toBe(false);
  });

  it('point at a comfortable in-arc angle within range -> true', () => {
    // {1,0,-3}: dist ~3.16 (in range), ~18.4deg off-axis -> dot ~0.95 >= cos(45deg)
    expect(isPointInCone(origin, dir, { x: 1, y: 0, z: -3 }, range, angleRad)).toBe(true);
  });

  it('point in-arc and in-range but far above (vertical cutoff |dy| > 2.2) -> false', () => {
    expect(isPointInCone(origin, dir, { x: 0, y: 3, z: -3 }, range, angleRad)).toBe(false);
  });

  it('point far below (vertical cutoff |dy| > 2.2) -> false', () => {
    expect(isPointInCone(origin, dir, { x: 0, y: -3, z: -3 }, range, angleRad)).toBe(false);
  });

  it('point at the vertical cutoff edge (|dy| = 2.2) still passes', () => {
    // dy = 2.2 is NOT > 2.2, so it stays a hit; xz still dead-ahead, dist 3.79 in range
    expect(isPointInCone(origin, dir, { x: 0, y: 2.2, z: -3 }, range, angleRad)).toBe(true);
  });
});
