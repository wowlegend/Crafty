// _lightModel.js — the arithmetic the colour gates measure with. A test helper, not a check file: it asserts nothing;
// the gates that import it carry the assertions.
//
// What it models, from the light rig to the pixel. Every step is transcribed from the code that runs, and cited:
//
//   1. THE RIG (three r172, physically-correct lights). A diffuse face takes `BRDF_Lambert = diffuseColor / PI`
//      (node_modules/three/src/renderers/shaders/ShaderChunk/common.glsl.js) times its irradiance: the ambient
//      colour x intensity, the hemisphere `mix(ground, sky, 0.5 * dot(n, up) + 0.5)` x intensity
//      (lights_pars_begin.glsl.js), and the one directional key x max(0, dot(n, L)). The stone is the terrain's
//      material: MeshStandardMaterial on world/terrainSurface.js (metalness 0), so its diffuse colour is the albedo.
//      THE DIRECT SPECULAR is added only when a `viewDir` is given (Task 3b's grey card): three's `RE_Direct_Physical`
//      adds `irradiance * BRDF_GGX(L, V, N, material)` (lights_physical_pars_fragment.glsl.js: F_Schlick in its
//      exp2 form from common.glsl.js, V_GGX_SmithCorrelated, D_GGX, alpha = roughness^2; specularColor =
//      mix(0.04, albedo, metalness), specularF90 = 1, lights_physical_fragment.glsl.js), transcribed below with the
//      terrain's roughness. It is view-dependent, and at a grazing view toward the key it is not small: a camera 15 deg
//      above an up face, looking toward the sun, adds displayed L 0.086 at noon and 0.093 at f 0.30 (this model at
//      metalness 0; 0.106 and 0.114 at the 0.1 it replaced), because Schlick's Fresnel, not the metalness, sets the
//      grazing lobe. The B-gates pass no view, so they measure the diffuse face alone; specular
//      only ADDS light, in the key's colour. The indirect specular is 0: with no envMap, `RE_IndirectSpecular_Physical`
//      is fed iblIrradiance = 0 (lights_fragment_maps.glsl.js), so the indirect term is exactly the Lambert below.
//   2. THE TERRAIN'S AO FLOOR. A fully occluded corner multiplies the ALBEDO by `uAoFloor` before lighting
//      (Terrain.jsx: `diffuseColor.rgb *= mix(uAoFloor, vec3(1.0), clamp(vAO / 3.0, 0.0, 1.0))`, at vAO = 0).
//   3. THE AERIAL HAZE at full distance (render/aerialPerspective.js, the same constants imported here).
//   4. THE POST CHAIN, which is what the player sees (GameScene.jsx: HueSaturation -> BrightnessContrast -> Bloom ->
//      SMAA -> ToneMapping NEUTRAL -> Vignette), postprocessing 6.39.5:
//        HueSaturation in LINEAR, then `min(color, 1.0)` (node_modules/postprocessing/build/index.js, the
//        hue-saturation fragment); hue 0 makes its rotation the identity.
//        BrightnessContrast in sRGB: its `inputColorSpace` is SRGBColorSpace (:4455), so the EffectPass inserts
//        `sRGBTransferOETF` before it (:15477) and `sRGBToLinear` before the next effect, whose input is linear.
//        three's OETF takes a negative channel down its linear branch; the model clamps it at 0 first.
//        NEUTRAL: three r172 `NeutralToneMapping`, transcribed line for line
//        (node_modules/three/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js), exposure 1.
//      Bloom adds light only above its threshold; SMAA and vignette are below the gates' resolution at the
//      centre of the frame. All three are left out. The framebuffer clamps to [0, 1], and so does the model.
//
// OKLab/OKLCH from linear sRGB (Ottosson's matrices). Hue in degrees, [0, 360).
import * as THREE from 'three';
import { AERIAL_DESAT, AERIAL_HAZE } from '../../src/render/aerialPerspective.js';
import { TERRAIN_SURFACE } from '../../src/world/terrainSurface.js';

export const STONE_HEX = '#8C8C8C';
export const STONE_METALNESS = TERRAIN_SURFACE.metalness;

/** sRGB hex -> linear [r, g, b], through three's ColorManagement (the same conversion the game's colours take). */
export function linearFromHex(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

/** A THREE.Color (or an [r, g, b]) -> [r, g, b], linear. */
export function rgb(c) {
  return Array.isArray(c) ? [c[0], c[1], c[2]] : [c.r, c.g, c.b];
}

const scale = (v, k) => [v[0] * k, v[1] * k, v[2] * k];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const STONE_ROUGHNESS = TERRAIN_SURFACE.roughness; // a flat face adds no geometryRoughness

const STONE_DIFFUSE = scale(linearFromHex(STONE_HEX), 1 - STONE_METALNESS);
const STONE_F0 = linearFromHex(STONE_HEX).map((a) => 0.04 + (a - 0.04) * STONE_METALNESS); // mix(0.04, albedo, metal)
const sat = (x) => Math.min(1, Math.max(0, x));

/** three r172 BRDF_GGX for the stone (isotropic, no iridescence), per channel. n, l, v unit. */
function brdfGGX(n, l, v) {
  const alpha = STONE_ROUGHNESS * STONE_ROUGHNESS, a2 = alpha * alpha;
  const h = unit(add(l, v));
  const nl = sat(dot(n, l)), nv = sat(dot(n, v)), nh = sat(dot(n, h)), vh = sat(dot(v, h));
  const fresnel = Math.pow(2, (-5.55473 * vh - 6.98316) * vh);
  const gv = nl * Math.sqrt(a2 + (1 - a2) * nv * nv), gl = nv * Math.sqrt(a2 + (1 - a2) * nl * nl);
  const vis = 0.5 / Math.max(gv + gl, 1e-6);
  const den = nh * nh * (a2 - 1) + 1;
  const d = a2 / (Math.PI * den * den);
  return STONE_F0.map((f0) => (f0 * (1 - fresnel) + fresnel) * vis * d);
}

/**
 * The rig's irradiance terms, already multiplied by their intensities. Two frame shapes:
 *   a ScriptFrame (render/colourScript.js sampleScript): `ambient.color`, intensities BEFORE `exposure`, so the
 *     model multiplies by `frame.exposure`; the key is `frame.sun` when `frame.s >= 0`, else `frame.moon`.
 *   a SkyFrame (render/mood.js sampleMood): `ambient` is the colour, intensities already carry the exposure, and
 *     the key is `keyColor` x `keyIntensity`.
 */
export function rigOf(frame) {
  if (frame.ambient && frame.ambient.color) {
    const e = frame.exposure;
    const key = frame.s >= 0 ? frame.sun : frame.moon;
    return {
      ambient: scale(rgb(frame.ambient.color), frame.ambient.intensity * e),
      hemiSky: scale(rgb(frame.hemi.sky), frame.hemi.intensity * e),
      hemiGround: scale(rgb(frame.hemi.ground), frame.hemi.intensity * e),
      key: scale(rgb(key.color), key.intensity * e),
      aoFloor: rgb(frame.aoFloor),
    };
  }
  return {
    ambient: scale(rgb(frame.ambient), frame.ambientIntensity),
    hemiSky: scale(rgb(frame.hemiSky), frame.hemiIntensity),
    hemiGround: scale(rgb(frame.hemiGround), frame.hemiIntensity),
    key: scale(rgb(frame.keyColor), frame.keyIntensity),
    aoFloor: rgb(frame.aoFloor),
  };
}

/** The irradiance a face of normal `n` takes from the rig; `keyDir` null = in shadow (indirect only). */
function irradiance(rig, n, keyDir) {
  const nn = unit(n);
  let e = add(rig.ambient, mix(rig.hemiGround, rig.hemiSky, 0.5 * nn[1] + 0.5));
  if (keyDir) e = add(e, scale(rig.key, Math.max(0, dot(nn, unit(keyDir)))));
  return e;
}

/**
 * The irradiance a point light (`{ color, intensity, distance }`, decay 2) puts on an up face `r` metres out from the
 * foot of the light, the light `height` above the face: three r172's `getPointLightInfo` with `getDistanceAttenuation`
 * (lights_pars_begin.glsl.js), times dot(n, L). Linear [r, g, b], in the same units as `rigOf`'s terms.
 */
export function pointLightOnUpFace(light, height, r) {
  const d = Math.hypot(height, r);
  const falloff = (1 / Math.max(d * d, 0.01)) * (light.distance > 0 ? sat(1 - (d / light.distance) ** 4) ** 2 : 1);
  return scale(linearFromHex(light.color), light.intensity * falloff * (height / d));
}

/** The indirect irradiance on an up face (ambient + hemisphere sky), linear [r, g, b]. */
export function indirectOnUpFace(frame) {
  return irradiance(rigOf(frame), [0, 1, 0], null);
}

/**
 * Linear radiance of the grey stone face under `frame`, before the post chain. With a `viewDir` (unit, from the face
 * TOWARD the camera) and a lit key, the key's direct specular is added, as three adds it; without one, the diffuse face.
 * `extra` is further irradiance on the face (a point light's, from `pointLightOnUpFace`), diffuse only. `albedo` (hex)
 * replaces the grey card's diffuse colour; the specular stays the grey card's.
 */
export function stoneFaceUnder(frame, { normal = [0, 1, 0], keyDir = null, viewDir = null, extra = null, albedo = null } = {}) {
  const rig = rigOf(frame);
  const e = extra ? add(irradiance(rig, normal, keyDir), extra) : irradiance(rig, normal, keyDir);
  const base = albedo ? scale(linearFromHex(albedo), 1 - STONE_METALNESS) : STONE_DIFFUSE;
  const diffuse = scale(mul(base, e), 1 / Math.PI);
  if (!keyDir || !viewDir) return diffuse;
  const n = unit(normal), l = unit(keyDir);
  return add(diffuse, mul(scale(rig.key, sat(dot(n, l))), brdfGGX(n, l, unit(viewDir))));
}

/** A fully occluded stone corner's up face, in shadow: the albedo multiplied by the frame's AO floor first. */
export function aoOccludedStone(frame) {
  const rig = rigOf(frame);
  return scale(mul(mul(STONE_DIFFUSE, rig.aoFloor), irradiance(rig, [0, 1, 0], null)), 1 / Math.PI);
}

/** The aerial haze at full distance (aerialGlsl): toward grey by AERIAL_DESAT, then toward the horizon by AERIAL_HAZE. */
export function hazed(c, horizon) {
  const alum = c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
  return mix(mix(c, [alum, alum, alum], AERIAL_DESAT), rgb(horizon), AERIAL_HAZE);
}

const oetf = (c) => { const v = Math.max(0, c); return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 0.41666) - 0.055; };
const eotf = (c) => (c <= 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4));

/** three r172 NeutralToneMapping, exposure 1. */
export function neutralToneMap(c) {
  const startCompression = 0.8 - 0.04, desaturation = 0.15;
  let col = [c[0], c[1], c[2]];
  const x = Math.min(col[0], col[1], col[2]);
  const offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  col = col.map((v) => v - offset);
  const peak = Math.max(col[0], col[1], col[2]);
  if (peak < startCompression) return col;
  const d = 1 - startCompression;
  const newPeak = 1 - (d * d) / (peak + d - startCompression);
  col = col.map((v) => (v * newPeak) / peak);
  const g = 1 - 1 / (desaturation * (peak - newPeak) + 1);
  return mix(col, [newPeak, newPeak, newPeak], g);
}

/** What reaches the screen, as linear [r, g, b] in [0, 1]: the grade, then NEUTRAL, then the framebuffer clamp. */
export function displayed(c, grade) {
  const sat = grade.saturation, br = grade.brightness, ct = grade.contrast;
  // HueSaturation (linear), then min(color, 1).
  const avg = (c[0] + c[1] + c[2]) / 3;
  const k = sat > 0 ? 1 - 1 / (1.001 - sat) : -sat;
  let col = c.map((v) => Math.min(1, v + (avg - v) * k));
  // BrightnessContrast in sRGB, then back to linear.
  col = col.map((v) => {
    let s = oetf(v) + br - 0.5;
    s = ct > 0 ? s / (1 - ct) : s * (1 + ct);
    return eotf(s + 0.5);
  });
  return neutralToneMap(col).map((v) => Math.min(1, Math.max(0, v)));
}

/** Linear sRGB [r, g, b] -> { L, C, h, a, b } in OKLab / OKLCH (h in degrees, [0, 360)). */
export function oklch(c) {
  const [r, g, b] = c;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, B);
  const h = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { L, C, h, a: A, b: B };
}

/** Linear [r, g, b] -> displayed sRGB bytes, for failure messages a person can picture. */
export function bytes(c) {
  return c.map((v) => Math.round(Math.min(1, Math.max(0, oetf(v))) * 255));
}
