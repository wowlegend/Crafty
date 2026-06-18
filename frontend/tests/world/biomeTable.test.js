import { describe, it, expect } from 'vitest';
import { pickBiome, BIOMES } from '../../src/world/biomeTable.js';

// The OLD inline 3-branch (terrain.worker.js:396-404), reproduced verbatim as the oracle for the
// HARD-THRESHOLD corners that W2-T8 must preserve (so climate.test.js + the M3 surface contract hold).
function oldBranch(temperature, moisture) {
  let surfaceBlock = 1, secondaryBlock = 2; // grass / dirt
  if (temperature > 0.7 && moisture < 0.3) { surfaceBlock = 4; secondaryBlock = 4; } // desert
  else if (temperature < 0.3) { surfaceBlock = 5; secondaryBlock = 3; }              // snow
  return { surfaceBlock, secondaryBlock };
}

describe('biome table (World-M3 hard-threshold corners preserved by W2-T8)', () => {
  // W2-T8 (2026-06-17): the table grew from 3 -> 9 biomes with continent-aware blending, BUT the
  // two HARD corners that downstream pins rely on are preserved BYTE-IDENTICALLY:
  //   - hot+dry  (temperature>0.7 && moisture<0.3) -> desert sand (surfaceBlock 4)
  //   - cold     (temperature<0.3)                 -> snow        (surfaceBlock 5)
  // These keep climate.test.js (origin grass, [0,-40] snow) + the biome-snow visual baseline stable.
  it('the hot+dry desert corner keeps the legacy sand surface/secondary blocks', () => {
    for (let m = 0; m <= 0.29; m += 0.05) {
      for (let t = 0.71; t <= 1.0001; t += 0.05) {
        const got = pickBiome(t, m, 0.4);
        expect({ surfaceBlock: got.surfaceBlock, secondaryBlock: got.secondaryBlock },
          `t=${t.toFixed(2)} m=${m.toFixed(2)}`).toEqual(oldBranch(t, m));
      }
    }
  });
  it('the cold corner keeps the legacy snow surface/secondary blocks', () => {
    for (let t = 0; t < 0.3; t += 0.05) {
      for (let m = 0; m <= 1.0001; m += 0.1) {
        const got = pickBiome(t, m, 0.4);
        expect({ surfaceBlock: got.surfaceBlock, secondaryBlock: got.secondaryBlock },
          `t=${t.toFixed(2)} m=${m.toFixed(2)}`).toEqual(oldBranch(t, m));
      }
    }
  });
  it('the temperate plains corner (origin climate) stays grass/dirt (climate.test.js pin)', () => {
    const got = pickBiome(0.522, 0.500, 0.0); // origin (0,0) climate fields
    expect(got.surfaceBlock).toBe(1); // grass
    expect(got.secondaryBlock).toBe(2); // dirt
  });
  it('returns a fresh object each call (the worker reassigns surfaceBlock for beaches — no shared mutation)', () => {
    const a = pickBiome(0.5, 0.5, 0);
    a.surfaceBlock = 99;
    expect(pickBiome(0.5, 0.5, 0).surfaceBlock).toBe(1); // not corrupted by the mutation above
  });
});

describe('W2-T8 biome variety beyond 3 hard-threshold biomes', () => {
  it('declares at least 6 biomes with distinct surface blocks + flora + tint', () => {
    const keys = Object.keys(BIOMES);
    expect(keys.length).toBeGreaterThanOrEqual(6);
    for (const k of keys) {
      expect(BIOMES[k].surfaceBlock, k).toBeGreaterThan(0);
      expect(BIOMES[k], k).toHaveProperty('flora');
      expect(BIOMES[k], k).toHaveProperty('tint');
    }
  });
  it('uses the continent param for selection (no longer ignored)', () => {
    // two columns differing ONLY in continent can pick different biomes (e.g. coastal vs inland)
    const a = pickBiome(0.5, 0.5, -0.1);
    const b = pickBiome(0.5, 0.5, 0.6);
    expect(a.surfaceBlock !== b.surfaceBlock || a.flora !== b.flora).toBe(true);
  });
  it('still returns a FRESH object (worker reassigns surfaceBlock for the beach band)', () => {
    const x = pickBiome(0.8, 0.2, 0.3); x.surfaceBlock = 999;
    expect(pickBiome(0.8, 0.2, 0.3).surfaceBlock).not.toBe(999);
  });

  // --- richer distinctness assertions (the world must not read same-everywhere) ---
  it('every biome carries a valid EXISTING surface block id (atlas layers 1..6 — no new ids; palette is M4b)', () => {
    const VALID_SURFACE = new Set([1, 2, 3, 4, 5, 6]); // grass/dirt/stone/sand/snow/wood
    for (const [k, b] of Object.entries(BIOMES)) {
      expect(VALID_SURFACE.has(b.surfaceBlock), `${k} surface ${b.surfaceBlock}`).toBe(true);
      expect(VALID_SURFACE.has(b.secondaryBlock), `${k} secondary ${b.secondaryBlock}`).toBe(true);
    }
  });
  it('the biome set spans multiple distinct surface materials AND multiple flora kinds (variety)', () => {
    const surfaces = new Set(Object.values(BIOMES).map((b) => b.surfaceBlock));
    const floras = new Set(Object.values(BIOMES).map((b) => b.flora));
    const tints = new Set(Object.values(BIOMES).map((b) => b.tint));
    expect(surfaces.size).toBeGreaterThanOrEqual(3); // grass + sand + snow at minimum
    expect(floras.size).toBeGreaterThanOrEqual(4);   // distinct flora kinds drive the foliage system
    expect(tints.size).toBeGreaterThanOrEqual(5);    // distinct vertex tints drive per-biome color
  });
  it('every tint is a parseable hex color (vertex-tint metadata the M4 mesher will consume)', () => {
    for (const [k, b] of Object.entries(BIOMES)) {
      expect(b.tint, `${k} tint`).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
  it('continent-aware selection is monotone-stable + deterministic (capture-safe)', () => {
    // same inputs -> identical pick (deep), required for seeded capture determinism
    expect(pickBiome(0.6, 0.7, 0.2)).toEqual(pickBiome(0.6, 0.7, 0.2));
    // a coastal temperate-wet column differs from an inland temperate-wet column
    const coast = pickBiome(0.55, 0.75, -0.2);
    const inland = pickBiome(0.55, 0.75, 0.5);
    expect(coast.flora !== inland.flora || coast.surfaceBlock !== inland.surfaceBlock).toBe(true);
  });
  it('hot+wet is a jungle-class biome distinct from hot+dry desert (moisture axis is real)', () => {
    const jungle = pickBiome(0.85, 0.8, 0.5);
    const desert = pickBiome(0.85, 0.15, 0.5);
    expect(jungle.flora).not.toBe(desert.flora);
    expect(jungle.surfaceBlock !== desert.surfaceBlock || jungle.tint !== desert.tint).toBe(true);
  });
});
