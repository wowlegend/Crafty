/**
 * targeting.js — THE allegiance filter. One table, every player-damage path.
 *
 * WHY THIS EXISTS (the 18-domain review, 2026-07-14):
 * `mobsQuery = ecs.with('isMob','position','type')` and `npcSpawn.makeNpcEntity` sets `isMob: true`
 * on the four hub questgivers — deliberately, to reuse the MobModel renderer and the minimap mirror.
 * The AI tick gates them out (`!isStatic`). **Combat never did.** So every player-damage surface
 * happily targeted the merchant, the smith, the healer and the guide:
 *
 *   - melee cone      -> 2.7s of holding LMB permanently killed all four. No respawn path exists:
 *                        trading, crafting, healing and the quest chain are gone for the rest of the run.
 *   - chain lightning -> auto-hopped onto passive villagers and livestock you never aimed at.
 *   - element zones   -> applied to `mobsQuery.entities` wholesale, so a fire zone burned questgivers.
 *   - ally squad AI   -> could be ordered onto one.
 *
 * THE THREE TIERS (this is a game-design decision, not just a bug fix):
 *   PROTECTED  (`isNPC`) — the hub questgivers. **Cannot be damaged by anything, ever.** Not a "very
 *                          high HP" mob, not a "they respawn" mob: an invariant. A player must not be
 *                          able to delete the game's service layer by mashing left-click.
 *   NEUTRAL    (`passive`, not isNPC) — livestock (Boar, Ox) and wild Settlers. Killable when you
 *                          DELIBERATELY aim at them (they are food and loot), but NEVER auto-selected
 *                          by an auto-targeter. Chain lightning hopping to a cow you didn't aim at is
 *                          the bug; walking up and hunting the cow is the feature.
 *   HOSTILE    (everything else) — fully targetable, fully auto-targetable.
 *
 * `isNPC` is the exact key: it is set in exactly one place (`world/npcSpawn.js:25`) and only on the
 * four hub NPCs. Wild `villager`-type Settlers do not carry it.
 */
import { isPointInCone } from './cone.js';

/** The hub questgivers. Nothing may damage these — the hard invariant. */
export function isProtected(e) {
  return !!(e && e.isNPC);
}

/** Hostile = a legitimate auto-target. Excludes the protected, the passive AND the already-dead —
 *  chain lightning spending one of its three hops on an invisible corpse is the same defect as a
 *  fireball resolving against one. */
export function isHostile(e) {
  return !!(e && !isProtected(e) && !e.passive && !isDefeated(e));
}

/**
 * Already dead, or mid-death-dissolve. A killed mob is NOT removed from the ECS at the moment it dies:
 * CombatSystem stamps `dyingUntil` and lets the model dissolve, and the only removal happens inside
 * SpawnerSystem's 1000ms sweep throttle — so a corpse lingers 320-1320ms. `mobsQuery` is
 * `ecs.with('isMob','position','type')`, which carries no health component, so corpses stay in the very
 * list every targeter walks. For most of that window the model is scaled to 0.001, i.e. INVISIBLE.
 */
function isDefeated(e) {
  return !!(e && ((typeof e.health === 'number' && e.health <= 0) || e.dyingUntil));
}

/**
 * May a player attack land on this entity AT ALL?
 * Livestock: yes (deliberate hunting). Hub NPCs: never. Corpses: never.
 *
 * The corpse exclusion is where the nearest-hit test used to lose the fight it had just won: an invisible
 * body stayed the NEAREST damageable entity and ate the next fireball, so the shot you aimed at the
 * zombie behind it simply vanished. Every one of the comparable systems -- element zones, squad AI, the
 * minimap mirror, nametags, the AI worker -- already filtered `health <= 0`; this module was the sole
 * omission, and it is the one the projectile hit-resolution goes through. Excluding here also stops a
 * second hit from re-running the whole damage side-effect chain on something already dead.
 */
export function canPlayerDamage(e) {
  return !!(e && !isProtected(e) && !isDefeated(e));
}

/**
 * May an AUTO-targeter (chain-lightning hop, snare-nearest, aim assist) pick this entity on its own?
 * Only hostiles. This is what stops chain lightning from executing the village cow.
 */
export function isAutoTargetable(e) {
  return isHostile(e);
}

/** Everything the player's swing may legitimately connect with, inside the cone. */
export function damageableInCone(entities, playerPos, lookDir, range, angleRad) {
  return (entities || []).filter(
    (e) => canPlayerDamage(e) && e.position && isPointInCone(playerPos, lookDir, e.position, range, angleRad)
  );
}

/**
 * NEAREST damageable entity within `range` — not first-in-ECS.
 *
 * The old `checkMobCollision` did `mobsQuery.entities.find(...)`, returning whatever miniplex happened
 * to hold first. A fireball aimed dead at a zombie standing in front of a cow would resolve against
 * the COW if the cow was inserted first. Projectile hit-resolution must be a nearest-hit test.
 *
 * B8 (arcane pierce): `excludeIds` skips entities a piercing projectile has ALREADY hit, so it pierces to
 * DISTINCT targets. Without it, a pierced projectile stays inside the hit mob's radius and re-resolves
 * against the SAME nearest mob every frame — the "pierce 3 targets" arcane spell triple-hit ONE target
 * (3x damage, 3x lifesteal, zero pierces). Absent/empty excludeIds -> unchanged single-hit behaviour.
 */
export function nearestDamageable(entities, pos, range = 3, excludeIds = null) {
  let best = null;
  let bestDist = Infinity;
  for (const e of entities || []) {
    if (!canPlayerDamage(e) || !e.position) continue;
    if (excludeIds && excludeIds.has(e.id)) continue;
    const dx = e.position.x - pos.x;
    const dy = e.position.y - pos.y;
    const dz = e.position.z - pos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < range && dist < bestDist) {
      best = e;
      bestDist = dist;
    }
  }
  return best;
}
