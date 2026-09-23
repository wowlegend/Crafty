// chunkLayout.js — a chunk's geometry and its block array's layout, defined ONCE (QUEUE R6.7, R7.2, R7.3).
//
// Four files each typed their own copy: the terrain worker's getIndex, the Hearth stamp's idx, the mesher's
// inline `bx + bz * 16 + by * 256`, and the save replay's inline index in the store — plus a literal 16 wherever
// a chunk coordinate became a world one. They agreed by coincidence. Everything that turns a chunk coordinate into
// a world one, or a local voxel into an array slot, reads this file. Pure constants and arithmetic: the terrain
// worker imports it too.

/** Blocks per chunk side. */
export const CHUNK_SIZE = 16;
/** Blocks per chunk column, y = 0 .. CHUNK_HEIGHT - 1. */
export const CHUNK_HEIGHT = 256;
/** Voxels in one horizontal layer of a chunk. */
export const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;
/** Voxels in a chunk — the length of its block array. */
export const CHUNK_VOLUME = CHUNK_AREA * CHUNK_HEIGHT;

/** The slot of chunk-local voxel (lx, y, lz) in a chunk's block array: x fastest, then z, then y. */
export function voxelIndex(lx, y, lz) {
  return lx + lz * CHUNK_SIZE + y * CHUNK_AREA;
}

/** The slot of chunk-local column (lx, lz) in a per-column array (the biome ids): x fastest, then z. */
export function columnIndex(lx, lz) {
  return lx + lz * CHUNK_SIZE;
}

/** The chunk a world coordinate falls in. */
export function chunkOf(v) {
  return Math.floor(v / CHUNK_SIZE);
}
