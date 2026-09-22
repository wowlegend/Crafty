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
  // drei <Outlines> default mode (screenspace=false) -> `thickness` is ≈ constant
  // SCREEN PIXELS (resolution-buffer px), NOT world units. ~3-5px reads as a crisp
  // ink line at any distance (gameplay-robust). (drei's 0.05 default is for the
  // screenspace=true world-unit mode, which we don't use.)
  mob:  { thickness: 5 },
  boss: { thickness: 6 },
  prop: { thickness: 3 },
};

// --- 2-band toon gradient (memoized singleton) ---
// Intentionally process-lifetime: never disposed, shared by every toon material by design.
let _gradient = null;
export function getToonGradient() {
  if (_gradient) return _gradient;
  const s = Math.round(TOON.shadow * 255);
  const l = Math.round(TOON.lit * 255);
  // width=2,height=1 RGBA, NearestFilter -> crisp 2-band toon ramp sampled by .r
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

/**
 * BOSS EMISSIVE, BY SURFACE KIND — the art rule that stops the payoff reading as a plastic box.
 *
 * THE DEFECT (QUEUE B3 / Q15). The torso is a `<boxGeometry args={[3,2,4]} />` at `roughness={0.15}
 * metalness={0.9}` — a genuinely beautiful obsidian setup — and then an emissive of the phase colour at
 * 0.8 to 2.2 floods every bit of it. The obsidian stops being obsidian and the result reads as a flat
 * purple box: cheaper-looking than the trash mobs, and it is the climax of the entire run.
 *
 * AND THE RATIO WAS BACKWARDS. The WINGS — thin membranes, the one surface on the model that should
 * carry a phase glow because light passing through a membrane is what that glow imitates — sat at
 * `emissiveIntensityVal * 0.4`, i.e. forty percent of the armour plate. The surface that should have
 * been brightest was dimmer than the one that should have been darkest.
 *
 * THE RULE: emissive belongs on surfaces light can PASS THROUGH or ESCAPE FROM — membranes, eyes, the
 * seams between plates — and not on the plates themselves. A phase-coloured glow on obsidian reads as
 * plastic; the same colour on a membrane beside unflooded obsidian reads as HEAT. `bodyColor` is not
 * touched: the obsidian was always right, and "fix the boss" by lightening it would lose the one thing
 * that already worked.
 *
 * A plate keeps a low sheen rather than zero, so the phase still registers in its crevices and at
 * grazing angles — deleting it outright would flatten the boss the other way.
 *
 * The damage FLASH is deliberately kind-independent: it must dominate every surface at once or it stops
 * reading as a hit, which is the whole point of `src/render/bossFlash.test.js`.
 */
export const BOSS_FLASH_EMISSIVE = 3.0;

/** Per-phase emissive intensity by surface kind. Phase index is clamped, so an unknown phase is safe. */
export const BOSS_EMISSIVE = {
  plate:    [0.10, 0.18, 0.26], // obsidian armour — a sheen, never a flood
  membrane: [1.10, 1.80, 2.60], // wings — this is where the phase colour lives
};
// NO `eye` BAND, deliberately. I wrote one, and the gate caught it as dead config within the minute:
// the boss eyes are `<meshBasicMaterial color={eyeColor} toneMapped={false} />`. A basic material is
// unlit and untone-mapped, so the eyes are already the brightest thing on the model BY CONSTRUCTION,
// through a better mechanism than emissive — they cannot be dimmed by the scene and they never blow out
// the tone curve. Adding an emissive band for them would have been a table entry nothing reads, and the
// gate's first run also showed the entry was WRONG: at phase 2 it sat at 3.20 against a flash of 3.00,
// so a hit would have made the eyes DIMMER. Two defects in one unwired constant.

export function bossEmissiveIntensity(kind, bossPhase, isFlashing = false) {
  if (isFlashing) return BOSS_FLASH_EMISSIVE;
  const band = BOSS_EMISSIVE[kind] || BOSS_EMISSIVE.plate;
  const i = Math.min(band.length - 1, Math.max(0, Math.floor(Number(bossPhase) || 0)));
  return band[i];
}
