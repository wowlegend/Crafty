import { describe, it, expect } from 'vitest';
import { SPARK_PROFILE, ENERGY_PROFILE, _defaultEnergy, WAND_CONFIGS } from './spellVisualProfiles';

describe('the spell visual profiles (S3-M2 — the fallback contract)', () => {
  const FOUR = ['fireball', 'iceball', 'lightning', 'arcane'];
  it('ENERGY + SPARK + WAND cover the four elements', () => {
    for (const k of FOUR) {
      expect(ENERGY_PROFILE[k], `ENERGY ${k}`).toBeTruthy();
      expect(SPARK_PROFILE[k], `SPARK ${k}`).toBeTruthy();
      expect(WAND_CONFIGS[k], `WAND ${k}`).toBeTruthy();
    }
  });
  it('_defaultEnergy is a complete fallback (the unknown-type contract)', () => {
    const ref = ENERGY_PROFILE.fireball;
    for (const key of Object.keys(ref)) {
      expect(_defaultEnergy[key], `fallback missing ${key}`).toBeDefined();
    }
  });
});

describe('W2-T4 per-element silhouette is the hero + distinct trail/impact', () => {
  const els = ['fireball', 'iceball', 'lightning', 'arcane'];
  it('every element declares a shape, a trail shape, and an impact shape', () => {
    for (const e of els) {
      expect(ENERGY_PROFILE[e].shape).toBeTruthy();
      expect(ENERGY_PROFILE[e].trail).toBeTruthy();
      expect(ENERGY_PROFILE[e].impact).toBeTruthy();
    }
  });
  it('the four silhouettes are DISTINCT (no shared shape)', () => {
    const shapes = els.map((e) => ENERGY_PROFILE[e].shape);
    expect(new Set(shapes).size).toBe(4);
  });
  it('the four TRAILS are distinct', () => {
    expect(new Set(els.map((e) => ENERGY_PROFILE[e].trail)).size).toBe(4);
  });
  it('the four IMPACTS are distinct', () => {
    expect(new Set(els.map((e) => ENERGY_PROFILE[e].impact)).size).toBe(4);
  });
  it('the shape now dominates the core (coreScale shrunk, shape emissive boosted)', () => {
    for (const e of els) {
      expect(ENERGY_PROFILE[e].coreScale).toBeLessThanOrEqual(0.42); // white core is a small spec
      expect(ENERGY_PROFILE[e].glowIntensity).toBeGreaterThanOrEqual(5.0); // shape reads first
    }
  });
  it('fallback still complete', () => { expect(_defaultEnergy.shape).toBeTruthy(); });
});
