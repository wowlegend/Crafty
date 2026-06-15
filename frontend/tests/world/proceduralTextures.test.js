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

  it('is a 10-layer DataArrayTexture (one albedo tile per blockType 0..9)', () => {
    expect(tex.isDataArrayTexture).toBe(true);
    expect(tex.image.depth).toBe(10);
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
