/**
 * kinetic.js — S2-B2-M1: the VOIDHAND Kinetic economy (pure). Structural twin of ferocity.js.
 *
 * Bank Kinetic charge by killing mobs DURING THE DAY; SPEND it to GRAB a block in the night siege
 * (each combat grab costs GRAB_COST). `kineticBanked` gates the grab (need >= GRAB_COST). Banked Kinetic
 * bleeds to zero at dawn (no carry across nights) — mirrors Ferocity exactly (Kevin Decision #2,
 * 2026-06-09). Unlike Ferocity (all-or-nothing per transform), Kinetic is SPENT-PER-GRAB so a full bank
 * yields several grabs. All numbers Kevin-tunable.
 */
export const KINETIC_MAX = 100;   // bar capacity
export const GRAB_COST = 25;      // one combat grab spends this (~4 grabs per full bank); Kevin-tunable

const PER_KILL_DEFAULT = 12;
// Per-tier gradient — identical model to ferocity.js (passive < hostile < boss): tougher kills bank more.
const PER_KILL = {
  pig: 8, cow: 8, villager: 8,           // passive
  zombie: 16, skeleton: 16, spider: 16,  // hostile
  boss: 60,                              // boss-like (regex below; boss-kill wiring is a follow-up)
};

/** kineticForKill(mobType) -> how much a kill of that type banks. Boss-like types bank a burst. */
export function kineticForKill(mobType) {
  if (typeof mobType === 'string' && /boss|dragon/i.test(mobType)) return PER_KILL.boss;
  return PER_KILL[mobType] ?? PER_KILL_DEFAULT;
}

/** clampKinetic(v) -> rounded + clamped to [0, KINETIC_MAX] (no float-bloat, no overflow). */
export function clampKinetic(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(KINETIC_MAX, Math.round(v)));
}

/** canGrab(banked) -> is there enough banked charge for one grab. */
export function canGrab(banked) {
  return clampKinetic(banked) >= GRAB_COST;
}
