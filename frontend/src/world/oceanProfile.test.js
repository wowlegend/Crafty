import { describe, it, expect } from 'vitest';
import { gerstnerDisplace, gerstnerNormal, gerstnerDisplaceInto, gerstnerNormalInto } from './oceanProfile.js';

// ~18,800 SHORT-LIVED ALLOCATIONS PER FRAME.
//
// Ocean's useFrame calls gerstnerDisplace and gerstnerNormal once per VERTEX per FRAME. On a 96x96 plane
// that is ~9,400 object literals plus ~9,400 arrays every frame at display refresh — a GC sawtooth in the
// one loop that must not stutter. The out-param variants exist for that loop; the object-returning forms
// stay for the call sites that run once.
describe('gerstner — the allocation-free variants agree with the originals', () => {
  const SAMPLES = [[0, 0, 0], [13.5, -7.25, 1.7], [-40, 40, 12.5], [123.75, 0.5, 33.3]];

  it('displacement matches to the last bit', () => {
    const out = { x: 0, y: 0, z: 0 };
    for (const [x, z, t] of SAMPLES) {
      const ref = gerstnerDisplace(x, z, t);
      gerstnerDisplaceInto(out, x, z, t);
      expect(out.x).toBe(ref.x);
      expect(out.y).toBe(ref.y);
      expect(out.z).toBe(ref.z);
    }
  });

  it('normals match to the last bit, in the same convention', () => {
    const out = { x: 0, y: 0, z: 0 };
    for (const [x, z, t] of SAMPLES) {
      const ref = gerstnerNormal(x, z, t);
      gerstnerNormalInto(out, x, z, t);
      expect(out.x).toBe(ref[0]);
      expect(out.y).toBe(ref[1]);
      expect(out.z).toBe(ref[2]);
    }
  });

  it('WRITES the target and returns it — the caller owns the memory', () => {
    // The point of the variant. If it returned a fresh object the allocation would still happen and the
    // Ocean loop would be unchanged while looking fixed.
    const out = { x: 9, y: 9, z: 9 };
    const returned = gerstnerDisplaceInto(out, 5, 5, 1);
    expect(returned, 'a NEW object was returned — nothing was saved').toBe(out);
    expect(out.x).not.toBe(9);
  });

  it('reuses one target across many samples without carrying state between them', () => {
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 0, y: 0, z: 0 };
    gerstnerNormalInto(a, 100, 100, 5);
    gerstnerNormalInto(a, 0, 0, 0);
    gerstnerNormalInto(b, 0, 0, 0);
    expect(a).toEqual(b);
  });

  it('the normal it writes is unit length, like the array form', () => {
    const out = { x: 0, y: 0, z: 0 };
    for (const [x, z, t] of SAMPLES) {
      gerstnerNormalInto(out, x, z, t);
      expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(1, 12);
    }
  });
});
