import { expect } from 'vitest';
import { surfaceBlockAt } from '../../src/world/climate.js';
import { CHUNK_SIZE, chunkOf } from '../../src/world/chunkLayout.js';
import { createCellEdits } from '../../src/world/cellEdits.js';

/**
 * The real terrain worker, driven on the main thread through its message handler, and the shore columns the
 * water gates read it at.
 *
 * terrain.worker.js assigns `self.onmessage` when it loads and answers through `self.postMessage`, so it is imported,
 * and every message is sent, with a stand-in `self` in place: under jsdom the global `self` is the window, and a
 * swap that stayed would hand the window's to anything else. Asking for a voxel is an `update_block` to air, which the
 * worker answers with a `block_broken` carrying the id it replaced, so each cell can be asked once.
 */

let handler;
const posted = [];
const workerSelf = { postMessage: (m) => posted.push(m), set onmessage(fn) { handler = fn; }, get onmessage() { return handler; } };

/** Puts the worker's `self` in place and returns what puts the previous one back. */
function swapInWorkerSelf() {
  const own = Object.getOwnPropertyDescriptor(globalThis, 'self');
  Object.defineProperty(globalThis, 'self', { value: workerSelf, configurable: true, writable: true });
  return () => { if (own) Object.defineProperty(globalThis, 'self', own); else delete globalThis.self; };
}

export async function loadTerrainWorker() {
  const restore = swapInWorkerSelf();
  try { await import('../../src/world/terrain.worker.js'); } finally { restore(); }
  expect(typeof handler, 'SETUP: the terrain worker registered its message handler').toBe('function');
}

export function sendToWorker(type, payload) {
  const restore = swapInWorkerSelf();
  try { handler({ data: { type, payload } }); } finally { restore(); }
}

/** The id of the block the worker generated at world (x, y, z); 0 for air. Replaces it with air, so ask once. */
export function workerVoxel(x, y, z) {
  const cx = chunkOf(x), cz = chunkOf(z);
  posted.length = 0;
  sendToWorker('update_block', { cx, cz, x: x - cx * CHUNK_SIZE, y, z: z - cz * CHUNK_SIZE, blockType: 0 });
  expect(posted.some((m) => m.type === 'chunk_mesh'), `SETUP: the worker never reached chunk (${cx}, ${cz})`).toBe(true);
  const broken = posted.find((m) => m.type === 'block_broken');
  return broken ? broken.payload.blockType : 0;
}

/** The id at world (x, y, z), asked as workerVoxel asks it and then written back, so the cell is as it was. */
export function readVoxel(x, y, z) {
  const id = workerVoxel(x, y, z);
  if (id !== 0) {
    const cx = chunkOf(x), cz = chunkOf(z);
    sendToWorker('update_block', { cx, cz, x: x - cx * CHUNK_SIZE, y, z: z - cz * CHUNK_SIZE, blockType: id });
  }
  posted.length = 0;
  return id;
}

/**
 * The io a build verb is handed in Terrain.jsx, over the real worker: `editCells` through world/cellEdits.js, `post` for
 * a lone update_block, and every reply heard as Terrain.jsx hears it (`cellEdits.heard`: a `cells_edited` settled, a
 * `block_broken` handed to `onBroken`, which Terrain.jsx pays the block back through). Every post the verb makes is kept
 * in `sent`, and everything the worker posted back in `received`.
 *
 * `deferred`: the worker still takes each message as it is posted, in order, as the real one does, but its replies wait
 * until `answer()` hands them back, in order, as a busy worker's do: so a click can land between an edit and its answer.
 */
export function workerVerbIo({ onBroken, deferred = false }) {
  const sent = [];
  const received = [];
  const held = [];
  const deliver = (msg) => {
    sent.push(msg);
    const from = posted.length;
    sendToWorker(msg.type, msg.payload);
    const replies = posted.splice(from);
    received.push(...replies);
    if (deferred) held.push(...replies);
    else for (const r of replies) edits.heard(r);
  };
  const edits = createCellEdits(deliver, { onBroken });
  /** Hands back the replies held so far, oldest first: `n` of them, or all. */
  const answer = (n = held.length) => { for (const r of held.splice(0, n)) edits.heard(r); };
  return { sent, received, editCells: edits.request, post: deliver, answer, held };
}

/**
 * Per surfaceY in `classes`, up to `perClass` columns whose 3 x 3 neighbourhood holds a column with its surface below
 * `line` and one at or above it: where a position inside a column and a point next to it differ. Two picked columns of
 * one class are at least `spacing` apart, so the set is the whole coast and not one bay; the Hearth's stamp is skipped.
 */
export function pickEdgeColumns(classes, line, { perClass = 8, spacing = 150 } = {}) {
  const picked = new Map(classes.map((c) => [c, []]));
  const touchesBoth = (x, z) => {
    let below = false, above = false;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (surfaceBlockAt(x + dx, z + dz).surfaceY < line) below = true; else above = true;
      }
    }
    return below && above;
  };
  for (let x = -1500; x <= 1500; x += 7) {
    for (let z = -1500; z <= 1500; z += 5) {
      if (Math.abs(x) < 64 && Math.abs(z) < 64) continue;
      const list = picked.get(surfaceBlockAt(x, z).surfaceY);
      if (!list || list.length >= perClass) continue;
      if (list.some(([px, pz]) => Math.max(Math.abs(px - x), Math.abs(pz - z)) < spacing)) continue;
      if (touchesBoth(x, z)) list.push([x, z]);
    }
  }
  return picked;
}
