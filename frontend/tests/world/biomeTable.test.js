import { describe, it, expect } from 'vitest';
import { pickBiome, BIOMES } from '../../src/world/biomeTable.js';

// The OLD inline 3-branch (terrain.worker.js:396-404), reproduced verbatim as the oracle.
function oldBranch(temperature, moisture) {
  let surfaceBlock = 1, secondaryBlock = 2; // grass / dirt
  if (temperature > 0.7 && moisture < 0.3) { surfaceBlock = 4; secondaryBlock = 4; } // desert
  else if (temperature < 0.3) { surfaceBlock = 5; secondaryBlock = 3; }              // snow
  return { surfaceBlock, secondaryBlock };
}

describe('biome table (World-M3) — byte-identical to the old inline branch', () => {
  it('pickBiome reproduces the old branch for a fine (temperature, moisture) grid', () => {
    for (let t = 0; t <= 1.0001; t += 0.025) {
      for (let m = 0; m <= 1.0001; m += 0.025) {
        expect(pickBiome(t, m, 0), `t=${t.toFixed(3)} m=${m.toFixed(3)}`).toEqual(oldBranch(t, m));
      }
    }
  });
  it('continent is accepted but does NOT change the M3 result (look-neutral; M4 may use it)', () => {
    for (const c of [-0.5, -0.15, 0, 0.5]) {
      expect(pickBiome(0.8, 0.2, c)).toEqual(pickBiome(0.8, 0.2, 0)); // desert case
      expect(pickBiome(0.1, 0.9, c)).toEqual(pickBiome(0.1, 0.9, 0)); // snow case
      expect(pickBiome(0.5, 0.5, c)).toEqual(pickBiome(0.5, 0.5, 0)); // plains case
    }
  });
  it('the three biomes carry the exact legacy block ids', () => {
    expect(BIOMES.desert).toEqual({ surfaceBlock: 4, secondaryBlock: 4 });
    expect(BIOMES.snow).toEqual({ surfaceBlock: 5, secondaryBlock: 3 });
    expect(BIOMES.plains).toEqual({ surfaceBlock: 1, secondaryBlock: 2 });
  });
  it('returns a fresh object each call (the worker reassigns surfaceBlock for beaches — no shared mutation)', () => {
    const a = pickBiome(0.5, 0.5, 0);
    a.surfaceBlock = 99;
    expect(pickBiome(0.5, 0.5, 0).surfaceBlock).toBe(1); // not corrupted by the mutation above
  });
});
