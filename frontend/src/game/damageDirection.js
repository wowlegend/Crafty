/**
 * damageDirection.js — the screen-relative angle toward an incoming hit (combat-legibility cue).
 * 0 = dead ahead (top of screen), +pi/2 = right, -pi/2 = left, +/-pi = behind. Pure; accepts a THREE
 * Vector3 ({x,z}) OR an [x,y,z] array. Derived from the three.js YXZ camera basis: forward (-sin,-cos),
 * right (cos,-sin); angle = atan2(d . right, d . forward).
 */
const cx = (p) => (p == null ? null : (p.x ?? p[0]));
const cz = (p) => (p == null ? null : (p.z ?? p[2]));

export function hitDirection(playerPos, sourcePos, cameraYaw) {
  if (!playerPos || !sourcePos) return null;
  const dx = cx(sourcePos) - cx(playerPos);
  const dz = cz(sourcePos) - cz(playerPos);
  if (dx === 0 && dz === 0) return 0;
  const s = Math.sin(cameraYaw || 0), c = Math.cos(cameraYaw || 0);
  const forward = -dx * s - dz * c; // d . forward(-sin,-cos)
  const right = dx * c - dz * s;     // d . right(cos,-sin)
  return Math.atan2(right, forward);
}
