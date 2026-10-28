// Mood/danger atmosphere model (spec §4), over the light and colour script.
//
// Since 2026-10-27 (plan 2026-10-27-crafty-light-colour-script, Task 3a) the world's light and colour come from the
// CLOCK: render/colourScript.js's six keys on the sun's elevation, with render/keyLight.js choosing the sun or the moon
// as the one directional light. A continuous `mood ∈ [0,2]` is only the DANGER OVERLAY on top: 0..1 a storm, 1..2 the
// obsidian boss state (colours from tokens.PALETTE.obsidian). Night is no longer mood 1. `sampleMood` resolves the
// whole frame; `publishSkyFrame` copies it into `skyFrameRef` once per frame for every reader. `moodRef` is the single
// smoothed "current mood" — written by <Atmosphere>, read by the terrain shader.
import * as THREE from 'three';
import { PALETTE } from '../theme/tokens.js';
import { cycleFraction } from '../game/dayPhase.js';
import { aoFloorColor } from '../world/biomeTable.js';
import { sampleScript, makeScriptFrame } from './colourScript.js';
import { resolveKeyLight, makeKeyLight } from './keyLight.js';
import { SUN_ARC_SWING, sunArcDirection } from './sunArc.js';

// The smoothed current mood (module singleton). <Atmosphere> updates it each
// frame; src/world/Terrain.jsx reads it to drive the terrain `mood`/`timeOfDay`.
export const moodRef = { current: 0 };

// The sun direction <Atmosphere> resolved this frame (mood, day arc, the capture pin — all of it). Written
// there, once per frame; read by anything that must agree with the sky's sun, such as the terrain's cloud
// shadows. Re-deriving it elsewhere would duplicate the arc and the capture pin, and drift from them.
export const sunDirRef = { current: new THREE.Vector3(0.3, 0.6, 0.3).normalize() };
// The cloud cover <Atmosphere> set this frame (0..1; 0 for the sky-studio cards). The terrain's cloud shadows
// read it so there is never a shadow under a sky with no cloud in it.
export const cloudCoverRef = { current: 1 };
// The storm-lightning flash this frame (game/lightning.js flashLight; 0 = none) — <Atmosphere> adds it to the dome and,
// as white light, to the hemisphere's sky term (hemiWithFlash). Written by <LightningDriver> once per frame, read by
// <Atmosphere> — a transient ref, so a flash never re-renders React (Game-Loop Isolation).
export const lightningFlashRef = { current: 0 };

const STATES = ['explore', 'dusk', 'obsidian']; // index === integer mood

// Per-state lighting scalars (tunable). Colours are sourced from tokens.PALETTE.
export const MOOD_SCALARS = {
  explore:  { ambientIntensity: 0.90, sunIntensity: 1.90, fogDensity: 0.0025, fillIntensity: 0.35, hemiIntensity: 0.55, sunPos: [-55, 48, -52] },
  dusk:     { ambientIntensity: 0.62, sunIntensity: 0.85, fogDensity: 0.0120, fillIntensity: 0.45, hemiIntensity: 0.30, sunPos: [-30, 40, -50] },
  obsidian: { ambientIntensity: 0.38, sunIntensity: 0.35, fogDensity: 0.0200, fillIntensity: 0.85, hemiIntensity: 0.12, sunPos: [-50, 30, -50] },
};

// ─────────────────────────────────────────────────────────────────────────────
// S1-D-M3: THE MAGIC-HOUR COLOUR SCRIPT (per-mood grade — Kevin taste-gate).
//
// This replaces the old GLOBAL static grade (HueSaturation 0.22 + BrightnessContrast
// 0.04/0.08) with a per-mood grade lerped on the continuous `mood`. It is delivered
// through the EXISTING composer effects (HueSaturation + BrightnessContrast), driven by
// the sampled-mood `grade` block below via refs in GameScene's <MoodGradeDriver>.
//
// DESIGN INTENT (premium, NOT candy):
//   explore  = MAGIC-HOUR — warm, gently LIFTED shadows (brightness +), tasteful (not
//              blown) saturation, soft contrast. The signature premium-warm read.
//   dusk     = cooler + slightly CRUSHED shadows (brightness −), a touch more contrast,
//              saturation pulled back so the mood is moodier, not gaudy.
//   obsidian = near-MONO desaturated, crushed shadows, dramatic contrast (boss dread).
//
// TUNING KNOBS (eyeball the re-captured explore frame, then nudge these):
//   saturation  HueSaturation.saturation  — colour intensity. Higher = punchier; too
//               high reads "candy". Explore 0.30 is the warm magic-hour ceiling (Kevin reversed the
//               restrained-NEUTRAL lock 2026-06-17 W2; was 0.20).
//   brightness  BrightnessContrast.brightness — shadow LIFT (+) / crush (−). The
//               magic-hour "lift" is explore's +0.09 (W2; was +0.05); obsidian crushes to −0.06.
//   contrast    BrightnessContrast.contrast — tonal punch. Dusk/obsidian add drama.
// The effect ranges are clamped/blended in MoodGradeDriver; all three are SAFE to retune
// without touching the shader. Capture-safe: mood is snapped in capture so grade is stable.
//
// SINCE 2026-10-27 the base grade is the colour script's, per key (render/colourScript.js); sampleMood reads only
// `obsidian` here, as the boss state's grade. `explore` and `dusk` are kept as the record of the old per-mood script.
export const MOOD_GRADE = {
  explore:  { saturation: 0.30, brightness: 0.09, contrast: 0.06 }, // magic-hour: warm, lifted, tasteful
  dusk:     { saturation: 0.10, brightness: -0.02, contrast: 0.12 }, // cooler, slightly crushed, more punch
  obsidian: { saturation: -0.45, brightness: -0.06, contrast: 0.18 }, // near-mono, crushed, dramatic
};

const lerp = THREE.MathUtils.lerp;

/**
 * Map (dangerLevel, weatherBoost) -> target mood in [0,2]: the larger of the two, clamped.
 *
 * NIGHT IS NO LONGER DANGER (plan 2026-10-27-crafty-light-colour-script, decision 2). This used to floor the mood at 1
 * whenever `isDay` was false, so every night WAS the dusk danger palette: a maroon land under an orange horizon. Night
 * is now the colour script's, read from the clock (render/colourScript.js); the mood is only the overlay a storm
 * (0..1) or a boss (1..2) lays over it. An `isDay` argument is accepted and ignored.
 */
export function moodTarget({ dangerLevel = 0, weatherBoost = 0 } = {}) {
  return THREE.MathUtils.clamp(Math.max(Number(dangerLevel) || 0, Number(weatherBoost) || 0), 0, 2);
}

// The sun's arc lives in render/sunArc.js (it moved there so keyLight.js need not import this module); re-exported so
// every existing importer of mood.js is unchanged.
export { SUN_ARC_SWING, sunArcDirection };

/** The fractions capture renders at, DECLARED: noon for a day state, midnight for a night state. */
export const CAPTURE_SOLAR = Object.freeze({ day: 0.25, night: 0.75 });

/**
 * The cycle fraction a capture frame renders at. A finite declared fraction (the store's `captureSolarFraction`, set by
 * a state such as `explore-golden`) wins; otherwise the state's `isDay` picks noon or midnight. Never "wherever the boot
 * clock stopped": a capture guard RESETS to a declared value (AGENTS.md).
 */
export function captureCycle({ isDay = true, captureSolarFraction = null } = {}) {
  if (typeof captureSolarFraction === 'number' && Number.isFinite(captureSolarFraction)) return captureSolarFraction;
  return isDay === false ? CAPTURE_SOLAR.night : CAPTURE_SOLAR.day;
}

/**
 * The cycle fraction live play renders at. A non-finite or non-number `gameTime` (a corrupt save, a NaN from a
 * division) is NOON, never `cycleFraction`'s 0: 0 is dawn, where the key light is 0, so a corrupt clock would render a
 * key-less world. `cycleFraction` itself keeps its 0, which two tests pin for the day-phase dial.
 */
export function liveCycle(gameTime) {
  return typeof gameTime === 'number' && Number.isFinite(gameTime) ? cycleFraction(gameTime) : CAPTURE_SOLAR.day;
}

// The storm overlay (mood 0..1, t1): fog density x(1 + STORM_FOG*t1), the sky's colours STORM_SKY_GREY*t1 of the way
// to their own luminance grey, the key x(1 - STORM_KEY_DIM*t1), stars x(1 - t1), grade saturation -STORM_DESAT*t1.
export const STORM_FOG = 2;
export const STORM_SKY_GREY = 0.4;
export const STORM_KEY_DIM = 0.4;
export const STORM_DESAT = 0.15;
// The boss state (mood 1..2, t2): every colour and scalar lerps to it, so at mood 2 the obsidian look replaces the
// script at ANY hour. Only the key's DIRECTION stays the clock's (and its intensity keeps the horizon fade).
const OBSIDIAN_FILL = '#FF3B5C';
const OB = {
  ambient: new THREE.Color(PALETTE.obsidian.skyMid), fog: new THREE.Color(PALETTE.obsidian.fog),
  skyTop: new THREE.Color(PALETTE.obsidian.skyTop), skyMid: new THREE.Color(PALETTE.obsidian.skyMid),
  skyHorizon: new THREE.Color(PALETTE.obsidian.skyHorizon), hemiSky: new THREE.Color(PALETTE.obsidian.skyMid),
  hemiGround: new THREE.Color(PALETTE.obsidian.fog), sun: new THREE.Color(PALETTE.obsidian.sun), fill: new THREE.Color(OBSIDIAN_FILL),
};

/** A fresh SkyFrame (persistent Colors and arrays). `skyFrameRef.current` is one; `sampleMood`'s scratch is another. */
export function makeSkyFrame() {
  return {
    ambient: new THREE.Color(), fog: new THREE.Color(), fill: new THREE.Color(),
    skyTop: new THREE.Color(), skyMid: new THREE.Color(), skyHorizon: new THREE.Color(),
    hemiSky: new THREE.Color(), hemiGround: new THREE.Color(),
    ambientIntensity: 0, fogDensity: 0, fillIntensity: 0, hemiIntensity: 0, sunPos: [0, 0, 0],
    grade: { saturation: 0, brightness: 0, contrast: 0 },
    keyDir: [0, 1, 0], keyColor: new THREE.Color(), keyIntensity: 0, keyIsMoon: false,
    moonDir: [0, -1, 0], sunDir: [0, 1, 0], sunColor: new THREE.Color(),
    stars: 0, glowColor: new THREE.Color(), glowStrength: 0, motes: 0, daylight: 1, exposure: 1, aoFloor: new THREE.Color(),
    storm: 0,
  };
}

const _out = makeSkyFrame();
const _script = makeScriptFrame();
const _key = makeKeyLight();
const _noon = [0, 0, 0];
const _grey = new THREE.Color();

// Pull a colour `a` of the way toward its own Rec. 709 luminance grey (the storm's washed-out sky).
function greyToward(c, a) {
  if (a <= 0) return c;
  const y = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return c.lerp(_grey.setRGB(y, y, y), a);
}

/**
 * Resolve the SKY FRAME for a continuous mood at a cycle fraction. Returns shared scratch (read or copy it before the
 * next call; `publishSkyFrame` copies it for the other readers).
 *
 *   the base       render/colourScript.js at `cycle` (omitted -> noon), the key light from render/keyLight.js, and the
 *                  key's exposure on the rig's intensities and the dome's colours (decision 6; the fog colour is not
 *                  scaled). `exposure` is reported for reference; it is already applied.
 *   the storm      mood 0..1, the overlay above.
 *   the boss       mood 1..2, lerped to the obsidian state.
 *
 * Fields: everything the light rig, the dome, the grade and the land read. `keyColor` / `keyIntensity` / `keyDir` are
 * the directional light (the moon at night); `sunDir` / `sunColor` are the SUN at every hour (the billboard, ore glow,
 * leaves, cloud shadows, GodRays). There is no `sun` or `sunIntensity`: a stale reader of those fails loudly
 * (`Color.copy(undefined)` throws) instead of quietly reading the moon as the sun. `aoFloor` is recomputed from the
 * COMPOSED ambient, so the overlays carry it. `sunPos` is the mood's noon vector arced by the cycle, exactly as
 * before; with no cycle it is the noon vector itself. `storm` is the storm overlay's weight (t1, 0..1; a boss state
 * carries 1), which darkens the clouds' sunlit body: `daylight` does not move under a storm.
 */
export function sampleMood(mood, cycle) {
  const m = THREE.MathUtils.clamp(Number(mood) || 0, 0, 2);
  const f = cycle === undefined || cycle === null ? CAPTURE_SOLAR.day : cycle;
  // The noon sun vector: the three mood states' own, lerped on the mood exactly as before.
  const i = Math.min(Math.floor(m), 1), t = m - i;
  const sa = MOOD_SCALARS[STATES[i]].sunPos, sb = MOOD_SCALARS[STATES[i + 1]].sunPos;
  _noon[0] = lerp(sa[0], sb[0], t); _noon[1] = lerp(sa[1], sb[1], t); _noon[2] = lerp(sa[2], sb[2], t);
  const sc = sampleScript(f, _script);
  const k = resolveKeyLight(_noon, f, sc, _key);
  const t1 = Math.min(m, 1);
  const t2 = Math.max(0, m - 1);
  const e = sc.exposure;
  const ob = MOOD_SCALARS.obsidian, og = MOOD_GRADE.obsidian;

  _out.ambient.copy(sc.ambient.color).lerp(OB.ambient, t2);
  _out.ambientIntensity = lerp(sc.ambient.intensity * e, ob.ambientIntensity, t2);
  _out.hemiSky.copy(sc.hemi.sky).lerp(OB.hemiSky, t2);
  _out.hemiGround.copy(sc.hemi.ground).lerp(OB.hemiGround, t2);
  _out.hemiIntensity = lerp(sc.hemi.intensity * e, ob.hemiIntensity, t2);
  _out.fog.copy(sc.fog.color).lerp(OB.fog, t2);
  _out.fogDensity = lerp(sc.fog.density * (1 + STORM_FOG * t1), ob.fogDensity, t2);
  greyToward(_out.skyTop.copy(sc.sky.top).multiplyScalar(e), STORM_SKY_GREY * t1).lerp(OB.skyTop, t2);
  greyToward(_out.skyMid.copy(sc.sky.mid).multiplyScalar(e), STORM_SKY_GREY * t1).lerp(OB.skyMid, t2);
  greyToward(_out.skyHorizon.copy(sc.sky.horizon).multiplyScalar(e), STORM_SKY_GREY * t1).lerp(OB.skyHorizon, t2);
  _out.fill.copy(OB.fill);
  _out.fillIntensity = ob.fillIntensity * t2; // the base has no fill light

  _out.keyColor.copy(k.keyColor).lerp(OB.sun, t2);
  _out.keyIntensity = lerp(k.keyIntensity * e * (1 - STORM_KEY_DIM * t1), ob.sunIntensity * k.fade, t2);
  _out.keyIsMoon = k.keyIsMoon;
  for (let j = 0; j < 3; j++) { _out.keyDir[j] = k.keyDir[j]; _out.sunDir[j] = k.sunDir[j]; _out.moonDir[j] = k.moonDir[j]; }
  _out.sunColor.copy(sc.sun.color).lerp(OB.sun, t2);
  _out.glowColor.copy(sc.glow.color).lerp(OB.sun, t2);
  _out.glowStrength = lerp(sc.glow.strength, 0, t2);

  _out.stars = sc.stars * (1 - t1);
  _out.storm = t1; // the storm overlay's weight, for the clouds' sunlit body (render/cloudField.js cloudTint)
  _out.motes = sc.motes * (1 - t2);
  _out.daylight = sc.daylight * (1 - t2);
  _out.exposure = lerp(e, 1, t2);
  _out.grade.saturation = lerp(sc.grade.saturation - STORM_DESAT * t1, og.saturation, t2);
  _out.grade.brightness = lerp(sc.grade.brightness, og.brightness, t2);
  _out.grade.contrast = lerp(sc.grade.contrast, og.contrast, t2);
  const ao = aoFloorColor([_out.ambient.r, _out.ambient.g, _out.ambient.b]);
  _out.aoFloor.setRGB(ao[0], ao[1], ao[2]);

  // THE ARC. With a cycle, `sunPos` is the noon vector on its arc (the same unit vector as `sunDir`); with none, the noon
  // vector itself, the historical fixed bearing, so that call stays additive.
  if (cycle === undefined || cycle === null) { _out.sunPos[0] = _noon[0]; _out.sunPos[1] = _noon[1]; _out.sunPos[2] = _noon[2]; }
  else sunArcDirection(_noon, f, _out.sunPos);
  return _out;
}

// The frame's field names, listed once: the copy runs every frame and must not allocate (Object.keys would, per call).
const SKY_FRAME_KEYS = Object.freeze(Object.keys(_out));

/** Copy every field of SkyFrame `src` into SkyFrame `dst` (Colors, arrays and the grade by value). */
function copySkyFrame(dst, src) {
  for (const key of SKY_FRAME_KEYS) {
    const d = dst[key], s = src[key];
    if (d instanceof THREE.Color) d.copy(s);
    else if (Array.isArray(d)) { d[0] = s[0]; d[1] = s[1]; d[2] = s[2]; }
    else if (d && typeof d === 'object') Object.assign(d, s);
    else dst[key] = s;
  }
  return dst;
}

/**
 * THE ONE RESOLVED FRAME, published by <Atmosphere> once per frame (Task 3b); the dome, the light rig, the sun
 * billboard, the grade and the land read THIS instead of re-sampling the mood with no cycle. A reader that runs before
 * Atmosphere in a frame reads the previous frame's values (the script is continuous, and capture flushes frames before
 * every shot). It starts as the noon day frame, so nothing reads zeros before Atmosphere's first frame.
 */
export const skyFrameRef = { current: makeSkyFrame() };

/** COPY `frame` into `skyFrameRef.current` — never alias `sampleMood`'s scratch, which the next call overwrites. */
export function publishSkyFrame(frame) {
  copySkyFrame(skyFrameRef.current, frame);
  return skyFrameRef.current;
}

publishSkyFrame(sampleMood(0));
