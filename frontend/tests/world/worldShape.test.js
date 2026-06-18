import { describe, it, expect } from 'vitest';
import { createNoise2D } from 'simplex-noise';
import { computeHeight, HIGHLAND_THRESHOLD, HIGHLAND_AMP } from '../../src/world/heightAt.js';
import { OCEAN_CONTINENT_THRESHOLD, oceanBlend, SEA_LEVEL } from '../../src/world/oceanProfile.js';
import { HEARTH_Y } from '../../src/world/homeAnchor.js';

// S4 (world-purpose plan): tame the world Kevin called "very mountainous". Measured BEFORE
// (consts 0.45 / 120): highland fired on 14.9% of columns, max relief +36 (steep dark walls).
// AFTER (0.62 / 90): fires ~4.4%, max relief ~+12.8 — gentle traversable terrain with occasional
// modest rises (the see-it-go-to-it landmarks become the shrines, not peaks). Values from a grid sweep.
// NOTE: the de-island (OCEAN_CONTINENT_THRESHOLD) is now EXECUTED in W2-T7 (the second describe below).
const lcg = (s) => () => (s = Math.imul(1664525, s) + 1013904223 | 0) / 4294967296 + 0.5;
const noise = createNoise2D(lcg(12345));

const cols = [];
const STEP = 16, R = 1600;
for (let x = -R; x <= R; x += STEP) for (let z = -R; z <= R; z += STEP) cols.push(computeHeight(noise, x, z));
const reliefOf = (c) => c.baseHeight - (40 + c.n * 18);

describe('S4 world shape — gentle, traversable terrain (Kevin: "very mountainous")', () => {
  it('highland swells are RARE: they fire on < 10% of columns (was ~15%)', () => {
    const fires = cols.filter((c) => reliefOf(c) > 0.5).length;
    expect(fires / cols.length).toBeLessThan(0.10);
  });

  it('peaks are gentle, not oppressive: max relief above the plain is < 20 blocks (was ~36)', () => {
    let maxRelief = 0;
    for (const c of cols) { const r = reliefOf(c); if (r > maxRelief) maxRelief = r; }
    expect(maxRelief).toBeLessThan(20);
    expect(maxRelief).toBeGreaterThan(3); // but NOT pancake-flat — keep some variation
  });

  it('the S4 tamed highland tunables are in force', () => {
    expect(HIGHLAND_THRESHOLD).toBeGreaterThanOrEqual(0.6);
    expect(HIGHLAND_AMP).toBeLessThanOrEqual(95);
  });
});

// W2-T7 de-island characterization. The spawn "felt like a tiny island on a plinth" — three pure-data
// forks (Kevin): push oceans WELL OUT (no deep water within ~80m of spawn on any cardinal), ENLARGE the
// continent (lower the continent-noise frequency), and FLUSH the Hearth pad (no podium, but never floods).
// Measured (locked seed 12345) post-fork: origin grade y49; footprint[-7..7] base y45-53 avg 49; nearest
// deep water 98m (8-cardinal, 2-unit step). BEFORE the fork the nearest deep water was 27m (an island).
describe('W2-T7 de-islanded flat spawn (Kevin: "seemingly on an island")', () => {
  it('oceans pushed out: the threshold is lower than the old -0.15', () => {
    expect(OCEAN_CONTINENT_THRESHOLD).toBeLessThan(-0.15);
  });

  it('origin column is LAND (above sea level) — spawn is not on a tiny island', () => {
    const { continent, baseHeight } = computeHeight(noise, 0, 0);
    expect(oceanBlend(continent)).toBe(0); // origin is fully continent, not ocean
    expect(baseHeight).toBeGreaterThan(SEA_LEVEL);
  });

  it('the Hearth pad sits flush with the local grade (no podium) but always above the waterline', () => {
    // local grade near origin ~45-53; the pad cap must nestle in it, not perch >1 above the footprint max.
    let max = -Infinity;
    for (let x = -7; x <= 7; x++) for (let z = -7; z <= 7; z++) {
      max = Math.max(max, computeHeight(noise, x, z).baseHeight);
    }
    expect(HEARTH_Y).toBeLessThanOrEqual(Math.ceil(max) + 1);
    expect(HEARTH_Y).toBeGreaterThan(SEA_LEVEL); // never floods (water fills y <= SEA_LEVEL)
  });

  it('the coastline is pushed away from spawn (Kevin: no deep water within ~80m on any cardinal)', () => {
    // 8 cardinals/diagonals, fine 2-unit radial step — the binding measure of "perched on an island".
    const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1], [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071]];
    let nearestWater = Infinity;
    for (let r = 4; r < 300; r += 2) {
      for (const [dx, dz] of dirs) {
        const { continent } = computeHeight(noise, dx * r, dz * r);
        if (oceanBlend(continent) > 0.5) nearestWater = Math.min(nearestWater, r);
      }
    }
    expect(nearestWater).toBeGreaterThan(80); // shoreline far from the spawn pad (measured 98m)
  });
});
