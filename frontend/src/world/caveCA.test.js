import { describe, it, expect } from 'vitest';
import { applyCaveCA, NEIGHBOURHOOD, CARVE_AT_OR_BELOW, FILL_AT_OR_ABOVE } from './caveCA.js';

// CAVES WALLED OFF AT EVERY 16-BLOCK SEAM.
//
// The CA's neighbour lookup answered SOLID for anything outside the chunk, so a column on a chunk border
// got nine phantom solid neighbours — one whole face of its 3x3x3 neighbourhood. Both rules are
// thresholds over that count (carve at <= 11, fill at >= 16), so nine free solids pushed every border
// column toward FILL and away from CARVE. Caves that should continue across a seam were sealed at it: a
// 16-block grid of invisible partitions below y=20, in the part of the world the player explores by
// squeezing through gaps.
//
// It had never been tested because it lived inside terrain.worker.js, which assigns self.onmessage at
// module scope and therefore throws on import under vitest — the same reason the greedy mesher, the
// wander re-roll and the A* neighbour table were all extracted.
const SIZE = 16;
const H = 20;
const idx = (x, y, z) => x + z * SIZE + y * SIZE * SIZE;

/** A chunk that is entirely open air below the ceiling — every cell a cave. */
const openChunk = () => new Uint8Array(SIZE * SIZE * H);

/** A chunk that is entirely solid stone. */
const solidChunk = () => new Uint8Array(SIZE * SIZE * H).fill(3);

describe('applyCaveCA — the chunk border is unknown, not a wall', () => {
  it('judges border cells on a SMALLER neighbourhood instead of inventing one', () => {
    const b = openChunk();
    const { sampledMin } = applyCaveCA(b, SIZE, H, 1);
    // A corner column of the x/z grid sees 2/3 of each horizontal axis: 2*3*3 = 18 at an edge.
    expect(sampledMin, 'a border cell was judged on a full 27-cell neighbourhood it does not have').toBeLessThan(NEIGHBOURHOOD);
    expect(sampledMin, 'the neighbourhood collapsed to nothing').toBeGreaterThan(6);
  });

  it('does NOT fill an open cave just because it touches a chunk edge', () => {
    // THE DEFECT. In an entirely open chunk no cell has a single solid neighbour, so nothing should fill.
    // With outside-is-solid, a border cell counted nine and the fill threshold is 16 — it survived that
    // alone, but combined with any real wall nearby it tipped, and the carve rule was suppressed
    // everywhere along the seam.
    const b = openChunk();
    applyCaveCA(b, SIZE, H, 2);
    let filledAtBorder = 0;
    for (let y = 1; y < H - 1; y++) {
      for (let z = 0; z < SIZE; z++) {
        for (const x of [0, SIZE - 1]) if (b[idx(x, y, z)] !== 0) filledAtBorder++;
      }
    }
    expect(filledAtBorder, 'open cave cells on the chunk edge were turned into wall').toBe(0);
  });

  it('a corridor running INTO the seam is treated the same at the edge as in the middle', () => {
    // The lived symptom: a tunnel that reaches x=15 and stops. It must be a tunnel the CA would KEEP in
    // the interior -- a 1x1 bore is consolidated everywhere by the fill rule, which is the CA working,
    // not a seam bug. A 3x3 bore survives, so the only question left is whether the border behaves like
    // the middle. That equivalence IS the finding: nine phantom solid neighbours made it not.
    const b = solidChunk();
    const y = 8;
    const z = 8;
    for (let x = 0; x < SIZE; x++) {
      for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) b[idx(x, y + dy, z + dz)] = 0;
    }
    applyCaveCA(b, SIZE, H, 2);
    const middle = b[idx(SIZE >> 1, y, z)];
    expect(middle, 'the CA closed the tunnel even in the interior; the fixture is wrong, not the code').toBe(0);
    expect(b[idx(SIZE - 1, y, z)], 'the tunnel was sealed at the chunk boundary but not in the middle').toBe(middle);
    expect(b[idx(0, y, z)], 'the tunnel was sealed at the other boundary').toBe(middle);
  });

  it('a border cave cell with a REAL neighbourhood below the fill threshold is not filled', () => {
    // THE DISCRIMINATING FIXTURE, and it took a second attempt to build. The earlier seam cases stayed
    // GREEN under the outside-is-solid mutation because their real neighbourhoods were nowhere near a
    // threshold — nine phantom solids changed the count without changing the decision. This one sits in
    // the gap: 10 real solid neighbours out of 18 is BELOW the proportional fill threshold (16 * 18/27 =
    // 10.67), and 10 + 9 phantom is 19, comfortably ABOVE the raw 16. Same cell, opposite outcome.
    const b = solidChunk();
    const y = 8;
    const z = 8;
    // The cell under test, on the x=0 seam, plus 8 of its 18 in-chunk neighbours carved to air.
    b[idx(0, y, z)] = 0;
    const carveList = [[0, y - 1, z], [0, y + 1, z], [0, y, z - 1], [0, y, z + 1],
                       [1, y, z], [1, y - 1, z], [1, y + 1, z], [1, y, z + 1]];
    for (const [cx, cy, cz] of carveList) b[idx(cx, cy, cz)] = 0;

    applyCaveCA(b, SIZE, H, 1);
    expect(
      b[idx(0, y, z)],
      'a seam cell was walled in on the strength of neighbours outside the chunk that were never sampled'
    ).toBe(0);
  });

  it('still carves and still fills in the INTERIOR — the control', () => {
    // Without this, a CA that did nothing at all would pass every assertion above.
    const b = solidChunk();
    // A small pocket of air in solid rock: its neighbours are overwhelmingly solid, so it fills.
    b[idx(8, 8, 8)] = 0;
    const { filled } = applyCaveCA(b, SIZE, H, 1);
    expect(filled, 'the CA consolidated nothing at all').toBeGreaterThan(0);
    expect(b[idx(8, 8, 8)], 'an isolated air pocket in solid rock was not consolidated').toBe(3);
  });

  it('carves a solid cell that is nearly surrounded by air', () => {
    const b = openChunk();
    b[idx(8, 8, 8)] = 3; // one lonely block in open space
    const { carved } = applyCaveCA(b, SIZE, H, 1);
    expect(carved, 'the CA carved nothing at all').toBeGreaterThan(0);
    expect(b[idx(8, 8, 8)]).toBe(0);
  });

  it('leaves water alone — it is not a wall', () => {
    const b = solidChunk();
    b[idx(8, 8, 8)] = 9;
    applyCaveCA(b, SIZE, H, 1);
    expect(b[idx(8, 8, 8)], 'water was consolidated into stone').toBe(9);
  });

  it('never touches the top and bottom layers, which the loop excludes by design', () => {
    const b = openChunk();
    b[idx(5, 0, 5)] = 3;
    b[idx(5, H - 1, 5)] = 3;
    applyCaveCA(b, SIZE, H, 2);
    expect(b[idx(5, 0, 5)]).toBe(3);
    expect(b[idx(5, H - 1, 5)]).toBe(3);
  });

  it('keeps the thresholds it was tuned on', () => {
    // The scaling is proportional, so if these move the border behaviour moves with them silently.
    expect(CARVE_AT_OR_BELOW).toBe(11);
    expect(FILL_AT_OR_ABOVE).toBe(16);
    expect(NEIGHBOURHOOD).toBe(27);
  });
});
