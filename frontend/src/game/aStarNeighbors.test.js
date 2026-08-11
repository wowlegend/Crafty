import { describe, it, expect } from 'vitest';
import { NEIGHBOR_OFFSETS } from './aStarNeighbors.js';

// NINE ALLOCATIONS PER EXPANDED NODE, FOR EIGHT CONSTANTS.
//
// This table was rebuilt inside the A* expansion loop -- per node, per aggro mob, at 15 Hz. It lived in
// ai.worker.js, which assigns self.onmessage at module scope and so cannot be imported under vitest, so
// no test could reach it: the same reason the greedy mesher and the wander re-roll were extracted.
describe('NEIGHBOR_OFFSETS', () => {
  it('is the SAME array every time — that is the entire point', () => {
    expect(NEIGHBOR_OFFSETS).toBe(NEIGHBOR_OFFSETS);
    expect(Object.isFrozen(NEIGHBOR_OFFSETS)).toBe(true);
    expect(Object.isFrozen(NEIGHBOR_OFFSETS[0]), 'a consumer can write through into every later expansion').toBe(true);
  });

  it('covers all eight neighbours of a cell, exactly once each', () => {
    expect(NEIGHBOR_OFFSETS).toHaveLength(8);
    const seen = new Set(NEIGHBOR_OFFSETS.map(([x, z]) => `${x},${z}`));
    expect(seen.size, 'a neighbour is duplicated').toBe(8);
    for (const dx of [-1, 0, 1]) {
      for (const dz of [-1, 0, 1]) {
        if (dx === 0 && dz === 0) continue;
        expect(seen.has(`${dx},${dz}`), `the ${dx},${dz} neighbour is missing`).toBe(true);
      }
    }
  });

  it('never includes the cell itself, which would be a zero-cost self-loop', () => {
    expect(NEIGHBOR_OFFSETS.some(([x, z]) => x === 0 && z === 0)).toBe(false);
  });

  it('carries four orthogonal and four diagonal steps — diagonal traversal is the feature', () => {
    const diag = NEIGHBOR_OFFSETS.filter(([x, z]) => x !== 0 && z !== 0);
    expect(diag).toHaveLength(4);
    expect(NEIGHBOR_OFFSETS.length - diag.length).toBe(4);
  });
});
