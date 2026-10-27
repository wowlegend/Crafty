// keyLight.js — the one directional light, and which body it is: the sun by day, the moon by night.
//
// Plan 2026-10-27-crafty-light-colour-script, Task 2 (refute F5). PURE: no scene, no store.
//
// THE MOON IS THE SAME LIGHT ON ITS OWN VECTOR. The rig keeps exactly one directional light, so the light count never
// changes (no program relink) and shadows stay on all night. `moonArcDirection(f)` is the sun's own arc function
// (render/mood.js sunArcDirection) applied to `MOON_NOON` half a cycle later, so the moon is up exactly when the sun is
// down. The key's intensity fades to 0 within `|s| < HORIZON_FADE` on each side of the horizon, so the direction swaps
// only under a key of intensity 0: the world is never lit from under the ground, and never pops.
//
// `sunDir` IS ALWAYS THE SUN. Ore glow (world/oreGlow.js), leaf translucency (world/leafFeel.js), cloud shadows
// (render/cloudField.js) and the GodRays horizon gate all mean the SUN: at midnight they must see it under the ground,
// not the moon overhead. Only `keyDir` follows the body that lights the world.
//
// HORIZON_FADE = 0.06, and the fade window carries its own continuity bound (review amendment 8): the key ramps from 0
// to about 2.5 in a few seconds there, which is a ramp, not a pop; widening the fade enough to bring that step under the
// day's bound would dim the golden key the lookbook frames.
import * as THREE from 'three';
import { sunArcDirection } from './mood.js';
import { solarPhase } from './colourScript.js';

/** The moon's direction at its own noon: the painted moon's azimuth (render/skyDome.js), raised to the sun's 32 deg. */
export const MOON_NOON = Object.freeze([0.284, 0.53, -0.799]);
/** The key fades to 0 within this much `s` of the horizon, on both sides. */
export const HORIZON_FADE = 0.06;

/** The moon's unit direction at cycle fraction `f`: the sun's arc on MOON_NOON, half a cycle behind. */
export function moonArcDirection(f, out = [0, 0, 0]) {
  return sunArcDirection(MOON_NOON, solarPhase(f).f - 0.5, out);
}

/** A fresh result to write into (persistent arrays and one Color; nothing is allocated per frame). */
export function makeKeyLight() {
  return { sunDir: [0, 0, 0], moonDir: [0, 0, 0], keyDir: [0, 0, 0], keyIsMoon: false, keyColor: new THREE.Color(), keyIntensity: 0 };
}

const _out = makeKeyLight();
const copy3 = (dst, src) => { dst[0] = src[0]; dst[1] = src[1]; dst[2] = src[2]; return dst; };

/**
 * PURE. Which body keys the world at `f`, from where, in what colour, how strongly. `frame` is a ScriptFrame
 * (render/colourScript.js sampleScript): its `sun` and `moon` carry colour and intensity BEFORE exposure, and so does
 * `keyIntensity` here. `noonSunPos` is the mood's noon sun vector (render/mood.js MOOD_SCALARS). Writes into `out`
 * (a persistent scratch when omitted: read or copy it before the next call).
 */
export function resolveKeyLight(noonSunPos, f, frame, out = _out) {
  const { s, f: ff } = solarPhase(f);
  sunArcDirection(noonSunPos, ff, out.sunDir);
  moonArcDirection(ff, out.moonDir);
  const fade = THREE.MathUtils.smoothstep(Math.abs(s), 0, HORIZON_FADE);
  if (s >= 0) {
    out.keyIsMoon = false;
    copy3(out.keyDir, out.sunDir);
    out.keyColor.copy(frame.sun.color);
    out.keyIntensity = frame.sun.intensity * fade;
  } else {
    out.keyIsMoon = true;
    copy3(out.keyDir, out.moonDir);
    out.keyColor.copy(frame.moon.color);
    out.keyIntensity = frame.moon.intensity * fade;
  }
  return out;
}
