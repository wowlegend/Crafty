/**
 * crafting.js — the pure recipe matcher (extracted from ui/panels/CraftingTable.jsx).
 *
 * B3a (18-domain review, CRITICAL): the ENTIRE sword tree was uncraftable. The panel trimmed the PLAYER'S
 * 3x3 grid to its bounding box (normalizeGrid) but compared it against the RAW recipe pattern. Every sword
 * is a null-bordered middle column — Iron Sword = [[null,'iron',null],[null,'iron',null],[null,'wood',null]]
 * — so a player's placement trims to a 3x1 column while the pattern stays a padded 3x3, and the equality
 * check bails on the row-length mismatch (1 !== 3). Stone / Iron / Iron(Nuggets) / Diamond Sword could never
 * match; weapon progression was permanently capped at the starting Stone Sword.
 *
 * THE FIX: trim BOTH sides to their bounding box before comparing. Trimming is idempotent for the 22
 * already-tight non-sword patterns (they equal their own bounding box), so nothing else changes; the 4
 * null-bordered sword patterns finally line up with the placement. `recipes.js` data is untouched.
 */

/** Trim a 2D grid of cells to its non-null bounding box. Returns null if fully empty. */
export function trimGrid(rows) {
  if (!rows || rows.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      if (rows[y][x]) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < 0) return null;
  const out = [];
  for (let y = minY; y <= maxY; y++) {
    const row = [];
    for (let x = minX; x <= maxX; x++) row.push(rows[y][x] ?? null);
    out.push(row);
  }
  return out;
}

/** Flat 9-slot row-major 3x3 grid -> trimmed 2D grid, or null if empty. */
export function normalizeGrid(flat) {
  const rows = [];
  for (let y = 0; y < 3; y++) {
    const row = [];
    for (let x = 0; x < 3; x++) row.push(flat[y * 3 + x] ?? null);
    rows.push(row);
  }
  return trimGrid(rows);
}

/** Cell-by-cell equality of two trimmed 2D grids. */
export function gridsEqual(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].length !== b[i].length) return false;
    for (let j = 0; j < a[i].length; j++) {
      if (a[i][j] !== b[i][j]) return false;
    }
  }
  return true;
}

/**
 * Match a flat 9-slot player grid against the recipe set. BOTH the grid and each recipe pattern are trimmed
 * to their bounding box, so a shaped recipe matches regardless of where in the 3x3 the player placed it and
 * regardless of the pattern's own null padding. Returns the matched recipe, or null.
 */
export function matchRecipe(flat, recipes) {
  const normalized = normalizeGrid(flat);
  if (!normalized) return null;
  return recipes.find((r) => gridsEqual(normalized, trimGrid(r.pattern))) || null;
}
