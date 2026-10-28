import { MOB_TYPES } from './mobTypes.js';

const UNLISTED_XP = 10;

// What the player's kill of a mob of this type is worth in XP. The XP drop, kill-quest credit and the kill count all read
// it, keyed by type and never by a field on the entity, so they cannot disagree about one kill: a kill worth 0 (a
// Settler) pays nothing and counts toward nothing.
export function killXP(mobType) {
  const xp = MOB_TYPES[mobType]?.xp;
  return typeof xp === 'number' ? xp : UNLISTED_XP;
}
