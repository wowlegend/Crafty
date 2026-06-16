import { describe, it, expect } from 'vitest';
import { grassTops, GRASS_CODE } from './grassField.js';

// A 4x4 column grid (size=4). topCodes[x + z*size]; 1 = grass (the rest: 3=stone, 4=sand, 0=air).
const SIZE = 4;
function grid(codes) { return Uint8Array.from(codes); }

describe('grassTops (sparse grass-top positions for the wind-grass overlay)', () => {
  it('includes ONLY grass-coded (1) columns, offset to world coords, y = topY + 1', () => {
    const codes = grid([1, 3, 0, 4,  3, 1, 3, 3,  0, 0, 0, 0,  4, 4, 4, 1]);
    const ys = Int16Array.from([10, 5, 0, 6,  5, 11, 5, 5,  0, 0, 0, 0,  6, 6, 6, 12]);
    const out = grassTops(codes, ys, SIZE, 100, 200, { stride: 1, cap: 50 });
    // grass at flat indices 0 (x0,z0), 5 (x1,z1), 15 (x3,z3)
    expect(out).toContainEqual([100 + 0, 10 + 1, 200 + 0]);
    expect(out).toContainEqual([100 + 1, 11 + 1, 200 + 1]);
    expect(out).toContainEqual([100 + 3, 12 + 1, 200 + 3]);
    expect(out.length).toBe(3); // no non-grass columns
  });

  it('GRASS_CODE is the grass block id (1)', () => {
    expect(GRASS_CODE).toBe(1);
  });

  it('honors the stride (thins density)', () => {
    const codes = grid(new Array(16).fill(1)); // all grass
    const ys = Int16Array.from(new Array(16).fill(8));
    const dense = grassTops(codes, ys, SIZE, 0, 0, { stride: 1, cap: 50 });
    const sparse = grassTops(codes, ys, SIZE, 0, 0, { stride: 2, cap: 50 });
    expect(dense.length).toBe(16);
    expect(sparse.length).toBe(4); // every other column in x and z
  });

  it('honors the cap (performance bound)', () => {
    const codes = grid(new Array(16).fill(1));
    const ys = Int16Array.from(new Array(16).fill(8));
    expect(grassTops(codes, ys, SIZE, 0, 0, { stride: 1, cap: 5 }).length).toBe(5);
  });

  it('returns empty for a grass-free chunk', () => {
    const codes = grid(new Array(16).fill(3)); // all stone
    const ys = Int16Array.from(new Array(16).fill(8));
    expect(grassTops(codes, ys, SIZE, 0, 0, {})).toEqual([]);
  });
});
