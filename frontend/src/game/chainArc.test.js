import { describe, it, expect } from 'vitest';
import { chainArcPoints, ARC_SEGMENTS } from './chainArc.js';

describe('chainArcPoints — jagged inter-target lightning arc geometry', () => {
  it('returns (segments+1)*3 flat coords', () => {
    const pts = chainArcPoints([0, 0, 0], [10, 0, 0]);
    expect(pts.length).toBe((ARC_SEGMENTS + 1) * 3);
  });
  it('endpoints are EXACT (first + last points = from + to)', () => {
    const pts = chainArcPoints([1, 2, 3], [7, 8, 9]);
    expect([pts[0], pts[1], pts[2]]).toEqual([1, 2, 3]);
    const n = pts.length;
    expect([pts[n - 3], pts[n - 2], pts[n - 1]]).toEqual([7, 8, 9]);
  });
  it('is deterministic (same args -> identical points; no Math.random)', () => {
    const a = chainArcPoints([0, 0, 0], [5, 5, 5], { seed: 12 });
    const b = chainArcPoints([0, 0, 0], [5, 5, 5], { seed: 12 });
    expect(a).toEqual(b);
  });
  it('interior points are jittered OFF the straight line (it is jagged, not straight)', () => {
    const from = [0, 0, 0], to = [10, 0, 0];
    const pts = chainArcPoints(from, to, { jitter: 0.5, seed: 1 });
    // a midpoint sample: index 3 (the 4th point) should deviate from the exact lerp (y/z != 0)
    const i = 3 * 3;
    const offLine = Math.abs(pts[i + 1]) + Math.abs(pts[i + 2]); // |y| + |z|
    expect(offLine).toBeGreaterThan(0);
  });
  it('jitter is bounded by the jitter param (interior deviation <= ~2*jitter)', () => {
    const from = [0, 0, 0], to = [10, 0, 0]; const jitter = 0.4;
    const pts = chainArcPoints(from, to, { jitter, seed: 3 });
    for (let i = 1; i < ARC_SEGMENTS; i++) {
      const dy = pts[i * 3 + 1], dz = pts[i * 3 + 2]; // off-axis components (axis is +X)
      expect(Math.hypot(dy, dz)).toBeLessThanOrEqual(2 * jitter + 1e-6);
    }
  });
  it('accepts {x,y,z} objects as well as arrays', () => {
    const pts = chainArcPoints({ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 });
    expect([pts[0], pts[1], pts[2]]).toEqual([0, 0, 0]);
  });
});
