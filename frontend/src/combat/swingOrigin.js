/**
 * swingOrigin.js — where the player's swings and aim are measured from: the BODY, never the camera.
 *
 * The camera rides the body's eye plus bob, screen shake and the verb kicks (Components.jsx, the camera follow). All of
 * that is presentation, and it can be large: in the frame a dodge started, the shake put the camera 2.43 m off the
 * body, so a finisher whose cone started at the camera missed a brute 2.2 m ahead of the body
 * (tests/e2e/melee-string.spec.js). Every cone that decides a hit or a target starts here instead.
 *
 * THREE-free and pure: `body` is any {x, y, z} (the rigid body's translation), and the point is written into `out`.
 */

/**
 * The eye over the body's centre: the height the camera follow puts the view at before bob, shake and kick. The capsule
 * is 1.8 m tall and its centre rests 0.95 m up (Components.jsx: half-height 0.5, radius 0.4, the controller's 0.05 m
 * gap), so the eye sits 1.62 m above the ground, 0.23 m under the top of the head. Above the head, the eye would sit
 * inside the ceiling block of any two-block passage the body fits through (DECISIONS 2026-10-28 item 34).
 */
export const EYE_HEIGHT_M = 0.67;

/** The cone apex sits this far below the eye: chest height, 0.4 m over the body's centre, so a swing reaches a mob's
 *  body rather than over it. */
export const SWING_DROP_M = 0.27;

/** The eye without bob, shake or kick, written into `out`, which is returned: the snare's aim and the hurl's launch. */
export function steadyEye(body, out) {
  out.x = body.x;
  out.y = body.y + EYE_HEIGHT_M;
  out.z = body.z;
  return out;
}

/** The apex of the melee cone and the aim cone, written into `out`, which is returned. */
export function swingOrigin(body, out) {
  out.x = body.x;
  out.y = body.y + EYE_HEIGHT_M - SWING_DROP_M;
  out.z = body.z;
  return out;
}
