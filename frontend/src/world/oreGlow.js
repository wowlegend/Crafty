// oreGlow.js — at night the ore NUGGETS glow (plan docs/superpowers/plans/2026-09-23-crafty-emissive-ores.md;
// EXTERNAL-BASELINE-R2 #3). Nothing in the terrain glowed: ores could not act as wayfinding at night or in a cave.
//
// The terrain shader adds  linear(tex) x uOreGlow[layer] x nugget(tex) x night(sunY)  to the emissive radiance, and
// the existing bloom halos it. Every factor lives here, where a node test can drive it:
//   - uOreGlow  a per-LAYER strength (layer index == block code): iron, gold, diamond. Coal is not luminous.
//   - nugget    a per-TEXEL chroma mask. The ore tiles are stone speckled with nuggets (world/proceduralTextures.js),
//               and that stone is grey (c, c, c + 3): its chroma is ~0.01, a nugget's 0.2-0.7. So the stone between
//               the nuggets never glows, without a second texture or any change to the locked tiles.
//   - night     0 while the sun is up — a day frame is untouched — and 1 once it is down, smooth through dusk.
// The GLSL is GENERATED from these constants, so the shader cannot drift from what the test measures.
import { BLOCK_ID } from './blockIds.js';

/** Emissive strength per glowing ore, x its own linear colour. Diamond reaches the bloom threshold; iron glints. */
export const ORE_GLOW = Object.freeze({ iron: 0.35, gold: 0.8, diamond: 1.25 });

/** The smoothstep edges on a texel's sRGB chroma (max - min, 0..1): stone ~0.01 -> 0, the dullest iron grit ~0.23 -> 1. */
export const NUGGET_CHROMA = Object.freeze([0.08, 0.18]);

/** The sun heights (uSunDir.y) the glow fades between: none at SUN_UP and above, full at SUN_DOWN and below. */
const SUN_UP = 0.1;
const SUN_DOWN = -0.15;

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The per-layer table the shader indexes, sized from the texture array. */
export function oreGlowTable(layers) {
  const out = new Float32Array(layers);
  for (const [name, k] of Object.entries(ORE_GLOW)) {
    const id = BLOCK_ID[name];
    if (Number.isInteger(id) && id >= 0 && id < layers) out[id] = k;
  }
  return out;
}

/** JS twin of the GLSL nugget mask, over sRGB bytes 0..255. */
export function nuggetMask(r, g, b) {
  const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
  return smoothstep(NUGGET_CHROMA[0], NUGGET_CHROMA[1], chroma);
}

/** JS twin of the GLSL night curve. Written 1 - smoothstep(DOWN, UP, y), not smoothstep(UP, DOWN, y): GLSL leaves
 *  smoothstep undefined for edge0 >= edge1, and the two are equal by the curve's symmetry. */
export function nightFactor(sunY) {
  return 1 - smoothstep(SUN_DOWN, SUN_UP, sunY);
}

/** The emissive term's factors, multiplied into the one output line below: the linear tile colour, the table, the
 *  nugget mask and the night curve — each defined above it in the GLSL and tested against its JS twin. Defining a
 *  factor does not apply it, so the product is generated from this list and the gate reads the list back out of it. */
const ORE_GLOW_TERM = ['pow(texColor.rgb, vec3(2.2))', 'oreGlowK', 'oreNugget', 'oreNight'];

/**
 * The GLSL. `decl` goes with the fragment uniforms (uSunDir is already declared by the terrain's cloud shadows);
 * `apply` goes after `#include <emissivemap_fragment>` and needs `layerIndex` and `texColor` in scope — both are
 * built by the terrain's `<color_fragment>` patch, earlier in the same main().
 */
export function oreGlowGlsl(layers = 16) {
  const lastLayer = (layers - 1).toFixed(1);
  const f = (x) => x.toFixed(3);
  return {
    decl: `uniform float uOreGlow[${layers}];`,
    apply: [
      `float oreGlowK = uOreGlow[int(clamp(layerIndex, 0.0, ${lastLayer}))];`,
      `if (oreGlowK > 0.0) {`,
      `  float oreChroma = max(texColor.r, max(texColor.g, texColor.b)) - min(texColor.r, min(texColor.g, texColor.b));`,
      `  float oreNugget = smoothstep(${f(NUGGET_CHROMA[0])}, ${f(NUGGET_CHROMA[1])}, oreChroma);`,
      `  float oreNight = 1.0 - smoothstep(${f(SUN_DOWN)}, ${f(SUN_UP)}, uSunDir.y);`,
      `  totalEmissiveRadiance += ${ORE_GLOW_TERM.join(' * ')};`,
      `}`,
    ].join('\n'),
  };
}
