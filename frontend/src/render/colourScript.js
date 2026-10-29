// colourScript.js — the light and colour script: six authored keys, keyed on the SUN'S ELEVATION.
//
// PURE: no scene, no store, no React. `sampleScript(f)` turns the
// cycle fraction (`cycleFraction`, dawn-origin: 0 dawn, 0.25 noon, 0.5 dusk, 0.75 midnight) into one resolved frame
// of colours and intensities. render/mood.js composes it with the danger overlays; nothing reads this module per frame
// except through that.
//
// WHY THE SOLAR PHASE, NOT `isDay` OR THE MOOD. A night drawn as the dusk danger palette is maroon under an orange
// horizon, and the iPad's stone reads navy under a blue ambient. Here the input is `s = sin(2*pi*f)`, the normalised elevation (-1..1, the same for every mood's noon
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
// THE VALUES ARE SOLVED ON THE DISPLAYED MODEL (tests/gates/_lightModel.js: the rig, the grade and NEUTRAL's toe), not
// on the linear light, because NEUTRAL crushes a dark linear value far below where it reads. Each key holds a bound in
// tests/gates/colour-script-gates.test.js:
//   night    the moonlit stone must read, and not as navy: exposure 1.7 with a near-neutral ambient #7E8496 x0.42 and
//            moon #B4C2E8 x0.85 display it at L 0.337 C 0.036 hue 268 (in shadow L 0.236). The grade's contrast stays
//            0.02, because contrast pivots at sRGB 0.5 and so crushes every night value.
//   preDawn  half of the light at the instant the sun crosses the horizon, where the key has faded to 0, so they carry
//   / dusk   the ground there: ambient x0.85 and hemi x1.50 hold it at midnight's lightness or above, for the grey card
//            and for the darker terrain stone alike. Their light is a steel blue (#7E8CA2, hemi sky #788AAC), not
//            lavender: the Hearth's orange on a violet light lands on maroon by the pad, and on the real GPU the pad
//            reads 10-20 deg redder than this model, so these were chosen to keep the model's pad 1 m from the brazier
//            near chroma 0.02 in maroon's hue band; G2 does not assert that margin. The dusk SKY stays violet: its horizon #9A90C0 displays hue 294 (a pink
//            one, hue 331, hazes the land maroon).
//   sunrise  the sun grazes (its arc peaks at 32 deg, so the up face takes about 7% of the key at golden hour), so the
//   / sunset ground is lit by the indirect terms: ambient x0.80 and hemi x1.80 put the up face at L 0.42, between
//            midnight's 0.337 and noon's 0.491. Exposure stays 1.0 so the dome keeps its authored warmth. The ambient
//            and hemisphere sky are warm yellow-greys (#C6B698 / #C2BAAC and #C6B496 / #C2BAA8), which read the
//            ground gold (hue 78-79) and keep the brazier's light on it orange; a redder or bluer grey turns the
//            fire-lit pad pink, a step from maroon.
import * as THREE from 'three';
import { aoFloorColor } from '../world/biomeTable.js';

/** Where each key sits in `s`. `twilight` is preDawn (rising) and dusk (setting); `golden` is sunrise and sunset. */
export const KEY_S = Object.freeze({ night: -0.45, twilight: -0.12, golden: 0.10, day: 0.45 });

/**
 * The four times of day the script is judged at, as dawn-origin cycle fractions, in the order the programme lists them
 * (roadmap move 4): the lookbook shoots each place at these and the media name their shots by them. Golden hour sits
 * just before the sunset key in time, the sun a little above it, and blue hour between dusk and night
 * (tests/gates/colour-script-gates.test.js).
 */
export const LOOK_TIMES = Object.freeze({ afternoon: 0.30, 'golden hour': 0.48, 'blue hour': 0.55, midnight: 0.75 });

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
    ambient: { color: '#7E8CA2', intensity: 0.85 },
    hemi: { sky: '#788AAC', ground: '#5A5262', intensity: 1.50 },
    fog: { color: '#5A6690', density: 0.0045 },
    sky: { top: '#141C46', mid: '#34447E', horizon: '#8A90C0' },
    glow: { color: '#8A90C0', strength: 0.15 },
    grade: { saturation: -0.02, brightness: 0.03, contrast: 0.04 },
    stars: 0.5, motes: 0.3, exposure: 1.4,
  },
  sunrise: {
    sun: { color: '#FFB870', intensity: 2.4 },
    moon: { color: '#B4BEE6', intensity: 0 },
    ambient: { color: '#C6B698', intensity: 0.80 },
    hemi: { sky: '#C2BAAC', ground: '#C8906A', intensity: 1.80 },
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
    ambient: { color: '#C6B496', intensity: 0.80 },
    hemi: { sky: '#C2BAA8', ground: '#C88E5C', intensity: 1.80 },
    fog: { color: '#E8C6A0', density: 0.0035 },
    sky: { top: '#3A5CA8', mid: '#8FA8D0', horizon: '#FFC27A' },
    glow: { color: '#FFB060', strength: 0.60 },
    grade: { saturation: 0.18, brightness: 0.03, contrast: 0.08 },
    stars: 0, motes: 0, exposure: 1.0,
  },
  dusk: {
    sun: { color: '#FFAA55', intensity: 0 },
    moon: { color: '#B4BEE6', intensity: 0.55 },
    ambient: { color: '#7E8CA2', intensity: 0.85 },
    hemi: { sky: '#788AAC', ground: '#5A5262', intensity: 1.50 },
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
