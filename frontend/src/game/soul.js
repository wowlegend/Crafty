import { bankForKill } from './mobBank.js';
/**
 * soul.js — S2-B3-M2: the SOULBIND Soul economy (pure). Structural twin of kinetic.js/ferocity.js.
 *
 * Bank Soul charge by killing mobs DURING THE DAY (player kills only — the M1 attribution contract);
 * SPEND it to SNARE a weakened creature (35) or FUSE two bound allies into a hybrid (50). The design
 * tension is the point (design §2): kills BANK soul, but binding requires SPARING one mob at low HP —
 * bank on the many, bind the one. Banked Soul bleeds to zero at dawn (no carry across nights) —
 * mirrors Ferocity/Kinetic exactly. All numbers Kevin-tunable.
 */
export const SOUL_MAX = 100;    // bar capacity
export const SNARE_COST = 35;   // one bind spends this (~2-3 binds per full bank); Kevin-tunable
export const FUSE_COST = 50;    // fusing two bound allies into a hybrid; Kevin-tunable

// Per-tier gradient — identical model to ferocity.js/kinetic.js (passive < hostile < boss).

/** soulForKill(mobType) -> how much a kill of that type banks. Boss-like types bank a burst. */
export function soulForKill(mobType) {
  return bankForKill(mobType);
}

/** clampSoul(v) -> rounded + clamped to [0, SOUL_MAX] (no float-bloat, no overflow). */
export function clampSoul(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(SOUL_MAX, Math.round(v)));
}

/** canSnare(banked) -> is there enough banked Soul for one bind. */
export function canSnare(banked) {
  return clampSoul(banked) >= SNARE_COST;
}

/** canFuse(banked) -> is there enough banked Soul for one fusion (M6 consumes this). */
export function canFuse(banked) {
  return clampSoul(banked) >= FUSE_COST;
}
