/**
 * chestState.js — does this chest still hold anything?
 *
 * The verb router protects a chest from a left-click ONLY when it has items in it, so that removing an
 * empty chest you placed still works. That distinction is the whole safety property, which makes the
 * emptiness test load-bearing rather than incidental — and an inline `Object.values(...).some(...)` at
 * the ray-hit site in Terrain.jsx would be untestable, leaving the guard's input unverified while the
 * guard itself looked covered.
 *
 * The shape is the store's: `chests: Map<coords, { inventory: { [item]: qty } }>`.
 */

/**
 * PURE. True when the chest holds at least one item of positive quantity.
 * Defensive about the zero-quantity key, because the store's transfer path decrements in place
 * (`chestInv[item] = chestQty - quantity`) and leaves a `0` entry behind rather than deleting the key —
 * so "has keys" and "has items" are genuinely different questions here.
 */
export function chestHasItems(chest) {
  if (!chest || !chest.inventory) return false;
  for (const qty of Object.values(chest.inventory)) {
    if (qty > 0) return true;
  }
  return false;
}
