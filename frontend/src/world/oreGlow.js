// oreGlow.js — at night the ore NUGGETS glow (plan docs/superpowers/plans/2026-09-23-crafty-emissive-ores.md;
// EXTERNAL-BASELINE-R2 #3). Nothing in the terrain glowed: ores could not act as wayfinding at night or in a cave.
//
// The terrain shader adds  linear(glow map) x uOreGlow[layer] x night(sunY)  to the emissive radiance, and the
// existing bloom halos it. Every factor lives here, where a node test can drive it:
//   - glow map  per texel, the tile's linear colour times its nugget mask, baked from the LEVEL-0 tile bytes and
//               mipped on its own (oreGlowTexture). The ore tiles are stone speckled with nuggets
//               (world/proceduralTextures.js), and that stone is grey (c, c, c + 3): its chroma is ~0.01, a nugget's
//               0.2-0.7, so the mask keeps the stone dark. The mask cannot be taken from the sampled tile: at distance
//               the GPU reads a mip texel, the mean of nugget and stone, whose chroma no longer says how much of it was
//               nugget. The mean of the baked product is the mean glow at every level.
//   - uOreGlow  a per-LAYER strength (layer index == block code): iron, gold, diamond. Coal is not luminous.
//   - night     0 while the sun is up — a day frame is untouched — and 1 once it is down, smooth through dusk.
// The GLSL is GENERATED from these constants, so the shader cannot drift from what the test measures.
import * as THREE from 'three';
import { BLOCK_ID } from './blockIds.js';
import { linearLightMipChain } from './proceduralTextures.js';
import { TEXTURE_LAYER_COUNT } from './materialGrammar.js';

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
/** @internal The JS twin of a shader formula, for its parity test. */
export function nightFactor(sunY) {
  return 1 - smoothstep(SUN_DOWN, SUN_UP, sunY);
}

const decode = (v) => Math.pow(v / 255, 2.2);
const encode = (linear) => Math.round(Math.pow(linear, 1 / 2.2) * 255);

/**
 * The block layers that glow, as one contiguous run: the glow map holds only these, so glow layer i is block layer
 * `first + i`. Its depth therefore differs from the block array's, which scripts/ci/prod-smoke.mjs relies on to find
 * the block array on the GPU by its dimensions.
 */
export const GLOW_LAYERS = (() => {
  const ids = Object.keys(ORE_GLOW).map((name) => BLOCK_ID[name]).sort((a, b) => a - b);
  if (ids.some((id, i) => id !== ids[0] + i)) throw new Error(`oreGlow: glowing layers ${ids} are not contiguous`);
  return Object.freeze({ first: ids[0], count: ids.length });
})();

/**
 * The glow map's level 0, from a tile stack's level-0 RGBA bytes: per texel of each glowing layer, encode(linear
 * colour x nugget mask) in the tiles' own 2.2 encoding. Alpha 255.
 */
export function oreGlowTexels(data, size) {
  const out = new Uint8Array(size * size * 4 * GLOW_LAYERS.count);
  for (let g = 0; g < GLOW_LAYERS.count; g++) {
    const l = GLOW_LAYERS.first + g;
    for (let i = 0; i < size * size; i++) {
      const o = (l * size * size + i) * 4, w = (g * size * size + i) * 4;
      const m = nuggetMask(data[o], data[o + 1], data[o + 2]);
      for (let c = 0; c < 3; c++) out[w + c] = encode(decode(data[o + c]) * m);
      out[w + 3] = 255;
    }
  }
  return out;
}

/** The glow map for a block texture array: baked from its level 0, mipped in linear light, sampled like it. */
export function oreGlowTexture(blocks) {
  const size = blocks.image.width, layers = GLOW_LAYERS.count;
  const data = oreGlowTexels(blocks.image.data, size);
  const texture = new THREE.CompressedArrayTexture(
    linearLightMipChain(data, size, layers), size, size, layers, THREE.RGBAFormat, THREE.UnsignedByteType,
  );
  texture.image.data = data;
  texture.minFilter = blocks.minFilter;
  texture.magFilter = blocks.magFilter;
  texture.wrapS = blocks.wrapS;
  texture.wrapT = blocks.wrapT;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** The emissive term's factors, multiplied into the one output line below: the linear glow-map texel, the table and
 *  the night curve, each defined above it in the GLSL. Defining a factor does not apply it, so the product is
 *  generated from this list and the gate reads the list back out of it. */
const ORE_GLOW_TERM = ['pow(oreGlowTexel, vec3(2.2))', 'oreGlowK', 'oreNight'];

/**
 * The GLSL. `decl` goes with the fragment uniforms (uSunDir is already declared by the terrain's cloud shadows);
 * `apply` goes after `#include <emissivemap_fragment>` and needs `layerIndex` (the terrain's `<color_fragment>` patch,
 * earlier in the same main()) and the land's `vUv` varying. The glow map is sampled before the branch: a texture
 * read with implicit derivatives inside non-uniform control flow picks an undefined mip level.
 */
export function oreGlowGlsl(layers = TEXTURE_LAYER_COUNT) {
  const lastLayer = (layers - 1).toFixed(1);
  const f = (x) => x.toFixed(3);
  return {
    decl: `uniform float uOreGlow[${layers}];\nuniform sampler2DArray uOreGlowTex;`,
    apply: [
      `vec3 oreGlowTexel = texture(uOreGlowTex, vec3(vUv.x, vUv.y, clamp(layerIndex - ${GLOW_LAYERS.first.toFixed(1)}, 0.0, ${(GLOW_LAYERS.count - 1).toFixed(1)}))).rgb;`,
      `float oreGlowK = uOreGlow[int(clamp(layerIndex, 0.0, ${lastLayer}))];`,
      `if (oreGlowK > 0.0) {`,
      `  float oreNight = 1.0 - smoothstep(${f(SUN_DOWN)}, ${f(SUN_UP)}, uSunDir.y);`,
      `  totalEmissiveRadiance += ${ORE_GLOW_TERM.join(' * ')};`,
      `}`,
    ].join('\n'),
  };
}
