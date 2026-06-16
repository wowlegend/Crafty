import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createProceduralVoxelTextures } from '../../src/world/proceduralTextures.js';

// REGRESSION LOCK for the bold-flat / pixel-art design language (CLAUDE.md "Design Language LOCKED S1-C").
// These invariants are what keep the voxel surfaces reading as crisp stylized pixel-art rather than
// drifting toward smoothed/realistic filtering. Crossing any of them (LinearFilter, mipmaps, non-square
// tiles, layer-count change) is a Kevin-taste fork, NOT an autonomous change -> this test makes such a
// drift fail loudly instead of slipping in silently.
describe('procedural voxel textures — bold-flat lock invariants', () => {
  const tex = createProceduralVoxelTextures();

  it('is a 14-layer DataArrayTexture (blockType 0..9 + 4 ore tiles 10..13)', () => {
    expect(tex.isDataArrayTexture).toBe(true);
    expect(tex.image.depth).toBe(14);
  });

  it('S6: the 4 ore layers (10=coal,11=iron,12=gold,13=diamond) are drawn on a stone base + speckled', () => {
    // Ores ride the existing block-code->atlas-layer scheme (layer index == block code). Each must be
    // actually drawn (non-blank) AND differ from the plain stone tile (layer 3) somewhere -> the ore
    // speckle was applied. Bold-flat lock unchanged (still NearestFilter/no-mipmaps/square, asserted below).
    const data = tex.image.data;
    const size = tex.image.width;
    const layerBytes = size * size * 4;
    const sliceOf = (L) => data.subarray(L * layerBytes, (L + 1) * layerBytes);
    const stone = sliceOf(3);
    for (const L of [10, 11, 12, 13]) {
      const ore = sliceOf(L);
      expect(ore.some((b) => b !== 0), `ore layer ${L} is blank`).toBe(true);
      let differs = false;
      for (let i = 0; i < ore.length; i++) { if (ore[i] !== stone[i]) { differs = true; break; } }
      expect(differs, `ore layer ${L} is byte-identical to stone (no ore speckle)`).toBe(true);
    }
  });

  it('uses square tiles (UV tiling assumes width === height)', () => {
    expect(tex.image.width).toBe(tex.image.height);
    expect(tex.image.width).toBeGreaterThan(0);
  });

  it('keeps the pixel-art lock: NearestFilter min+mag, NO mipmaps (never drift to realistic filtering)', () => {
    expect(tex.minFilter).toBe(THREE.NearestFilter);
    expect(tex.magFilter).toBe(THREE.NearestFilter);
    expect(tex.generateMipmaps).toBe(false);
  });

  it('tiles repeat (RepeatWrapping) so one tile covers many voxels', () => {
    expect(tex.wrapS).toBe(THREE.RepeatWrapping);
    expect(tex.wrapT).toBe(THREE.RepeatWrapping);
  });
});
