import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createProceduralVoxelTextures } from '../../src/world/proceduralTextures.js';
import { BLOCK_ID } from '../../src/world/blockIds.js';

// REGRESSION LOCK for the bold-flat / pixel-art design language (CLAUDE.md "Design Language LOCKED S1-C").
// These invariants are what keep the voxel surfaces reading as crisp stylized pixel-art rather than
// drifting toward smoothed/realistic filtering. Crossing any of them (LinearFilter, mipmaps, non-square
// tiles, layer-count change) is a Kevin-taste fork, NOT an autonomous change -> this test makes such a
// drift fail loudly instead of slipping in silently.
describe('procedural voxel textures — bold-flat lock invariants', () => {
  const tex = createProceduralVoxelTextures();

  // ⚠️ DELIBERATE CHANGE 2026-07-13 (R4a), 14 -> 16 layers. NOT a weakened gate — a widened one.
  // `cobblestone` and `glass` were offered in HOTBAR_BLOCKS but had NO voxel id and NO texture layer, so
  // placing them silently produced STONE (and `cobblestone` is even a Stone Sword recipe ingredient). They
  // now have real ids (14, 15) + real texture layers. Layer index == block code, so the array had to grow.
  // The invariant this test protects (layer count matches the id space) is UNCHANGED and still enforced —
  // it is asserted against blockIds.js below so the two can never drift apart again.
  it('is a 16-layer DataArrayTexture (blockType 0..9 + ore tiles 10..13 + cobblestone 14 + glass 15)', () => {
    expect(tex.isDataArrayTexture).toBe(true);
    expect(tex.image.depth).toBe(16);
  });

  it('the layer count covers the ENTIRE block-id space (layer index == block code)', () => {
    // The structural invariant. If someone adds a block id without adding its texture layer, that block
    // renders untextured — this fails instead of shipping it.
    const maxId = Math.max(...Object.values(BLOCK_ID));
    expect(tex.image.depth, `every block id must have a texture layer (max id = ${maxId})`).toBeGreaterThan(maxId);
  });

  it('the two new layers are actually DRAWN (not blank) and differ from stone', () => {
    // Same discipline as the ore-layer test: a layer that exists but was never painted would render black.
    const size = tex.image.width;
    const layerPixels = (layer) => {
      const start = layer * size * size * 4;
      return tex.image.data.slice(start, start + size * size * 4);
    };
    const stone = layerPixels(3);
    for (const [layer, name] of [[14, 'cobblestone'], [15, 'glass']]) {
      const px = layerPixels(layer);
      expect(px.some((v) => v !== 0), `${name} (layer ${layer}) is blank — it was never drawn`).toBe(true);
      expect(
        px.some((v, i) => v !== stone[i]),
        `${name} (layer ${layer}) is pixel-identical to stone — it would read as stone in-world`,
      ).toBe(true);
    }
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
