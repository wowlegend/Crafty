// compass.js — pure compass-bearing math (no React/Three; node-testable). Given a world target, the
// player position, the camera heading, and the compass FOV, returns where the target's marker sits on the
// heading-centered compass strip. Shared math for HUD compass markers (HOME/boss/chest all use the same
// dx/dz -> atan2 -> heading-relative diff -> percent mapping the Compass already does inline).

/**
 * @param {number} targetX  world X of the target
 * @param {number} targetZ  world Z of the target
 * @param {number} playerX  player world X
 * @param {number} playerZ  player world Z
 * @param {number} heading  camera heading (radians), atan2(forwardX, -forwardZ); 0 = north
 * @param {number} [fov]    visible field of view in radians (default PI = 180deg)
 * @returns {{ inView: boolean, pct: number, dist: number }}
 *   pct: 0..100 across the strip (50 = dead center); dist: planar distance to the target.
 */
export function bearingToMarker(targetX, targetZ, playerX, playerZ, heading, fov = Math.PI) {
  const dx = targetX - playerX;
  const dz = targetZ - playerZ;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const targetAngle = Math.atan2(dx, -dz);
  let diff = targetAngle - heading;
  while (diff < -Math.PI) diff += Math.PI * 2;
  while (diff > Math.PI) diff -= Math.PI * 2;
  const inView = Math.abs(diff) < fov / 2;
  const pct = ((diff / (fov / 2)) * 50) + 50;
  return { inView, pct, dist };
}

/**
 * Full-circle bearing -> arrow rotation (degrees). When bearingToMarker is called with fov = 2*PI, its
 * `pct` maps the normalized heading-relative bearing [-PI, PI] to [0, 100] (50 = dead-ahead). bearingDeg
 * converts that to degrees in [-180, 180] for a CSS rotate(), so a HUD arrow points to the target REGARDLESS
 * of which way the player faces -- the facing-independent cue the FOV-gated compass markers can't give.
 * @param {number} pct  the bearingToMarker pct at fov = 2*PI
 * @returns {number} rotation in degrees (0 = ahead, +90 = right, +/-180 = behind)
 */
export function bearingDeg(pct) {
  return ((pct - 50) / 50) * 180;
}
