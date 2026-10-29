import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createProceduralVoxelTextures } from '../../src/world/proceduralTextures.js';
import { BLOCK_ID } from '../../src/world/blockIds.js';
import { TEXTURE_LAYER_COUNT, FACE_VARIANTS } from '../../src/world/materialGrammar.js';

// The invariants the terrain relies on: layer index == block code, square REPEAT tiles, and the filtering that keeps
// texels crisp up close and stops them sparkling at distance.
describe('procedural voxel textures — the invariants the terrain relies on', () => {
  const tex = createProceduralVoxelTextures();

  // Layer index == block code, then the face variants (materialGrammar.js), so the array grows with the id space.
  it('is an array texture of the block id space plus the face variants (16 + 3 today)', () => {
    expect(tex.isCompressedArrayTexture).toBe(true);
    expect(tex.image.depth).toBe(TEXTURE_LAYER_COUNT);
    expect(tex.image.depth).toBe(Math.max(...Object.values(BLOCK_ID)) + 1 + FACE_VARIANTS.length);
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
    // speckle was applied.
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

  it('is mipmapped: NEAREST up close, NEAREST within a mip level and LINEAR between levels at distance', () => {
    expect(tex.magFilter).toBe(THREE.NearestFilter);
    expect(tex.minFilter).toBe(THREE.NearestMipmapLinearFilter);
    // The chain is built here, so the GPU must not rebuild it from the bytes.
    expect(tex.generateMipmaps).toBe(false);
    const size = tex.image.width;
    const levels = Math.log2(size) + 1;
    expect(tex.mipmaps.map((m) => m.width)).toEqual(Array.from({ length: levels }, (_, i) => size >> i));
    tex.mipmaps.forEach((m) => {
      expect(m.height).toBe(m.width);
      expect(m.data.length).toBe(m.width * m.height * 4 * tex.image.depth);
    });
    expect(tex.mipmaps[0].data).toBe(tex.image.data);
  });

  it('tiles repeat (RepeatWrapping) so one tile covers many voxels', () => {
    expect(tex.wrapS).toBe(THREE.RepeatWrapping);
    expect(tex.wrapT).toBe(THREE.RepeatWrapping);
  });
});
