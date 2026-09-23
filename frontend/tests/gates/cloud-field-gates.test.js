import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  cloudGlsl, cloudTint, cloudShadowGlsl, CLOUD_PARAMS, CLOUD_HEIGHT, CLOUD_SCALE, CLOUD_THRESHOLD, CLOUD_SOFTNESS,
  CLOUD_WIND, CLOUD_SHADOW_STRENGTH,
} from '../../src/render/cloudField.js';
import { makeSkyDomeMaterial } from '../../src/render/skyDome.js';
import { sampleMood } from '../../src/render/mood.js';
import { carriersOf } from './_srcWalk.js';

/**
 * THE CLOUD FIELD — one definition for the clouds you see and the shadows they cast (EXTERNAL-BASELINE #5,
 * plan Tasks 3-4).
 *
 * The sky was an empty three-stop gradient. The GLSL is generated from named constants so a tuned value
 * cannot drift from the shader, and it takes its parameters so this can drive values the constants do not
 * hold — a literal typed back into the template cannot pass that.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, each observed RED:
 *   M1 cloudField: the height typed as a literal 220.0                    -> driven-params RED
 *   M2 cloudField: the threshold band loses its softness (lo = hi)        -> soft-edge RED
 *   M3 cloudField: plausible-wrong — wind not applied (drift frozen)      -> driven-params RED
 *   M4 cloudField: plausible-wrong — a LINEAR day/night blend (the first draft: night clouds 6x their sky) -> night RED
 *   M5 cloudField: plausible-wrong — the night body not lifted off the sky (x1.0) -> night "does not read" RED
 *   (the first version of these tests asserted only day > dusk > boss ordering and dusk-warmer-than-day; the
 *   sky palette alone satisfies both, so two mutants survived and the tests became design anchors. A
 *   "lighter than its sky" anchor then survived the unlifted night body too, because the day body's residue
 *   alone clears it — hence twice.)
 *   M6 skyDome: the cloud field no longer spliced                         -> splice RED
 *   M7 skyDome: plausible-wrong — the ray cast from the origin, not the camera -> ray RED
 *   M8 skyDome: the above-horizon mask dropped from the composite         -> composite RED
 *   M9 skyDome: clouds composited BEFORE the stars/moon                   -> order RED
 *   M10 Atmosphere: plausible-wrong — uTime from performance.now()        -> capture-clock RED (structural)
 *   Task 4 (the shadows):
 *   M12 plausible-wrong — the shadow multiplies the albedo (darkens caves and shade too) -> direct-only RED
 *   M13 plausible-wrong — sampled straight up, not toward the sun        -> sun-ray RED
 *   M14 the strength typed as a literal                                  -> driven-strength RED
 *   M15 plausible-wrong — the indirect light dimmed as well              -> direct-only RED
 *   M16 Terrain: uTime from performance.now()                            -> structural RED
 *   M17 Terrain: the sun recomputed as a constant                        -> structural RED
 *   M18 Atmosphere: the resolved sun never published                     -> structural RED
 *   M19 Terrain: the injection spliced nowhere                           -> structural RED
 *   M20 skyDome: cloud cover ignored in the composite                     -> studio-reset RED
 *   M21 Atmosphere: the studio cards not reset to 0                       -> studio-reset RED (structural)
 *   M22 the terrain shadow ignores the sky's cover (review)               -> no-shadow-without-cloud RED
 *   M23 no sun-elevation fade (review: a grazing sun samples ~3,400 m away) -> low-sun RED
 *   M24 Terrain never reads the cover                                     -> structural RED
 *
 * BLIND SPOT: the GLSL is not compiled here — only a browser does that (the capture). How the clouds and
 * their shadows LOOK is judged from the captured frames. Atmosphere's and Terrain's per-frame writes are
 * asserted by source shape (weak). Whether a shadow lands under ITS cloud is geometry this cannot see.
 */
describe('cloud field constants', () => {
  it('are finite and in range', () => {
    expect(CLOUD_HEIGHT).toBeGreaterThan(100);
    expect(CLOUD_SCALE).toBeGreaterThan(0);
    expect(CLOUD_THRESHOLD).toBeGreaterThan(0);
    expect(CLOUD_THRESHOLD).toBeLessThan(1);
    expect(CLOUD_SOFTNESS).toBeGreaterThan(0);
    expect(CLOUD_WIND.every(Number.isFinite)).toBe(true);
    expect(CLOUD_SHADOW_STRENGTH).toBeGreaterThan(0);
    expect(CLOUD_SHADOW_STRENGTH).toBeLessThanOrEqual(0.6);
  });
});

describe('cloudGlsl — generated from its parameters, by value', () => {
  it('defines the two functions both consumers call', () => {
    const g = cloudGlsl();
    expect(g).toMatch(/float cloudDensity\(vec2 p\)/);
    expect(g).toMatch(/vec2 cloudPlane\(vec3 origin, vec3 dir, float t\)/);
  });

  it('a driven parameter set lands in the GLSL — a typed literal cannot', () => {
    const g = cloudGlsl({ ...CLOUD_PARAMS, height: 999, wind: [7, -2], scale: 0.25 });
    expect(g).toContain('(999.000000 - origin.y)');
    expect(g).toContain('vec2(7.000000, -2.000000) * t');
    expect(g).toContain('hit * 0.250000');
  });

  it('the edge is SOFT: the smoothstep band straddles the threshold by the softness', () => {
    const g = cloudGlsl({ ...CLOUD_PARAMS, threshold: 0.5, softness: 0.1 });
    expect(g).toContain('smoothstep(0.400000, 0.600000, n)');
  });
});

// ─── Task 3: the clouds you SEE (the sky dome) ────────────────────────────────────────────────────────────
const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

describe('cloudTint — the clouds take the mood, they are not painted white', () => {
  // Design anchors, not the formula: a sunlit cloud is bright; a night cloud is a SHAPE, not a light —
  // dimmer than a lamp, and at least twice its sky's luminance or it does not read; the boss sky's are dark.
  const at = (mood) => { const m = sampleMood(mood); return { m, t: cloudTint(m, new THREE.Color()) }; };

  it('day clouds are bright', () => {
    expect(lum(at(0).t)).toBeGreaterThan(0.7);
  });

  it('night clouds are a shape, not a glow: lighter than their sky, far dimmer than day', () => {
    const { m, t } = at(1);
    expect(lum(t), 'a night cloud brighter than a third of a day cloud reads as a lamp').toBeLessThan(0.3);
    expect(lum(t), 'a night cloud under twice its sky\'s luminance does not read as a shape').toBeGreaterThan(2 * lum(m.skyMid));
  });

  it('the boss sky\'s clouds are dark', () => {
    expect(lum(at(2).t)).toBeLessThan(0.1);
  });

  it('never leaves displayable range, at any mood', () => {
    for (let mood = 0; mood <= 2; mood += 0.25) {
      const { t: c } = at(mood);
      for (const v of [c.r, c.g, c.b]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
    }
  });
});

describe('the sky dome draws the cloud field', () => {
  const mat = makeSkyDomeMaterial();

  it('carries the cloud uniforms, and the shader IS the shared field (spliced, not re-typed)', () => {
    expect(mat.uniforms.uTime.value).toBe(0);
    expect(mat.uniforms.uCloudTint.value).toBeInstanceOf(THREE.Color);
    expect(mat.fragmentShader).toContain(cloudGlsl());
  });

  it('casts the view ray from the CAMERA to the cloud plane, drifted by uTime', () => {
    expect(mat.fragmentShader).toMatch(/cloudPlane\(cameraPosition, normalize\(vDir\), uTime\)/);
  });

  it('clouds live above the horizon only, and are composited over the sun and stars', () => {
    const fs = mat.fragmentShader;
    const up = fs.indexOf('float cloudUp = smoothstep(');
    expect(up, 'no above-horizon mask: clouds would be drawn below the horizon').toBeGreaterThan(-1);
    const composite = fs.indexOf('col = mix(col, cloudCol, cloudD * cloudUp');
    expect(composite, 'the cloud composite is missing or not masked').toBeGreaterThan(-1);
    expect(composite, 'clouds composited before the sun/stars would be painted over by them').toBeGreaterThan(fs.indexOf('uStar > 0.001'));
  });

  it('the studio subject cards reset cloud cover to a DECLARED 0; everywhere else it is 1', () => {
    // At y~146 the studio camera sits ~74 m under the cloud plane: clouds loom behind the subject and put a
    // white band behind pale spell VFX, defeating the card. A reset to a declared value, never an early
    // return (AGENTS.md capture rule); the explore frames still gate the clouds.
    expect(mat.uniforms.uCloudCover.value).toBe(1);
    expect(mat.fragmentShader).toContain('col = mix(col, cloudCol, cloudD * cloudUp * 0.92 * uCloudCover);');
    expect(carriersOf(/u\.uCloudCover\.value = st\.captureStudio \? 0 : 1;/)).toEqual(['render/Atmosphere.jsx']);
  });

  it('Atmosphere feeds the drift from the CAPTURE clock and the tint from the mood (weak, structural)', () => {
    // performance.now() here would make every gated sky frame depend on how long the process took to boot.
    expect(carriersOf(/u\.uTime\.value = frameElapsed\(state\.clock\.elapsedTime\)/)).toEqual(['render/Atmosphere.jsx']);
    expect(carriersOf(/cloudTint\(m, u\.uCloudTint\.value\)/)).toEqual(['render/Atmosphere.jsx']);
    expect(carriersOf(/\bmakeSkyDomeMaterial\b/).sort()).toEqual(['render/Atmosphere.jsx', 'render/skyDome.js']);
  });
});

// ─── Task 4: the shadows they CAST (the terrain) ──────────────────────────────────────────────────────────
describe('cloud shadows on the terrain — the sun\'s light only', () => {
  const g = cloudShadowGlsl();

  it('declares the same field the sky draws, and its own two uniforms', () => {
    expect(g.decl).toContain(cloudGlsl());
    expect(g.decl).toMatch(/uniform float uTime;/);
    expect(g.decl).toMatch(/uniform vec3 uSunDir;/);
  });

  it('samples the cloud plane along the ray TOWARD THE SUN from the lit point, on the shared clock', () => {
    // From the camera's view ray (the sky's) the shadow would sit under the cloud as YOU see it, not as the
    // sun does, and slide across the ground as you turned your head.
    expect(g.apply).toMatch(/cloudDensity\(cloudPlane\(vWorldPos, normalize\(uSunDir\), uTime\)\)/);
  });

  it('dims ONLY the direct light: the ambient and sky bounce keep a shaded valley readable', () => {
    expect(g.apply).toMatch(/reflectedLight\.directDiffuse \*= cloudShade;/);
    expect(g.apply).toMatch(/reflectedLight\.directSpecular \*= cloudShade;/);
    expect(g.apply, 'shadowing the albedo darkens caves and the shaded side too').not.toMatch(/diffuseColor/);
    expect(g.apply, 'shadowing the indirect light darkens what the sun never reached').not.toMatch(/indirect/);
  });

  it('no shadow without its cloud: the terrain obeys the SAME cover the sky does (review 2026-09-22)', () => {
    // The studio cards zero the sky's cover; a shadow that ignored it would drift over ground under a clear sky.
    expect(g.decl).toMatch(/uniform float uCloudCover;/);
    expect(g.apply).toMatch(/cloudDensity\([^;]*\) \* uCloudCover/);
    expect(carriersOf(/uniforms\.uCloudCover\.value = cloudCoverRef\.current/).sort()).toEqual(['world/FarField.jsx', 'world/Terrain.jsx']);
    expect(carriersOf(/cloudCoverRef\.current = u\.uCloudCover\.value/)).toEqual(['render/Atmosphere.jsx']);
  });

  it('the shadow fades as the sun nears the horizon, instead of sampling a cloud thousands of metres away', () => {
    // cloudPlane clamps the ray's y to 0.05, so a set or grazing sun samples ~3,400 m along its azimuth —
    // a cloud neither the player nor the light has anything to do with.
    expect(g.apply).toMatch(/smoothstep\(0\.05, 0\.25, normalize\(uSunDir\)\.y\)/);
  });

  it('the strength lands in the GLSL by value, and a driven strength moves it', () => {
    expect(cloudShadowGlsl(0.2).apply).toContain('1.0 - 0.200000 * cloudDensity(');
    expect(g.apply).toContain(`1.0 - ${CLOUD_SHADOW_STRENGTH.toFixed(6)} * cloudDensity(`);
  });

  it('the terrain AND the far field splice it after lights_fragment_end and feed the shared clock and the resolved sun (weak, structural)', () => {
    // Two materials since QUEUE R3.7: a far horizon without the shadows the land in front of it wears is a seam.
    const both = ['world/FarField.jsx', 'world/Terrain.jsx'];
    expect(carriersOf(/CLOUD_SHADOW_GLSL\.decl\b/).sort()).toEqual(both);
    expect(carriersOf(/'#include <lights_fragment_end>',\s*`\s*#include <lights_fragment_end>\s*\$\{CLOUD_SHADOW_GLSL\.apply\}/).sort()).toEqual(both);
    expect(carriersOf(/uniforms\.uTime\.value = frameElapsed\(state\.clock\.elapsedTime\)/).sort()).toEqual(both);
    // The sun direction is RESOLVED once, in Atmosphere (mood, arc, the capture pin); both materials read it.
    expect(carriersOf(/uniforms\.uSunDir\.value\.copy\(sunDirRef\.current\)/).sort()).toEqual(both);
    expect(carriersOf(/sunDirRef\.current\.copy\(u\.sunDir\.value\)/)).toEqual(['render/Atmosphere.jsx']);
  });
});
