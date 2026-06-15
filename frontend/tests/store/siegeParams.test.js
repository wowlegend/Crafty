import { describe, it, expect } from 'vitest';
import { siegeParams, DAY_MAX_MOBS, DAY_HOSTILE_CHANCE } from '../../src/game/dayNight.js';

// M3b-T2: night siege intensity is a PURE function of nightCount (nights survived).
// It ramps the hostile-spawn bias + the max-mob cap each night, then plateaus at a
// cap so a long run stays bounded. Pure + exhaustively unit-tested so the load-bearing
// escalation contract lives off any static-text gate. Numbers are a Kevin-tunable knob;
// these tests lock the SHAPE (monotonic-up, capped, night-0 == day-calm baseline).

describe('siegeParams(nightCount) — pure night-siege intensity', () => {
  it('night 0 (no nights survived) is the calm day baseline', () => {
    const p = siegeParams(0);
    expect(p.maxMobs).toBe(DAY_MAX_MOBS);          // 16
    expect(p.hostileChance).toBeCloseTo(DAY_HOSTILE_CHANCE); // 0.7
  });

  it('night 1 raises both maxMobs and hostileChance above the baseline', () => {
    const p = siegeParams(1);
    expect(p.maxMobs).toBe(16 + 4);                // 20
    expect(p.hostileChance).toBeCloseTo(0.75);     // 0.7 + 0.05
  });

  it('ramps maxMobs by +4/night until the +24 cap (cap at night 6)', () => {
    expect(siegeParams(2).maxMobs).toBe(24);
    expect(siegeParams(5).maxMobs).toBe(36);
    expect(siegeParams(6).maxMobs).toBe(40);       // 16 + min(6*4, 24) = 40
    expect(siegeParams(7).maxMobs).toBe(40);       // capped
    expect(siegeParams(50).maxMobs).toBe(40);      // still capped
  });

  it('ramps hostileChance by +0.05/night until the 0.95 cap', () => {
    expect(siegeParams(3).hostileChance).toBeCloseTo(0.85);
    expect(siegeParams(5).hostileChance).toBeCloseTo(0.95);
    expect(siegeParams(6).hostileChance).toBeCloseTo(0.95); // capped
    expect(siegeParams(99).hostileChance).toBeCloseTo(0.95); // still capped
  });

  it('is monotonically non-decreasing in both outputs', () => {
    let prevMobs = -Infinity, prevChance = -Infinity;
    for (let n = 0; n <= 30; n++) {
      const p = siegeParams(n);
      expect(p.maxMobs).toBeGreaterThanOrEqual(prevMobs);
      expect(p.hostileChance).toBeGreaterThanOrEqual(prevChance);
      prevMobs = p.maxMobs;
      prevChance = p.hostileChance;
    }
  });

  it('is robust to a nullish / negative / NaN nightCount (clamps to the baseline)', () => {
    expect(siegeParams(undefined).maxMobs).toBe(DAY_MAX_MOBS);
    expect(siegeParams(null).hostileChance).toBeCloseTo(DAY_HOSTILE_CHANCE);
    expect(siegeParams(-5).maxMobs).toBe(DAY_MAX_MOBS);
    expect(siegeParams(NaN).maxMobs).toBe(DAY_MAX_MOBS);
  });
});

// S7 Slice 2: the distance zone-tier (Ember Frontier) ADDS to the siege so the frontier is more
// dangerous far from spawn -- more + more-hostile mobs even by DAY. zoneTier 0 (default / near spawn)
// MUST be byte-identical to the 1-arg form (no regression). Numbers are a Kevin-tunable feel knob.
describe('siegeParams(nightCount, zoneTier) — distance zone-tier ramps the siege (S7)', () => {
  it('zoneTier 0 (default) is byte-identical to the 1-arg form (no regression near spawn)', () => {
    for (const n of [0, 1, 3, 6, 50]) {
      expect(siegeParams(n, 0)).toEqual(siegeParams(n));
    }
  });
  it('a higher zoneTier raises maxMobs even by DAY (nightCount 0)', () => {
    expect(siegeParams(0, 2).maxMobs).toBeGreaterThan(siegeParams(0, 0).maxMobs);
    expect(siegeParams(0, 4).maxMobs).toBeGreaterThan(siegeParams(0, 2).maxMobs);
  });
  it('a higher zoneTier raises hostileChance', () => {
    expect(siegeParams(0, 3).hostileChance).toBeGreaterThan(siegeParams(0, 0).hostileChance);
  });
  it('the zoneTier mob bonus is capped (far-out plateaus, total stays bounded)', () => {
    expect(siegeParams(0, 99).maxMobs).toBe(siegeParams(0, 4).maxMobs);
  });
  it('hostileChance never exceeds an absolute ceiling (<= 0.98) at max night + tier', () => {
    expect(siegeParams(99, 99).hostileChance).toBeLessThanOrEqual(0.98);
  });
  it('is monotonic non-decreasing in zoneTier (both outputs)', () => {
    let prevMobs = -Infinity, prevChance = -Infinity;
    for (let z = 0; z <= 8; z++) {
      const p = siegeParams(2, z);
      expect(p.maxMobs).toBeGreaterThanOrEqual(prevMobs);
      expect(p.hostileChance).toBeGreaterThanOrEqual(prevChance);
      prevMobs = p.maxMobs; prevChance = p.hostileChance;
    }
  });
  it('is robust to a nullish / negative / NaN zoneTier (treated as 0)', () => {
    expect(siegeParams(2, undefined)).toEqual(siegeParams(2, 0));
    expect(siegeParams(2, -3)).toEqual(siegeParams(2, 0));
    expect(siegeParams(2, NaN)).toEqual(siegeParams(2, 0));
  });
});
