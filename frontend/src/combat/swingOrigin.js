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

/** The eye over the body's centre: the height the camera follow puts the view at before bob, shake and kick. */
export const EYE_HEIGHT_M = 1.2;

/** The cone apex sits this far below the eye: chest height, so a swing reaches a mob's body rather than over it. */
export const SWING_DROP_M = 0.8;

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
