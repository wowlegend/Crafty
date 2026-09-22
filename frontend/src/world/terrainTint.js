// terrainTint.js — which terrain blocks take the per-biome tint, and the GLSL that applies it.
//
// WHY THIS IS ITS OWN MODULE (QUEUE R1.5, R1.6). Terrain.jsx built the tint inline in a shader template
// with two defects no test could reach, because Terrain.jsx cannot be imported under node:
//
//  R1.5 — the tint multiplied EVERY opaque block. Stone, ores, wood, cactus and player-placed blocks, cave
//         walls thirty blocks under a jungle, all took the column's biome hue. The tint exists to tell
//         grass-surfaced biomes apart (six of ten share surfaceBlock 1); on stone it is a colour cast.
//  R1.6 — `uniform vec3 uBiomeTint[10]` and `clamp(vBiome, 0.0, 9.0)` were literals. An eleventh biome
//         would clamp to the tenth on the ground while the grass blades (which index the JS table) got it
//         right — exactly the ground/blade disagreement the tint was built to remove.
//
// Both are now DATA derived here and drivable by a test: the array length comes from BIOME_NAMES, and the
// per-block mask is a table indexed by the texture layer (= block id).
import { BIOME_NAMES } from './biomeTable.js';
import { BLOCK_ID } from './blockIds.js';

/**
 * The natural SURFACE blocks a biome colours: its ground (grass, dirt, sand, snow) and its canopy (leaves —
 * a jungle and a taiga should not share one green). Everything else keeps its own colour.
 */
export const BIOME_TINTED_BLOCKS = Object.freeze(['grass', 'dirt', 'sand', 'snow', 'leaves']);

/** Per-layer 0/1 mask, `layers` long (the texture-array depth). 1 = take the biome tint. */
export function biomeTintMask(layers) {
  const out = new Float32Array(layers);
  for (const name of BIOME_TINTED_BLOCKS) {
    const id = BLOCK_ID[name];
    if (Number.isInteger(id) && id >= 0 && id < layers) out[id] = 1;
  }
  return out;
}

/**
 * The GLSL for the tint, sized from the biome table. `decl` goes with the other fragment uniforms; `apply`
 * goes after the albedo is built and needs `layerIndex` and `vBiome` in scope.
 *
 * The mask is MIXED, not branched: the multiplier is luminance-normalised, so mix(1, tint, 0/1) either
 * shifts hue or leaves the texel alone, with no divergence in the fragment shader.
 */
export function biomeTintGlsl(biomeCount = BIOME_NAMES.length, layers = 16) {
  const lastBiome = (biomeCount - 1).toFixed(1);
  const lastLayer = (layers - 1).toFixed(1);
  return {
    decl: [
      `uniform vec3 uBiomeTint[${biomeCount}];`,
      `uniform float uBiomeTintMask[${layers}];`,
    ].join('\n'),
    apply: [
      `float biomeTintOn = uBiomeTintMask[int(clamp(layerIndex, 0.0, ${lastLayer}))];`,
      `diffuseColor.rgb *= mix(vec3(1.0), uBiomeTint[int(clamp(vBiome, 0.0, ${lastBiome}))], biomeTintOn);`,
    ].join('\n'),
  };
}
