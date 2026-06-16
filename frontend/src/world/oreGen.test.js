import { describe, it, expect } from 'vitest';
import { oreCodeFor } from './oreGen';

// S6 Slice 2: deterministic depth-banded ore generation. oreCodeFor returns the worker block code for a
// deep-solid voxel: 3 (plain stone) or an ore code 10(coal)/11(iron)/12(gold)/13(diamond). Pure +
// position-deterministic (same coords -> same code, so chunks regenerate identically + it's capture-safe),
// banded by depth = surfaceY - worldY: coal shallow+common -> diamond deepest+rarest.
describe('oreCodeFor — depth-banded deterministic ore placement', () => {
  it('is deterministic (same coords -> same code)', () => {
    for (const [x, y, z, s] of [[10, 5, 20, 40], [-7, 12, 3, 50], [100, 1, -50, 60]]) {
      expect(oreCodeFor(x, y, z, s)).toBe(oreCodeFor(x, y, z, s));
    }
  });

  it('returns only valid codes (3 stone or 10..13 ore)', () => {
    const valid = new Set([3, 10, 11, 12, 13]);
    for (let i = 0; i < 2000; i++) {
      const code = oreCodeFor(i * 3, (i % 50), i * 7, 55);
      expect(valid.has(code), `code ${code} at i=${i}`).toBe(true);
    }
  });

  it('shallow voxels never yield diamond (depth < the diamond band)', () => {
    // depth 4..11 just under the secondary fill -> coal/stone only, never the deep ores.
    let sawDiamond = false;
    const surfaceY = 60;
    for (let x = 0; x < 200; x++) {
      for (let d = 4; d <= 11; d++) {
        if (oreCodeFor(x, surfaceY - d, x * 13, surfaceY) === 13) sawDiamond = true;
      }
    }
    expect(sawDiamond).toBe(false);
  });

  it('the deepest band can yield diamond', () => {
    let sawDiamond = false;
    const surfaceY = 60;
    for (let x = 0; x < 400 && !sawDiamond; x++) {
      for (let z = 0; z < 400 && !sawDiamond; z++) {
        if (oreCodeFor(x, surfaceY - 50, z, surfaceY) === 13) sawDiamond = true;
      }
    }
    expect(sawDiamond).toBe(true);
  });

  it('over a deep sample: rarity ordering coal>iron>gold>diamond + ores are a small (<8%) fraction', () => {
    const counts = { 3: 0, 10: 0, 11: 0, 12: 0, 13: 0 };
    const surfaceY = 80;
    let total = 0;
    for (let x = 0; x < 160; x++) {
      for (let z = 0; z < 160; z++) {
        counts[oreCodeFor(x, surfaceY - 50, z, surfaceY)]++; // deep band: all ore gates open
        total++;
      }
    }
    expect(counts[10]).toBeGreaterThan(counts[11]); // coal > iron
    expect(counts[11]).toBeGreaterThan(counts[12]); // iron > gold
    expect(counts[12]).toBeGreaterThan(counts[13]); // gold > diamond
    expect(counts[13]).toBeGreaterThan(0);          // diamond present
    const ore = counts[10] + counts[11] + counts[12] + counts[13];
    expect(ore / total).toBeLessThan(0.08);          // stone still dominates
    expect(counts[3] / total).toBeGreaterThan(0.9);
  });
});
