// Character render language (S1-B M2b): PURE single source of truth for the
// stylized mob/boss/prop look — a subtle 2-band toon gradient, a fresnel
// rim-light shader patch, the inverted-hull outline config, and the hit-flash
// material allow-list. No JSX / no R3F import here (keeps it node-testable);
// the React <MobToonMaterial> wrapper lives in MobToonMaterial.jsx.
import * as THREE from 'three';

// --- Art direction (re-tune here; Kevin's eye is the judge at re-baseline) ---
export const TOON = { shadow: 0.55, lit: 1.0 }; // 2 bands, hard step at dotNL=0.5
export const RIM = { color: '#bfe2ff', power: 2.5, strength: 0.35 }; // high tier only
export const OUTLINE = {
  color: '#0b0e14',
  mob:  { thickness: 0.025 },
  boss: { thickness: 0.04 },
  prop: { thickness: 0.02 },
};

// --- 2-band toon gradient (memoized singleton) ---
// Intentionally process-lifetime: never disposed, shared by every toon material by design.
let _gradient = null;
export function getToonGradient() {
  if (_gradient) return _gradient;
  const s = Math.round(TOON.shadow * 255);
  const l = Math.round(TOON.lit * 255);
  // width=2,height=1 RGBA, NearestFilter → crisp 2-band toon ramp sampled by .r
  const data = new Uint8Array([s, s, s, 255, l, l, l, 255]);
  const tex = new THREE.DataTexture(data, 2, 1, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  _gradient = tex;
  return tex;
}

// --- Fresnel rim-light: additive view-dependent edge glow on a toon material.
// Independent of emissive (which the mob hit-flash mutates), so no collision.
export function installRim(material, { color = RIM.color, power = RIM.power, strength = RIM.strength } = {}) {
  material.userData.rim = {
    uRimColor: { value: new THREE.Color(color) },
    uRimPower: { value: power },
    uRimStrength: { value: strength },
  };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = material.userData.rim.uRimColor;
    shader.uniforms.uRimPower = material.userData.rim.uRimPower;
    shader.uniforms.uRimStrength = material.userData.rim.uRimStrength;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimPower;\nuniform float uRimStrength;'
      )
      .replace(
        '#include <dithering_fragment>',
        // vNormal + vViewPosition are standard varyings in three lit materials (toon included)
        'float rimDot = 1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0);\n' +
        'gl_FragColor.rgb += uRimColor * pow(rimDot, uRimPower) * uRimStrength;\n' +
        '#include <dithering_fragment>'
      );
  };
  // All rim materials share ONE compiled program (perf): stable cache key.
  material.customProgramCacheKey = () => 'mobToonRim';
  return material;
}

// --- Hit-flash allow-list: only flash lit body materials; never the outline
// ShaderMaterial or the basic-material eyes. (Replaces the name!=="eye" guard.)
export function flashableMaterial(mat) {
  return !!mat && (mat.isMeshStandardMaterial === true || mat.isMeshToonMaterial === true);
}
