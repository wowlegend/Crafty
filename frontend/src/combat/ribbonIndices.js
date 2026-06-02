/**
 * ribbonIndices.js — pure index-buffer builder for the procedural sword/weapon
 * ribbon trail (extracted from Components.jsx's ProceduralRibbonTrail).
 *
 * A ribbon of `N` captured point-pairs has `2N` vertices (a base + a tip vertex
 * per point) and `N-1` quads between consecutive pairs. Each quad `i` spans the
 * four vertices [2i, 2i+1, 2i+2, 2i+3] and is two triangles:
 *   tri 1: (2i,   2i+1, 2i+2)
 *   tri 2: (2i+1, 2i+3, 2i+2)
 * => the 6 indices for quad i are [2i, 2i+1, 2i+2, 2i+1, 2i+3, 2i+2].
 *
 * BUGFIX: the original inline loop wrote `indices[i*6+2]` TWICE and never wrote
 * `indices[i*6+5]`, so the 2nd triangle's 3rd vertex stayed at the TypedArray
 * default of 0 — a degenerate/torn 2nd triangle in every quad. This builder
 * writes slot +5 correctly (tri 2's 3rd vertex = 2i+2).
 *
 * Returns a `Uint16Array` of length `6*(N-1)` — the exact type the geometry's
 * `setIndex(new THREE.BufferAttribute(indices, 1))` consumes. THREE-free + pure.
 *
 * @param {number} N  number of captured point-pairs (N >= 1; N < 2 -> empty)
 * @returns {Uint16Array} index buffer for the ribbon triangle list
 */
export function buildRibbonIndices(N) {
  const quads = Math.max(0, N - 1);
  const indices = new Uint16Array(quads * 6);

  for (let i = 0; i < quads; i++) {
    // tri 1
    indices[i * 6 + 0] = 2 * i;
    indices[i * 6 + 1] = 2 * i + 1;
    indices[i * 6 + 2] = 2 * i + 2;
    // tri 2
    indices[i * 6 + 3] = 2 * i + 1;
    indices[i * 6 + 4] = 2 * i + 3;
    indices[i * 6 + 5] = 2 * i + 2;
  }

  return indices;
}
