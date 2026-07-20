/**
 * placementEconomy.js — the pure rule for whether a block placement is allowed and what it costs.
 *
 * B3c (18-domain review, HIGH): placing a block was FREE — Terrain.jsx place() had zero inventory logic —
 * while mining granted +1. Place-free + mine-+1 is an infinite-material loop: infinite diamonds in seconds,
 * which guts the entire crafting/economy loop. Placement must cost the block in SURVIVAL mode (you spend
 * what you place). CREATIVE mode — the game's default — keeps free placement, as a builder sandbox should.
 */

/**
 * @param {string} gameMode  'creative' | 'survival'
 * @param {number} ownedCount how many of the block the player holds
 * @returns {{allowed: boolean, consume: number}} allowed = may place; consume = count to debit
 */
export function resolvePlacement(gameMode, ownedCount) {
  if (gameMode === 'creative') return { allowed: true, consume: 0 };
  const have = ownedCount || 0;
  if (have <= 0) return { allowed: false, consume: 0 };   // survival: no block, no place
  return { allowed: true, consume: 1 };
}
