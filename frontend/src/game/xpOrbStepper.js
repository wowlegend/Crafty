/**
 * xpOrbStepper.js -- PURE per-frame magnet-pickup physics (no THREE/React; node-testable). Extracted
 * byte-equivalent from SimplifiedNPCSystem's XPOrbSystem + LootSystem (the god-file de-monolith,
 * charter S3). The XP-orb and loot steppers are the SAME physics with DIFFERENT params (spec S3-M6),
 * now unified behind `_stepMagnet`. Mutates orb.position/velocity/age via .x/.y/.z arithmetic (works
 * on a THREE.Vector3 entity AND a plain test object) and returns {collected} -- the component owns the
 * (different) collect side-effects. ctx = { playerPos:{x,y,z}, groundYAt:(x,z)=>number|null }.
 */

// Shared magnet-pickup step. params = { magnetRange, pullBase, pullFloor }.
function _stepMagnet(orb, delta, ctx, { magnetRange, pullBase, pullFloor }) {
  const p = orb.position, v = orb.velocity;
  orb.age += delta;
  if (orb.age < 0.8) {
    // explosion phase: gravity + ground bounce (identical for both pickups)
    v.y -= 12 * delta;
    p.x += v.x * delta; p.y += v.y * delta; p.z += v.z * delta;
    const gy = ctx.groundYAt ? ctx.groundYAt(p.x, p.z) : null;
    if (gy !== null && !Number.isNaN(gy) && p.y < gy + 0.1) {
      p.y = gy + 0.1;
      v.y = -v.y * 0.4;       // bounce damping
      v.x *= 0.7; v.z *= 0.7; // friction
    }
    return { collected: false };
  }
  // magnetic pull phase
  const pp = ctx.playerPos;
  const dx = pp.x - p.x, dy = (pp.y - 0.5) - p.y, dz = pp.z - p.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist < magnetRange) {
    const inv = 1 / (dist || 1e-6);
    const pullSpeed = Math.max(pullFloor, pullBase / (dist + 0.2));
    p.x += dx * inv * pullSpeed * delta;
    p.y += dy * inv * pullSpeed * delta;
    p.z += dz * inv * pullSpeed * delta;
  } else if (ctx.groundYAt) {
    const gy = ctx.groundYAt(p.x, p.z);
    if (gy !== null && !Number.isNaN(gy)) p.y = gy + 0.1;
  }
  return { collected: dist < 1.2 };
}

/** XP-orb: magnet range 12, pull base 80, floor 4 (the original XPOrbSystem params). */
export function stepXPOrb(orb, delta, ctx) {
  return _stepMagnet(orb, delta, ctx, { magnetRange: 12, pullBase: 80, pullFloor: 4 });
}

/** Loot drop: magnet range 7, pull base 40, floor 3 (the original LootSystem params). */
export function stepLootDrop(orb, delta, ctx) {
  return _stepMagnet(orb, delta, ctx, { magnetRange: 7, pullBase: 40, pullFloor: 3 });
}
