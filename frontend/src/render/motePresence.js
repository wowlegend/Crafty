// motePresence.js — when the light motes exist, what they look like, and how they keep off the lens. PURE: no scene.
//
// The motes are fireflies: the colour script gives them a presence by the hour (render/colourScript.js `motes`: 1 at
// night, a share at dusk and before dawn, 0 by day), and the sky frame carries it with the boss overlay applied
// (render/mood.js sampleMood). By day there are none, so the mesh is not drawn at all. They drift in a box centred on
// the camera, so a mote can pass right in front of the eye; each one fades out as it nears the camera instead.

/** A firefly's colour: a warm yellow-green, readable on the night key's blue-violet. */
export const FIREFLY_COLOR = '#C8F07A';

/** Opacity at full presence. */
export const FIREFLY_OPACITY = 0.6;

/** Below this presence the mote mesh is not drawn. */
export const MOTE_MIN_PRESENCE = 0.01;

/** The near-camera fade, metres: invisible inside the first, full beyond the second. */
export const MOTE_NEAR = Object.freeze([2.5, 6.0]);

/** Presence 0..1 from a sky frame (render/mood.js skyFrameRef.current). A missing or non-finite value is 0. */
export function motePresence(frame) {
  const m = Number(frame?.motes);
  return Number.isFinite(m) ? Math.min(1, Math.max(0, m)) : 0;
}

/** The fade for a mote `distance` metres from the camera: smoothstep over MOTE_NEAR. */
export function moteNearFade(distance) {
  const d = Number(distance);
  if (!Number.isFinite(d)) return 0;
  const t = Math.min(1, Math.max(0, (d - MOTE_NEAR[0]) / (MOTE_NEAR[1] - MOTE_NEAR[0])));
  return t * t * (3 - 2 * t);
}

/** The same fade as GLSL, generated from MOTE_NEAR so the shader cannot drift from it. `d` is a float expression. */
export function moteNearFadeGlsl(d = 'd') {
  return `smoothstep(${MOTE_NEAR[0].toFixed(3)}, ${MOTE_NEAR[1].toFixed(3)}, ${d})`;
}
