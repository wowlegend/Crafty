import { describe, it, expect } from 'vitest';
import { createNoise2D } from 'simplex-noise';
import { computeHeight, HIGHLAND_THRESHOLD, HIGHLAND_AMP } from '../../src/world/heightAt.js';
import { surfaceBlockAt } from '../../src/world/climate.js';
import { OCEAN_CONTINENT_THRESHOLD } from '../../src/world/oceanProfile.js';

// climate.js + terrain.worker.js seed simplex with this exact lcg(12345); a fresh instance
// produces an IDENTICAL noise function, so we can recompute the canonical surface here.
const lcg = (seed) => () => (seed = Math.imul(1664525, seed) + 1013904223 | 0) / 4294967296 + 0.5;

describe('heightAt — single source of truth for the surface formula', () => {
  it('computeHeight uses the authoritative 40 + n*18 + highland^2*AMP formula', () => {
    const v = 0.6;                 // constant stub -> n + highland fully determined
    const { continent, n, baseHeight } = computeHeight(() => v, 100, 200);
    const expectedN = v * 0.5 + 0.5 + v * 0.1;          // 0.01-octave + 0.05-octave
    const highland = Math.max(0, v - HIGHLAND_THRESHOLD);
    const expectedBase = 40 + expectedN * 18 + highland * highland * HIGHLAND_AMP;
    expect(continent).toBe(v);
    expect(n).toBeCloseTo(expectedN, 9);
    expect(baseHeight).toBeCloseTo(expectedBase, 9);
  });

  it('the highland swell is RARE: zero at/below threshold, growing above it', () => {
    // isolate the highland term by holding n constant — use a stub keyed only on the highland freq (0.0018)
    const mk = (hv) => (x) => (Math.abs(x) < 0.5 ? 0.2 /* n/continent/etc default */ : hv);
    // simpler: compare two constant stubs and subtract the (identical) n contribution
    const baseAt = (v) => computeHeight(() => v, 0, 0).baseHeight - (40 + (v * 0.5 + 0.5 + v * 0.1) * 18);
    expect(baseAt(HIGHLAND_THRESHOLD - 0.1)).toBeCloseTo(0, 9);  // below -> no swell
    expect(baseAt(HIGHLAND_THRESHOLD)).toBeCloseTo(0, 9);        // at -> no swell
    expect(baseAt(HIGHLAND_THRESHOLD + 0.3)).toBeGreaterThan(5); // above -> a real peak
  });

  it('climate.surfaceBlockAt matches the shared formula (the worker<->climate drift is fixed)', () => {
    const noise = createNoise2D(lcg(12345));
    // find a LAND column where the highland swell actually contributes (the drift used to hide here)
    let found = null;
    for (let i = 1; i < 6000 && !found; i++) {
      const x = i * 11, z = i * 7;
      const h = computeHeight(noise, x, z);
      const hasSwell = h.baseHeight > 40 + h.n * 18 + 1e-9;
      if (h.continent >= OCEAN_CONTINENT_THRESHOLD && Math.floor(h.baseHeight) >= 32 && hasSwell) {
        found = { x, z, h };
      }
    }
    expect(found, 'expected at least one land+highland column in the sample').not.toBeNull();
    const { x, z, h } = found;
    const got = surfaceBlockAt(x, z);
    expect(got.surfaceY).toBe(Math.floor(h.baseHeight));        // matches the single source
    expect(got.surfaceY).not.toBe(Math.floor(30 + h.n * 40));   // and NOT the old stale 30+n*40
  });
});
