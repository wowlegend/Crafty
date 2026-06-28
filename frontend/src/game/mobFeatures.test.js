import { describe, it, expect } from 'vitest';
import { mobFeatures, FEATURED_TYPES } from './mobFeatures.js';

// Pure per-type silhouette-accessory box-spec derivation (mob distinctness). Each spec is
// { box:[w,h,d], pos:[x,y,z], rot?:[x,y,z], tone? }, all DERIVED from the body/head dims so features
// scale with each mob's size. Locks: featured-vs-plain gating, per-type shape/count/tone, and the
// dims-derivation (scale dims ×k -> box+pos scale ×k, rot unchanged).
const ONES = { bodyW: 1, bodyH: 1, bodyD: 1, headW: 1, headH: 1, headD: 1 };
const scaled = (k) => ({ bodyW: k, bodyH: k, bodyD: k, headW: k, headH: k, headD: k });

describe('FEATURED_TYPES', () => {
  it('lists the featured mobs and excludes the deliberately-plain ones', () => {
    expect(FEATURED_TYPES.length).toBeGreaterThan(0);
    expect(FEATURED_TYPES).toContain('zombie');
    expect(FEATURED_TYPES).toContain('skeleton');
    expect(FEATURED_TYPES).not.toContain('pig'); // stout quadruped stays plain
    expect(FEATURED_TYPES).not.toContain('spider'); // 8-leg sprawl carries it
  });
});

describe('mobFeatures gating', () => {
  it('returns [] for an unfeatured type', () => {
    expect(mobFeatures('pig', ONES)).toEqual([]);
    expect(mobFeatures('nonexistent', ONES)).toEqual([]);
  });
  it('returns [] when dims are missing', () => {
    expect(mobFeatures('zombie', null)).toEqual([]);
    expect(mobFeatures('zombie', undefined)).toEqual([]);
  });
});

describe('mobFeatures per-type shape', () => {
  it('zombie = two forward-reaching arms (shamble: rot.x = -0.5)', () => {
    const f = mobFeatures('zombie', ONES);
    expect(f).toHaveLength(2);
    expect(f[0].rot[0]).toBeCloseTo(-0.5, 10);
    expect(f[1].rot[0]).toBeCloseTo(-0.5, 10);
    expect(f[0].pos[0]).toBeCloseTo(-f[1].pos[0], 10); // mirrored across the body
  });
  it('villager = two plain arms (no reach, no tone)', () => {
    const f = mobFeatures('villager', ONES);
    expect(f).toHaveLength(2);
    expect(f[0].rot[0]).toBe(0);
    expect(f[0].tone).toBeUndefined();
  });
  it('skeleton = 3 bone rib slats + 2 bone arms, all bone-toned', () => {
    const f = mobFeatures('skeleton', ONES);
    expect(f).toHaveLength(5);
    expect(f.every((s) => s.tone === 'bone')).toBe(true);
  });
  it('moss_brute = 3 dark slabs (2 shoulders + head crown)', () => {
    const f = mobFeatures('moss_brute', ONES);
    expect(f).toHaveLength(3);
    expect(f.every((s) => s.tone === 'dark')).toBe(true);
  });
  it('cow = two bone horns', () => {
    const f = mobFeatures('cow', ONES);
    expect(f).toHaveLength(2);
    expect(f.every((s) => s.tone === 'bone')).toBe(true);
  });
});

describe('mobFeatures dims-derivation (scale-invariance)', () => {
  it('scaling the body dims ×k scales every box+pos ×k (rot unchanged)', () => {
    const base = mobFeatures('zombie', ONES);
    const big = mobFeatures('zombie', scaled(2));
    expect(big).toHaveLength(base.length);
    base.forEach((spec, i) => {
      for (let a = 0; a < 3; a++) {
        expect(big[i].box[a]).toBeCloseTo(spec.box[a] * 2, 10);
        expect(big[i].pos[a]).toBeCloseTo(spec.pos[a] * 2, 10); // pos.z = 0 stays 0
        expect(big[i].rot[a]).toBeCloseTo(spec.rot[a], 10); // angles are dimensionless
      }
    });
  });
});
