// freeze.js — the iceball secondary (slow / full-freeze). A SEPARATE slow channel from the zone
// slow (zoneSlowMult): ElementZoneSystem resets zoneSlowMult every step, so a spell-applied freeze
// must live on its own entity fields (spellSlowMult + spellSlowUntil) or it would be clobbered.
// Pure + node-testable; the magic system stamps the fields, the mob-speed line multiplies by them.

/** Speed multiplier an iceball hit imposes: a full freeze (0) on a chance roll, else a slow. */
export function freezeSlowMult(slowPercent, roll, fullStopChance) {
  if (roll < fullStopChance) return 0; // full freeze
  const m = 1 - (Number(slowPercent) || 0) / 100; // e.g. 70% slow -> 0.3 speed
  return Math.max(0, Math.min(1, m));
}

/** The active spell-slow factor for a mob entity (1 = none / expired / malformed). */
export function spellSlowFactor(entity, now) {
  if (!entity || entity.spellSlowUntil == null || now >= entity.spellSlowUntil) return 1;
  const m = entity.spellSlowMult;
  return typeof m === 'number' && m >= 0 && m <= 1 ? m : 1;
}
