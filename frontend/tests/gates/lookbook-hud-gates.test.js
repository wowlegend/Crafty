import { describe, it, expect } from 'vitest';
import { clusterStand, overlappingPairs } from '../../scripts/visual/_lookbookHud.mjs';

/**
 * The lookbook's hud set poses HOME and an NPC close together on the compass and counts overlapping label boxes. These
 * drive its two pure parts on inputs whose answer is known by construction.
 *
 * NOT CHECKED HERE: that the frame shows what the pose computed (the set records the labels and pips it read; open the
 * frame), and the dusk half, which reads a running game.
 */
describe('the compass cluster pose', () => {
  it('stands beyond the NPC on the line from HOME, facing HOME, so both share a bearing', () => {
    const npc = [5, -3];
    const at = clusterStand(npc[0], npc[1], 22);
    const bearing = (x, z) => ((Math.atan2(x - at.x, -(z - at.z)) * 180) / Math.PI + 360) % 360;
    expect(Math.hypot(at.x - npc[0], at.z - npc[1])).toBeCloseTo(22, 9);
    expect(Math.hypot(at.x, at.z)).toBeGreaterThan(Math.hypot(...npc));
    expect(bearing(0, 0)).toBeCloseTo(at.heading, 9);
    expect(bearing(...npc)).toBeCloseTo(at.heading, 9);
  });
});

describe('overlapping label boxes', () => {
  const box = (text, x, right, y = 0, bottom = 10) => ({ text, x, right, y, bottom });
  it('counts a shared pixel, not a shared edge, and names both labels', () => {
    expect(overlappingPairs([box('HOME', 0, 40), box('Mara', 39, 70), box('N', 70, 80)])).toEqual(['HOME x Mara']);
    expect(overlappingPairs([box('A', 0, 10), box('B', 0, 10, 10, 20)])).toEqual([]);
    expect(overlappingPairs([])).toEqual([]);
  });
});
