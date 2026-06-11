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
