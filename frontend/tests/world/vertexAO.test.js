import { describe, it, expect } from 'vitest';
import { cornerAO } from '../../src/world/vertexAO.js';

// The classic "0fps" voxel ambient-occlusion corner formula. Each arg is whether the
// corresponding occluder voxel (the two edge-adjacent + the diagonal corner, all on the
// face's OUTWARD side) is SOLID. Returns 0..3: 3 = fully open (bright), 0 = most occluded (dark).
// Special rule: if BOTH edge-sides are solid the corner is fully occluded (0) regardless of the
// diagonal — that is what makes voxel AO read as soft contact-shadow in concave corners.
describe('cornerAO — the 0fps voxel ambient-occlusion corner formula', () => {
  it('fully open (no occluders) -> 3 (brightest)', () => {
    expect(cornerAO(false, false, false)).toBe(3);
  });
  it('both edge-sides solid -> 0 (darkest), regardless of the corner', () => {
    expect(cornerAO(true, true, false)).toBe(0);
    expect(cornerAO(true, true, true)).toBe(0);
  });
  it('one edge-side only -> 2', () => {
    expect(cornerAO(true, false, false)).toBe(2);
    expect(cornerAO(false, true, false)).toBe(2);
  });
  it('corner-only (no edge-sides) -> 2', () => {
    expect(cornerAO(false, false, true)).toBe(2);
  });
  it('one edge-side + the corner -> 1', () => {
    expect(cornerAO(true, false, true)).toBe(1);
    expect(cornerAO(false, true, true)).toBe(1);
  });
  it('accepts truthy/falsy (e.g. block ids / 0) not just booleans', () => {
    expect(cornerAO(1, 1, 0)).toBe(0);   // both sides solid
    expect(cornerAO(3, 0, 0)).toBe(2);   // one side
    expect(cornerAO(0, 0, 0)).toBe(3);   // open
  });
});
