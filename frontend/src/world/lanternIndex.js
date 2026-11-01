// lanternIndex.js — where the placed lanterns stand, derived from the player's block edits.
//
// A lantern's state is its block (the W3-A task script's calls: no saved set of lit lights), and every lantern is one
// the player placed, so the store's worldBlocks ("x_y_z" -> block id, every place and mine recorded) holds them all.
// The store rebuilds this index wherever worldBlocks is replaced (setWorldBlocks: a place, a mine, a boss smash) and on
// a load, so the lights (game/lights.js) read a list instead of scanning the edits.

const NONE = Object.freeze([]);

/**
 * The cells of `blocks` holding block `id`, as frozen [{ x, y, z }] in the Map's order; `prev` itself when it lists the
 * same cells, so an edit that moves no lantern hands its readers the list they already hold. No cells while `id` is
 * undefined (a build with no lantern block). O(edited cells), beside the copy of the whole Map every edit already makes.
 * @param {Map<string, number>} blocks the store's worldBlocks
 * @param {number|undefined} id the lantern's block id (world/blockIds.js BLOCK_ID.lantern)
 * @param {ReadonlyArray<{x: number, y: number, z: number}>} [prev] the index this replaces
 */
export function lanternsIn(blocks, id, prev = NONE) {
  if (id === undefined || !blocks) return NONE;
  const cells = [];
  for (const [key, block] of blocks) {
    if (block !== id) continue;
    const [x, y, z] = key.split('_').map(Number);
    cells.push(Object.freeze({ x, y, z }));
  }
  if (cells.length === 0) return NONE;
  const same = prev.length === cells.length && cells.every((c, i) => c.x === prev[i].x && c.y === prev[i].y && c.z === prev[i].z);
  return same ? prev : Object.freeze(cells);
}
