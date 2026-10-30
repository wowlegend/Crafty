// leafFeel.js — canopies move in the wind and glow when the sun is behind them (plan
// docs/superpowers/plans/2026-09-23-crafty-leaf-sway-translucency.md; EXTERNAL-BASELINE-R2 #2). Only grass blades
// swayed, and a leaf block was lit exactly like stone.
//
// Two terms in the terrain program, both only on the leaves layer:
//   - SWAY (vertex): each leaf vertex moves by a small horizontal offset whose phase is a SLOW function of its WORLD
//     position. A greedy-merged leaf quad keeps its corners on world positions, so neighbouring blocks share almost
//     the same offset and a canopy moves as one soft mass instead of shearing; the amplitude bounds how far a leaf
//     face can open from the trunk face beside it.
//   - TRANSLUCENCY (fragment): light the leaf GIVES when the camera looks toward the sun through it — the leaf's own
//     colour, warmed, times a back-light lobe and a day factor. Minecraft's Vibrant Visuals does this with a
//     subsurface pass; here it is one term, no new texture.
// Both read uTime / uSunDir, which the terrain drives from the capture-aware clock, so capture stays deterministic.
// The GLSL is GENERATED from the constants below, and a node test evaluates it against the JS twins.
import { BLOCK_ID } from './blockIds.js';

/** The leaves layer (layer index == block code). */
export const LEAF_LAYER = BLOCK_ID.leaves;

/** Metres a leaf vertex moves at most, per axis. Small: the seam against a trunk face opens by no more than this. */
export const SWAY_AMP = 0.04;
/** Radians of phase per metre. A 1 m step moves both components' phases by this, so neighbours differ by at most
 *  SWAY_AMP x this x sqrt(2) (0.21 x SWAY_AMP) — a merged quad cannot shear. */
const SWAY_K = 0.15;
/** Radians per second: two slow, unrelated rates so the motion never reads as a metronome. */
const SWAY_W = [1.3, 0.9];

/** How strongly a back-lit leaf glows, the lobe's tightness, and the warm tint of light through a leaf. */
export const LEAF_TRANSLUCENCY = 0.55;
const BACK_POWER = 3;
const LEAF_SUN = [1.0, 0.9, 0.65];
/** The sun heights the translucency fades between: none at DAY_LO and below, full at DAY_HI and above. */
const DAY_LO = -0.05;
const DAY_HI = 0.15;

/** JS twin of the vertex sway: the [dx, dz] a leaf vertex at world (x, y, z) moves at time t (seconds). */
/** @internal The JS twin of a shader formula, for its parity test. */
export function leafSway(x, y, z, t) {
  const p = (x + y) * SWAY_K;
  const q = (z - y) * SWAY_K;
  return [SWAY_AMP * Math.sin(t * SWAY_W[0] + p + q), SWAY_AMP * Math.sin(t * SWAY_W[1] + p - q)];
}

/** JS twin of the back-light lobe over d = dot(view direction, sun direction): 0 facing away, 1 looking into the sun. */
/** @internal The JS twin of a shader formula, for its parity test. */
export function backLight(d) {
  return Math.pow(Math.max(d, 0), BACK_POWER);
}

const smoothstep = (a, b, x) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

/** JS twin of the day factor over the sun's height. */
/** @internal The JS twin of a shader formula, for its parity test. */
export function leafDay(sunY) {
  return smoothstep(DAY_LO, DAY_HI, sunY);
}

/**
 * The GLSL. `vertexDecl` goes with the vertex declarations; `vertex` goes after `#include <begin_vertex>` and needs
 * `transformed`, `color` and `modelMatrix` (three's own). `fragment` goes after `#include <emissivemap_fragment>`
 * and needs `layerIndex`, `texColor` (the terrain's <color_fragment> patch), `vWorldPos`, `uSunDir` and three's
 * `cameraPosition`.
 */
export function leafFeelGlsl() {
  const f = (x) => x.toFixed(3);
  const layer = f(LEAF_LAYER);
  // The translucency term's factors, multiplied into its one output line: the linear leaf colour, the warm tint, the
  // strength, the back-light lobe and the day factor. Defining a factor does not apply it, so the product is generated
  // from this list and the gate reads the list back out of it.
  const glowTerm = ['pow(texColor.rgb, vec3(2.2))', `vec3(${LEAF_SUN.map(f).join(', ')})`, f(LEAF_TRANSLUCENCY), 'leafBack', 'leafDay'];
  return {
    vertexDecl: 'uniform float uTime;',
    vertex: [
      `if (abs(color.r - ${layer}) < 0.5) {`,
      `  vec3 leafW = (modelMatrix * vec4(position, 1.0)).xyz;`,
      `  float leafP = (leafW.x + leafW.y) * ${f(SWAY_K)};`,
      `  float leafQ = (leafW.z - leafW.y) * ${f(SWAY_K)};`,
      `  transformed.x += ${f(SWAY_AMP)} * sin(uTime * ${f(SWAY_W[0])} + leafP + leafQ);`,
      `  transformed.z += ${f(SWAY_AMP)} * sin(uTime * ${f(SWAY_W[1])} + leafP - leafQ);`,
      `}`,
    ].join('\n'),
    fragment: [
      `if (abs(layerIndex - ${layer}) < 0.5) {`,
      `  float leafBack = pow(max(dot(normalize(vWorldPos - cameraPosition), normalize(uSunDir)), 0.0), ${f(BACK_POWER)});`,
      `  float leafDay = smoothstep(${f(DAY_LO)}, ${f(DAY_HI)}, uSunDir.y);`,
      `  totalEmissiveRadiance += ${glowTerm.join(' * ')};`,
      `}`,
    ].join('\n'),
  };
}
