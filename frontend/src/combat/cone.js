/**
 * cone.js — pure melee-cone geometry, extracted from SimplifiedNPCSystem.jsx's
 * `checkMobsInMeleeCone` so the SAME front-arc test can be reused (mobs AND the
 * boss) and unit-tested without THREE / a GPU / the ECS.
 *
 * Behaviour is IDENTICAL to the original inline math:
 *   - a 2D (xz-plane) angle test via dot-product against the look direction,
 *     where minDot = cos(angleRad / 2)  (angleRad is the FULL arc),
 *   - a vertical cutoff (|dy| > 2.2 misses — keeps the melee swing on the
 *     player's horizontal plane), and
 *   - a 3D range check (dist > range misses).
 *
 * THREE-free on purpose: accepts plain `{x, y, z}`-shaped args (THREE.Vector3
 * is structurally compatible, so callers may pass either). Pure function — no
 * allocation of THREE objects, no side effects.
 *
 * @param {{x:number,y:number,z:number}} origin  cone apex (the attacker)
 * @param {{x:number,y:number,z:number}} dir      forward look direction (y is
 *        ignored here; callers already zero+normalize it — only x,z are used)
 * @param {{x:number,y:number,z:number}} point    candidate target position
 * @param {number} range     max 3D distance (default 4.5)
 * @param {number} angleRad  FULL arc in radians (default Math.PI/2 -> +/-45deg)
 * @returns {boolean} true if `point` is inside the cone
 */
export function isPointInCone(origin, dir, point, range = 4.5, angleRad = Math.PI / 2) {
  // forward2D = normalize(Vector2(dir.x, dir.z))
  const fLen = Math.hypot(dir.x, dir.z);
  // Degenerate forward (looking straight up/down) — no horizontal facing, no hit.
  if (fLen === 0) return false;
  const fx = dir.x / fLen;
  const fz = dir.z / fLen;

  const minDot = Math.cos(angleRad / 2);

  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const dz = point.z - origin.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (dist > range) return false;
  if (Math.abs(dy) > 2.2) return false; // horizontal plane vertical cutoff

  // toPoint2D = normalize(Vector2(dx, dz)); dot = forward2D . toPoint2D
  const pLen = Math.hypot(dx, dz);
  // Degenerate: target shares the apex's xz column. THREE.Vector2.normalize()
  // leaves a zero vector at (0,0), giving dot = 0; mirror that exactly.
  if (pLen === 0) return 0 >= minDot;
  const dot = fx * (dx / pLen) + fz * (dz / pLen);
  return dot >= minDot;
}
