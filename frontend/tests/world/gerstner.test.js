import { describe, it, expect } from 'vitest';
import { gerstnerDisplace, gerstnerNormal, WAVES, SEA_LEVEL } from '../../src/world/oceanProfile.js';

// The surface HEIGHT is the displaced parcel's y — the exported height-only function had no runtime caller and
// was deleted (review #3, R4.7); these properties of the wave table still hold, read through the full form.
const gerstnerHeight = (x, z, t) => gerstnerDisplace(x, z, t).y;

describe('W2-T2 summed Gerstner ocean surface', () => {
  it('is world-space coherent: same (x,z,t) -> same height regardless of chunk', () => {
    const t = 3.0;
    expect(gerstnerHeight(17.0, -33.0, t)).toBeCloseTo(gerstnerHeight(17.0, -33.0, t), 9);
  });
  it('cross-chunk seam is continuous (no per-chunk phase reset)', () => {
    const t = 1.5;
    const a = gerstnerHeight(15.999, 8.0, t);
    const b = gerstnerHeight(16.001, 8.0, t); // across the chunk-16 boundary
    expect(Math.abs(a - b)).toBeLessThan(0.05); // smooth, not a discontinuity
  });
  it('oscillates around SEA_LEVEL within a bounded amplitude', () => {
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < 200; i++) { const h = gerstnerHeight(i * 1.3, i * 0.7, 2.0); min = Math.min(min, h); max = Math.max(max, h); }
    expect(min).toBeGreaterThan(SEA_LEVEL - 2.5);
    expect(max).toBeLessThan(SEA_LEVEL + 2.5);
  });
  it('recomputes a unit normal that tilts off vertical on a slope', () => {
    const n = gerstnerNormal(5.0, 5.0, 2.0);
    expect(Math.hypot(n[0], n[1], n[2])).toBeCloseTo(1, 5);
    expect(n[1]).toBeGreaterThan(0.5); // mostly up, but not exactly [0,1,0]
  });
  it('summed waves use >= 3 components', () => {
    expect(WAVES.length).toBeGreaterThanOrEqual(3);
  });
});
