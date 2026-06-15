import { describe, it, expect } from 'vitest';
import { blightHeartSite, BLIGHT_RADIUS } from '../../src/world/blightHeart.js';
import { zoneTier, MAX_TIER } from '../../src/world/zoneTier.js';

// S9a: the Blight Heart — a FIXED, foreshadowed far-frontier lair (not a random ambush). The compass
// marker (S9b) + the boss spawn (S9b) both consume this one source. Deterministic + far -> capture-safe.
describe('blightHeartSite — the fixed far-frontier Blight Heart lair', () => {
  it('is a fixed {x,z} (deterministic, same every call)', () => {
    expect(blightHeartSite()).toEqual(blightHeartSite());
    const s = blightHeartSite();
    expect(typeof s.x).toBe('number');
    expect(typeof s.z).toBe('number');
  });
  it('sits in the FAR frontier (radius >= BLIGHT_RADIUS, deepest zone tier)', () => {
    const s = blightHeartSite();
    expect(Math.hypot(s.x, s.z)).toBeGreaterThanOrEqual(BLIGHT_RADIUS);
    expect(zoneTier(s.x, s.z)).toBe(MAX_TIER); // the most dangerous ring = the climax sits there
  });
});
