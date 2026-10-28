import { describe, it, expect } from 'vitest';
import { ShaderLib } from 'three';
import {
  patchOceanFragment, oceanLookUniforms, writeOceanLight, FOAM_HEX, GLINT_GAIN,
} from '../../src/render/oceanLook.js';
import { sampleMood } from '../../src/render/mood.js';
import { stoneFaceUnder, displayed, linearFromHex } from './_lightModel.js';
import { carriersOf } from './_srcWalk.js';

/**
 * The ocean's foam, sky Fresnel and glint take the hour's light, under the fog (plan 2026-10-28-crafty-sota-reset
 * item #42, unit W2-A). They were spliced after `<dithering_fragment>`: never fogged, the Fresnel toward a fixed teal,
 * the highlight off a fixed vector, and the foam mixed toward white AFTER lighting, so a midnight sea carried crests
 * at full white.
 *
 * The patch runs here on three r172's real ShaderLib.standard fragment shader (an import, not a file read), so the
 * chunk order these assertions read is the one the GPU compiles. The foam's lit brightness is measured on the colour
 * model the light gates use (_lightModel.js: the rig, the grade and NEUTRAL), under the real sky frames.
 *
 * Mutation-Proof: recorded on the commit that added this file.
 *
 * BLIND SPOT: nothing here compiles GLSL; a browser does (prod-smoke loads the shipped bundle; the live eye-level
 * frames at 0.75 are the acceptance). The model lights the foam as an up face; wave normals vary.
 */
const src = ShaderLib.standard.fragmentShader;
const out = patchOceanFragment(src);
const main = out.indexOf('void main');
const at = (s) => {
  const i = out.indexOf(s, main);
  expect(i, `${s} not found in main()`).toBeGreaterThanOrEqual(0);
  return i;
};
const Y = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

describe('the ocean fragment patch: where each term sits in three r172 standard', () => {
  it('every include of the input survives exactly once', () => {
    const count = (s) => (s.match(/#include </g) || []).length;
    expect(count(src)).toBeGreaterThan(30);
    expect(count(out)).toBe(count(src));
  });

  it('foam is written to diffuseColor between <color_fragment> and <lights_fragment_begin>, so the rig lights it', () => {
    const foam = at('diffuseColor.rgb = mix(diffuseColor.rgb, uFoamColor, oFoam);');
    expect(foam).toBeGreaterThan(at('#include <color_fragment>'));
    expect(foam).toBeLessThan(at('#include <lights_fragment_begin>'));
  });

  it('the sky Fresnel and the glint sit after <opaque_fragment> and before <fog_fragment>', () => {
    const fres = at('mix(gl_FragColor.rgb, skyHorizon,');
    const glint = at('gl_FragColor.rgb += uKeyLight * oGlint');
    for (const term of [fres, glint]) {
      expect(term).toBeGreaterThan(at('#include <opaque_fragment>'));
      expect(term).toBeLessThan(at('#include <fog_fragment>'));
    }
  });

  it('nothing ocean follows <dithering_fragment>, and no fixed colour stands in for the hour', () => {
    const tail = out.slice(at('#include <dithering_fragment>'));
    expect(tail).not.toMatch(/oFoam|oFres|oGlint|skyHorizon|uKeyLight|uFoamColor|vFoam/);
    const body = out.slice(main);
    expect(body, 'a vec3 literal is mixed into the colour').not.toMatch(/mix\(gl_FragColor\.rgb,\s*vec3\(/);
    expect(body, 'a vec3 literal is added to the colour').not.toMatch(/gl_FragColor\.rgb \+= vec3\(/);
  });

  it('the glint follows the key light in view space, and foam suppresses the glint, the Fresnel and the emissive', () => {
    expect(out).toMatch(/vec3 oKey = normalize\(\(viewMatrix \* vec4\(uKeyDir, 0\.0\)\)\.xyz\);/);
    expect(out).toMatch(/dot\(reflect\(-oV, oN\), oKey\)/);
    expect(out).toMatch(/skyHorizon, oFres \* [\d.]+ \* \(1\.0 - oFoam\)\)/);
    expect(out).toMatch(/uKeyLight \* oGlint \* \(1\.0 - oFoam\)/);
    expect(at('totalEmissiveRadiance *= 1.0 - oFoam;')).toBeLessThan(at('#include <lights_fragment_begin>'));
  });
});

describe('the ocean takes the hour from the sky frame', () => {
  it('the uniforms carry the frame: the sun by day, the moon at night, the dark horizon at midnight', () => {
    const u = oceanLookUniforms();
    const noon = sampleMood(0, 0.25);
    writeOceanLight(u, noon);
    expect(u.uKeyDir.value.toArray()).toEqual(noon.keyDir.slice());
    const noonKey = Y(u.uKeyLight.value.toArray()), noonSky = Y(u.skyHorizon.value.toArray());
    const night = sampleMood(0, 0.75);
    expect(night.keyIsMoon, 'SETUP: the midnight key is not the moon').toBe(true);
    writeOceanLight(u, night);
    expect(u.uKeyDir.value.toArray()).toEqual(night.keyDir.slice());
    const k = u.uKeyLight.value.toArray(), want = night.keyColor.toArray().map((c) => c * night.keyIntensity * GLINT_GAIN);
    for (let c = 0; c < 3; c++) expect(k[c]).toBeCloseTo(want[c], 6);
    expect(Y(k) / noonKey, 'the midnight glint is not dimmer than noon').toBeLessThan(0.5);
    expect(Y(u.skyHorizon.value.toArray()) / noonSky, 'the midnight Fresnel target is not dark').toBeLessThan(0.2);
  });

  it('the noon glint reads like the old fixed band: same luminance within 15%', () => {
    const u = writeOceanLight(oceanLookUniforms(), sampleMood(0, 0.25));
    const old = Y([0.16, 0.26, 0.27]);
    expect(Y(u.uKeyLight.value.toArray()) / old).toBeGreaterThan(0.85);
    expect(Y(u.uKeyLight.value.toArray()) / old).toBeLessThan(1.15);
  });

  it('lit foam at midnight displays at most 0.6 of its noon luminance; unlit foam held about 1.0', () => {
    const shown = (f, lit) => {
      const fr = sampleMood(0, f);
      const c = lit ? stoneFaceUnder(fr, { keyDir: fr.keyDir, albedo: FOAM_HEX }) : linearFromHex(FOAM_HEX);
      return Y(displayed(c, fr.grade));
    };
    // The instrument sees the defect: foam that bypasses the rig is as bright at midnight as at noon.
    expect(shown(0.75, false) / shown(0.25, false)).toBeGreaterThan(0.95);
    const ratio = shown(0.75, true) / shown(0.25, true);
    console.log(`[ocean-look] lit foam Y noon ${shown(0.25, true).toFixed(3)} midnight ${shown(0.75, true).toFixed(3)} (ratio ${ratio.toFixed(2)})`);
    expect(ratio).toBeLessThanOrEqual(0.6);
  });
});

describe('Ocean.jsx uses the patch and the frame (weak, structural)', () => {
  it('its onBeforeCompile runs the patch, and its frame loop writes the hour', () => {
    expect(carriersOf(/shader\.fragmentShader = patchOceanFragment\(shader\.fragmentShader\);/)).toEqual(['render/Ocean.jsx']);
    expect(carriersOf(/writeOceanLight\(lookUniforms, skyFrameRef\.current\);/)).toEqual(['render/Ocean.jsx']);
    expect(carriersOf(/Object\.assign\(shader\.uniforms, lookUniforms\);/)).toEqual(['render/Ocean.jsx']);
    expect(carriersOf(/#include <dithering_fragment>/), 'a file splices after dithering again').not.toContain('render/Ocean.jsx');
  });
});
