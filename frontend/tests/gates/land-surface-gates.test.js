import { describe, it, expect } from 'vitest';
import { TERRAIN_SURFACE } from '../../src/world/terrainSurface.js';
import { STONE_METALNESS, STONE_ROUGHNESS, stoneFaceUnder } from './_lightModel.js';
import { sampleMood } from '../../src/render/mood.js';
import { carriersOf } from './_srcWalk.js';

/**
 * The land is a dielectric (plan 2026-10-28-crafty-sota-reset item #43, unit W2-A). Terrain drew at metalness 0.1, so
 * its diffuse was the albedo x 0.9 beside creatures at x 1, and its specular took its albedo's tint. One constant,
 * world/terrainSurface.js, now feeds the terrain material, the far ring, the light rig's grey card and the colour model
 * the light gates measure with, so the card and the model stand for the ground the player sees.
 *
 * Mutation-Proof: recorded on the commit that added this file.
 *
 * BLIND SPOT: the wiring is source shape (comment-stripped). That the shader then draws without the albedo-tinted
 * lobe is the live frame's. Metalness 0 does NOT remove the grazing specular: three's dielectric F0 0.04 under Schlick
 * still adds displayed L ~0.09 at f 0.30 a camera 15 deg above the ground looking toward the sun (_lightModel.js).
 */
describe('the land surface: metalness 0, one constant for the ground, the card and the model', () => {
  it('the land is a dielectric', () => {
    expect(TERRAIN_SURFACE.metalness).toBe(0);
    expect(TERRAIN_SURFACE.roughness).toBeGreaterThan(0.5);
  });

  it('the colour model reads the same surface, so its diffuse is the albedo itself', () => {
    expect(STONE_METALNESS).toBe(TERRAIN_SURFACE.metalness);
    expect(STONE_ROUGHNESS).toBe(TERRAIN_SURFACE.roughness);
    // Driven, not read back: under any rig the model's stone with no key is Lambert of the albedo, unscaled.
    const fr = sampleMood(0, 0.3);
    const grey = stoneFaceUnder(fr, { keyDir: null });
    const white = stoneFaceUnder(fr, { keyDir: null, albedo: '#FFFFFF' });
    const lin = 0.2622; // #8C8C8C in linear sRGB
    for (let c = 0; c < 3; c++) expect(grey[c] / white[c]).toBeCloseTo(lin, 3);
  });

  it('the terrain and the grey card spread it, and the far ring takes its metalness', () => {
    expect(carriersOf(/\.\.\.TERRAIN_SURFACE\b/).sort()).toEqual(['render/Atmosphere.jsx', 'world/Terrain.jsx']);
    expect(carriersOf(/metalness:\s*TERRAIN_SURFACE\.metalness\b/)).toEqual(['world/FarField.jsx']);
    // A literal beside the spread would override it.
    expect(carriersOf(/metalness:\s*0?\.\d/).filter((f) => ['world/Terrain.jsx', 'world/FarField.jsx'].includes(f)))
      .toEqual([]);
  });
});
