/**
 * allegiance.js — S2-B3-M3: the allegiance seam. Converting a mob into an ally is a miniplex
 * COMPONENT SWAP (isMob -> isAlly): queries re-index synchronously, so the entity atomically
 * exits mobsQuery — which the worker serializer, the per-message apply map (rebuilt fresh),
 * the >100u cull, the spawn-cap count, the minimap hostile
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

/**
 * releaseOverCap(world, allies, cap) -> the entities released (removed from the world).
 *
 * The squad cap is an INVARIANT, not a gate on new binds only (QUEUE R1.4): a respec that refunds Pack
 * Bond lowers the cap, and a squad above it must shrink, or the refund is a free, repeatable exploit —
 * take Pack Bond, bind a third, respec, keep it. Released creatures DEPART (the bond breaks) rather than
 * turning hostile at your side, which would punish a menu choice with a fight.
 *
 * Who leaves is deterministic: plain binds before hybrids (a fusion cost 50 Soul), then the weakest
 * (lowest maxHealth), then by id. `allies` is not mutated by the sort — miniplex re-indexes on remove.
 */
export function releaseOverCap(world, allies, cap) {
  const excess = (allies?.length || 0) - cap;
  if (excess <= 0) return [];
  const order = [...allies].sort((a, b) =>
    (Number(!!a.hybridId) - Number(!!b.hybridId)) ||
    ((a.maxHealth || 0) - (b.maxHealth || 0)) ||
    String(a.id).localeCompare(String(b.id)));
  const out = order.slice(0, excess);
  for (const e of out) world.remove(e);
  return out;
}
