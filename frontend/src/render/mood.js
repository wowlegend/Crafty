// Mood/danger atmosphere model (spec §4). A single continuous `mood ∈ [0,2]`
// blends three palette STATES: 0 = explore (day), 1 = dusk (night/combat,
// everyday — spec §4 Tier 1), 2 = obsidian (boss). Colours come from
// tokens.PALETTE; per-state lighting SCALARS live here. `moodRef` is the single
// smoothed "current mood" — written by <Atmosphere>, read by the terrain shader.
import * as THREE from 'three';
import { PALETTE } from '../theme/tokens.js';

// The smoothed current mood (module singleton). <Atmosphere> updates it each
// frame; src/world/Terrain.jsx reads it to drive the terrain `mood`/`timeOfDay`.
export const moodRef = { current: 0 };

const STATES = ['explore', 'dusk', 'obsidian']; // index === integer mood

// Per-state lighting scalars (tunable). Colours are sourced from tokens.PALETTE.
export const MOOD_SCALARS = {
  explore:  { ambientIntensity: 0.90, sunIntensity: 1.90, fogDensity: 0.0025, fillIntensity: 0.00, sunPos: [-55, 48, -52] },
  dusk:     { ambientIntensity: 0.62, sunIntensity: 0.85, fogDensity: 0.0120, fillIntensity: 0.45, sunPos: [-30, 40, -50] },
  obsidian: { ambientIntensity: 0.38, sunIntensity: 0.35, fogDensity: 0.0200, fillIntensity: 0.85, sunPos: [-50, 30, -50] },
};

// Per-state colour roles (mapped from palette tokens).
const ROLE = { ambient: 'skyMid', sun: 'sun', fog: 'fog' };
// Fill light colour per state (explore: cool sky; dusk: hero-accent; obsidian: magic-red).
const FILL_HEX = { explore: PALETTE.explore.skyMid, dusk: PALETTE.dusk.heroAccent, obsidian: '#FF3B5C' };

// Pre-parsed per-state Colors (no per-frame allocation). skyTop/skyMid/skyHorizon
// feed the gradient SkyDome (Task 2); ambient/sun/fog/fill feed the lights + fog.
const COL = {};
for (const s of STATES) {
  COL[s] = {
    ambient: new THREE.Color(PALETTE[s][ROLE.ambient]),
    sun: new THREE.Color(PALETTE[s][ROLE.sun]),
    fog: new THREE.Color(PALETTE[s][ROLE.fog]),
    fill: new THREE.Color(FILL_HEX[s]),
    skyTop: new THREE.Color(PALETTE[s].skyTop),
    skyMid: new THREE.Color(PALETTE[s].skyMid),
    skyHorizon: new THREE.Color(PALETTE[s].skyHorizon),
  };
}

// Reusable result scratch (mutated each call — do not retain references across frames).
const _out = {
  ambient: new THREE.Color(), sun: new THREE.Color(), fog: new THREE.Color(), fill: new THREE.Color(),
  skyTop: new THREE.Color(), skyMid: new THREE.Color(), skyHorizon: new THREE.Color(),
  ambientIntensity: 0, sunIntensity: 0, fogDensity: 0, fillIntensity: 0, sunPos: [0, 0, 0],
};

const lerp = THREE.MathUtils.lerp;

/** Map (isDay, dangerLevel) -> target mood in [0,2]. Night = dusk(1); danger overrides up. */
export function moodTarget({ isDay = true, dangerLevel = 0 } = {}) {
  const night = isDay ? 0 : 1;
  return THREE.MathUtils.clamp(Math.max(night, Number(dangerLevel) || 0), 0, 2);
}

/** Resolve the blended atmosphere for a continuous mood. Returns shared scratch. */
export function sampleMood(mood) {
  const m = THREE.MathUtils.clamp(Number(mood) || 0, 0, 2);
  const i = Math.min(Math.floor(m), 1);        // bracket lower index: 0 or 1
  const t = m - i;                              // fraction into [i, i+1]
  const a = STATES[i], b = STATES[i + 1];
  const sa = MOOD_SCALARS[a], sb = MOOD_SCALARS[b];
  _out.ambient.lerpColors(COL[a].ambient, COL[b].ambient, t);
  _out.sun.lerpColors(COL[a].sun, COL[b].sun, t);
  _out.fog.lerpColors(COL[a].fog, COL[b].fog, t);
  _out.fill.lerpColors(COL[a].fill, COL[b].fill, t);
  _out.skyTop.lerpColors(COL[a].skyTop, COL[b].skyTop, t);
  _out.skyMid.lerpColors(COL[a].skyMid, COL[b].skyMid, t);
  _out.skyHorizon.lerpColors(COL[a].skyHorizon, COL[b].skyHorizon, t);
  _out.ambientIntensity = lerp(sa.ambientIntensity, sb.ambientIntensity, t);
  _out.sunIntensity = lerp(sa.sunIntensity, sb.sunIntensity, t);
  _out.fogDensity = lerp(sa.fogDensity, sb.fogDensity, t);
  _out.fillIntensity = lerp(sa.fillIntensity, sb.fillIntensity, t);
  _out.sunPos[0] = lerp(sa.sunPos[0], sb.sunPos[0], t);
  _out.sunPos[1] = lerp(sa.sunPos[1], sb.sunPos[1], t);
  _out.sunPos[2] = lerp(sa.sunPos[2], sb.sunPos[2], t);
  return _out;
}
