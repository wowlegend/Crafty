import { describe, it, expect } from 'vitest';
import { bearingToMarker, bearingDeg } from './compass.js';

// Pure compass-bearing math (HUD HOME/boss/chest markers + the facing-independent arrow). Locks: the
// atan2 bearing, heading-relative normalization (wrap-safe), the FOV in-view gate (exclusive at the
// edge), the 0..100 strip mapping (50 = dead-ahead), and the pct->degrees arrow conversion.
const P = Math.PI;

describe('bearingToMarker (default FOV = PI)', () => {
  it('a target dead ahead maps to centre (pct 50, in view)', () => {
    const r = bearingToMarker(0, -10, 0, 0, 0); // due north, facing north
    expect(r.pct).toBeCloseTo(50, 6);
    expect(r.inView).toBe(true);
    expect(r.dist).toBeCloseTo(10, 6);
  });

  it('a target 45deg to the right maps to pct 75, in view', () => {
    const r = bearingToMarker(10, -10, 0, 0, 0); // NE of player, facing north
    expect(r.pct).toBeCloseTo(75, 6);
    expect(r.inView).toBe(true);
    expect(r.dist).toBeCloseTo(Math.sqrt(200), 6);
  });

  it('a target due-right sits at the exclusive edge (pct 100, NOT in view)', () => {
    const r = bearingToMarker(10, 0, 0, 0, 0); // due east, facing north -> diff = PI/2 == fov/2
    expect(r.pct).toBeCloseTo(100, 6);
    expect(r.inView).toBe(false); // boundary is exclusive (< fov/2)
  });

  it('a target behind is off-strip and not in view', () => {
    const r = bearingToMarker(0, 10, 0, 0, 0); // due south, facing north -> diff = PI
    expect(r.inView).toBe(false);
    expect(r.pct).toBeCloseTo(150, 6);
  });

  it('rotating the heading moves the marker (north target seen while facing east -> left edge)', () => {
    const r = bearingToMarker(0, -10, 0, 0, P / 2); // target north, facing east
    expect(r.pct).toBeCloseTo(0, 6);
    expect(r.inView).toBe(false);
  });

  it('is invariant to heading +/- 2*PI (wrap normalization)', () => {
    const a = bearingToMarker(7, -3, 0, 0, 0.5);
    const b = bearingToMarker(7, -3, 0, 0, 0.5 + 2 * P);
    const c = bearingToMarker(7, -3, 0, 0, 0.5 - 2 * P);
    expect(b.pct).toBeCloseTo(a.pct, 6);
    expect(c.pct).toBeCloseTo(a.pct, 6);
  });

  it('distance is planar (ignores heading)', () => {
    const r = bearingToMarker(3, -4, 0, 0, 1.23);
    expect(r.dist).toBeCloseTo(5, 6); // 3-4-5
  });
});

describe('bearingDeg (full-circle arrow, pct from FOV = 2*PI)', () => {
  it('maps the strip percent to a CSS rotation in [-180,180]', () => {
    expect(bearingDeg(50)).toBeCloseTo(0, 6); // dead ahead
    expect(bearingDeg(75)).toBeCloseTo(90, 6); // right
    expect(bearingDeg(25)).toBeCloseTo(-90, 6); // left
    expect(bearingDeg(100)).toBeCloseTo(180, 6); // behind
    expect(bearingDeg(0)).toBeCloseTo(-180, 6); // behind (other way)
  });

  it('composes with a full-circle bearingToMarker (behind -> ~180deg)', () => {
    const r = bearingToMarker(0, 10, 0, 0, 0, 2 * P); // due south, full FOV
    expect(Math.abs(bearingDeg(r.pct))).toBeCloseTo(180, 6);
  });
});
