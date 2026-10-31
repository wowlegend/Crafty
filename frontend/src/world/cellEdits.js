// The build tools' batched cell edits and the worker's answer to each. Only the terrain worker holds the voxels, so only
// it can tell an empty cell from a solid one: a footprint is sent as one `edit_cells` message, the worker changes only
// the cells whose kind the edit changes (a block fills only air or water; a removal takes only a solid block) and replies
// `cells_edited` with the cells it changed and the blocks it removed. The caller debits, records and credits only those
// (world/placeAtHit.js, world/mineAtHit.js; DECISIONS 2026-10-31 items 230 and 270-272).

// The worker applies edits in the order they are posted and answers batches in that order, but a single mine and the
// dragon's smash write the store's record at the click while a batch writes it on its answer, so a batch posted before
// such a writer is answered after it, and its block would land in the record over the writer's air (the save then holds
// a block the world does not). So every edit takes a number as it is posted, and a batch's answer records a cell only
// when no writer at the click has recorded that cell since the batch was posted. "The newest number wins" would be wrong:
// a later batch the worker refused at a cell leaves the earlier batch's block there, and that block must be recorded.
// One terrain worker per page, so one ledger; it is emptied whenever no batch is owed, as nothing can be compared to it.
let lastPosted = 0;
let owed = 0;
const recordedAtClick = new Map();
const keyOf = (c) => `${c.x}_${c.y}_${c.z}`;

/** A writer that records its cells at the click (the single mine, the dragon's smash): they are recorded after every
 *  batch still owed, whose answers must not write over them. */
export function recordingAtClick(keys) {
  lastPosted += 1;
  if (owed === 0) return;
  for (const k of keys) recordedAtClick.set(k, lastPosted);
}

/**
 * @param {(msg: object) => void} post the worker's postMessage
 * @param {{onBroken?: (payload: object) => void}} [heardBy] where a lone `block_broken` (a single mine's, the smash's) goes
 * @returns {{ request: (edit: {blockType: number, cells: {x: number, y: number, z: number, seq?: number}[]},
 *   onApplied: (applied: number[], recordable: number[], broken: object[]) => void) => void,
 *   settle: (payload: {id: number, applied: number[], broken?: object[]}) => void, heard: (msg: object) => void }}
 */
export function createCellEdits(post, { onBroken } = {}) {
  let lastId = 0;
  const waiting = new Map();
  const edits = {
    /** Send one batch. `onApplied` gets the indices into `edit.cells` of the cells the worker changed, those of them
     *  this answer may record, and each block a removal took (`{x, y, z, blockType, color}`). */
    request(edit, onApplied) {
      const id = (lastId += 1);
      lastPosted += 1;
      owed += 1;
      // Registered before the post: a worker answered in the same call (the unit suite's) settles at once.
      waiting.set(id, { onApplied, order: lastPosted, cells: edit.cells });
      post({ type: 'edit_cells', payload: { id, blockType: edit.blockType, cells: edit.cells } });
    },
    /** The worker's `cells_edited` reply. */
    settle({ id, applied, broken = [] }) {
      const w = waiting.get(id);
      if (!w) return;
      waiting.delete(id);
      owed -= 1;
      const recordable = applied.filter((i) => !((recordedAtClick.get(keyOf(w.cells[i])) || 0) > w.order));
      if (owed === 0) recordedAtClick.clear();
      w.onApplied(applied, recordable, broken);
    },
    /** Every worker message the build verbs wait on, heard for as long as the worker lives (Terrain.jsx). */
    heard(msg) {
      if (msg.type === 'cells_edited') edits.settle(msg.payload);
      else if (msg.type === 'block_broken') onBroken?.(msg.payload);
    },
  };
  return edits;
}
