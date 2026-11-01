import { describe, it, expect } from 'vitest';
import { lanternsIn } from './lanternIndex.js';

describe('lanternsIn', () => {
  it('lists the cells holding the lantern id, in the edits\' order, and no others', () => {
    const blocks = new Map([['4_9_-2', 16], ['0_5_0', 1], ['-1_3_8', 16], ['2_2_2', 0]]);
    expect(lanternsIn(blocks, 16)).toEqual([{ x: 4, y: 9, z: -2 }, { x: -1, y: 3, z: 8 }]);
    expect(lanternsIn(blocks, 1)).toEqual([{ x: 0, y: 5, z: 0 }]);
  });

  it('hands back the list it replaces when the lanterns did not move, and a new one when they did', () => {
    const prev = lanternsIn(new Map([['4_9_-2', 16]]), 16);
    expect(lanternsIn(new Map([['4_9_-2', 16], ['0_5_0', 1]]), 16, prev)).toBe(prev);
    expect(lanternsIn(new Map([['4_9_-1', 16]]), 16, prev)).toEqual([{ x: 4, y: 9, z: -1 }]);
    expect(lanternsIn(new Map([['4_9_-2', 16], ['5_9_-2', 16]]), 16, prev)).toHaveLength(2);
  });

  it('holds nothing for a build with no lantern block, whatever the edits hold', () => {
    expect(lanternsIn(new Map([['4_9_-2', 16]]), undefined)).toEqual([]);
    expect(lanternsIn(null, 16)).toEqual([]);
  });
});
