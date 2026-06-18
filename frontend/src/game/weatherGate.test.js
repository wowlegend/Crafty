import { describe, it, expect } from 'vitest';
import { allowedPrecip, stormMoodBoost, SNOW_SURFACE, STORM_MOOD_BOOST } from './weatherGate.js';

// surfaceBlock codes (from world/climate.js FOOTSTEP_TYPE + biomeTable.js): 5=snow biome, 4=sand/desert/
// beach, 1=grass(plains), 2=dirt(plains), 3=stone, 6=wood. Verified against the live surfaceBlockAt.
describe('allowedPrecip — biome gate (no desert-snow)', () => {
  it('snow biome (5) permits snow, not rain', () => {
    expect(allowedPrecip(5)).toBe('snow');
  });
  it('desert/sand (4) permits NO precip (dry) — never snow', () => {
    expect(allowedPrecip(4)).toBe('none');
  });
  it('plains grass (1) + dirt (2) + stone (3) permit rain, not snow', () => {
    expect(allowedPrecip(1)).toBe('rain');
    expect(allowedPrecip(2)).toBe('rain');
    expect(allowedPrecip(3)).toBe('rain');
  });
  it('unknown surface defaults to rain (temperate)', () => {
    expect(allowedPrecip(99)).toBe('rain');
  });
});

describe('stormMoodBoost — sky-darkening signal', () => {
  it('returns the storm boost while raining or snowing, 0 when clear', () => {
    expect(stormMoodBoost('rain')).toBeCloseTo(STORM_MOOD_BOOST);
    expect(stormMoodBoost('snow')).toBeCloseTo(STORM_MOOD_BOOST);
    expect(stormMoodBoost('clear')).toBe(0);
    expect(stormMoodBoost('none')).toBe(0);
  });
  it('STORM_MOOD_BOOST is a partial darkening (between explore=0 and obsidian=2)', () => {
    expect(STORM_MOOD_BOOST).toBeGreaterThan(0);
    expect(STORM_MOOD_BOOST).toBeLessThan(2);
  });
  it('SNOW_SURFACE is the snow biome code 5', () => {
    expect(SNOW_SURFACE).toBe(5);
  });
});
