/**
 * placementEconomy.js — the pure rule for whether a block placement is allowed and what it costs.
 *
 * Placing a block spends one of it, in every game (DECISIONS 2026-10-28 W1-H item 4). Mining gives a broken block back,
 * so a free placement is an infinite-material loop, and a free wall makes holding a siege no choice.
 */

/**
 * @param {number} ownedCount how many of the block the player holds; anything but a finite number counts as none
 * @returns {{allowed: boolean, consume: number}} allowed = may place; consume = count to debit
 */
export function resolvePlacement(ownedCount) {
  const have = Number.isFinite(ownedCount) ? ownedCount : 0;
  if (have <= 0) return { allowed: false, consume: 0 };
  return { allowed: true, consume: 1 };
}
