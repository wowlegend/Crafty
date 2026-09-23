// cloudField.js — THE cloud field: one definition read by the sky dome (clouds you see) and the terrain
// (the shadows they cast). EXTERNAL-BASELINE #5; plan Task 3/4.
//
// WHY ONE MODULE. The sky and the ground must agree — a shadow with no cloud above it, or a cloud with no
// shadow, reads as a rendering fault. Both sample the SAME density at the SAME horizontal plane: the sky
// along the view ray from the camera, the ground along the ray toward the sun. The GLSL is generated here
// with every tuning constant substituted BY VALUE, so a tuned constant cannot drift from the shader that
// uses it (the terrain tint's literal `[10]` is the failure this avoids — QUEUE R1.6).
//
// BOLD-FLAT, NOT VOLUMETRIC. Two octaves of value noise through a soft threshold: flat cloud shapes with a
// soft edge, no raymarching, a handful of ALU per fragment. The look is locked (S1-C); volumetric clouds
// are a WebGPU-era item (EXTERNAL-BASELINE §5).
//
// CAPTURE DETERMINISM: drift reads a time uniform the caller feeds from devtest/captureClock.frameElapsed,
// so a gated frame always shows the same clouds.
import * as THREE from 'three';
import { MOOD_SCALARS } from './mood.js';

/** Height of the cloud plane (world units, absolute y). Terrain surface sits around y 40-60. */
export const CLOUD_HEIGHT = 220;
/** Noise frequency per world unit on the cloud plane — larger shapes as this shrinks. */
export const CLOUD_SCALE = 1 / 150;
/** Noise value above which there is cloud (0..1). Higher = clearer sky. */
export const CLOUD_THRESHOLD = 0.56;
/** Half-width of the soft edge around the threshold. */
export const CLOUD_SOFTNESS = 0.08;
/** Drift, world units per second (x, z). */
export const CLOUD_WIND = [3.0, 1.2];
/** How much of the SUN's light a full cloud removes from the ground under it (0..1). Ambient is untouched. */
export const CLOUD_SHADOW_STRENGTH = 0.35;

/** The defaults, as one object — cloudGlsl takes it so a test can drive a value the constants do not hold. */
export const CLOUD_PARAMS = Object.freeze({
  height: CLOUD_HEIGHT, scale: CLOUD_SCALE, threshold: CLOUD_THRESHOLD, softness: CLOUD_SOFTNESS, wind: CLOUD_WIND,
});

const f = (n) => Number(n).toFixed(6);

const WHITE = new THREE.Color(1, 1, 1);
const DAY_SUN = MOOD_SCALARS.explore.sunIntensity;
const _night = new THREE.Color();

/**
 * The cloud colour for a sampled mood (render/mood.js sampleMood), written into `out`.
 *
 * By day, a sunlit body: the sky's mid colour carried most of the way to white. By night, the sky's own
 * colour lifted enough that a cloud still reads as a shape (about three times the sky's luminance), never
 * a glow. Blended by the sun's strength CUBED, so dusk (the sun at ~45%) is already night: a first version
 * blended linearly and put night clouds at six times the night sky's luminance, which is a lamp, not a
 * cloud. (A warm sun-tinted underside was tried and deleted: at the strength that kept night clouds dark
 * it changed nothing a test or an eye could tell apart.)
 */
export function cloudTint(m, out) {
  const day = THREE.MathUtils.clamp(m.sunIntensity / DAY_SUN, 0, 1);
  _night.copy(m.skyMid).multiplyScalar(1.8);
  out.copy(m.skyMid).lerp(WHITE, 0.72).lerp(_night, 1 - day * day * day);
  out.r = Math.min(1, out.r); out.g = Math.min(1, out.g); out.b = Math.min(1, out.b);
  return out;
}

/**
 * THE TERRAIN'S HALF: `{ decl, apply }` for the terrain material. `decl` (global scope) is the shared field
 * plus the two uniforms it needs; `apply` goes right after three's `lights_fragment_end` and dims ONLY the
 * direct light by the cloud density along the ray from the lit point TOWARD THE SUN — so a valley under a
 * cloud keeps its ambient and sky bounce (still readable), a cave is not darkened twice, and the shadow sits
 * where the sun puts it rather than under the cloud as the camera sees it.
 */
export function cloudShadowGlsl(strength = CLOUD_SHADOW_STRENGTH, p = CLOUD_PARAMS) {
  return {
    decl: ['uniform float uTime;', 'uniform vec3 uSunDir;', cloudGlsl(p)].join('\n'),
    apply: [
      `float cloudShade = 1.0 - ${f(strength)} * cloudDensity(cloudPlane(vWorldPos, normalize(uSunDir), uTime));`,
      'reflectedLight.directDiffuse *= cloudShade;',
      'reflectedLight.directSpecular *= cloudShade;',
    ].join('\n'),
  };
}

/**
 * GLSL defining `float cloudDensity(vec2 p)` (0 clear .. 1 full cloud, p already in noise space),
 * `float cloudNoise(vec2 p)` (the raw field it thresholds, with its band as CF_LO..CF_HI, so the sky can
 * shade a cloud's core without a second noise), and `vec2 cloudPlane(vec3 origin, vec3 dir, float t)`
 * (where a ray from `origin` along `dir` meets the cloud plane, drifted by wind, in noise space). Helper
 * names are prefixed to avoid colliding with three's shader chunks.
 */
export function cloudGlsl(p = CLOUD_PARAMS) {
  return `
float cfHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cfNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 q = fract(p);
  vec2 u = q * q * (3.0 - 2.0 * q);
  return mix(mix(cfHash(i), cfHash(i + vec2(1.0, 0.0)), u.x),
             mix(cfHash(i + vec2(0.0, 1.0)), cfHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
const float CF_LO = ${f(p.threshold - p.softness)};
const float CF_HI = ${f(p.threshold + p.softness)};
float cloudNoise(vec2 p) {
  return 0.65 * cfNoise(p) + 0.35 * cfNoise(p * 2.3 + vec2(17.0, 9.0));
}
float cloudDensity(vec2 p) {
  float n = cloudNoise(p);
  return smoothstep(${f(p.threshold - p.softness)}, ${f(p.threshold + p.softness)}, n);
}
vec2 cloudPlane(vec3 origin, vec3 dir, float t) {
  float k = (${f(p.height)} - origin.y) / max(dir.y, 0.05);
  vec2 hit = origin.xz + dir.xz * k + vec2(${f(p.wind[0])}, ${f(p.wind[1])}) * t;
  return hit * ${f(p.scale)};
}
`;
}
