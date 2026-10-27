import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  moodTarget, sampleMood, skyFrameRef, publishSkyFrame, CAPTURE_SOLAR, captureCycle, liveCycle, MOOD_SCALARS, MOOD_GRADE,
} from '../../src/render/mood.js';
import { sampleScript, makeScriptFrame } from '../../src/render/colourScript.js';
import { resolveKeyLight, makeKeyLight } from '../../src/render/keyLight.js';
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

  it('captureCycle: declared, then by isDay', () => {
    expect(CAPTURE_SOLAR).toEqual({ day: 0.25, night: 0.75 });
    expect(captureCycle({ isDay: true })).toBe(0.25);
    expect(captureCycle({ isDay: false })).toBe(0.75);
    expect(captureCycle({ isDay: true, captureSolarFraction: 0.48 })).toBe(0.48);
    expect(captureCycle({ isDay: false, captureSolarFraction: NaN })).toBe(0.75);
    expect(captureCycle({ isDay: false, captureSolarFraction: null })).toBe(0.75);
  });
});
