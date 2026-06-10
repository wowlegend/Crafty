/**
 * hybrids.js — S2-B3-M6: the CURATED fusion roster (the spec-locked v1 stance: lookup, never
 * procedural splicing). Keys are sorted baseType pairs; values are COMPLETE parametric MobModel
 * data (the BEAST_FORMS data-driven precedent) — render-ready, role-spread (skirmisher/bruiser/
 * harasser), names with weight. applyFusion consumes two allies and births ONE hybrid ally at
 * their midpoint, reusing the first consumed id (unique by construction; no id-allocator needed).
 */
export const FUSE_RADIUS = 6; // both allies must be this near the player to fuse

export const HYBRIDS = {
  dreadweaver: {
    id: 'dreadweaver', name: 'Dreadweaver', color: '#2E8B6A',
    bodySize: [1.2, 0.9, 1.5], headSize: [0.7, 0.6, 0.7], legMode: 'spider',
    health: 140, speed: 2.8, damage: 14, role: 'skirmisher',
  },
  bonehide_bulwark: {
    id: 'bonehide_bulwark', name: 'Bonehide Bulwark', color: '#C9CDB8',
    bodySize: [1.5, 1.3, 1.9], headSize: [0.8, 0.8, 0.9], legMode: 'quad',
    health: 240, speed: 1.2, damage: 10, role: 'bruiser',
  },
  marrowspinner: {
    id: 'marrowspinner', name: 'Marrowspinner', color: '#9FE8C8',
    bodySize: [0.8, 0.6, 1.3], headSize: [0.55, 0.5, 0.55], legMode: 'spider',
    health: 90, speed: 3.4, damage: 9, role: 'harasser',
  },
};

const PAIRS = {
  'spider+zombie': 'dreadweaver',
  'cow+skeleton': 'bonehide_bulwark',
  'skeleton+spider': 'marrowspinner',
};

export function fuseKey(a, b) {
  return [a, b].sort().join('+');
}

/** lookupHybrid(baseA, baseB) -> the hybrid def or undefined (no entry = the channel never starts). */
export function lookupHybrid(a, b) {
  return HYBRIDS[PAIRS[fuseKey(a, b)]];
}

/** applyFusion(world, allyA, allyB) -> the hybrid ally entity (allyA's id reused) or null. */
export function applyFusion(world, a, b) {
  if (!a || !b || !a.isAlly || !b.isAlly) return null;
  const def = lookupHybrid(a.baseType || a.type, b.baseType || b.type);
  if (!def) return null;
  // the hybrid's position MUST be a THREE.Vector3 (the spawnMob contract): MobModel drives its
  // mesh with Vector3 ops, and a plain {x,y,z} leaves the mesh stranded at the origin — the
  // iter-57 root cause of invisible fused hybrids. Clone the live ally vector (same class,
  // zero new imports in this pure module).
  const mid = a.position.clone ? a.position.clone() : { ...a.position };
  mid.x = (a.position.x + b.position.x) / 2;
  mid.y = Math.max(a.position.y, b.position.y);
  mid.z = (a.position.z + b.position.z) / 2;
  const id = a.id;
  world.remove(a);
  world.remove(b);
  return world.add({
    isAlly: true, id, position: mid, type: def.id, baseType: def.id, hybridId: def.id,
    color: def.color, bodySize: def.bodySize, headSize: def.headSize, legMode: def.legMode,
    health: def.health, maxHealth: def.health, speed: def.speed, damage: def.damage,
    lastAllyAttack: 0,
    // the MobModel ENTITY CONTRACT (iter-59): the renderer reads these every frame —
    // rotation.y = undefined poisons the Euler -> NaN matrix -> an INVISIBLE mesh (the
    // second half of the invisible-hybrid bug; the Vector3 position was the first).
    rotation: (a.rotation ?? 0),
    isAggro: false, isMoving: false, knockback: null, lastHit: 0, snapSync: true,
  });
}
