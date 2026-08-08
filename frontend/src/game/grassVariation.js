// grassVariation.js — PURE per-blade placement + tint for the wind-grass overlay (S8).
//
// WHY IT IS A SEAM. Before this, `OptimizedGrassSystem` set position and nothing else, so every blade
// in the world was the same 0.4x0.7 rectangle at the same yaw, sitting on the bare 2m voxel lattice
// that `world/grassField.js` emits. The result reads as a grid of identical cards, which is the single
// loudest tell that the grass is instanced geometry rather than plants.
//
// Everything here is a function of the world (x, z) ONLY — no RNG, no clock, no allocation order.
// That is capture-determinism invariant 3, and it is not incidental: the visual gate byte-compares
// frames, so a blade that picks a different yaw on the second run reds a gate that is supposed to be
// reporting on the terrain.
//
// TWO THINGS THAT LOOK LIKE DETAILS AND ARE NOT:
//
//  1. SCALE UN-ANCHORS THE BLADE. The tuft geometry is a planeGeometry centred on its own origin, so
//     the renderer lifts it by half its height to stand the base on the grass surface. That lift is
//     only a constant while the scale is. `bladeTransform` therefore returns `py` already corrected
//     (`y + (BLADE_HEIGHT / 2) * scale`) rather than handing the caller a scale and trusting it to
//     remember — the caller forgetting is the whole failure mode.
//
//  2. `instanceColor` MULTIPLIES, it does not replace. three folds it into the varying at
//     color_vertex.glsl.js:18 and consumes it at color_fragment.glsl.js as `diffuseColor.rgb *= vColor`
//     (the fragment-side USE_COLOR being ORed on by WebGLProgram.js:796 is also why `setColorAt` needs
//     no `vertexColors: true`). So a tint of '#4a7c59' would SQUARE the material's own '#4a7c59' and
//     render the grass near-black. `bladeTint` returns a multiplier centred on 1.0.
//
// The base colour itself is NOT touched here. Recolouring the grass toward its yellow-green substrate
// is S9's owner decision (a 3-swatch ladder for Kevin to pick from); S8 only adds spread around
// whatever that colour ends up being, which is why the tint is a multiplier and its mean is 1.

/** Half-turn. The blade renders DoubleSide, so yaw and yaw+PI are the same picture — a [0,2PI) range
 *  would spend half its entropy on duplicates. */
export const YAW_MAX = Math.PI;

/** Readable band: below this a tuft reads as a speck, above it as a bush. */
export const SCALE_MIN = 0.82;
export const SCALE_MAX = 1.28;

/** Sub-cell offset ceiling, metres. `grassField.js` strides the lattice at 2m, so anything at or past
 *  1.0 lets a blade cross into its neighbour's cell and de-gridding turns into clumping. */
export const JITTER_MAX = 0.45;

/** Height of the tuft quad — must match the `planeGeometry` in OptimizedGrassSystem.jsx. */
export const BLADE_HEIGHT = 0.7;

/** Neutral multiplier. See note 2 above: this is 1.0, not the material's colour. */
export const BASE_TINT = Object.freeze({ r: 1, g: 1, b: 1 });

/** Amplitudes of the tint jitter, as a fraction of the base. Value moves all three channels together;
 *  the R/B bias opposes them for a touch of warm/cool spread without shifting the mean hue. */
const TINT_VALUE = 0.07;
const TINT_HUE = 0.04;

/**
 * Deterministic integer hash of a lattice cell, in [0, 1).
 *
 * Uses a 32-bit integer mix (Math.imul) plus the murmur3 finalizer rather than the usual
 * `fract(sin(dot(p,k)) * 43758.5453)`. Two reasons, both load-bearing on this input domain:
 *   - the world spans roughly -1024..1024 on both axes, and the sin-hash returns a NEGATIVE value for
 *     half of it in JS (`%` keeps the dividend's sign), which would hand `bladeTransform` a negative
 *     scale — a mesh flipped inside out across half the map;
 *   - `x` and `z` get different multipliers, so hash01(a,b) !== hash01(b,a). A symmetric hash is
 *     constant along a diagonal, which is the exact artifact the shader phase change exists to kill.
 *
 * @param {number} x world X (integer lattice)
 * @param {number} z world Z (integer lattice)
 * @param {number} [salt] channel selector, so yaw/scale/jitter/tint are not the same number reused
 * @returns {number} in [0, 1)
 */
export function hash01(x, z, salt = 0) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1) ^ Math.imul((salt | 0) + 1, 0x9e3779b1);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Signed [-1, 1) draw from the same hash. */
const signed = (x, z, salt) => hash01(x, z, salt) * 2 - 1;

/**
 * Full per-blade placement for a grass-top at world (x, y, z), where `y` is the GRASS SURFACE — the
 * height the blade's base must sit on, not the height of its centre.
 *
 * @returns {{px:number, py:number, pz:number, yaw:number, scale:number}}
 */
export function bladeTransform(x, y, z) {
  const yaw = hash01(x, z, 0) * YAW_MAX;
  const scale = SCALE_MIN + hash01(x, z, 1) * (SCALE_MAX - SCALE_MIN);
  return {
    px: x + signed(x, z, 2) * JITTER_MAX,
    // base-anchored: the quad is centre-origin, so the lift scales with the blade. See note 1.
    py: y + (BLADE_HEIGHT / 2) * scale,
    pz: z + signed(x, z, 3) * JITTER_MAX,
    yaw,
    scale
  };
}

/**
 * Per-blade colour MULTIPLIER (see note 2 — never a colour). Mean is 1.0 on every channel, so this
 * adds spread without moving the palette.
 *
 * @returns {{r:number, g:number, b:number}}
 */
export function bladeTint(x, z) {
  const value = signed(x, z, 4) * TINT_VALUE;
  const hue = signed(x, z, 5) * TINT_HUE;
  return {
    r: BASE_TINT.r + value + hue,
    g: BASE_TINT.g + value,
    b: BASE_TINT.b + value - hue
  };
}
