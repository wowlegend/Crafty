import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { TEXTURE_LAYER_COUNT } from '../../src/world/materialGrammar.js';

/**
 * WHEN THE TERRAIN'S TEXTURES ARE BAKED. Terrain.jsx imports the land material (world/terrainMaterial.js) and only then,
 * at its own module scope, spawns the terrain worker and posts it `init`. Imports evaluate first, so a bake at the
 * material's import (the block texture array, about 13 ms in node, and the ore glow map) runs on the main thread
 * before the worker exists, and the first chunk waits for it. Baked on the material's first compile instead, it runs
 * while the worker generates. Driven here on the real module, with the two bakes counted.
 *
 * NOT CHECKED HERE: that Terrain.jsx spawns the worker at module scope (it cannot be imported under node), or the
 * cold-start time itself.
 */
const calls = vi.hoisted(() => ({ voxel: 0, glow: 0 }));

vi.mock('../../src/world/proceduralTextures.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, sharedVoxelTextures: () => { calls.voxel += 1; return real.sharedVoxelTextures(); } };
});
vi.mock('../../src/world/oreGlow.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, oreGlowTexture: (blocks) => { calls.glow += 1; return real.oreGlowTexture(blocks); } };
});

const physicalShader = () => {
  const lib = THREE.ShaderLib.physical;
  return { vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: THREE.UniformsUtils.clone(lib.uniforms) };
};

describe('the land material bakes its textures on its first compile, not on import', () => {
  it('importing it bakes nothing; the first compile bakes each once and binds them; a later compile reuses them', async () => {
    const { terrainMaterial } = await import('../../src/world/terrainMaterial.js');
    expect(calls, 'importing the material baked a texture ahead of the worker').toEqual({ voxel: 0, glow: 0 });
    const first = physicalShader();
    terrainMaterial.onBeforeCompile(first, null);
    expect(calls).toEqual({ voxel: 1, glow: 1 });
    expect(first.uniforms.voxelTextures.value.image.depth, 'the compile bound no block array').toBe(TEXTURE_LAYER_COUNT);
    expect(first.uniforms.uOreGlowTex.value, 'the compile bound no glow map').toBeInstanceOf(THREE.Texture);
    const second = physicalShader();
    terrainMaterial.onBeforeCompile(second, null);
    expect(calls, 'a second compile baked again').toEqual({ voxel: 1, glow: 1 });
    expect(second.uniforms.voxelTextures.value).toBe(first.uniforms.voxelTextures.value);
    expect(second.uniforms.uOreGlowTex.value).toBe(first.uniforms.uOreGlowTex.value);
  });
});
