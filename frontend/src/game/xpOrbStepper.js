/**
 * xpOrbStepper.js -- PURE per-frame XP-orb physics (no THREE/React; node-testable). Extracted
 * byte-equivalent from SimplifiedNPCSystem's XPOrbSystem (the god-file de-monolith, charter S3).
 * Mutates orb.position/velocity/age via .x/.y/.z arithmetic (works on a THREE.Vector3 entity AND a
 * plain test object) and returns {collected} -- the component owns grantXP/spawnXPText/sound/remove.
 * ctx = { playerPos:{x,y,z}, groundYAt:(x,z)=>number|null }.
 */
export function stepXPOrb(orb, delta, ctx) {
  const p = orb.position, v = orb.velocity;
  orb.age += delta;
  if (orb.age < 0.8) {
    // explosion phase: gravity + ground bounce
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
  if (dist < 12) {
    const inv = 1 / (dist || 1e-6);
    const pullSpeed = Math.max(4, 80 / (dist + 0.2));
    p.x += dx * inv * pullSpeed * delta;
    p.y += dy * inv * pullSpeed * delta;
    p.z += dz * inv * pullSpeed * delta;
  } else if (ctx.groundYAt) {
    const gy = ctx.groundYAt(p.x, p.z);
    if (gy !== null && !Number.isNaN(gy)) p.y = gy + 0.1;
  }
  return { collected: dist < 1.2 };
}
