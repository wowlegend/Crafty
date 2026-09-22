/**
 * mobDamage.js — the mapping from a worker attack message to damagePlayer's arguments.
 *
 * WHY THIS IS A MODULE AND NOT THREE INLINE ARGUMENTS. The damage lockout is keyed on the ATTACKER, and
 * the attacker's identity has to survive a trip it previously did not: `ai.worker.js` stamps every attack
 * with the mob's entity id, and the call site in `systems/AIWorkerSystem.jsx` used to pass only
 * `attack.type`. Every melee mob in the world therefore shared the lockout key `'melee'`, so a pack of six
 * was rate-limited as though it were one attacker — the id was in the message the whole time.
 *
 * A fix living only at that call site is untestable: `AIWorkerSystem` is a useFrame component, so
 * reverting the argument leaves the entire suite green (the producer/consumer split — what proves the
 * CONSUMER handles a key says nothing about whether the PRODUCER emits one). Pulling the mapping out makes
 * the producer drivable, which is the point of the extraction rather than tidiness.
 *
 * WHAT THIS DOES NOT CHECK: that AIWorkerSystem calls it. That is one line of wiring and no pure module can
 * see it; `runtime-reach.mjs` is the instrument that would notice this module going unreached.
 */

/** The lockout key for one attacking mob. Entity-scoped: two mobs of the SAME type must not share it. */
export const mobLockoutKey = (attack) => `mob:${attack.id}`;

/**
 * PURE. Spread straight into `damagePlayer(amount, source, sourcePos, sourceKey)`.
 * `type` stays the DISPLAY/attribution string ('melee', 'projectile') — it is what the hit log and the
 * death screen read, and it is deliberately not the lockout key.
 */
export function damageArgsForAttack(attack) {
  return [attack.damage, attack.type, attack.position, mobLockoutKey(attack)];
}
