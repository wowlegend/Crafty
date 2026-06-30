import { describe, it, expect } from 'vitest';
import { allowedPrecip, precipFor, stormMoodBoost, SNOW_SURFACE, STORM_MOOD_BOOST } from './weatherGate.js';

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

// v7 snow-model: the weather state machine now cycles clear<->storm (decoupled from precip TYPE);
// when 'storm', the player's CURRENT biome decides what actually falls. This fixes "snow never shows"
// (the old global clear->rain->snow timer almost never lined the snow phase up with a cold biome).
describe('precipFor — storm x biome -> rendered precip (v7 snow-model)', () => {
  it("renders NOTHING when not storming (clear)", () => {
    expect(precipFor('clear', 5)).toBe('none');
    expect(precipFor('clear', 1)).toBe('none');
    expect(precipFor('clear', 4)).toBe('none');
  });
  it("when storming, a snow biome (5) renders SNOW", () => {
    expect(precipFor('storm', 5)).toBe('snow');
  });
  it("when storming, temperate (1/2/3) renders RAIN", () => {
    expect(precipFor('storm', 1)).toBe('rain');
    expect(precipFor('storm', 2)).toBe('rain');
    expect(precipFor('storm', 3)).toBe('rain');
  });
  it("when storming, the desert (4) stays DRY (none)", () => {
    expect(precipFor('storm', 4)).toBe('none');
  });
  it("an unknown surface defaults to rain under a storm", () => {
    expect(precipFor('storm', 99)).toBe('rain');
  });
});

describe('stormMoodBoost — sky-darkening signal', () => {
  it('returns the storm boost while raining or snowing, 0 when clear', () => {
    expect(stormMoodBoost('rain')).toBeCloseTo(STORM_MOOD_BOOST);
    expect(stormMoodBoost('snow')).toBeCloseTo(STORM_MOOD_BOOST);
    expect(stormMoodBoost('clear')).toBe(0);
    expect(stormMoodBoost('none')).toBe(0);
  });
  it("v7: the unified 'storm' state also darkens the sky (boost)", () => {
    expect(stormMoodBoost('storm')).toBeCloseTo(STORM_MOOD_BOOST);
  });
  it('STORM_MOOD_BOOST is a partial darkening (between explore=0 and obsidian=2)', () => {
    expect(STORM_MOOD_BOOST).toBeGreaterThan(0);
    expect(STORM_MOOD_BOOST).toBeLessThan(2);
  });
  it('SNOW_SURFACE is the snow biome code 5', () => {
    expect(SNOW_SURFACE).toBe(5);
  });
});
