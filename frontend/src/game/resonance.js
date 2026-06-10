/**
 * resonance.js — S2-B4-M2: the ELEMANCER Resonance economy (pure) — the BUILD-VERB meter.
 * Mining/placing by day charges the chemistry (the only untaken economy slot; design §2):
 * the accrual lives at the Terrain mine/place EXECUTORS (not the kill bus — this Aspect's
 * power comes from working the world, not killing). Spent per zone ignition (the imbued
 * cast); dawn-bled like every Aspect meter (no carry across nights). All Kevin-tunable.
 */
export const RESONANCE_MAX = 100; // bar capacity
export const ZONE_COST = 30;      // one imbued-cast zone (~3 per full bank); Kevin-tunable
export const MINE_GAIN = 1;       // per successful mine (day-only at the accrual site)
export const PLACE_GAIN = 2;      // per successful place — building charges MORE than digging

/** clampResonance(v) -> rounded + clamped to [0, RESONANCE_MAX]. */
export function clampResonance(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(RESONANCE_MAX, Math.round(v)));
}

/** canIgnite(banked) -> is there enough banked Resonance for one zone. */
export function canIgnite(banked) {
  return clampResonance(banked) >= ZONE_COST;
}
