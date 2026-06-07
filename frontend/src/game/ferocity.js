/**
 * ferocity.js — S2-B1-M4: the WILDHEART Ferocity economy (pure).
 *
 * Bank Ferocity by killing mobs DURING THE DAY; UNLEASH it in the night siege by transforming.
 * `ferocityBanked` is the gate on the roar (need a full bank) and entering a beast SPENDS it — the
 * "bank in the day, unleash in the siege" loop. Banked Ferocity bleeds to zero at dawn (no carry
 * across nights). All numbers are Kevin-tunable (KEVIN-REVIEW-BATCH §8 #2: tuning + reset semantics;
 * spend-vs-permission is the default-spend choice flagged there).
 */
export const FEROCITY_MAX = 100;        // bar capacity
export const FEROCITY_THRESHOLD = 100;  // a FULL bank = one transform (== MAX so the full bar means "ready")

const PER_KILL_DEFAULT = 12;
// Per-tier gradient (the actual live mob types — passive < hostile < boss). Tougher kills bank more,
// so the reward reads "fight harder = unleash sooner". All Kevin-tunable (§8 #2).
const PER_KILL = {
  pig: 8, cow: 8, villager: 8,           // passive
  zombie: 16, skeleton: 16, spider: 16,  // hostile
  boss: 60,                              // boss-like (reached via the regex below; boss-kill wiring is a follow-up)
};

/** ferocityForKill(mobType) -> how much a kill of that type banks. Boss-like types bank a burst. */
export function ferocityForKill(mobType) {
  if (typeof mobType === 'string' && /boss|dragon/i.test(mobType)) return PER_KILL.boss;
  return PER_KILL[mobType] ?? PER_KILL_DEFAULT;
}

/** clampFerocity(v) -> rounded + clamped to [0, FEROCITY_MAX] (no float-bloat, no overflow). */
export function clampFerocity(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(FEROCITY_MAX, Math.round(v)));
}

/** canTransform(banked) -> is the bank full enough to roar. */
export function canTransform(banked) {
  return clampFerocity(banked) >= FEROCITY_THRESHOLD;
}
