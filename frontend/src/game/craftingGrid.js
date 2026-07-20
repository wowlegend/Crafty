/**
 * craftingGrid.js — pure escrow reconciliation for the 3x3 crafting grid.
 *
 * B3d (18-domain review, HIGH): CraftingTable debits a material from inventory the moment you place it into
 * the grid (handleGridClick -> removeFromInventory), escrowing it only in React-LOCAL grid state. Closing
 * the panel UNMOUNTS the component, discarding that state — so anything still in the grid was permanently
 * destroyed. A child drops iron in, changes their mind, presses C to close, and the iron is gone. No undo.
 *
 * The grid is ESCROW, not a sink: whatever is still in it at teardown belongs to the player and must return
 * to inventory. A crafted recipe is the ONE exception — doCraft clears the grid first, so its consumed
 * inputs are already gone and must NOT come back. The injected `addToInventory` sink keeps this pure + reusable.
 */

/** Count how many of each item sit in the flat grid. */
export function gridTally(grid) {
  const tally = new Map();
  for (const cell of grid || []) if (cell) tally.set(cell, (tally.get(cell) || 0) + 1);
  return tally;
}

/** Credit every escrowed grid item back to inventory. Returns the tally that was returned. */
export function returnGridToInventory(grid, addToInventory) {
  const tally = gridTally(grid);
  for (const [item, count] of tally) addToInventory(item, count);
  return tally;
}
