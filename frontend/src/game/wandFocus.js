// wandFocus.js — B7 wand/crystal economy: the WAND is a SPELL FOCUS (pure math, node-testable).
//
// The ore->crystals->wand trade economy used to dead-end: the `wand` counter nothing consumed, so
// crystals had no real payoff. Now each owned wand shaves a small, capped percentage off spell mana
// cost — a distinct lever from spell-upgrades (which raise damage). This closes the loop:
//   mine ore -> trade ore->crystals -> trade crystals->wands -> cast spells cheaper.
// Conservative + clamped: linear per-wand below a hard cap, never zeroes or inverts cost, and any
// nullish/negative/NaN count (e.g. a not-yet-initialized store field) yields no discount.
// Consumed at the single cast-time mana chokepoint (EnhancedMagicSystem). Locked by wandFocus.test.js.

/** Mana-cost reduction per owned wand. */
export const WAND_MANA_PER = 0.06;

/** Hard cap on the total reduction (so a big wand stash can't trivialize mana). 0.30 => spells
 *  always cost >= 70% of base. */
export const WAND_MANA_CAP = 0.30;

/**
 * The multiplier applied to a spell's mana cost given the player's wand count.
 * 1.0 at 0 wands, dropping WAND_MANA_PER per wand, clamped to (1 - WAND_MANA_CAP).
 * @param {number} wandCount
 * @returns {number} a multiplier in [1 - WAND_MANA_CAP, 1]
 */
export function wandManaMultiplier(wandCount) {
  const n = Math.max(0, Math.floor(Number(wandCount) || 0));
  return 1 - Math.min(n * WAND_MANA_PER, WAND_MANA_CAP);
}

/**
 * Apply the wand focus to an integer mana cost. Rounded, floored at 1 so a spell always costs
 * something (the discount can never produce a free cast).
 * @param {number} manaCost the (already level-resolved) base mana cost
 * @param {number} wandCount
 * @returns {number}
 */
export function applyWandFocus(manaCost, wandCount) {
  const base = Number(manaCost) || 0;
  return Math.max(1, Math.round(base * wandManaMultiplier(wandCount)));
}
