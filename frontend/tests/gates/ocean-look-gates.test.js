import { describe, it, expect } from 'vitest';
import { ShaderLib } from 'three';
import {
  patchOceanFragment, oceanLookUniforms, writeOceanLight, FOAM_HEX, FOAM_WEIGHT, GLINT_GAIN, OCEAN_SURFACE,
} from '../../src/render/oceanLook.js';
import { sampleMood } from '../../src/render/mood.js';
import { stoneFaceUnder, displayed, linearFromHex, STONE_METALNESS } from './_lightModel.js';

/**
 * The ocean's foam, sky Fresnel and glint take the hour's light, under the fog. The patch runs here on three r172's
 * real ShaderLib.standard fragment shader (an import, not a file read), so the chunk order these assertions read is
 * the one the GPU compiles. The foam's brightness is measured on the colour model the light gates use (_lightModel.js:
 * the rig, the grade and NEUTRAL), under the real sky frames, for the foam position the patch actually has.
 *
 * That Ocean.jsx runs this patch and writes the hour each frame is checked on the shipped bundle by prod-smoke: the
 * ocean program must link, carry the patch's uniforms and hold a non-zero key light (scripts/ci/prod-smoke.mjs
 * WATCHED_PROGRAMS).
 *
 * BLIND SPOT: the model lights the foam and the sea as up faces (wave normals vary) and leaves out the view-dependent
 * terms: the material's own specular, equal on foam and sea, which lowers the contrast, and the sky Fresnel on the
 * sea, toward a midnight horizon darker than the water, which raises it at a grazing view. The live eye-level frames
 * at 0.75 are the acceptance.
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

  // The foam a full crest shows (vFoam 1), and the sea beside it, for the patch's foam position: written into the
  // albedo before lighting, the rig lights it; mixed into the output after lighting, it holds its own colour.
  const FOAM_LINE = 'diffuseColor.rgb = mix(diffuseColor.rgb, uFoamColor, oFoam);';
  const mixv = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
  const addv = (a, b) => a.map((x, i) => x + b[i]);
  const shown = (f, { foamLit }) => {
    const fr = sampleMood(0, f);
    // Lambert of a white dielectric under this rig; the model's stone carries the terrain's metalness, divided out.
    const white = stoneFaceUnder(fr, { keyDir: fr.keyDir, albedo: '#FFFFFF' }).map((v) => (v / (1 - STONE_METALNESS)) * (1 - OCEAN_SURFACE.metalness));
    const lit = (albedo) => albedo.map((a, i) => a * white[i]);
    const water = linearFromHex(OCEAN_SURFACE.color), foamColor = linearFromHex(FOAM_HEX);
    const emissive = linearFromHex(OCEAN_SURFACE.emissive).map((v) => v * OCEAN_SURFACE.emissiveIntensity);
    const sea = addv(lit(water), emissive);
    const foam = foamLit
      ? addv(lit(mixv(water, foamColor, FOAM_WEIGHT)), emissive.map((v) => v * (1 - FOAM_WEIGHT)))
      : mixv(sea, foamColor, FOAM_WEIGHT);
    return { foam: Y(displayed(foam, fr.grade)), sea: Y(displayed(sea, fr.grade)) };
  };

  it('a crest at midnight displays at most 0.6 of its noon luminance, and stands out from the sea no more than at noon', () => {
    const foamLit = at(FOAM_LINE) < at('#include <lights_fragment_begin>');
    expect(foamLit, 'SETUP: the patch no longer writes foam into the albedo before lighting, which is what this case models').toBe(true);
    expect(out, 'SETUP: the patch no longer dims the emissive under foam, which this case models').toContain('totalEmissiveRadiance *= 1.0 - oFoam;');
    // The instrument sees the defect: foam that bypasses the rig is as bright at midnight as at noon, and stands out
    // from the midnight sea twice as much as from the noon one.
    const unlitNoon = shown(0.25, { foamLit: false }), unlitNight = shown(0.75, { foamLit: false });
    expect(unlitNight.foam / unlitNoon.foam).toBeGreaterThan(0.95);
    expect(unlitNight.foam / unlitNight.sea).toBeGreaterThan(1.5 * (unlitNoon.foam / unlitNoon.sea));
    const noon = shown(0.25, { foamLit }), night = shown(0.75, { foamLit });
    console.log(`[ocean-look] crest Y noon ${noon.foam.toFixed(3)} midnight ${night.foam.toFixed(3)}; foam/sea noon ${(noon.foam / noon.sea).toFixed(2)} midnight ${(night.foam / night.sea).toFixed(2)}`);
    expect(night.foam / noon.foam).toBeLessThanOrEqual(0.6);
    expect(noon.foam / noon.sea, 'the crest does not read as foam at noon').toBeGreaterThan(1.3);
    expect(night.foam / night.sea).toBeLessThanOrEqual(noon.foam / noon.sea);
  });
});
