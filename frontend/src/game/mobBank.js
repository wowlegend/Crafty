// The ONE derivation of "how much does killing this mob bank" — shared by all three Aspect meters.
//
// WHY IT EXISTS. ferocity.js, kinetic.js and soul.js each carried a byte-identical hand-maintained
// PER_KILL table with a silent `?? PER_KILL_DEFAULT` fallback and no link to MOB_TYPES. The tables listed
// six types; MOB_TYPES has ten. So skitterling, duskhound, moss_brute and emberhusk — all `passive: false`
// — silently banked the DEFAULT of 12 instead of the hostile tier's 16.
//
// The sharpest case was moss_brute: 220 health, 25 damage, 60 xp, the toughest non-boss in the game,
// banking LESS than a zombie. The gradient the table exists to express — "fight harder, unleash sooner" —
// ran backwards for every mob added after the tables were written.
//
// The DUPLICATION was the root cause, not the missing rows: a new mob had to be remembered in three
// places, and a silent fallback turned forgetting into a plausible number rather than an error. So the
// value now lives on the mob itself (`MOB_TYPES[t].bank`), where adding a mob without one is caught by
// tests/gates/mob-bank-coverage.test.js instead of quietly paying 12.
import { MOB_TYPES } from './mobTypes.js';

/** Fallback for a type nobody declared. Reachable only for names absent from MOB_TYPES. */
export const PER_KILL_DEFAULT = 12;

/** Boss-like kills bank a burst. Boss is NOT a MOB_TYPES entry — it is reached by name match. */
export const BOSS_BANK = 60;

/**
 * How much a kill of `mobType` banks toward any Aspect meter.
 *
 * Boss-like names are matched by regex, exactly as the three original tables did, because the boss is not
 * a MOB_TYPES entry and its kill wiring identifies it by name.
 *
 * @param {string} mobType
 * @returns {number}
 */
export function bankForKill(mobType) {
  if (typeof mobType === 'string' && /boss|dragon/i.test(mobType)) return BOSS_BANK;
  const t = MOB_TYPES[mobType];
  return (t && typeof t.bank === 'number') ? t.bank : PER_KILL_DEFAULT;
}
