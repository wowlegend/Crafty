import { describe, it, expect } from 'vitest';
import { mobFeatures, FEATURED_TYPES } from '../../src/game/mobFeatures.js';

// T1 of the mob-distinctness milestone: invariants on the pure per-type silhouette-feature specs.
// Tests assert STRUCTURE + scaling invariants (not exact coords — those get tuned in-world at T3).

const DIMS = { bodyW: 1.6, bodyH: 2.0, bodyD: 1.0, headW: 0.9, headH: 0.8, headD: 0.9 };
const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n));

describe('mobFeatures (mob-distinctness T1)', () => {
  it('exposes exactly the spec\'d featured types', () => {
    expect([...FEATURED_TYPES].sort()).toEqual(['cow', 'duskhound', 'moss_brute', 'skeleton', 'skitterling']);
  });

  it('every featured type returns a non-empty list of valid box specs', () => {
    for (const t of FEATURED_TYPES) {
      const specs = mobFeatures(t, DIMS);
      expect(specs.length).toBeGreaterThan(0);
      for (const s of specs) {
        expect(isVec3(s.box)).toBe(true);
        expect(s.box.every((n) => n > 0)).toBe(true); // positive box dims
        expect(isVec3(s.pos)).toBe(true);
        if (s.rot !== undefined) expect(isVec3(s.rot)).toBe(true);
        if (s.tone !== undefined) expect(['dark', 'bone']).toContain(s.tone);
      }
    }
  });

  it('unfeatured types return an empty list (plain box-mob, capture-safe)', () => {
    for (const t of ['pig', 'zombie', 'villager', 'spider', 'unknown_xyz']) {
      expect(mobFeatures(t, DIMS)).toEqual([]);
    }
  });

  it('missing/invalid dims return an empty list (no crash)', () => {
    expect(mobFeatures('cow', null)).toEqual([]);
    expect(mobFeatures('cow', undefined)).toEqual([]);
    expect(mobFeatures(undefined, DIMS)).toEqual([]);
  });

  it('feature geometry SCALES with body size (a bigger mob -> features further out / larger)', () => {
    const big = { ...DIMS, bodyW: 3.2, headW: 1.8 };
    // moss_brute shoulders sit at ±bodyW*0.45 -> wider body pushes them further out
    const shoulderSmall = Math.abs(mobFeatures('moss_brute', DIMS)[0].pos[0]);
    const shoulderBig = Math.abs(mobFeatures('moss_brute', big)[0].pos[0]);
    expect(shoulderBig).toBeGreaterThan(shoulderSmall);
    // cow horns scale with head width
    const hornSmall = mobFeatures('cow', DIMS)[0].box[0];
    const hornBig = mobFeatures('cow', big)[0].box[0];
    expect(hornBig).toBeGreaterThan(hornSmall);
  });

  it('skeleton ribs sit on the torso FRONT (+z face) so they read head-on', () => {
    for (const rib of mobFeatures('skeleton', DIMS)) {
      expect(rib.pos[2]).toBeGreaterThan(DIMS.bodyD / 2); // in front of the body front face
      expect(rib.tone).toBe('bone');
    }
  });
});
