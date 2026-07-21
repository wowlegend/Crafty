import { describe, it, expect } from 'vitest';
import { hasLineOfSight } from './mobLineOfSight.js';

// 9x9 height window (81 cells). Flat unless a wall is placed.
const flatGrid = (h = 0) => new Array(81).fill(h);
const gridWithWall = () => { const g = flatGrid(0); g[4 + 4 * 9] = 5; return g; }; // tall column at (4,4)

describe('hasLineOfSight — mob local 9x9 window', () => {
  it('clear across a flat grid', () => {
    expect(hasLineOfSight(flatGrid(0), 0, 4, 8, 4)).toBe(true);
  });

  it('a tall intermediate column blocks the sightline', () => {
    expect(hasLineOfSight(gridWithWall(), 0, 4, 8, 4)).toBe(false); // wall at (4,4) sits between the ends
  });

  it('the same cell is trivially in sight', () => {
    expect(hasLineOfSight(flatGrid(0), 3, 3, 3, 3)).toBe(true);
  });

  // MUTATION-PROOF for the clamp: an off-grid endpoint (player far from the mob) must be projected onto
  // the grid so a real obstruction still blocks. Without clampCell the endpoint index reads undefined ->
  // Math.max(startH, undefined) is NaN -> `cellH > NaN` is always false -> LOS falsely reports "clear",
  // so cover is never found at range. Delete the clampCell calls and these two go RED (true).
  it('an off-grid POSITIVE player endpoint is clamped, so a wall still blocks (no false clear)', () => {
    expect(hasLineOfSight(gridWithWall(), 0, 0, 15, 15)).toBe(false); // (15,15) -> (8,8); diagonal crosses (4,4)
  });

  it('an off-grid NEGATIVE endpoint clamps to 0 rather than reading a wrapped cell', () => {
    expect(hasLineOfSight(gridWithWall(), 8, 8, -20, -20)).toBe(false); // (-20,-20) -> (0,0); crosses (4,4)
  });
});
