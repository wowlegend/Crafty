// mobTones.js — identity and threat on a mob (feedback-grammar plan M4).
//
// Every bright thing on a mob means something, and a hostile's eyes are the only part of it that glows: red lifted past
// the bloom threshold (render/hdrGain.js), so they read as a threat's tell at night, while a settler's eyes stay plain.
// Each mob also wears two more tones on parts it already has, a lighter head (a face read at a glance) and darker legs
// (extremities), so identity costs no part, draw or program: the plan's flush plate and strap would each have added a
// mesh and its ink hull.
import * as THREE from 'three';
import { BLOOM_THRESHOLD, hdrGain } from './hdrGain.js';

const WHITE = new THREE.Color(1, 1, 1);
const HEAD_LIFT = 0.22; // the head's step toward white, in linear light
const LEG_SHADE = 0.7; // the legs' share of the body colour

/** A body colour's head and leg tones, as sRGB hex. */
export function mobTones(hex) {
  const c = new THREE.Color(hex);
  return { head: `#${c.clone().lerp(WHITE, HEAD_LIFT).getHexString()}`, leg: `#${c.multiplyScalar(LEG_SHADE).getHexString()}` };
}

/** A hostile's eyes: red at 1.25x the bloom threshold's luminance. Through the Neutral tone map the core reads hot
 *  red-pink, about sRGB (0.99, 0.58, 0.58), with a red halo. */
export const HOSTILE_EYE = new THREE.Color('#ff0000').multiplyScalar(hdrGain('#ff0000', BLOOM_THRESHOLD, 1.25));
