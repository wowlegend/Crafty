import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createProceduralVoxelTextures } from '../../src/world/proceduralTextures.js';

/**
 * DISTANT TERRAIN STOPS SHIMMERING (EXTERNAL-BASELINE #2; plan Task 1) — WHEN KEVIN TURNS IT ON.
 *
 * The block texture array is NEAREST with no mip chain, so every distant face samples one texel out of a
 * 32x32 tile per pixel and crawls as the camera moves — texture aliasing, which no post AA can fix. The
 * option builds mipmapped minification (NEAREST within a level, LINEAR between levels — Minecraft's choice),
 * magnification still NEAREST so the pixel look up close is unchanged.
 *
 * WHY AN OPTION AND NOT THE DEFAULT: "no mipmaps" is part of the bold-flat design lock
 * (tests/world/proceduralTextures.test.js), recorded as Kevin's taste call. The production default stays
 * the lock (that file asserts it); this drives the option so the flip is one constant, already proven.
 *
 * THE SEAM TRAP, and why the sampler changed too: it read `fract(vUv)`. With mipmaps, the UV derivative
 * jumps at every block edge where fract wraps, the GPU picks the SMALLEST mip there, and every block gets a
 * 1-px averaged grid line. The texture already wraps REPEAT, so the sampler reads raw vUv now.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, each observed RED:
 *   M1 generateMipmaps forced false                M2 minFilter back to NearestFilter
 *   M3 plausible-wrong: magFilter Linear (blurs the pixel look up close)
 *   M4 plausible-wrong: LinearMipmapLinear (blurs inside a mip level)
 *   M5 plausible-wrong: the option ignored, mipmaps always on (the pixels-are-the-same check)
 *   M6 the production default flipped on -> RED in tests/world/proceduralTextures.test.js (the lock)
 *   M7 fract( back in the sampler (the seam trap) -> RED in grass-biome-tint-gates, which already reads
 *      Terrain.jsx (a source read here would grow the frozen source-grep population)
 *
 * BLIND SPOT: whether the GPU actually builds the chain is the renderer's business (verified in the
 * installed three r172 WebGLTextures: texStorage3D allocates the levels, generateMipmap fills them); how it
 * LOOKS is judged from the capture A/B.
 */
describe('with mipmaps on, the block texture array is mipmapped, and stays crisp up close', () => {
  const tex = createProceduralVoxelTextures({ mipmaps: true });

  it('minification is mipmapped (NEAREST in a level, LINEAR between levels)', () => {
    expect(tex.isDataArrayTexture).toBe(true);
    expect(tex.generateMipmaps).toBe(true);
    expect(tex.minFilter).toBe(THREE.NearestMipmapLinearFilter);
  });

  it('the pixels are the same pixels — the option changes filtering, never the tiles', () => {
    const off = createProceduralVoxelTextures({ mipmaps: false });
    expect(off.generateMipmaps).toBe(false);
    expect(off.minFilter).toBe(THREE.NearestFilter);
    expect(Buffer.compare(Buffer.from(off.image.data), Buffer.from(tex.image.data))).toBe(0);
  });

  it('magnification stays NEAREST, and the tile still wraps REPEAT (the sampler depends on it)', () => {
    expect(tex.magFilter).toBe(THREE.NearestFilter);
    expect(tex.wrapS).toBe(THREE.RepeatWrapping);
    expect(tex.wrapT).toBe(THREE.RepeatWrapping);
  });
});
