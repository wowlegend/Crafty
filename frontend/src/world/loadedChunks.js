// loadedChunks.js — WHICH CHUNKS ARE ON SCREEN, as one registry, and as a mask the far field can read.
//
// Terrain registers a chunk when its mesh mounts and drops it when the mesh unmounts; this Set is also what the
// store's getGeneratedChunks hands to the spawner and the perf probe, so there is ONE loaded set, not a private
// copy per consumer that can disagree with it.
//
// The far field (world/FarField.jsx) draws land at the true surface everywhere and DISCARDS every fragment over a
// loaded chunk, so real terrain and its impostor never overlap (QUEUE R3.9). It reads the set as a small R8 mask
// around the player, rebuilt only when the set's version or the player's chunk changes.
// The chunk size and chunkOf live in chunkLayout.js (the terrain worker needs them without this registry);
// re-exported here so the streamer, block edits and the far-field mask keep one import.
import { CHUNK_SIZE, chunkOf } from './chunkLayout.js';
export { CHUNK_SIZE, chunkOf };

/**
 * Texels per side of the mask: +-32 chunks (512 m) around the player, so it reaches past the whole far-field ring
 * (FAR_OUTER, 420 m). At 32 (+-256 m) a chunk still mounted far away after a teleport sat outside the mask and
 * the ring drew over it until it was culled (review #3, R4.3). 4 KB.
 */
export const LOADED_MASK_SIZE = 64;

const loaded = new Set();
let version = 0;

export function markChunkLoaded(key) {
  if (loaded.has(key)) return;
  loaded.add(key);
  version++;
}

export function markChunkUnloaded(key) {
  if (loaded.delete(key)) version++;
}

/** The live set of `${cx}_${cz}` keys. Read it; register through the functions above. */
export function loadedChunkSet() {
  return loaded;
}

/** Bumps on every real change to the set, never on a repeat. */
export function loadedChunksVersion() {
  return version;
}

/**
 * The mask around chunk (centreCx, centreCz): texel (i, j) is chunk (originX + i, originZ + j), stored at
 * data[j * size + i] — row j is v = (j + 0.5) / size in a DataTexture (flipY false). 255 = loaded.
 */
export function buildLoadedMask(keys, centreCx, centreCz, size = LOADED_MASK_SIZE, out = new Uint8Array(size * size)) {
  const originX = centreCx - size / 2, originZ = centreCz - size / 2;
  out.fill(0);
  for (const key of keys) {
    const sep = key.indexOf('_');
    const i = Number(key.slice(0, sep)) - originX, j = Number(key.slice(sep + 1)) - originZ;
    if (i >= 0 && j >= 0 && i < size && j < size) out[j * size + i] = 255;
  }
  return { data: out, originX, originZ, size };
}

/**
 * The fragment-shader lookup, generated so its constants cannot drift from the mask's. Needs a `vec3 vWorldPos`
 * varying (the same world position the cloud shadows read), `uniform vec2 uMaskOrigin` and
 * `uniform sampler2D uLoadedMask`. Scalar statements only: the gate interprets this text in JS.
 */
export function loadedMaskGlsl(size = LOADED_MASK_SIZE) {
  const S = size.toFixed(1), C = CHUNK_SIZE.toFixed(1);
  return `
        float lmx = floor(vWorldPos.x / ${C}) - uMaskOrigin.x;
        float lmz = floor(vWorldPos.z / ${C}) - uMaskOrigin.y;
        if (lmx >= 0.0 && lmz >= 0.0 && lmx < ${S} && lmz < ${S} && texture(uLoadedMask, vec2((lmx + 0.5) / ${S}, (lmz + 0.5) / ${S})).r > 0.5) discard;
`;
}
