// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildRibbonIndices } from './ribbonIndices.js';

// Ribbon-trail index builder, extracted from Components.jsx's ProceduralRibbonTrail.
// A ribbon of N point-pairs (2N vertices: base/tip per point) is N-1 quads.
// Each quad i (vertices 2i, 2i+1, 2i+2, 2i+3) is two triangles, wound to MATCH
// the original inline code's intended winding:
//   tri 1: (2i,   2i+1, 2i+2)
//   tri 2: (2i+1, 2i+3, 2i+2)
// => the 6 indices for quad i are [2i, 2i+1, 2i+2, 2i+1, 2i+3, 2i+2].
//
// REGRESSION: the inline loop had a copy-paste bug — it wrote indices[i*6+2]
// twice and never wrote indices[i*6+5], leaving the 2nd triangle's 3rd vertex
// at 0 (a degenerate/torn triangle). This test pins indices[i*6+5] === 2i+3.
describe('buildRibbonIndices — ribbon weapon-trail index builder', () => {
  it('returns a Uint16Array of length 6*(N-1)', () => {
    const out = buildRibbonIndices(5);
    expect(out).toBeInstanceOf(Uint16Array);
    expect(out.length).toBe(6 * (5 - 1));
  });

  it('emits the exact expected indices for N=3 (two quads)', () => {
    // quad0: [0,1,2, 1,3,2], quad1: [2,3,4, 3,5,4]
    const expected = Uint16Array.from([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4]);
    const out = buildRibbonIndices(3);
    expect(out.length).toBe(12);
    expect(Array.from(out)).toEqual(Array.from(expected));
  });

  it('every quad has the correct 6-index winding [2i, 2i+1, 2i+2, 2i+1, 2i+3, 2i+2]', () => {
    const N = 8;
    const out = buildRibbonIndices(N);
    for (let i = 0; i < N - 1; i++) {
      expect(out[i * 6 + 0]).toBe(2 * i);
      expect(out[i * 6 + 1]).toBe(2 * i + 1);
      expect(out[i * 6 + 2]).toBe(2 * i + 2);
      expect(out[i * 6 + 3]).toBe(2 * i + 1);
      expect(out[i * 6 + 4]).toBe(2 * i + 3);
      expect(out[i * 6 + 5]).toBe(2 * i + 2);
    }
  });

  it('REGRESSION: indices[i*6+5] === 2*i+2 for every quad (slot +5 was stuck at 0)', () => {
    // The inline bug wrote indices[i*6+2] twice and never wrote slot +5, leaving
    // it at the TypedArray default of 0 — the torn-2nd-triangle signature. The
    // value that SHOULD land in slot +5 is tri 2's 3rd vertex = 2i+2 (matching
    // the N=3 expected array's quad1 = [2,3,4, 3,5,4], slot +5 = 4 = 2*1+2).
    const N = 10;
    const out = buildRibbonIndices(N);
    for (let i = 0; i < N - 1; i++) {
      expect(out[i * 6 + 5]).toBe(2 * i + 2);
      if (i > 0) expect(out[i * 6 + 5]).not.toBe(0); // torn-triangle signature (i=0 -> 2 anyway)
    }
  });
});
