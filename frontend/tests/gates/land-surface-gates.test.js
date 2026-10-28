import { describe, it, expect } from 'vitest';
import { TERRAIN_SURFACE } from '../../src/world/terrainSurface.js';
import { stoneFaceUnder, indirectOnUpFace } from './_lightModel.js';
import { sampleMood } from '../../src/render/mood.js';

/**
 * The land is a dielectric: one constant, world/terrainSurface.js, feeds the terrain material, the far ring, the light
 * rig's grey card and the colour model the light gates measure with, so the card and the model stand for the ground
 * the player sees. That the terrain and far-ring programs in the shipped bundle hold this metalness (and the terrain
 * its roughness) is read off the GPU by prod-smoke (scripts/ci/prod-smoke.mjs WATCHED_PROGRAMS).
 *
 * BLIND SPOT: the grey card's material is not read anywhere but through light-script.spec's model-against-screen
 * comparison. Metalness 0 does NOT remove the grazing specular: three's dielectric F0 0.04 under Schlick still adds
 * displayed L ~0.09 at f 0.30 for a camera 15 deg above the ground looking toward the sun (_lightModel.js).
 */
describe('the land surface: metalness 0, one constant for the ground, the card and the model', () => {
  it('the land is a dielectric', () => {
    expect(TERRAIN_SURFACE.metalness).toBe(0);
    expect(TERRAIN_SURFACE.roughness).toBeGreaterThan(0.5);
  });

  it("the colour model's stone in shadow is Lambert of its albedo, unscaled by any metalness", () => {
    for (const f of [0.02, 0.3, 0.75]) {
      const fr = sampleMood(0, f);
      const white = stoneFaceUnder(fr, { keyDir: null, albedo: '#FFFFFF' });
      const e = indirectOnUpFace(fr);
      for (let c = 0; c < 3; c++) expect(white[c], `f ${f} channel ${c}`).toBeCloseTo(e[c] / Math.PI, 6);
    }
  });
});
