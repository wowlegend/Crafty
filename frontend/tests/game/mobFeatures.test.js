import { describe, it, expect } from 'vitest';
import { mobFeatures, FEATURED_TYPES } from '../../src/game/mobFeatures.js';

// T1 of the mob-distinctness milestone: invariants on the pure per-type silhouette-feature specs.
// Tests assert STRUCTURE + scaling invariants (not exact coords — those get tuned in-world at T3).

const DIMS = { bodyW: 1.6, bodyH: 2.0, bodyD: 1.0, headW: 0.9, headH: 0.8, headD: 0.9 };
const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n));

describe('mobFeatures (mob-distinctness T1)', () => {
  it('exposes exactly the spec\'d featured types (B5: humanoids zombie/villager now carry arms)', () => {
    expect([...FEATURED_TYPES].sort()).toEqual(['cow', 'duskhound', 'emberhusk', 'moss_brute', 'skeleton', 'skitterling', 'villager', 'zombie']);
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
    for (const t of ['pig', 'spider', 'unknown_xyz']) {
      expect(mobFeatures(t, DIMS)).toEqual([]);
    }
  });

  it('B5: upright humanoids carry >=2 ARMS at the body sides (reads as a creature, not a box)', () => {
    for (const t of ['zombie', 'skeleton', 'villager']) {
      const arms = mobFeatures(t, DIMS).filter(
        (f) => Math.abs(f.pos[0]) > DIMS.bodyW / 2 && f.box[1] > DIMS.bodyH * 0.4,
      );
      expect(arms.length, `${t} arms`).toBeGreaterThanOrEqual(2);
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
    // the rib slats are the front-face features (z > body front); arms sit at the sides (excluded here).
    const ribs = mobFeatures('skeleton', DIMS).filter((f) => f.pos[2] > DIMS.bodyD / 2);
    expect(ribs.length).toBeGreaterThanOrEqual(3);
    for (const rib of ribs) {
      expect(rib.pos[2]).toBeGreaterThan(DIMS.bodyD / 2); // in front of the body front face
      expect(rib.tone).toBe('bone');
    }
  });
});
