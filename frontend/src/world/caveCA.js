/**
 * caveCA.js — the cave-smoothing cellular automaton, extracted so it can be tested.
 *
 * IT SEALED CAVES AT EVERY CHUNK SEAM. Its neighbour lookup answered SOLID for anything outside the
 * chunk, so a column on a chunk border got nine phantom solid neighbours it never had — one whole face of
 * its 3x3x3 neighbourhood. The two rules are threshold rules over that count:
 *
 *   solid cell,  solidCount <= 11  -> carve (open a bottleneck)
 *   empty cell,  solidCount >= 16  -> fill  (consolidate a wall)
 *
 * Nine free solids push every border column toward "fill" and away from "carve", so caves that should
 * continue across a seam were walled off at it — a 16-block grid of invisible partitions below y=20, in
 * the one part of the world the player explores by squeezing through gaps.
 *
 * THE FIX IS NOT "TREAT OUTSIDE AS EMPTY". That biases the opposite way and erodes the seam instead. The
 * honest answer is that the neighbourhood is UNKNOWN out there, so those cells are not sampled at all and
 * the thresholds are scaled by how many were: a border column judges itself on 18 neighbours against
 * proportional thresholds rather than on 27 with nine of them invented.
 *
 * lives in ai/terrain.worker.js's neighbourhood originally; that file assigns self.onmessage at module
 * scope and cannot be imported under vitest, which is why this had never been tested.
 */

/** Blocks that count as SOLID for the neighbourhood. 0 is air; 9 is water, which is not a wall. */
const isSolid = (t) => t > 0 && t !== 9;

/** The full 3x3x3 neighbourhood, including the cell itself — the count the thresholds were tuned on. */
export const NEIGHBOURHOOD = 27;
export const CARVE_AT_OR_BELOW = 11;
export const FILL_AT_OR_ABOVE = 16;

/**
 * Smooth caves in-place.
 *
 * @param {Uint8Array} blocks       the chunk's block ids, indexed x + z*size + y*size*size
 * @param {number} size             CHUNK_SIZE
 * @param {number} rangeHeight      how many y layers the CA covers
 * @param {number} [passes]
 * @returns {{carved:number, filled:number, sampledMin:number}} counters, so a caller or a test can assert
 *          on a number rather than on the absence of an effect. sampledMin is the smallest neighbourhood
 *          any cell was judged on — 18 at a chunk border, 27 in the interior.
 */
export function applyCaveCA(blocks, size, rangeHeight, passes = 2) {
  const temp = new Uint8Array(size * size * rangeHeight);
  const at = (arr, bx, by, bz) => arr[bx + bz * size + by * size * size];
  let carved = 0;
  let filled = 0;
  let sampledMin = NEIGHBOURHOOD;

  for (let pass = 0; pass < passes; pass++) {
    temp.set(blocks.subarray(0, temp.length));

    for (let y = 1; y < rangeHeight - 1; y++) {
      for (let z = 0; z < size; z++) {
        for (let x = 0; x < size; x++) {
          const index = x + z * size + y * size * size;
          const currentType = temp[index];

          let solidCount = 0;
          let sampled = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dz = -1; dz <= 1; dz++) {
              for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx;
                const nz = z + dz;
                const ny = y + dy;
                // OUT OF CHUNK IS UNKNOWN, not solid and not empty. Counting it either way invents a
                // neighbourhood the world does not have, and the thresholds below are what read it.
                if (nx < 0 || nx >= size || nz < 0 || nz >= size || ny < 0 || ny >= rangeHeight) continue;
                sampled++;
                if (isSolid(at(temp, nx, ny, nz))) solidCount++;
              }
            }
          }
          if (sampled < sampledMin) sampledMin = sampled;

          // Thresholds scaled to what was actually sampled, so a border column is judged on the same
          // PROPORTION as an interior one rather than on a padded count.
          const carveAt = (CARVE_AT_OR_BELOW * sampled) / NEIGHBOURHOOD;
          const fillAt = (FILL_AT_OR_ABOVE * sampled) / NEIGHBOURHOOD;

          if (isSolid(currentType)) {
            if (solidCount <= carveAt) { blocks[index] = 0; carved++; }
          } else if (currentType === 0) {
            if (solidCount >= fillAt) { blocks[index] = 3; filled++; }
          }
        }
      }
    }
  }

  return { carved, filled, sampledMin };
}
