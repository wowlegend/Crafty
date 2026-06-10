/**
 * allegiance.js — S2-B3-M3: the allegiance seam. Converting a mob into an ally is a miniplex
 * COMPONENT SWAP (isMob -> isAlly): queries re-index synchronously, so the entity atomically
 * exits mobsQuery — which the worker serializer, the per-message apply map (rebuilt fresh,
 * SimplifiedNPCSystem :753-757), the >100u cull, the spawn-cap count, the minimap hostile
 * count, and the player melee cone ALL read live. One op, five hostile surfaces exited by
 * construction (design §1; the invariant tests pin this construction against future caching).
 * The villager (quest NPC) is blocklisted here — the deepest layer (design §4).
 */
const UNBINDABLE = new Set(['villager']);

/** convertMobToAlly(world, entity) -> the same entity (now an ally) or null (refused). */
export function convertMobToAlly(world, entity) {
  if (!entity || !entity.isMob || UNBINDABLE.has(entity.type)) return null;
  world.removeComponent(entity, 'isMob');
  world.addComponent(entity, 'isAlly', true);
  entity.baseType = entity.type;        // the fusion-lookup key (M6) survives re-tints
  entity.health = entity.maxHealth;     // binding mends — the creature joins whole (design §2)
  entity.isAggro = false;               // no lingering hostility flag
  return entity;
}
