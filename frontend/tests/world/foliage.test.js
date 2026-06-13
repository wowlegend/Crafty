import { describe, it, expect } from 'vitest';
import { pineShape } from '../../src/world/foliage.js';

describe('pineShape (World-M4a) — deterministic conical evergreen', () => {
  it('the trunk is a single column of `height` blocks rising from the base', () => {
    const { trunk } = pineShape(6);
    expect(trunk).toHaveLength(6);
    for (const [dx, dy, dz] of trunk) { expect(dx).toBe(0); expect(dz).toBe(0); }
    expect(trunk.map(t => t[1])).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it('the canopy is a tapered cone — radius shrinks with height (fat base, pointed spire)', () => {
    const { leaves } = pineShape(8);
    const byY = new Map();
    for (const [dx, dy, dz] of leaves) {
      const r = Math.max(byY.get(dy) || 0, Math.abs(dx) + Math.abs(dz));
      byY.set(dy, r);
    }
    const ys = [...byY.keys()].sort((a, b) => a - b);
    const radii = ys.map(y => byY.get(y));
    for (let i = 1; i < radii.length; i++) expect(radii[i]).toBeLessThanOrEqual(radii[i - 1]); // monotonic taper
    expect(radii[0]).toBeGreaterThanOrEqual(2);                  // fat base
    expect(radii[radii.length - 1]).toBe(0);                     // pointed top
  });
  it('the spire pokes one block above the trunk top (a distinct evergreen tip)', () => {
    const h = 7;
    const { leaves } = pineShape(h);
    const maxLeafY = Math.max(...leaves.map(l => l[1]));
    expect(maxLeafY).toBe(h + 1);
  });
  it('is deterministic (same height -> identical offsets)', () => {
    expect(pineShape(6)).toEqual(pineShape(6));
  });
});
