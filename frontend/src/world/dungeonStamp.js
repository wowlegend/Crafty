/**
 * dungeonStamp.js — which neighbouring chunks a structure stamp actually has to visit.
 *
 * THE DEFECT. `stampStructures` swept `dcx-1 .. dcx+1` × `dcz-1 .. dcz+1` — nine candidate dungeon
 * chunks per generated chunk — and then discarded any block whose local coordinate fell outside 0..15.
 * The dungeon blueprint is centred at `chunk*16 + 8` with a half-extent of 6, so its footprint spans
 * local 2..14 and ALWAYS fits inside its own chunk. Eight of those nine iterations could not write a
 * single block, on every chunk the worker has ever generated, in a hot path.
 *
 * WHY NOT JUST DELETE THE LOOP. Because it is only dead while the blueprint stays small. Hardcoding
 * "self only" would make a later, larger dungeon clip silently at the chunk seam — the same class of
 * bug as the cave automaton that walled itself off at every 16-block boundary, which went unnoticed for
 * months because nothing failed, the world was just quietly wrong.
 *
 * So the radius is DERIVED from the footprint instead: zero today (one iteration, 9x less work), and
 * automatically one the moment a blueprint grows past the seam. The extraction is what makes any of this
 * checkable — terrain.worker.js assigns `self.onmessage` at module scope, so under vitest it cannot be
 * imported at all, which is why nobody had ever run this.
 */

/**
 * PURE: the half-extent, in chunks, that a stamp of `halfExtent` blocks centred at `centreOffset`
 * inside a `chunkSize` chunk can reach.
 *
 * @param {number} halfExtent   the blueprint's largest |dx| or |dz|
 * @param {number} chunkSize    blocks per chunk edge
 * @param {number} centreOffset where inside the chunk the structure is centred
 * @returns {number} 0 if the footprint fits inside its own chunk, else how many chunks out it reaches
 */
export function stampChunkRadius(halfExtent, chunkSize, centreOffset) {
  const lo = centreOffset - halfExtent;              // most negative local coord
  const hi = centreOffset + halfExtent;              // most positive local coord
  const under = lo < 0 ? Math.ceil(-lo / chunkSize) : 0;
  const over = hi > chunkSize - 1 ? Math.ceil((hi - (chunkSize - 1)) / chunkSize) : 0;
  return Math.max(under, over);
}

/** PURE: the largest |dx| / |dz| in a blueprint of `[dx, dy, dz, blockType]` entries. */
export function blueprintHalfExtent(blueprint) {
  let m = 0;
  for (const [dx, , dz] of blueprint || []) {
    const a = Math.abs(dx), b = Math.abs(dz);
    if (a > m) m = a;
    if (b > m) m = b;
  }
  return m;
}
