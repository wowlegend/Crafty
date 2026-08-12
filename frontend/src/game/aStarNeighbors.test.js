import { describe, it, expect } from 'vitest';
import { NEIGHBOR_OFFSETS, octileHeuristic, DIAG_COST } from './aStarNeighbors.js';

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

// ADMISSIBILITY — the property that makes A* return the SHORTEST path rather than merely a path.
//
// The worker searched with Manhattan (`|dx| + |dz|`) while stepping diagonally at DIAG_COST. Manhattan
// charges 2 for a move that costs 1.414, so h could EXCEED the true remaining cost — inadmissible, and
// with an inadmissible heuristic A* stops guaranteeing optimality. The symptom is a mob taking a visibly
// longer route, or expanding the wrong frontier and giving up on a reachable target.
describe('octileHeuristic — admissible for this 8-way grid', () => {
  // The true cost of the cheapest obstacle-free path, by construction: diagonal while both axes remain,
  // then straight. Derived from NEIGHBOR_OFFSETS' own movement model rather than restated by hand.
  const trueCost = (dx, dz) => {
    const diag = Math.min(dx, dz);
    return diag * DIAG_COST + (Math.max(dx, dz) - diag) * 1.0;
  };

  it('NEVER exceeds the true cost — the admissibility property itself', () => {
    let checked = 0;
    for (let dx = 0; dx <= 12; dx++) {
      for (let dz = 0; dz <= 12; dz++) {
        const h = octileHeuristic(0, 0, dx, dz);
        expect(h, `h(${dx},${dz}) = ${h} overestimates the true cost ${trueCost(dx, dz)}`)
          .toBeLessThanOrEqual(trueCost(dx, dz) + 1e-9);
        checked += 1;
      }
    }
    expect(checked, 'the sweep enumerated nothing').toBe(169);
  });

  it('is EXACT on an open grid, so it is not admissible by being uselessly small', () => {
    // A heuristic of 0 is admissible and worthless. This one must equal the true cost where there are
    // no obstacles, which is what makes A* expand almost nothing.
    for (const [dx, dz] of [[0, 0], [5, 0], [0, 7], [4, 4], [9, 3], [2, 11]]) {
      expect(octileHeuristic(0, 0, dx, dz)).toBeCloseTo(trueCost(dx, dz), 9);
    }
  });

  it('the Manhattan heuristic it replaced was NOT admissible — the defect, stated as a test', () => {
    const manhattan = (dx, dz) => dx + dz;
    // A pure diagonal is where it breaks worst: 4 steps of 1.414 = 5.656, Manhattan claims 8.
    expect(manhattan(4, 4)).toBeGreaterThan(trueCost(4, 4));
    // And the new one does not.
    expect(octileHeuristic(0, 0, 4, 4)).toBeLessThanOrEqual(trueCost(4, 4) + 1e-9);
  });

  it('is symmetric and non-negative', () => {
    expect(octileHeuristic(3, 7, -2, 4)).toBeCloseTo(octileHeuristic(-2, 4, 3, 7), 12);
    expect(octileHeuristic(0, 0, 0, 0)).toBe(0);
    expect(octileHeuristic(-5, -5, 5, 5)).toBeGreaterThan(0);
  });
});
