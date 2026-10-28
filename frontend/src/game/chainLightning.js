/**
 * chainLightning.js — which mobs a chain-lightning strike hops to, and how hard each hop hits.
 *
 * `mobs` are live ECS entities (`mobsQuery.entities`, positions as {x, y, z}). The allegiance filter drops the
 * dead and the dissolving as well as the passive and the protected, so a hop is never spent on a corpse.
 * The first hop deals baseDamage * damageReduction, not baseDamage minus a reduction: the arcs are weak echoes
 * of the direct hit, and each further hop falls off by (1 - damageReduction).
 */
import { isAutoTargetable } from '../combat/targeting.js';

export function solveChainTargets(mobs, startPos, { excludeId, baseDamage, maxChains, range, damageReduction }) {
  if (!mobs || mobs.length === 0) return [];

  let currentDamage = baseDamage * damageReduction;
  let last = { x: startPos.x, y: startPos.y, z: startPos.z };
  const hit = new Set([excludeId]);
  const out = [];

  const distSqFrom = (from, mob) => {
    const dx = mob.position.x - from.x;
    const dy = mob.position.y - from.y;
    const dz = mob.position.z - from.z;
    return dx * dx + dy * dy + dz * dz;
  };

  // The chain picks its own victims, so only hostiles: aiming at livestock still works through the direct hit.
  const maxPossibleRangeSq = (range * maxChains) ** 2;
  const nearby = mobs.filter((mob) => isAutoTargetable(mob) && distSqFrom(last, mob) <= maxPossibleRangeSq);

  for (let i = 0; i < maxChains; i++) {
    let nearest = null;
    let nearestDistSq = range * range;
    for (const mob of nearby) {
      if (hit.has(mob.id)) continue;
      const distSq = distSqFrom(last, mob);
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearest = mob;
      }
    }
    if (!nearest) break;
    hit.add(nearest.id);
    out.push({ id: nearest.id, position: nearest.position, damage: Math.floor(currentDamage) });
    last = { x: nearest.position.x, y: nearest.position.y, z: nearest.position.z };
    currentDamage *= (1 - damageReduction);
  }
  return out;
}
