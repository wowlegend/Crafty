import { describe, it, expect } from 'vitest';
import { zoneTier, TIER_RING, MAX_TIER } from '../../src/world/zoneTier.js';

// Distance zone-tier (Ember Frontier): radial distance from spawn (origin 0,0) -> integer tier 0..MAX_TIER
// in concentric rings, so the outward journey gains stakes (danger + reward ramp). Named zoneTier (NOT
// `tier`) because the codebase already uses `tier` for QUEST unlock tiers.
describe('zoneTier — concentric distance rings from origin', () => {
  it('spawn (origin) is tier 0', () => {
    expect(zoneTier(0, 0)).toBe(0);
  });
  it('rings step at multiples of TIER_RING', () => {
    expect(zoneTier(TIER_RING - 1, 0)).toBe(0);
    expect(zoneTier(TIER_RING + 1, 0)).toBe(1);
    expect(zoneTier(0, TIER_RING * 2 + 5)).toBe(2);
  });
  it('uses radial distance (hypot), not axis sum', () => {
    // (0.8, 0.8)*TIER_RING has radius ~1.13*TIER_RING -> tier 1
    expect(zoneTier(TIER_RING * 0.8, TIER_RING * 0.8)).toBe(1);
  });
  it('is symmetric in sign (negative coords behave like positive)', () => {
    expect(zoneTier(-(TIER_RING + 1), 0)).toBe(1);
    expect(zoneTier(0, -(TIER_RING * 3 + 1))).toBe(3);
  });
  it('is monotonic non-decreasing with distance', () => {
    let prev = -1;
    for (let d = 0; d < TIER_RING * (MAX_TIER + 3); d += 37) {
      const t = zoneTier(d, 0);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });
  it('caps at MAX_TIER far out (danger/reward plateaus)', () => {
    expect(zoneTier(99999, 99999)).toBe(MAX_TIER);
  });
});
