// The ONE derivation of "how much does killing this mob bank" — read by the ember bar (game/ember.js).
//
// The value lives on the mob itself (`MOB_TYPES[t].bank`), so a new mob cannot be left out of a separate table and
// quietly pay a default; tests/gates/mob-bank-coverage.test.js fails a mob type that declares none.
import { MOB_TYPES } from './mobTypes.js';

/** Fallback for a type nobody declared. Reachable only for names absent from MOB_TYPES. */
export const PER_KILL_DEFAULT = 12;

/** Boss-like kills bank a burst. Boss is NOT a MOB_TYPES entry — it is reached by name match. */
export const BOSS_BANK = 60;

/**
 * How much a kill of `mobType` banks into the ember bar.
 *
 * Boss-like names are matched by regex because the boss is not a MOB_TYPES entry and its kill wiring identifies it
 * by name.
 *
 * @param {string} mobType
 * @returns {number}
 */
export function bankForKill(mobType) {
  if (typeof mobType === 'string' && /boss|dragon/i.test(mobType)) return BOSS_BANK;
  const t = MOB_TYPES[mobType];
  return (t && typeof t.bank === 'number') ? t.bank : PER_KILL_DEFAULT;
}
