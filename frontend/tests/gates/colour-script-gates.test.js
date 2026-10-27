import { describe, it, expect } from 'vitest';
import { KEY_S, KEY_NAMES, SCRIPT_KEYS, solarPhase, scriptKeysAt, sampleScript } from '../../src/render/colourScript.js';
import { sunArcDirection, MOOD_SCALARS } from '../../src/render/mood.js';
import { rgb, oklch, displayed, stoneFaceUnder, aoOccludedStone, hazed, bytes } from './_lightModel.js';

/**
 * THE COLOUR SCRIPT (plan 2026-10-27-crafty-light-colour-script, Task 1).
 *
 * Six keys on the sun's elevation `s`; night cool and readable, golden hour warm, a near-neutral indirect light. Every
 * colour bound is stated on the DISPLAYED colour (review amendment 1): the grade and three's NEUTRAL tone map run in
 * `displayed()` (tests/gates/_lightModel.js), because the linear radiance before them is not what the player sees.
 *
 * DENOMINATORS, each asserted: continuity 3601 steps x 47 fields; B1 360 fractions (two faces each); B2b 89 fractions x
 * 5 samples; every key checked at its own anchor (6).
 *
 * RED FIRST: on the plan's draft keys this file fails B2 (the moonlit stone displays (5, 22, 57), L 0.211 C 0.071,
 * exactly the plan's own reading), B2b (the hazed land at f 0.540 displays (125, 76, 92), hue 359) and B3 (the sunrise
 * up face a hair blue, OKLab b -0.001). The derived keys in src/render/colourScript.js are what turned it green.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh (src/render/colourScript.js, 11 tests), each observed RED:
 *   C1 day ambient back to today's #2E8AE0 x0.90 -> B1, B4
 *   C2 night fog back to the dusk #3A2E40 -> B2
 *   C3 night horizon back to the dusk #C25A3A -> B2 (its hue band; the plan expected B2b)
 *   C4 sunset sun white #FFFBF2 -> B3
 *   C5 `rising` inverted -> the branches-meet and keys-land cases
 *   C6 interpolated in f instead of s -> continuity, keys-land, junk-cycle, B2, B2c, B3
 *   C7 a non-finite f read as 0.75 (midnight) -> junk-cycle
 *   C8 the twilight anchor deleted from KEY_S -> continuity, branches-meet, keys-land, junk-cycle, B1, B2, B2c, B3, B4
 *   C9 night exposure back to 1.15 -> B2 (moonlit stone L 0.273 < 0.30)
 *   C10 dusk horizon back to #C88A90 -> B2c. B2b stays GREEN on it, correctly: under the derived dusk light that pink
 *       displays light (L 0.78), not maroon; the violet requirement is B2c's.
 *   C11 the AO floor derived from sky.mid (today's source) -> B1, continuity
 *   C12 dusk AND night horizon #80586A -> B2b through the HAZED-LAND sample only (the scratch model's breakdown: 80
 *       land samples, 0 sky or fog samples), plus B2's and B2c's hue bands and keys-land
 *   and C0, an identity mutant (a comment edit in colourScript.js), SURVIVED at the start and again at the end of the
 *   same batch.
 *
 * BLIND SPOT: nothing here renders. The model is checked against the screen by Task 3b's grey card, and the look by
 * the real-GPU lookbook (Task 9). This file also cannot see whether anything CALLS sampleScript: that is Task 3a's
 * sky-frame gate and Task 3b's e2e.
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
    // On the low tier (no N8AO, no god rays) these two terms are the whole shade of every face the key does not reach.
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
        const { L, C, h } = D(fr, c);
        expect(!(C >= 0.04 && L < 0.5 && (h >= 330 || h < 30)), `${name} at f ${f.toFixed(3)}: ${say(fr, c)}`).toBe(true);
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
