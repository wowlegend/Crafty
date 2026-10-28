// oceanLook.js — the ocean surface's shading terms (plan 2026-10-28-crafty-sota-reset item #42, unit W2-A), as a
// pure patch of three's standard fragment shader so a node test can run it on the real chunk order.
//
//   foam      written into `diffuseColor` before lighting, so the light rig lights it: white by day, moonlit grey at
//             night. Foam mixed in after lighting reads full white at every hour, a glow on a midnight sea.
//   Fresnel   toward the sky frame's horizon colour, so a grazing view reflects the sky of the hour, not a fixed teal.
//   glint     the key light's mirror image off the wave normal: the sun by day, the moon at night (the frame's key).
//   The Fresnel and the glint are added after `<opaque_fragment>` and before `<fog_fragment>`, so the fog covers
//   them like everything else; foam suppresses both, since foam is matte.
import * as THREE from 'three';

/** The foam's albedo (sRGB): near-white, so the light rig alone sets how bright it reads. */
export const FOAM_HEX = '#F2FAFB';
/** How far a full crest moves the water's albedo toward the foam's. */
export const FOAM_WEIGHT = 0.85;
/** Schlick-shaped sky reflection: weight at full grazing, and its falloff power. A surface-skimming camera sees most
 *  of the sheet near grazing, so a heavier weight washes the whole sea toward the sky colour. */
export const FRESNEL_WEIGHT = 0.2;
export const FRESNEL_POWER = 3;
/** The glint: smoothstep edges on dot(reflected view, key direction). */
export const GLINT_LOBE = Object.freeze([0.9, 0.99]);
/** The glint's colour per unit of key light (keyColor x keyIntensity). At the noon key this matches the luminance the
 *  fixed highlight band had, and it stays under the bloom threshold on lit water, which no glint is cleared to cross. */
export const GLINT_GAIN = 0.1;

/** The uniforms the patch declares, fresh. `skyHorizon` keeps the name render/aerialPerspective.js reads. */
export function oceanLookUniforms() {
  return {
    skyHorizon: { value: new THREE.Color(0.6, 0.75, 0.9) },
    uKeyDir: { value: new THREE.Vector3(0, 1, 0) },
    uKeyLight: { value: new THREE.Color(0, 0, 0) },
    uFoamColor: { value: new THREE.Color(FOAM_HEX) },
  };
}

/** Copy the hour's light from a sky frame (render/mood.js skyFrameRef.current) into the uniforms. */
export function writeOceanLight(uniforms, frame) {
  uniforms.skyHorizon.value.copy(frame.skyHorizon);
  uniforms.uKeyDir.value.fromArray(frame.keyDir);
  uniforms.uKeyLight.value.copy(frame.keyColor).multiplyScalar(frame.keyIntensity * GLINT_GAIN);
  return uniforms;
}

const f = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));

const DECLARATIONS = [
  'uniform vec3 skyHorizon;',
  'uniform vec3 uKeyDir;',
  'uniform vec3 uKeyLight;',
  'uniform vec3 uFoamColor;',
  'varying float vFoam;',
].join('\n');

const FOAM_INTO_ALBEDO = [
  `float oFoam = clamp(vFoam, 0.0, 1.0) * ${f(FOAM_WEIGHT)};`,
  'diffuseColor.rgb = mix(diffuseColor.rgb, uFoamColor, oFoam);',
  'totalEmissiveRadiance *= 1.0 - oFoam;',
].join('\n');

const SKY_AND_GLINT = [
  'vec3 oN = normalize(geometryNormal);',
  'vec3 oV = normalize(vViewPosition);',
  `float oFres = pow(1.0 - max(dot(oN, oV), 0.0), ${f(FRESNEL_POWER)});`,
  `gl_FragColor.rgb = mix(gl_FragColor.rgb, skyHorizon, oFres * ${f(FRESNEL_WEIGHT)} * (1.0 - oFoam));`,
  'vec3 oKey = normalize((viewMatrix * vec4(uKeyDir, 0.0)).xyz);',
  `float oGlint = smoothstep(${f(GLINT_LOBE[0])}, ${f(GLINT_LOBE[1])}, dot(reflect(-oV, oN), oKey));`,
  'gl_FragColor.rgb += uKeyLight * oGlint * (1.0 - oFoam);',
].join('\n');

function after(src, anchor, text) {
  const at = src.indexOf(anchor);
  if (at < 0 || src.indexOf(anchor, at + 1) >= 0) throw new Error(`patchOceanFragment: ${anchor} must occur exactly once`);
  return src.replace(anchor, `${anchor}\n${text}`);
}

/** Patch a MeshStandardMaterial fragment shader with the ocean's foam, sky Fresnel and key glint. Pure. */
export function patchOceanFragment(fragmentShader) {
  let out = `${DECLARATIONS}\n${fragmentShader}`;
  out = after(out, '#include <color_fragment>', FOAM_INTO_ALBEDO);
  out = after(out, '#include <opaque_fragment>', SKY_AND_GLINT);
  return out;
}
