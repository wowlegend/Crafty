/**
 * chainLightning.js — the chain's TARGETING half, pure (S3-M2 T3 extraction from
 * EnhancedMagicSystem's applyChainLightning). Math verbatim, characterized as-is —
 * including the live quirk that the FIRST arc deals baseDamage * damageReduction (NOT
 * base minus a reduction) — the arcs are weak ECHOES of the direct hit, then fall off
 * by x(1 - damageReduction) per hop.
 * The component keeps the thin wrapper (the store read + damageMob/spark application).
 * Mob positions arrive as [x,y,z] arrays (the mobEntities snapshot format).
 */
export function solveChainTargets(mobs, startPos, { excludeId, baseDamage, maxChains, range, damageReduction }) {
  if (!mobs || mobs.length === 0) return [];

  let currentDamage = baseDamage * damageReduction;
  let last = { x: startPos.x, y: startPos.y, z: startPos.z };
  const hit = new Set([excludeId]);
  const out = [];

  const maxPossibleRangeSq = (range * maxChains) ** 2;
  const nearby = mobs.filter((mob) => {
    const dx = mob.position[0] - last.x;
    const dy = mob.position[1] - last.y;
    const dz = mob.position[2] - last.z;
    return (dx * dx + dy * dy + dz * dz) <= maxPossibleRangeSq;
  });

  for (let i = 0; i < maxChains; i++) {
    let nearest = null;
    let nearestDistSq = range * range;
    for (const mob of nearby) {
      if (hit.has(mob.id)) continue;
      const dx = mob.position[0] - last.x;
      const dy = mob.position[1] - last.y;
      const dz = mob.position[2] - last.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearest = mob;
      }
    }
    if (!nearest) break;
    hit.add(nearest.id);
    out.push({ id: nearest.id, position: nearest.position, damage: Math.floor(currentDamage) });
    last = { x: nearest.position[0], y: nearest.position[1], z: nearest.position[2] };
    currentDamage *= (1 - damageReduction);
  }
  return out;
}
