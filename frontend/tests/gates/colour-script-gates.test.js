import { describe, it, expect } from 'vitest';
import { KEY_S, KEY_NAMES, SCRIPT_KEYS, solarPhase, scriptKeysAt, sampleScript } from '../../src/render/colourScript.js';
import { sunArcDirection, MOOD_SCALARS, sampleMood } from '../../src/render/mood.js';
import { HEARTH_FIRE } from '../../src/world/homeAnchor.js';
import { rgb, oklch, displayed, stoneFaceUnder, aoOccludedStone, hazed, bytes, pointLightOnUpFace } from './_lightModel.js';

/**
 * THE COLOUR SCRIPT: six keys on the sun's elevation `s`; night cool and readable, golden hour warm, a near-neutral
 * indirect light, and ground that never reads darker by day than under the midnight moon. Every colour bound is stated
 * on the DISPLAYED colour: the grade and three's NEUTRAL tone map run in `displayed()` (tests/gates/_lightModel.js),
 * because the linear radiance before them is not what the player sees (NEUTRAL's toe crushes a dark linear value far
 * below where it reads).
 *
 * The unit every perceptual bound here is stated in is VISIBLE_STEP, 0.02 in OKLab: about one just-visible difference.
 *
 * DENOMINATORS, each asserted: continuity 3601 steps x 47 fields; B1 360 fractions (two faces each); B2b 89 fractions x
 * 5 samples; every key checked at its own anchor (6); G1 361 fractions of the sun-up half x 2 albedos; G2 242
 * fractions of the two twilight blends x 8 samples; G2b 621 fractions of the night half x 3 distances from the fire.
 *
 * BLIND SPOT: nothing here renders. The model is checked against the screen by the grey card (light-script.spec.js)
 * and the look by the real-GPU lookbook. The Hearth's fire is modelled as its point light on the pad (G2, G2b), not as
 * the ember's bloom. This file cannot see whether anything CALLS sampleScript: that is the sky-frame gate and the e2e.
 * G2b reads this model's pad by the fire, not the screen: on the real GPU that pad reads maroon at midnight under every
 * warm fire tried, the shipped amber included, and not with the fire off, because what the fire adds to the dark pad
 * on screen carries far less green and blue than the light's own colour, which this model does not reproduce (the
 * frames and their numbers: DECISIONS 2026-11-01 (W3-A PR B) item 440; the open bug: registry
 * REVIEW:light:midnight-brazier-maroon).
 */

// The scalar fields a frame carries, flattened. `rising` and `f` are left out on purpose: `rising` flips at noon and
// midnight by definition (the branches meet there), and `f` wraps from 1 to 0.
const FIELD_COUNT = 47;
const COLOURS = ['sun.color', 'moon.color', 'ambient.color', 'hemi.sky', 'hemi.ground', 'fog.color', 'sky.top', 'sky.mid',
  'sky.horizon', 'glow.color', 'aoFloor'];
const SCALARS = ['sun.intensity', 'moon.intensity', 'ambient.intensity', 'hemi.intensity', 'fog.density', 'glow.strength',
  'grade.saturation', 'grade.brightness', 'grade.contrast', 'stars', 'motes', 'exposure', 'daylight', 's'];
const get = (o, path) => path.split('.').reduce((v, k) => v[k], o);
function snap(frame, colours = COLOURS, scalars = SCALARS) {
  const out = {};
  for (const p of colours) { const c = get(frame, p); out[`${p}.r`] = c.r; out[`${p}.g`] = c.g; out[`${p}.b`] = c.b; }
  for (const p of scalars) out[p] = get(frame, p);
  return out;
}
// The fields a KEY carries (the frame's derived fields — s, daylight, aoFloor — are not authored).
const KEY_COLOURS = COLOURS.filter((p) => p !== 'aoFloor');
const KEY_SCALARS = SCALARS.filter((p) => p !== 'daylight' && p !== 's');
const snapKey = (x) => snap(x, KEY_COLOURS, KEY_SCALARS);
const close = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, expect.closeTo(v, 6)]));
const STEP = (k) => (/\.(r|g|b)$/.test(k) ? 0.02 : k === 'fog.density' ? 0.0002 : 0.03);

// Where each key sits, as a cycle fraction on its own branch.
const TAU = 2 * Math.PI;
const ANCHOR_F = {
  night: 1 - Math.asin(-KEY_S.night) / TAU, // rising branch, below the horizon
  preDawn: 1 - Math.asin(-KEY_S.twilight) / TAU,
  sunrise: Math.asin(KEY_S.golden) / TAU,
  day: Math.asin(KEY_S.day) / TAU,
  sunset: 0.5 - Math.asin(KEY_S.golden) / TAU,
  dusk: 0.5 + Math.asin(-KEY_S.twilight) / TAU,
};

const UP = [0, 1, 0];
const NOON_POS = MOOD_SCALARS.explore.sunPos;
const sunDirAt = (f) => sunArcDirection(NOON_POS, f);
const NOON = sunDirAt(0.25);
const MOON_REF = [0.284, 0.53, -0.799]; // the moon at 32 deg (Task 2's MOON_NOON)
const towardSunHorizontal = (f) => { const d = sunDirAt(f), l = Math.hypot(d[0], d[2]); return [d[0] / l, 0, d[2] / l]; };
// The dome's colours reach the screen multiplied by the frame's exposure (decision 6, applied in sampleMood); so do
// the terrain's haze target and the scene background, which are the same `skyHorizon`. The fog colour is not scaled.
const dome = (fr, c) => rgb(c).map((v) => v * fr.exposure);
const skyAndFog = (fr) => [rgb(fr.fog.color), dome(fr, fr.sky.top), dome(fr, fr.sky.mid), dome(fr, fr.sky.horizon)];
// Every B-gate reads the DISPLAYED colour.
const D = (fr, c) => oklch(displayed(c, fr.grade));
const say = (fr, c) => { const d = D(fr, c); return `L ${d.L.toFixed(3)} C ${d.C.toFixed(3)} h ${d.h.toFixed(0)} bytes ${bytes(displayed(c, fr.grade))}`; };
// One just-visible difference in OKLab.
const VISIBLE_STEP = 0.02;
// MAROON, as displayed: a red-to-magenta hue with a colour to it, below mid lightness. A pink that displays light is not
// maroon, and a grey at any hue is not either.
const isMaroon = ({ L, C, h }) => C >= 0.04 && L < 0.5 && (h >= 330 || h < 30);

describe('the script: six keys, continuous, keyed on the sun', () => {
  it('six keys, every field', () => {
    expect(KEY_NAMES).toEqual(['night', 'preDawn', 'sunrise', 'day', 'sunset', 'dusk']);
    expect(Object.keys(SCRIPT_KEYS)).toEqual(KEY_NAMES);
    let n = 0;
    for (const k of KEY_NAMES) { const v = snapKey(SCRIPT_KEYS[k]); for (const [f, x] of Object.entries(v)) { expect(Number.isFinite(x), `${k} ${f}`).toBe(true); n++; } }
    expect(n).toBe(6 * (FIELD_COUNT - 5)); // a key carries every field but aoFloor (3), daylight and s
  });

  it('continuous: 3600 steps around the clock, wrap included', () => {
    let checked = 0;
    for (let i = 0; i <= 3600; i++) {
      const a = snap(sampleScript(i / 3600)), b = snap(sampleScript((i + 1) / 3600));
      for (const [k, v] of Object.entries(a)) { expect(Math.abs(v - b[k]), `${k} at ${i}`).toBeLessThanOrEqual(STEP(k)); checked++; }
    }
    console.log(`  colour script: continuity ${checked} field-steps checked`);
    expect(checked).toBe(3601 * FIELD_COUNT);
  });

  it('the branches meet: noon and midnight read the same from both sides', () => {
    expect(solarPhase(0.25 - 1e-9).rising).toBe(true);
    expect(solarPhase(0.75 - 1e-9).rising).toBe(false);
    expect(snap(sampleScript(0.25 - 1e-9))).toEqual(close(snap(sampleScript(0.25 + 1e-9))));
    expect(snap(sampleScript(0.75 - 1e-9))).toEqual(close(snap(sampleScript(0.75 + 1e-9))));
  });

  it('keys land where they are declared: each key, at its own anchor, IS that key', () => {
    expect(scriptKeysAt(0.02)).toMatchObject({ from: 'sunrise', to: 'day' }); // morning is the RISING branch
    expect(scriptKeysAt(0.48)).toMatchObject({ from: 'sunset', to: 'day' });  // the lookbook's golden frame
    expect(scriptKeysAt(0.55)).toMatchObject({ from: 'night', to: 'dusk' });  // blue hour, after sunset
    expect(scriptKeysAt(0.99)).toMatchObject({ from: 'preDawn', to: 'sunrise' }); // just before dawn
    let n = 0;
    for (const k of KEY_NAMES) { expect(snapKey(sampleScript(ANCHOR_F[k])), k).toEqual(close(snapKey(SCRIPT_KEYS[k]))); n++; }
    expect(n).toBe(6);
  });

  it('junk-cycle: NaN, Infinity, undefined, null, a string -> the day key at noon, every value finite', () => {
    for (const f of [NaN, Infinity, -Infinity, undefined, null, 'x']) {
      const fr = sampleScript(f);
      expect(fr.s, String(f)).toBeCloseTo(1, 9);
      expect(snapKey(fr), String(f)).toEqual(close(snapKey(SCRIPT_KEYS.day)));
      for (const [k, v] of Object.entries(snap(fr))) expect(Number.isFinite(v), `${String(f)} ${k}`).toBe(true);
    }
  });
});

// The bounds (review amendment 1, from the scratch model): the evidence navy is displayed C 0.092; a grey at displayed
// L 0.30 is about 46/255.
describe('the look, as DISPLAYED', () => {
  it('B1 flat ambient: a shadowed and a fully occluded stone up face are near-neutral at every hour', () => {
    // On the low tier (no god rays) these two terms are the whole shade of every face the key does not reach.
    let n = 0;
    for (let i = 0; i < 360; i++) {
      const fr = sampleScript(i / 360), cap = fr.s >= KEY_S.day ? 0.05 : 0.07;
      const sh = stoneFaceUnder(fr, { normal: UP, keyDir: null }), ao = aoOccludedStone(fr);
      expect(D(fr, sh).C, `shadow f ${i / 360}: ${say(fr, sh)}`).toBeLessThanOrEqual(cap);
      expect(D(fr, ao).C, `AO floor f ${i / 360}: ${say(fr, ao)}`).toBeLessThanOrEqual(cap);
      n++;
    }
    expect(n).toBe(360);
  });

  it('B2 night is cool and readable', () => {
    const night = sampleScript(0.75);
    let cool = 0;
    for (const c of [rgb(night.ambient.color), rgb(night.hemi.sky), rgb(night.fog.color), ...skyAndFog(night).slice(1)]) {
      const { C, h } = D(night, c);
      if (C >= 0.02) { expect(h, say(night, c)).toBeGreaterThanOrEqual(240); expect(h, say(night, c)).toBeLessThanOrEqual(300); cool++; }
    }
    expect(cool).toBeGreaterThan(0); // the night has a hue to judge, not six greys
    const fog = D(night, rgb(night.fog.color));
    expect(fog.L, `fog ${say(night, rgb(night.fog.color))}`).toBeGreaterThanOrEqual(0.18);
    expect(fog.L).toBeLessThanOrEqual(0.4);
    const litC = stoneFaceUnder(night, { normal: UP, keyDir: MOON_REF });
    const lit = D(night, litC);
    expect(lit.L, `moonlit stone ${say(night, litC)}`).toBeGreaterThanOrEqual(0.3); // the Hearth is not black...
    expect(lit.C, `moonlit stone ${say(night, litC)}`).toBeLessThanOrEqual(0.07);   // ...and not navy
    const shC = stoneFaceUnder(night, { normal: UP, keyDir: null });
    expect(D(night, shC).L, `stone in shadow ${say(night, shC)}`).toBeGreaterThanOrEqual(0.2); // nor its shadow
  });

  it('B2b no maroon after sunset: sky, fog AND the hazed land, f 0.53..0.97', () => {
    // The land takes the horizon colour through the aerial haze (55% at full distance), so a pink horizon that passes on
    // its own (L >= 0.5) still turns dark land maroon. The shadowed face is the worst case: the haze dominates it.
    let n = 0;
    for (let i = 0; i <= 88; i++) {
      const f = 0.53 + i * 0.005, fr = sampleScript(f);
      const land = hazed(stoneFaceUnder(fr, { normal: UP, keyDir: null }), dome(fr, fr.sky.horizon));
      const samples = [['fog', rgb(fr.fog.color)], ['sky top', dome(fr, fr.sky.top)], ['sky mid', dome(fr, fr.sky.mid)],
        ['horizon', dome(fr, fr.sky.horizon)], ['hazed land', land]];
      for (const [name, c] of samples) {
        expect(isMaroon(D(fr, c)), `${name} at f ${f.toFixed(3)}: ${say(fr, c)}`).toBe(false);
        n++;
      }
    }
    expect(n).toBe(89 * 5);
  });

  it('B2c the dusk horizon is violet, not pink (plan Task 1 Step 3: displayed hue 320 or less at the dusk key)', () => {
    // B2b alone cannot hold this: under the derived dusk light a pink horizon such as the draft #C88A90 displays LIGHT
    // (L 0.78), which is not maroon by B2b's rule (L < 0.5), so B2b correctly passes it. The violet is its own claim.
    for (const k of ['dusk', 'preDawn']) {
      const fr = sampleScript(ANCHOR_F[k]), c = dome(fr, fr.sky.horizon), { h, C } = D(fr, c);
      expect(C, `${k} horizon ${say(fr, c)}`).toBeGreaterThanOrEqual(0.02); // a hue to judge, not a grey
      expect(h, `${k} horizon ${say(fr, c)}`).toBeGreaterThanOrEqual(240);
      expect(h, `${k} horizon ${say(fr, c)}`).toBeLessThanOrEqual(320);
    }
  });

  it('B3 golden hour is warm (sunrise, and the lookbook frame 0.48 just after the sunset key)', () => {
    for (const f of [0.02, 0.48]) {
      const fr = sampleScript(f);
      const sideC = stoneFaceUnder(fr, { normal: towardSunHorizontal(f), keyDir: sunDirAt(f) }), side = D(fr, sideC);
      expect(side.h, `sun-facing side at f ${f}: ${say(fr, sideC)}`).toBeGreaterThanOrEqual(40);
      expect(side.h, `sun-facing side at f ${f}: ${say(fr, sideC)}`).toBeLessThanOrEqual(90);
      expect(side.C, `sun-facing side at f ${f}: ${say(fr, sideC)}`).toBeGreaterThanOrEqual(0.05);
      const upC = stoneFaceUnder(fr, { normal: UP, keyDir: sunDirAt(f) });
      expect(D(fr, upC).b, `up face at f ${f}: ${say(fr, upC)}`).toBeGreaterThanOrEqual(0); // not blue
    }
  });

  it('B4 day: designed shadows', () => {
    const day = sampleScript(0.25);
    const lit = D(day, stoneFaceUnder(day, { normal: UP, keyDir: NOON }));
    const sh = D(day, stoneFaceUnder(day, { normal: UP, keyDir: null }));
    expect(sh.L / lit.L).toBeGreaterThanOrEqual(0.5);
    expect(sh.L / lit.L).toBeLessThanOrEqual(0.72);
    const side = towardSunHorizontal(0.25);
    const sideLit = D(day, stoneFaceUnder(day, { normal: side, keyDir: NOON }));
    const sideSh = D(day, stoneFaceUnder(day, { normal: side, keyDir: null }));
    expect(sideSh.C).toBeLessThan(sideLit.C);
  });
});

// THE GROUND, read the way the game resolves it: render/mood.js sampleMood at mood 0, whose key carries the horizon
// fade and the moon. The sun's arc peaks at 32 deg, so at golden hour the key grazes an up face (about 7% of it reaches
// the ground) and the indirect terms are the ground's whole light.
const groundAt = (f, extra = null, albedo = null) => {
  const fr = sampleMood(0, f);
  return { fr, c: stoneFaceUnder(fr, { normal: UP, keyDir: fr.keyDir, extra, albedo }) };
};
// The terrain's stone as it renders: world/proceduralTextures.js layer 3 (MATERIAL_TONES.stone, clusters of a 104 base,
// a 132 light and a 78 crack), and the grey a fit of the lookbook's pad patch lands on. NEUTRAL's toe pulls a darker albedo down faster,
// so a floor the grey card clears by a hair this stone can miss.
const TERRAIN_STONE = '#707070';
// The up face at the lookbook's golden frames under the flat-day rig this script replaced (main 030ada1f's mood 0, read
// through this model): the script may warm golden hour, but must not make the ground harder to read than that.
const GOLDEN_FLOOR = 0.374;
// The Hearth pad 1 m from the brazier's foot, where the iPad lookbook's pad patch sits: with the fire at that distance
// and one grey albedo (sRGB 112, the stone texture's), this model reproduces the patch's five real-GPU readings under
// the previous keys (0.02, 0.25, 0.48, 0.50, 0.75) within L 0.007.
const PAD_FIRE = pointLightOnUpFace(HEARTH_FIRE, HEARTH_FIRE.height, 1);
// G2b reads the pad where the player stands by the brazier at night: at its foot, at the lookbook's patch, and at the
// edge of the patch the light lane's raw frames read maroon (17.7 to 43.9% of it at midnight, registry
// REVIEW:light:midnight-brazier-maroon).
const PAD_RADII_M = [0.5, 1, 2];
const PAD_MAROON_C = 0.025;
const nearMaroonHue = ({ L, h }) => L < 0.5 && (h >= 310 || h < 50);

describe('the ground through the day', () => {
  it('G1 while the sun is up the ground is never darker than under the midnight moon, and golden hour reads as day', () => {
    let n = 0;
    for (const albedo of [null, TERRAIN_STONE]) {
      const { fr: midFr, c: midC } = groundAt(0.75, null, albedo);
      const midnight = D(midFr, midC).L;
      for (let i = 0; i <= 360; i++) {
        const f = i / 720, { fr, c } = groundAt(f, null, albedo);
        expect(D(fr, c).L, `${albedo || 'grey card'} up face at f ${f.toFixed(4)}: ${say(fr, c)}; midnight L ${midnight.toFixed(3)}`).toBeGreaterThanOrEqual(midnight);
        n++;
      }
    }
    expect(n).toBe(2 * 361);
    for (const f of [0.02, 0.48]) {
      const { fr, c } = groundAt(f), d = D(fr, c);
      expect(d.L, `golden up face at f ${f}: ${say(fr, c)}`).toBeGreaterThanOrEqual(GOLDEN_FLOOR);
      expect(d.h, `golden up face at f ${f}: ${say(fr, c)}`).toBeGreaterThanOrEqual(40); // gold, not pink
      expect(d.h, `golden up face at f ${f}: ${say(fr, c)}`).toBeLessThanOrEqual(90);
    }
  });

  it('G2 no maroon through either twilight blend: sky, fog, the hazed land, the ground, and the pad by the fire', () => {
    // The fire's orange on a violet twilight is the maroon the land shows; the bare ground can pass while the pad by
    // the Hearth, where the player stands at dusk, does not.
    let n = 0;
    for (const centre of [0.5, 1]) {
      for (let i = 0; i <= 120; i++) {
        const f = (centre - 0.06 + i * 0.001) % 1, { fr, c: lit } = groundAt(f);
        const shade = stoneFaceUnder(fr, { normal: UP, keyDir: null });
        const horizon = rgb(fr.skyHorizon);
        const samples = [['sky top', rgb(fr.skyTop)], ['sky mid', rgb(fr.skyMid)], ['horizon', horizon], ['fog', rgb(fr.fog)],
          ['hazed land', hazed(shade, horizon)], ['ground', lit], ['ground in shade', shade], ['pad by the fire', groundAt(f, PAD_FIRE).c]];
        for (const [name, c] of samples) {
          expect(isMaroon(D(fr, c)), `${name} at f ${f.toFixed(3)}: ${say(fr, c)}`).toBe(false);
          n++;
        }
      }
    }
    expect(n).toBe(2 * 121 * 8);
  });

  it('G2b in the model, the pad by the fire stays near grey wherever its hue lies in the widened maroon band: terrain stone 0.5, 1 and 2 m from the brazier, f 0.44 to 1.06', () => {
    // The real-GPU pad by the brazier reads 10 to 20 deg redder than this model (DECISIONS 2026-10-28, the landing
    // lifecycle entry, item 21 (d)), so a model hue within 20 deg of maroon's band (330 to 30) displays in it: the band here
    // is widened to 310 to 50. Inside
    // it the pad may carry at most PAD_MAROON_C of chroma, the design margin the twilight keys were chosen for, and it is
    // read on the stone the screen was calibrated on, from sunset through the night keys (f 0.574, 0.926) to sunrise.
    let n = 0, inBand = 0;
    for (const r of PAD_RADII_M) {
      const fire = pointLightOnUpFace(HEARTH_FIRE, HEARTH_FIRE.height, r);
      for (let i = 0; i <= 620; i++) {
        const f = (0.44 + i * 0.001) % 1, fr = sampleMood(0, f);
        const c = stoneFaceUnder(fr, { normal: UP, keyDir: fr.keyDir, extra: fire, albedo: TERRAIN_STONE }), d = D(fr, c);
        if (nearMaroonHue(d)) {
          inBand++;
          expect(d.C, `the pad ${r} m from the fire at f ${f.toFixed(3)}: ${say(fr, c)}`).toBeLessThanOrEqual(PAD_MAROON_C);
        }
        n++;
      }
    }
    expect(n).toBe(3 * 621);
    // The night pad's hue is the mix of the cool night light and the fire, so the band holds most of the night: a band
    // that no sample entered would pass any fire.
    expect(inBand, 'no sample of the pad fell in the widened maroon band, so the chroma bound judged nothing').toBeGreaterThan(300);
  });
});

// The reference for a blend between two keys: the straight line between them in OKLab, which is perceptually even. A
// blend that falls DARKER than that line, or loses chroma against it, reads muddy at the midpoint. Both are bounded by
// one VISIBLE_STEP, because the claim is about how the blend looks; a tighter bound on either would gate how it is
// computed. The script blends in linear RGB (three's lerpColors in the working space): never darker than the line, at
// most 0.015 short in chroma (sunset to dusk fog). An sRGB-byte lerp would run up to 0.006 darker, also under a step;
// linear is kept because it is never darker and costs no conversion.
const lab = (c) => { const o = oklch(c); return [o.L, o.a, o.b]; };
const chroma = (v) => Math.hypot(v[1], v[2]);
const mixv = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const BLEND_COLOURS = ['sky.top', 'sky.mid', 'sky.horizon', 'fog.color', 'glow.color', 'hemi.sky', 'hemi.ground', 'ambient.color', 'sun.color', 'moon.color'];
// Each blended segment as [lower key, upper key, branch]: the anchors in ascending s on each side of the day.
const SEGMENTS = [['night', 'preDawn', 'rising'], ['preDawn', 'sunrise', 'rising'], ['sunrise', 'day', 'rising'],
  ['night', 'dusk', 'setting'], ['dusk', 'sunset', 'setting'], ['sunset', 'day', 'setting']];
const KEY_ANCHOR_S = { night: KEY_S.night, preDawn: KEY_S.twilight, dusk: KEY_S.twilight, sunrise: KEY_S.golden, sunset: KEY_S.golden, day: KEY_S.day };
const fOn = (s, branch) => (branch === 'rising' ? ((Math.asin(s) / TAU) + 1) % 1 : 0.5 - Math.asin(s) / TAU);

describe('the blend between keys, against OKLab', () => {
  it('no blend is darker than the OKLab line between its keys, or greyer by a visible step', () => {
    const N = 24;
    let n = 0, worstL = { d: -Infinity }, worstC = { d: -Infinity };
    for (const [lo, hi, branch] of SEGMENTS) {
      for (let i = 1; i < N; i++) {
        const s = KEY_ANCHOR_S[lo] + (KEY_ANCHOR_S[hi] - KEY_ANCHOR_S[lo]) * (i / N);
        const f = fOn(s, branch);
        const at = scriptKeysAt(f);
        expect([at.from, at.to].sort(), `SETUP: f ${f.toFixed(4)} is not in ${lo}..${hi}`).toEqual([lo, hi].sort());
        const fr = sampleScript(f);
        for (const p of BLEND_COLOURS) {
          const ref = mixv(lab(rgb(get(SCRIPT_KEYS[at.from], p))), lab(rgb(get(SCRIPT_KEYS[at.to], p))), at.t);
          const got = lab(rgb(get(fr, p)));
          const dL = ref[0] - got[0], dC = chroma(ref) - chroma(got);
          if (dL > worstL.d) worstL = { d: dL, at: `${p} ${at.from}->${at.to} t ${at.t.toFixed(2)}` };
          if (dC > worstC.d) worstC = { d: dC, at: `${p} ${at.from}->${at.to} t ${at.t.toFixed(2)}` };
          n++;
        }
      }
    }
    console.log(`[blend] ${n} samples; darkest against OKLab ${worstL.d.toFixed(4)} (${worstL.at}); greyest ${worstC.d.toFixed(4)} (${worstC.at})`);
    expect(n).toBe(SEGMENTS.length * (N - 1) * BLEND_COLOURS.length);
    expect(worstL.d, `a blend runs darker than the OKLab line: ${worstL.at}`).toBeLessThanOrEqual(VISIBLE_STEP);
    expect(worstC.d, `a blend greys out against the OKLab line: ${worstC.at}`).toBeLessThanOrEqual(VISIBLE_STEP);
  });

  it('the displayed horizon keeps its colour through dusk and dawn: never grey, never darker than OKLab between its ends', () => {
    const spans = [['sunset', 'dusk'], ['preDawn', 'sunrise']];
    let n = 0;
    for (const [a, b] of spans) {
      const f0 = ANCHOR_F[a], f1 = ANCHOR_F[b] < f0 ? ANCHOR_F[b] + 1 : ANCHOR_F[b];
      const show = (f) => { const fr = sampleScript(f % 1); return lab(displayed(dome(fr, fr.sky.horizon), fr.grade)); };
      const e0 = show(f0), e1 = show(f1), d = e1.map((v, i) => v - e0[i]), len2 = d.reduce((s, v) => s + v * v, 0);
      for (let i = 0; i <= 40; i++) {
        const f = f0 + (f1 - f0) * (i / 40), p = show(f);
        const t = Math.min(1, Math.max(0, p.reduce((s, v, j) => s + (v - e0[j]) * d[j], 0) / len2));
        const ref = mixv(e0, e1, t);
        expect(chroma(p), `${a}->${b} horizon greys out at f ${(f % 1).toFixed(4)}: C ${chroma(p).toFixed(3)}`).toBeGreaterThanOrEqual(0.04);
        expect(ref[0] - p[0], `${a}->${b} horizon runs dark at f ${(f % 1).toFixed(4)}`).toBeLessThanOrEqual(VISIBLE_STEP);
        n++;
      }
    }
    expect(n).toBe(82);
  });
});
