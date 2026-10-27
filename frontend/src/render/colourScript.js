// colourScript.js — the light and colour script: six authored keys, keyed on the SUN'S ELEVATION.
//
// Plan 2026-10-27-crafty-light-colour-script, Task 1. PURE: no scene, no store, no React. `sampleScript(f)` turns the
// cycle fraction (`cycleFraction`, dawn-origin: 0 dawn, 0.25 noon, 0.5 dusk, 0.75 midnight) into one resolved frame
// of colours and intensities. render/mood.js composes it with the danger overlays; nothing reads this module per frame
// except through that.
//
// WHY THE SOLAR PHASE, NOT `isDay` OR THE MOOD. Night used to BE the dusk danger palette (moodTarget mapped `isDay
// false` to mood 1), so every night was maroon under an orange horizon and the iPad's stone read navy under a blue
// ambient. Here the input is `s = sin(2*pi*f)`, the normalised elevation (-1..1, the same for every mood's noon
// vector), and `rising = cos(2*pi*f) >= 0`. Two branches share their end keys:
//     rising   night -> preDawn -> sunrise -> day
//     setting  day   -> sunset  -> dusk    -> night
// Because `day` and `night` are shared, the frame is continuous at noon and midnight by construction; piecewise
// linear interpolation in `s` makes it continuous everywhere else.
//
// THE KEYS. sRGB hex as authored, converted to linear once at module load (three's ColorManagement, the same
// conversion every colour in the game takes). Intensities are BEFORE `exposure`; render/mood.js applies exposure to
// the rig's intensities and the dome's colours (decision 6). A `sun` or `moon` colour at intensity 0 is never seen:
// it only keeps the colour channel continuous through the keys where that body is down, so each one is the colour of
// the neighbouring key where the body is up.
//
// THE NIGHT, PRE-DAWN AND DUSK VALUES ARE DERIVED, NOT THE PLAN'S FIRST DRAFT (its keys table marked them PROVISIONAL).
// The draft night (exposure 1.15, moon #9DB4FF x0.70, ambient #465074 x0.32) displays the moonlit stone at (5, 22,
// 57)/255, OKLab L 0.211 C 0.071: black, and navy, once the grade and NEUTRAL's toe are applied (review amendment 1;
// this file's gate reproduces exactly those numbers on the draft). Re-derived on the displayed model
// (tests/gates/_lightModel.js) until tests/gates/colour-script-gates.test.js passes:
//   night    light up and chroma down: moon #B4C2E8 x0.85, ambient #7E8496 x0.42, hemi #7A84A2 / #4A4A56 x0.68, fog
//            #333B58, sky #0A1028 / #18234A / #34406E, grade -0.10 / +0.03 / 0.02 (contrast 0.10 pivoting at sRGB 0.5
//            crushed every night value), exposure 1.7. Moonlit stone displays (47, 55, 74): L 0.337 C 0.036 hue 268;
//            in shadow (22, 30, 47): L 0.236. At exposure 1.15 the same night is L 0.273, under the 0.30 bound.
//   preDawn  moon #B4BEE6 x0.55, ambient #868AA0 x0.38, hemi #7E88AA / #5A5262 x0.68, grade -0.02 / +0.03 / 0.04,
//   / dusk   exposure 1.4 (dusk saturation 0.0). The dusk horizon goes VIOLET, #9A90C0 (displayed hue 294): the
//            draft #C88A90 displays hue 331 and hazes the land maroon (f 0.54: (125, 76, 92)).
//   golden   the hemisphere sky at sunrise and sunset #A8B2C8 -> #B0B2C2: the draft turned the sunrise up face a hair
//            BLUE (OKLab b -0.001 at f 0.02), which B3 forbids; this is the smallest change that clears it.
import * as THREE from 'three';
import { aoFloorColor } from '../world/biomeTable.js';

/** Where each key sits in `s`. `twilight` is preDawn (rising) and dusk (setting); `golden` is sunrise and sunset. */
export const KEY_S = Object.freeze({ night: -0.45, twilight: -0.12, golden: 0.10, day: 0.45 });

const AUTHORED = {
  night: {
    sun: { color: '#FFB062', intensity: 0 },
    moon: { color: '#B4C2E8', intensity: 0.85 },
    ambient: { color: '#7E8496', intensity: 0.42 },
    hemi: { sky: '#7A84A2', ground: '#4A4A56', intensity: 0.68 },
    fog: { color: '#333B58', density: 0.0060 },
    sky: { top: '#0A1028', mid: '#18234A', horizon: '#34406E' },
    glow: { color: '#000000', strength: 0 },
    grade: { saturation: -0.10, brightness: 0.03, contrast: 0.02 },
    stars: 1, motes: 1, exposure: 1.7,
  },
  preDawn: {
    sun: { color: '#FFB870', intensity: 0 },
    moon: { color: '#B4BEE6', intensity: 0.55 },
    ambient: { color: '#868AA0', intensity: 0.38 },
    hemi: { sky: '#7E88AA', ground: '#5A5262', intensity: 0.68 },
    fog: { color: '#5A6690', density: 0.0045 },
    sky: { top: '#141C46', mid: '#34447E', horizon: '#8A90C0' },
    glow: { color: '#8A90C0', strength: 0.15 },
    grade: { saturation: -0.02, brightness: 0.03, contrast: 0.04 },
    stars: 0.5, motes: 0.3, exposure: 1.4,
  },
  sunrise: {
    sun: { color: '#FFB870', intensity: 2.4 },
    moon: { color: '#B4BEE6', intensity: 0 },
    ambient: { color: '#B8A89C', intensity: 0.26 },
    hemi: { sky: '#B0B2C2', ground: '#C8906A', intensity: 0.60 },
    fog: { color: '#E8C2A8', density: 0.0035 },
    sky: { top: '#3A5CA8', mid: '#9AA8D0', horizon: '#FFB8A0' },
    glow: { color: '#FFC08A', strength: 0.55 },
    grade: { saturation: 0.16, brightness: 0.03, contrast: 0.07 },
    stars: 0, motes: 0, exposure: 1.0,
  },
  day: {
    sun: { color: '#FFE6C4', intensity: 2.8 },
    moon: { color: '#B4BEE6', intensity: 0 },
    ambient: { color: '#C4C6CC', intensity: 0.26 },
    hemi: { sky: '#9DB8D6', ground: '#B49670', intensity: 0.80 },
    fog: { color: '#CFE3EC', density: 0.0025 },
    sky: { top: '#2A64C8', mid: '#5A9AE0', horizon: '#CFE6F2' },
    glow: { color: '#FFF0D8', strength: 0.20 },
    grade: { saturation: 0.12, brightness: 0.04, contrast: 0.06 },
    stars: 0, motes: 0, exposure: 1.0,
  },
  sunset: {
    sun: { color: '#FFAA55', intensity: 2.6 },
    moon: { color: '#B4BEE6', intensity: 0 },
    ambient: { color: '#B8AA9C', intensity: 0.26 },
    hemi: { sky: '#B0B2C2', ground: '#C88E5C', intensity: 0.60 },
    fog: { color: '#E8C6A0', density: 0.0035 },
    sky: { top: '#3A5CA8', mid: '#8FA8D0', horizon: '#FFC27A' },
    glow: { color: '#FFB060', strength: 0.60 },
    grade: { saturation: 0.18, brightness: 0.03, contrast: 0.08 },
    stars: 0, motes: 0, exposure: 1.0,
  },
  dusk: {
    sun: { color: '#FFAA55', intensity: 0 },
    moon: { color: '#B4BEE6', intensity: 0.55 },
    ambient: { color: '#868AA0', intensity: 0.38 },
    hemi: { sky: '#7E88AA', ground: '#5A5262', intensity: 0.68 },
    fog: { color: '#5A6690', density: 0.0045 },
    sky: { top: '#1A2350', mid: '#3A4C88', horizon: '#9A90C0' },
    glow: { color: '#9A90C0', strength: 0.20 },
    grade: { saturation: 0.0, brightness: 0.03, contrast: 0.04 },
    stars: 0.5, motes: 0.6, exposure: 1.4,
  },
};

/** The key names, in the order the plan's table lists them. */
export const KEY_NAMES = Object.freeze(['night', 'preDawn', 'sunrise', 'day', 'sunset', 'dusk']);

const col = (hex) => new THREE.Color(hex); // sRGB hex -> linear, under three's ColorManagement
const parseKey = (k) => ({
  sun: { color: col(k.sun.color), intensity: k.sun.intensity },
  moon: { color: col(k.moon.color), intensity: k.moon.intensity },
  ambient: { color: col(k.ambient.color), intensity: k.ambient.intensity },
  hemi: { sky: col(k.hemi.sky), ground: col(k.hemi.ground), intensity: k.hemi.intensity },
  fog: { color: col(k.fog.color), density: k.fog.density },
  sky: { top: col(k.sky.top), mid: col(k.sky.mid), horizon: col(k.sky.horizon) },
  glow: { color: col(k.glow.color), strength: k.glow.strength },
  grade: { ...k.grade },
  stars: k.stars, motes: k.motes, exposure: k.exposure,
});

// Freeze the plain structure; the Colors inside stay ordinary objects (three's methods write to `this`), and nothing
// here ever writes to them.
const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !(o instanceof THREE.Color)) {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
};

/** The six keys, parsed: colours are linear THREE.Color. Frozen. */
export const SCRIPT_KEYS = deepFreeze(Object.fromEntries(KEY_NAMES.map((n) => [n, parseKey(AUTHORED[n])])));

// The anchors of each branch, in ascending `s`.
const RISING = [['night', KEY_S.night], ['preDawn', KEY_S.twilight], ['sunrise', KEY_S.golden], ['day', KEY_S.day]];
const SETTING = [['night', KEY_S.night], ['dusk', KEY_S.twilight], ['sunset', KEY_S.golden], ['day', KEY_S.day]];

/** Noon: what a non-finite or non-number fraction means (a corrupt save must never be a black, key-less sky). */
const NOON = 0.25;

/** The solar phase of a cycle fraction: `s` (the normalised elevation), and which branch the sun is on. */
export function solarPhase(f) {
  const ff = typeof f === 'number' && Number.isFinite(f) ? ((f % 1) + 1) % 1 : NOON;
  const theta = 2 * Math.PI * ff;
  return { s: Math.sin(theta), rising: Math.cos(theta) >= 0, f: ff };
}

/** The two keys bracketing `f` on its branch, lower `s` first, and how far between them (0..1). */
export function scriptKeysAt(f) {
  const { s, rising } = solarPhase(f);
  const anchors = rising ? RISING : SETTING;
  const sc = Math.min(KEY_S.day, Math.max(KEY_S.night, s));
  let i = 0;
  while (i < anchors.length - 2 && sc > anchors[i + 1][1]) i++;
  const [lo, sLo] = anchors[i], [hi, sHi] = anchors[i + 1];
  return { from: lo, to: hi, t: (sc - sLo) / (sHi - sLo) };
}

const lerp = THREE.MathUtils.lerp;

/** A fresh frame to write into. `sampleScript` reuses the one passed to it, so a caller can hold one per loop. */
export function makeScriptFrame() {
  return {
    s: 0, rising: true, f: NOON,
    sun: { color: new THREE.Color(), intensity: 0 },
    moon: { color: new THREE.Color(), intensity: 0 },
    ambient: { color: new THREE.Color(), intensity: 0 },
    hemi: { sky: new THREE.Color(), ground: new THREE.Color(), intensity: 0 },
    fog: { color: new THREE.Color(), density: 0 },
    sky: { top: new THREE.Color(), mid: new THREE.Color(), horizon: new THREE.Color() },
    glow: { color: new THREE.Color(), strength: 0 },
    grade: { saturation: 0, brightness: 0, contrast: 0 },
    stars: 0, motes: 0, exposure: 1, daylight: 1,
    aoFloor: new THREE.Color(),
  };
}

const _scratch = makeScriptFrame();

/**
 * PURE. The resolved script frame for cycle fraction `f`, written into `out` (a persistent scratch when omitted: read
 * or copy it before the next call, never retain it). Colours are linear THREE.Color.
 *
 *   daylight = smoothstep(KEY_S.twilight, KEY_S.day, s)   0 by night, 1 by full day
 *   aoFloor  = aoFloorColor(ambient)   the terrain's fully-occluded corner takes the AUTHORED SHADOW TINT, never the
 *                                      sky's mid colour (that was blue by day and navy by night: a blue AO on every
 *                                      corner of the low tier, which has no other AO)
 */
export function sampleScript(f, out = _scratch) {
  const ph = solarPhase(f);
  const { from, to, t } = scriptKeysAt(ph.f);
  const a = SCRIPT_KEYS[from], b = SCRIPT_KEYS[to];
  out.s = ph.s; out.rising = ph.rising; out.f = ph.f;
  out.sun.color.lerpColors(a.sun.color, b.sun.color, t); out.sun.intensity = lerp(a.sun.intensity, b.sun.intensity, t);
  out.moon.color.lerpColors(a.moon.color, b.moon.color, t); out.moon.intensity = lerp(a.moon.intensity, b.moon.intensity, t);
  out.ambient.color.lerpColors(a.ambient.color, b.ambient.color, t);
  out.ambient.intensity = lerp(a.ambient.intensity, b.ambient.intensity, t);
  out.hemi.sky.lerpColors(a.hemi.sky, b.hemi.sky, t); out.hemi.ground.lerpColors(a.hemi.ground, b.hemi.ground, t);
  out.hemi.intensity = lerp(a.hemi.intensity, b.hemi.intensity, t);
  out.fog.color.lerpColors(a.fog.color, b.fog.color, t); out.fog.density = lerp(a.fog.density, b.fog.density, t);
  out.sky.top.lerpColors(a.sky.top, b.sky.top, t);
  out.sky.mid.lerpColors(a.sky.mid, b.sky.mid, t);
  out.sky.horizon.lerpColors(a.sky.horizon, b.sky.horizon, t);
  out.glow.color.lerpColors(a.glow.color, b.glow.color, t); out.glow.strength = lerp(a.glow.strength, b.glow.strength, t);
  out.grade.saturation = lerp(a.grade.saturation, b.grade.saturation, t);
  out.grade.brightness = lerp(a.grade.brightness, b.grade.brightness, t);
  out.grade.contrast = lerp(a.grade.contrast, b.grade.contrast, t);
  out.stars = lerp(a.stars, b.stars, t);
  out.motes = lerp(a.motes, b.motes, t);
  out.exposure = lerp(a.exposure, b.exposure, t);
  out.daylight = THREE.MathUtils.smoothstep(ph.s, KEY_S.twilight, KEY_S.day);
  const ao = aoFloorColor([out.ambient.color.r, out.ambient.color.g, out.ambient.color.b]);
  out.aoFloor.setRGB(ao[0], ao[1], ao[2]);
  return out;
}
