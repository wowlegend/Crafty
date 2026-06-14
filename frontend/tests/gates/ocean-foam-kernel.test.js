import { describe, it, expect } from 'vitest';
import { shoreFoamFactor, isWaterTop, WATER_BLOCK } from '../../src/world/oceanProfile.js';

// Ocean S2 (shore foam) pure kernel. The greedy mesher merges water-top faces into one quad, so foam must
// be baked per-block at mesh time — this is the testable detection the mesher will call (the GL wiring +
// re-baseline is the next slice). A water-top cell is "foam" iff it has air above + a solid-land neighbor.
describe('shore-foam kernel', () => {
  it('isWaterTop: water (9) with air (0) above is a top face', () => {
    expect(isWaterTop(WATER_BLOCK, 0)).toBe(true);
    expect(isWaterTop(WATER_BLOCK, WATER_BLOCK)).toBe(false); // submerged (water above) -> no top face
    expect(isWaterTop(3, 0)).toBe(false);                     // stone, not water
  });

  it('foam = 1 when a water-top cell touches land (any solid neighbor)', () => {
    expect(shoreFoamFactor(9, 0, [3, 9, 9, 9])).toBe(1); // stone to the west
    expect(shoreFoamFactor(9, 0, [9, 4, 9, 9])).toBe(1); // sand (beach) to the east
    expect(shoreFoamFactor(9, 0, [9, 9, 9, 6])).toBe(1); // wood
  });

  it('foam = 0 in open water (all-water or air neighbors — air is not land)', () => {
    expect(shoreFoamFactor(9, 0, [9, 9, 9, 9])).toBe(0); // open sea
    expect(shoreFoamFactor(9, 0, [0, 0, 9, 9])).toBe(0); // chunk-edge air ≠ land
  });

  it('foam = 0 if it is not a water-top face, even adjacent to land', () => {
    expect(shoreFoamFactor(9, 9, [3, 3, 3, 3])).toBe(0); // submerged water
    expect(shoreFoamFactor(3, 0, [9, 9, 9, 9])).toBe(0); // land cell, not water
  });
});
