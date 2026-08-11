/**
 * damageSource.js — who dealt this damage, and did the player's hands do it THIS INSTANT.
 *
 * WHY THESE ARE TWO QUESTIONS. `damageMob` used one `source` string to answer both, and they diverge in
 * exactly one place: a damage-over-time tick. The fireball burn calls `damageMob(mobId, dps, 'fireball')`
 * every 1000ms for 4 ticks, omitting `source`, so it took the 'player' default — and 'player' is what
 * gates the PLAYER FEEL effects. Every burn tick therefore stamped hitstop (clamping the player's own
 * motion), fired a camera shake and pushed an ImpactShockwave, four times, seconds after the cast, with
 * no input. The game shook because a mob was quietly on fire somewhere.
 *
 * Naively passing 'fireball' or 'dot' instead would have fixed the feel and silently zeroed the burn's XP
 * and kill attribution, since the same string gates those — the kill-attribution gates pin that. So the
 * question is split rather than the value changed: 'player-dot' is a PLAYER source for attribution and is
 * NOT a direct hit for feel.
 */

/** Did this damage come from the player at all — the ATTRIBUTION question (XP, quest counts, banking). */
export function isPlayerSource(source) {
  return source === 'player' || source === 'player-dot';
}

/** Was it the player's input THIS INSTANT — the FEEL question (hitstop, camera shake, impact ring). */
export function isDirectPlayerHit(source) {
  return source === 'player';
}

/**
 * Collapse to the vocabulary the kill bus publishes ('player' | 'ally' | 'hazard'). Subscribers count
 * quest kills and bank Resonance off that string, so a burn kill has to reach them as a player kill;
 * the direct/indirect distinction is a concern of the damage path, not of everyone downstream of it.
 */
export function attributionSource(source) {
  return isPlayerSource(source) ? 'player' : source;
}
