// M4 #5: sparse grass-top positions for the wind-grass overlay (OptimizedGrassSystem). The terrain
// worker scans each column's top block (it owns the chunk indexing) into flat `topCodes`/`topYs` arrays;
// this PURE helper maps the grass-coded columns to world positions, strided + capped for density/perf.
// Gen-time only (NO-RE-MESH); RNG-free. The grass blade sits one block above the surface (y = topY + 1).
export const GRASS_CODE = 1;

/**
 * Scan every column's TOP block (highest non-air) out of a chunk's flat block array.
 *
 * EXTRACTED 2026-09-22. This loop was written out twice in `terrain.worker.js` — once on the build path
 * and once on the update_block path — and the second copy carried a comment saying "a shared
 * computeGrassTops helper is the upgrade path". Two copies is how the update path once lost `grassTops`
 * entirely, so editing ANY block killed that chunk's wind-grass. The worker keeps the chunk indexing;
 * this takes it as a function so the helper stays pure and node-testable.
 *
 * @param {Uint8Array} blocks flat chunk block array
 * @param {(x:number,y:number,z:number)=>number} index the chunk's own flat-index function
 * @param {number} size chunk width/depth
 * @param {number} height chunk height
 */
export function columnTops(blocks, index, size, height) {
  const topCodes = new Uint8Array(size * size);
  const topYs = new Int16Array(size * size);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      for (let y = height - 1; y >= 0; y--) {
        const b = blocks[index(x, y, z)];
        if (b !== 0) { topCodes[x + z * size] = b; topYs[x + z * size] = y; break; }
      }
    }
  }
  return { topCodes, topYs };
}

/**
 * Sparse grass-top world positions, as `[x, y, z, biomeId]`.
 *
 * THE BIOME ID IS THE FOURTH ELEMENT (Q14, 2026-09-22). The ground gets its biome hue from a shader
 * uniform indexed by a per-vertex biome id; the wind-grass blades standing ON that ground had no biome
 * input at all, so a blade in a savanna read the same green as one in a taiga while the block beneath it
 * did not. Carrying the id here is what lets `bladeTint` compose the two multipliers. It is emitted
 * ALWAYS, defaulting to 0, rather than optionally: a consumer destructuring four elements from a
 * sometimes-three-element tuple gets `undefined` and silently tints nothing, which is exactly the
 * always-miss shape this codebase has already shipped once.
 */
export function grassTops(topCodes, topYs, size, originX, originZ, { stride = 2, cap = 50 } = {}, biomeIds = null) {
  const out = [];
  const step = Math.max(1, stride | 0);
  for (let z = 0; z < size; z += step) {
    for (let x = 0; x < size; x += step) {
      const i = x + z * size;
      if (topCodes[i] === GRASS_CODE) {
        out.push([originX + x, topYs[i] + 1, originZ + z, biomeIds ? biomeIds[i] : 0]);
        if (out.length >= cap) return out;
      }
    }
  }
  return out;
}
