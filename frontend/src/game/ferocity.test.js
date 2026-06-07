import { describe, it, expect } from 'vitest';
import { FEROCITY_MAX, FEROCITY_THRESHOLD, ferocityForKill, clampFerocity, canTransform } from './ferocity.js';

// S2-B1-M4: the Ferocity economy is pure -> the per-kill values, the clamp, and the roar gate are
// unit-testable; the store wires accrue/spend/persist + Components reads canTransform for the roar.

describe('ferocityForKill', () => {
  it('a regular kill banks a positive amount', () => {
    expect(ferocityForKill('zombie')).toBeGreaterThan(0);
    expect(ferocityForKill('pig')).toBeGreaterThan(0);
  });
  it('boss-like kills bank far more than a regular kill', () => {
    expect(ferocityForKill('boss')).toBeGreaterThan(ferocityForKill('zombie'));
    expect(ferocityForKill('ShadowDragon')).toBeGreaterThan(ferocityForKill('zombie')); // /dragon/i
  });
  it('an unknown type still banks the default (robust to any mob type)', () => {
    expect(ferocityForKill('weird_new_mob')).toBe(ferocityForKill('zombie'));
    expect(ferocityForKill(undefined)).toBeGreaterThan(0);
  });
});

describe('clampFerocity', () => {
  it('rounds + clamps to [0, MAX]', () => {
    expect(clampFerocity(-5)).toBe(0);
    expect(clampFerocity(106)).toBe(FEROCITY_MAX);
    expect(clampFerocity(13.7)).toBe(14);
    expect(clampFerocity(NaN)).toBe(0);
  });
});

describe('canTransform (the roar gate)', () => {
  it('true only at/above the threshold', () => {
    expect(canTransform(FEROCITY_THRESHOLD)).toBe(true);
    expect(canTransform(FEROCITY_THRESHOLD - 1)).toBe(false);
    expect(canTransform(0)).toBe(false);
  });
  it('a full bank (== MAX) is enough; entering will spend the threshold back toward 0', () => {
    expect(canTransform(FEROCITY_MAX)).toBe(true);
    expect(clampFerocity(FEROCITY_MAX - FEROCITY_THRESHOLD)).toBe(0); // spend a full bank -> empty
  });
});
