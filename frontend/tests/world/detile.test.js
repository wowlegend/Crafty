import { describe, it, expect } from 'vitest';
import { tileValueOffset } from '../../src/world/detile.js';

// Bold-flat de-tile: a bounded, deterministic per-world-cell value offset that breaks the
// repeated-identical-tile monotony of the voxel terrain WITHOUT leaving the flat-shaded look.
// The GLSL terrain shader mirrors this exact formula on floor(worldPos) so JS + GPU agree.
describe('tileValueOffset — bold-flat de-tile (bounded, deterministic, varies by cell)', () => {
  it('is deterministic for the same world cell', () => {
    expect(tileValueOffset(5, 30, 12)).toBe(tileValueOffset(5, 30, 12));
  });
  it('is cell-quantized (same integer cell -> same offset regardless of sub-voxel position)', () => {
    expect(tileValueOffset(5.0, 30.2, 12.9)).toBe(tileValueOffset(5.4, 30.8, 12.1));
  });
  it('stays within +/- 0.08 (subtle — must not break the flat read)', () => {
    for (let i = 0; i < 400; i++) {
      const v = tileValueOffset(i * 3 - 100, i % 40, i * 7 - 50);
      expect(v).toBeGreaterThanOrEqual(-0.08);
      expect(v).toBeLessThanOrEqual(0.08);
    }
  });
  it('differs across adjacent cells (actually de-tiles, not a constant)', () => {
    const a = tileValueOffset(5, 30, 12), b = tileValueOffset(6, 30, 12), c = tileValueOffset(5, 30, 13);
    expect(a === b && a === c).toBe(false);
  });
});
