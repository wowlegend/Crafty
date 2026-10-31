// The build tools' batched cell edits and the worker's answer to each. Only the terrain worker holds the voxels, so only
// it can tell an empty cell from a solid one: a footprint is sent as one `edit_cells` message, the worker changes only
// the cells whose kind the edit changes (a block fills only air or water; a removal takes only a solid block) and replies
// `cells_edited` with the cells it changed. The caller debits, records and credits only those (world/placeAtHit.js,
// world/mineAtHit.js; DECISIONS 2026-10-31 item 230).

/**
 * @param {(msg: object) => void} post the worker's postMessage
 * @returns {{ request: (edit: {blockType: number, cells: {x: number, y: number, z: number, seq?: number}[]},
 *   onApplied: (applied: number[]) => void) => void, settle: (payload: {id: number, applied: number[]}) => void }}
 */
export function createCellEdits(post) {
  let lastId = 0;
  const waiting = new Map();
  return {
    /** Send one batch; `onApplied` gets the indices into `edit.cells` of the cells the worker changed. */
    request(edit, onApplied) {
      const id = (lastId += 1);
      // Registered before the post: a worker answered in the same call (the unit suite's) settles at once.
      waiting.set(id, onApplied);
      post({ type: 'edit_cells', payload: { id, blockType: edit.blockType, cells: edit.cells } });
    },
    /** The worker's `cells_edited` reply. */
    settle({ id, applied }) {
      const onApplied = waiting.get(id);
      if (!onApplied) return;
      waiting.delete(id);
      onApplied(applied);
    },
  };
}
