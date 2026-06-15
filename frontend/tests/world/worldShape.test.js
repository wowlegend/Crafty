import { describe, it, expect } from 'vitest';
import { createNoise2D } from 'simplex-noise';
import { computeHeight, HIGHLAND_THRESHOLD, HIGHLAND_AMP } from '../../src/world/heightAt.js';

// S4 (world-purpose plan): tame the world Kevin called "very mountainous". Measured BEFORE
// (consts 0.45 / 120): highland fired on 14.9% of columns, max relief +36 (steep dark walls).
// AFTER (0.62 / 90): fires ~4.4%, max relief ~+12.8 — gentle traversable terrain with occasional
// modest rises (the see-it-go-to-it landmarks become the shrines, not peaks). Values from a grid sweep.
// NOTE: the de-island (OCEAN_CONTINENT_THRESHOLD) is a SEPARATE slice (S4b) — not asserted here.
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
