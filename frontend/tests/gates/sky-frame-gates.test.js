import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  moodTarget, sampleMood, skyFrameRef, publishSkyFrame, CAPTURE_SOLAR, captureCycle, liveCycle, MOOD_SCALARS, MOOD_GRADE,
} from '../../src/render/mood.js';
import { sampleScript, makeScriptFrame } from '../../src/render/colourScript.js';
import { resolveKeyLight, makeKeyLight, moonArcDirection, MOON_NOON } from '../../src/render/keyLight.js';
import { sunArcDirection } from '../../src/render/sunArc.js';
import { STORM_MOOD_BOOST } from '../../src/game/weatherGate.js';
import { aoFloorColor } from '../../src/world/biomeTable.js';
import { PALETTE } from '../../src/theme/tokens.js';
import { oklch, displayed, stoneFaceUnder } from './_lightModel.js';

/**
 * ONE SKY FRAME (plan 2026-10-27-crafty-light-colour-script, Task 3a; refute F5).
 *
 * sampleMood(mood, cycle) is the colour script at the clock's fraction, under the danger overlays: mood 0..1 is the
 * storm (fog thickens, sky greys, key dims, stars hide), mood 1..2 blends to the obsidian boss state, which replaces
 * the colours at any hour. Night is the CLOCK's, no longer danger. publishSkyFrame copies the frame once per frame
 * into skyFrameRef, which every other reader will read (Task 3b). Capture declares its solar fraction.
 *
 * The expected values here are built INDEPENDENTLY of mood.js: the script and the key light are sampled directly and
 * the exposure applied as decision 6 states (the rig's intensities and the dome's colours), and the obsidian state is
 * read from the palette tokens. A sampleMood that drifted from the script would disagree with them.
 *
 * DENOMINATORS: five fractions for the script case (each compares 36 colour channels and 14 scalars); six junk
 * gameTimes; the copy case compares every field of the frame (asserted count).
 *
 * Mutation-Proof: via scripts/dev/mutate.sh on src/render/mood.js, 8 tests, each observed RED (2026-10-27):
 *   S1 moodTarget floors night at 1 again                       -> night case RED
 *   S2 the obsidian blend keyed by the hour (t2 x [daylight > .5]) -> boss-any-hour RED
 *   S3 publishSkyFrame assigns the scratch by reference          -> copies case RED
 *   S4 captureCycle's night fallback -> CAPTURE_SOLAR.day (the old noon pin for every state, F5) -> captureCycle RED
 *   S5 the storm's fog x(1 + 8*t1)                               -> storm-at-midnight RED
 *   S6 liveCycle = cycleFraction (a NaN clock is the key-less dawn) -> liveCycle RED
 *   S7 sunColor written from keyColor                            -> key-and-sun RED (and mood-0-is-the-script)
 *   S8 the dome's skyMid without the key's exposure              -> mood-0-is-the-script RED
 *   S0 identity (a comment edit in mood.js)                      -> SURVIVED
 *   Review fixes (2026-10-27: MB, MA, STORM_KEY_DIM = 0 and STORM_SKY_GREY = 0 had survived the whole suite):
 *   MB moonDir never copied into the frame                        -> directions RED
 *   MA sunDir written from the key's direction                    -> directions RED
 *   SK1 STORM_KEY_DIM = 0 / SK2 doubled (0.8) / MC the key's storm term dropped -> storm RED (each)
 *   SG1 STORM_SKY_GREY = 0 / SG3 0.9 / SG2 the storm darkens the sky instead of greying it -> storm RED (each)
 *   S0b identity (a comment edit in mood.js)                     -> SURVIVED
 *
 * BLIND SPOT: nothing here wires. Whether Atmosphere publishes the frame, and whether the readers read it, is Task 3b
 * (its sky-readers gate and its e2e).
 */
const COLOURS = ['ambient', 'fog', 'skyTop', 'skyMid', 'skyHorizon', 'hemiSky', 'hemiGround', 'keyColor', 'sunColor', 'glowColor',
  'fill', 'aoFloor'];
const SCALARS = ['ambientIntensity', 'hemiIntensity', 'keyIntensity', 'fogDensity', 'fillIntensity', 'stars', 'motes', 'daylight',
  'glowStrength', 'exposure'];
const colours = (m, names = COLOURS) => Object.fromEntries(names.flatMap((n) => [[`${n}.r`, m[n].r], [`${n}.g`, m[n].g], [`${n}.b`, m[n].b]]));
const scalars = (m) => ({ ...Object.fromEntries(SCALARS.map((n) => [n, m[n]])), sat: m.grade.saturation, bright: m.grade.brightness, contrast: m.grade.contrast, keyIsMoon: m.keyIsMoon ? 1 : 0 });
const close = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, expect.closeTo(v, 6)]));
const UP = [0, 1, 0];

// What mood 0 must be, built from the script and the key light directly (decision 6: exposure on the rig and the dome).
function scriptFrame(f) {
  const sc = sampleScript(f, makeScriptFrame()), k = resolveKeyLight(MOOD_SCALARS.explore.sunPos, f, sc, makeKeyLight()), e = sc.exposure;
  const dome = (c) => c.clone().multiplyScalar(e);
  return {
    ambient: sc.ambient.color, fog: sc.fog.color, skyTop: dome(sc.sky.top), skyMid: dome(sc.sky.mid), skyHorizon: dome(sc.sky.horizon),
    hemiSky: sc.hemi.sky, hemiGround: sc.hemi.ground, keyColor: k.keyColor, sunColor: sc.sun.color, glowColor: sc.glow.color,
    fill: new THREE.Color('#FF3B5C'), aoFloor: sc.aoFloor,
    ambientIntensity: sc.ambient.intensity * e, hemiIntensity: sc.hemi.intensity * e, keyIntensity: k.keyIntensity * e,
    fogDensity: sc.fog.density, fillIntensity: 0, stars: sc.stars, motes: sc.motes, daylight: sc.daylight, glowStrength: sc.glow.strength,
    exposure: e, grade: sc.grade, keyIsMoon: k.keyIsMoon,
  };
}
// The boss state, from the tokens: the obsidian palette, its scalars and grade, the magic-red fill.
const OB = PALETTE.obsidian, obAo = aoFloorColor([new THREE.Color(OB.skyMid).r, new THREE.Color(OB.skyMid).g, new THREE.Color(OB.skyMid).b]);
const OBSIDIAN = colours({
  ambient: new THREE.Color(OB.skyMid), fog: new THREE.Color(OB.fog), skyTop: new THREE.Color(OB.skyTop), skyMid: new THREE.Color(OB.skyMid),
  skyHorizon: new THREE.Color(OB.skyHorizon), hemiSky: new THREE.Color(OB.skyMid), hemiGround: new THREE.Color(OB.fog),
  keyColor: new THREE.Color(OB.sun), sunColor: new THREE.Color(OB.sun), glowColor: new THREE.Color(OB.sun),
  fill: new THREE.Color('#FF3B5C'), aoFloor: new THREE.Color(obAo[0], obAo[1], obAo[2]),
});

describe('the sky frame: the script under the danger overlays', () => {
  it('night is no longer danger', () => {
    expect(moodTarget({ isDay: false })).toBe(0);
    expect(moodTarget({ isDay: false, dangerLevel: 0, weatherBoost: 0 })).toBe(0);
    expect(moodTarget({ dangerLevel: 2 })).toBe(2);
    expect(moodTarget({ weatherBoost: 0.6 })).toBeCloseTo(0.6);
    expect(moodTarget({ dangerLevel: 1, weatherBoost: 0.6 })).toBe(1); // the larger wins, as before
  });

  it('mood 0 is the script', () => {
    let n = 0;
    for (const f of [0.02, 0.25, 0.48, 0.55, 0.75]) {
      const m = sampleMood(0, f), want = scriptFrame(f);
      expect(colours(m), `colours at f ${f}`).toEqual(close(colours(want)));
      expect(scalars(m), `scalars at f ${f}`).toEqual(close(scalars(want)));
      n++;
    }
    expect(n).toBe(5);
  });

  it('boss-any-hour: mood 2 colours are obsidian at noon and at midnight', () => {
    expect(colours(sampleMood(2, 0.25))).toEqual(close(OBSIDIAN));
    expect(colours(sampleMood(2, 0.75))).toEqual(close(OBSIDIAN));
    const g = sampleMood(2, 0.75).grade, og = MOOD_GRADE.obsidian;
    expect({ s: g.saturation, b: g.brightness, c: g.contrast }).toEqual(close({ s: og.saturation, b: og.brightness, c: og.contrast }));
  });

  it('storm-at-midnight stays readable, as displayed', () => {
    const calm = sampleMood(0, 0.75).fogDensity; // read before the stormy sample: sampleMood returns one shared scratch
    const m = sampleMood(1, 0.75);
    const lit = oklch(displayed(stoneFaceUnder(m, { normal: UP, keyDir: m.keyDir }), m.grade));
    expect(lit.L, `stone under the storm at midnight: L ${lit.L.toFixed(3)}`).toBeGreaterThanOrEqual(0.25);
    expect(m.fogDensity).toBeLessThanOrEqual(0.02);
    expect(m.fogDensity).toBeGreaterThan(calm); // and the storm did thicken it
    expect(m.stars).toBe(0);
  });

  it('liveCycle: a corrupt gameTime is noon with a lit key, never the key-less dawn', () => {
    for (const t of [NaN, Infinity, -Infinity, undefined, null, 'x']) {
      expect(liveCycle(t), String(t)).toBe(CAPTURE_SOLAR.day);
      expect(sampleMood(0, liveCycle(t)).keyIntensity, String(t)).toBeGreaterThan(1);
    }
    expect(liveCycle(0)).toBe(0);              // finite time passes through: 0 is dawn
    expect(liveCycle(300)).toBeCloseTo(0.25);  // a quarter of the 1200-unit cycle is noon
  });

  it('the key and the sun are different fields: at 0.52 (s about -0.13, moon up) sunColor is still the sun', () => {
    const m = sampleMood(0, 0.52);
    expect(m.keyIsMoon).toBe(true);
    expect('sun' in m).toBe(false);
    expect('sunIntensity' in m).toBe(false);
    expect(m.sunColor.getHex()).not.toBe(m.keyColor.getHex());
    expect(m.sunColor.getHex()).toBe(sampleScript(0.52).sun.color.getHex());
  });

  it('publishSkyFrame copies, never aliases', () => {
    const src = sampleMood(0, 0.75);
    publishSkyFrame(src);
    const held = skyFrameRef.current.fog.getHex(), heldKey = [...skyFrameRef.current.keyDir];
    let n = 0;
    for (const [k, v] of Object.entries(src)) {
      const d = skyFrameRef.current[k];
      if (v instanceof THREE.Color) { expect(d.getHex(), k).toBe(v.getHex()); expect(d).not.toBe(v); }
      else if (Array.isArray(v)) { expect(d, k).toEqual(v); expect(d).not.toBe(v); }
      else if (v && typeof v === 'object') { expect(d, k).toEqual(v); expect(d).not.toBe(v); }
      else expect(d, k).toBe(v);
      n++;
    }
    expect(n).toBe(Object.keys(skyFrameRef.current).length); // every field the published frame has
    sampleMood(0, 0.25); // overwrite the scratch
    expect(skyFrameRef.current.fog.getHex()).toBe(held);
    expect(skyFrameRef.current.keyDir).toEqual(heldKey);
  });

  // THE FRAME'S THREE DIRECTIONS (review of the light-colour lane, 2026-10-27: mutants MB and MA survived the suite).
  // Each is checked against the pure arc it must come from, built here independently of mood.js: the sun's arc on the
  // mood's noon vector, the moon's arc (keyLight.js moonArcDirection), and the key = whichever body is up. At 0.62 the
  // moon is up and far from its own noon (MOON_NOON, which is also the dome's initial uniform), so a moonDir never
  // copied (left at the scratch's [0, -1, 0]) or a frozen one both fail.
  it('sunDir, moonDir and keyDir are the arcs they name, at a moonlit hour and a sunlit one', () => {
    let n = 0;
    for (const f of [0.62, 0.3]) {
      const m = sampleMood(0, f);
      const sun = sunArcDirection(MOOD_SCALARS.explore.sunPos, f), moon = moonArcDirection(f);
      for (let c = 0; c < 3; c++) {
        expect(m.sunDir[c], `f ${f}: sunDir[${c}] is not the sun's arc`).toBeCloseTo(sun[c], 9);
        expect(m.moonDir[c], `f ${f}: moonDir[${c}] is not the moon's arc`).toBeCloseTo(moon[c], 9);
        expect(m.keyDir[c], `f ${f}: keyDir[${c}] is not the body that is up`).toBeCloseTo(m.keyIsMoon ? moon[c] : sun[c], 9);
      }
      n++;
    }
    expect(n).toBe(2);
    expect(sampleMood(0, 0.62).keyIsMoon).toBe(true); // the night case really is the moon's
    const at62 = moonArcDirection(0.62), nn = Math.hypot(...MOON_NOON);
    const cos = (at62[0] * MOON_NOON[0] + at62[1] * MOON_NOON[1] + at62[2] * MOON_NOON[2]) / nn;
    expect(cos, 'the case cannot tell the moon\'s arc from its noon').toBeLessThan(Math.cos((10 * Math.PI) / 180));
  });

  // THE STORM OVERLAY'S TWO OTHER TERMS (review: STORM_KEY_DIM = 0 and STORM_SKY_GREY = 0 both survived). Design
  // anchors, not the constants: at the live storm boost (game/weatherGate.js) a storm takes between a quarter and a half
  // off the key light, and washes the sky toward grey (OKLab chroma down by 20-50%) without darkening it (the grey is
  // the colour's own luminance, Rec. 709, so the luminance holds within 1%). Noon and midnight, so both keys are seen.
  it('a storm dims the key and greys the sky toward its own luminance, at noon and at midnight', () => {
    const lum709 = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    let n = 0;
    for (const f of [0.25, 0.75]) {
      const calm = sampleMood(0, f);
      const key0 = calm.keyIntensity, sky0 = calm.skyMid.clone(), top0 = calm.skyTop.clone();
      const storm = sampleMood(STORM_MOOD_BOOST, f);
      const keyRatio = storm.keyIntensity / key0;
      expect(keyRatio, `f ${f}: the storm left the key at ${(keyRatio * 100).toFixed(0)}%`).toBeLessThanOrEqual(0.75);
      expect(keyRatio, `f ${f}: the storm took the key to ${(keyRatio * 100).toFixed(0)}%`).toBeGreaterThanOrEqual(0.5);
      for (const [name, c0, c1] of [['skyMid', sky0, storm.skyMid], ['skyTop', top0, storm.skyTop]]) {
        const chroma = oklch([c1.r, c1.g, c1.b]).C / oklch([c0.r, c0.g, c0.b]).C;
        expect(chroma, `f ${f}: ${name} kept ${(chroma * 100).toFixed(0)}% of its chroma under the storm`).toBeLessThanOrEqual(0.8);
        expect(chroma, `f ${f}: ${name} lost too much chroma`).toBeGreaterThanOrEqual(0.5);
        expect(lum709(c1) / lum709(c0), `f ${f}: the storm darkened ${name} instead of greying it`).toBeCloseTo(1, 2);
      }
      n++;
    }
    expect(n).toBe(2);
  });

  it('captureCycle: noon for a day state, midnight for a night state', () => {
    expect(CAPTURE_SOLAR).toEqual({ day: 0.25, night: 0.75 });
    expect(captureCycle({ isDay: true })).toBe(0.25);
    expect(captureCycle({ isDay: false })).toBe(0.75);
    expect(captureCycle({})).toBe(0.25);
  });
});
