import { describe, it, expect } from 'vitest';
import { biomeAmbience } from '../../src/audio/biomeAmbience.js';

describe('biomeAmbience (interleave) — per-biome wind character', () => {
  it('every land biome returns sane filter cutoff (120..8000 Hz) + gain (0..0.12)', () => {
    for (const b of [1, 4, 5, 3, 2]) { // grass, sand, snow, stone, dirt
      const a = biomeAmbience(b, false);
      expect(a.cutoff).toBeGreaterThanOrEqual(120);
      expect(a.cutoff).toBeLessThanOrEqual(8000);
      expect(a.gain).toBeGreaterThanOrEqual(0);
      expect(a.gain).toBeLessThanOrEqual(0.12);
    }
  });
  it('snow is brighter/airier than desert, which is brighter than plains (distinct cutoffs)', () => {
    expect(biomeAmbience(5, false).cutoff).toBeGreaterThan(biomeAmbience(4, false).cutoff); // snow > sand
    expect(biomeAmbience(4, false).cutoff).toBeGreaterThan(biomeAmbience(1, false).cutoff); // sand > grass
  });
  it('underwater muffles — a much lower cutoff than any land biome', () => {
    const water = biomeAmbience(9, true);
    expect(water.cutoff).toBeLessThan(biomeAmbience(1, false).cutoff);
    expect(water.cutoff).toBeLessThanOrEqual(500);
  });
  it('is deterministic (pure map)', () => {
    expect(biomeAmbience(5, false)).toEqual(biomeAmbience(5, false));
  });
});
