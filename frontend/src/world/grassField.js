// M4 #5: sparse grass-top positions for the wind-grass overlay (OptimizedGrassSystem). The terrain
// worker scans each column's top block (it owns the chunk indexing) into flat `topCodes`/`topYs` arrays;
// this PURE helper maps the grass-coded columns to world positions, strided + capped for density/perf.
// Gen-time only (NO-RE-MESH); RNG-free. The grass blade sits one block above the surface (y = topY + 1).
export const GRASS_CODE = 1;

export function grassTops(topCodes, topYs, size, originX, originZ, { stride = 2, cap = 50 } = {}) {
  const out = [];
  const step = Math.max(1, stride | 0);
  for (let z = 0; z < size; z += step) {
    for (let x = 0; x < size; x += step) {
      const i = x + z * size;
      if (topCodes[i] === GRASS_CODE) {
        out.push([originX + x, topYs[i] + 1, originZ + z]);
        if (out.length >= cap) return out;
      }
    }
  }
  return out;
}
