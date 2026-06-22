import { describe, it, expect } from 'vitest';
import { pineShape, acaciaShape, swampShape, jungleShape } from '../../src/world/foliage.js';

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

describe('acaciaShape (Phase B M1) — flat-top savanna umbrella', () => {
  it('the trunk is a single column of `height` blocks', () => {
    const { trunk } = acaciaShape(6);
    expect(trunk).toHaveLength(6);
    for (const [dx, , dz] of trunk) { expect(dx).toBe(0); expect(dz).toBe(0); }
    expect(trunk.map(t => t[1])).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it('the canopy is a WIDE FLAT umbrella at the crown (radius >= 3, no spire) — distinct from the conical pine', () => {
    const h = 6;
    const { leaves } = acaciaShape(h);
    const topY = Math.max(...leaves.map(l => l[1]));
    expect(topY).toBeLessThanOrEqual(h); // crown at/under the trunk top — flat, NOT a spire above it
    const topR = Math.max(...leaves.filter(l => l[1] === topY).map(l => Math.abs(l[0]) + Math.abs(l[2])));
    expect(topR).toBeGreaterThanOrEqual(3); // wide flat canopy
  });
  it('is deterministic (same height -> identical offsets)', () => {
    expect(acaciaShape(6)).toEqual(acaciaShape(6));
  });
});

describe('swampShape (Phase B M1) — short droopy wetland canopy', () => {
  it('the trunk is a single column of `height` blocks', () => {
    const { trunk } = swampShape(4);
    expect(trunk).toHaveLength(4);
    for (const [dx, , dz] of trunk) { expect(dx).toBe(0); expect(dz).toBe(0); }
  });
  it('the canopy droops BELOW the trunk top + is widest under the cap (droopy, not a round oak)', () => {
    const h = 4;
    const { leaves } = swampShape(h);
    expect(Math.min(...leaves.map(l => l[1]))).toBeLessThan(h); // fringe hangs below the trunk top
    const byY = new Map();
    for (const [dx, dy, dz] of leaves) byY.set(dy, Math.max(byY.get(dy) || 0, Math.abs(dx) + Math.abs(dz)));
    expect(byY.get(h - 1)).toBeGreaterThanOrEqual(byY.get(h)); // underlayer at least as wide as the cap (droopy)
  });
  it('is deterministic (same height -> identical offsets)', () => {
    expect(swampShape(4)).toEqual(swampShape(4));
  });
});

describe('jungleShape (Phase B B1) — broad layered vine-canopy', () => {
  it('the trunk is a single column of `height` blocks', () => {
    const { trunk } = jungleShape(8);
    expect(trunk).toHaveLength(8);
    for (const [dx, , dz] of trunk) { expect(dx).toBe(0); expect(dz).toBe(0); }
  });
  it('the crown is the BROADEST canopy (radius 4 — wider than the acacia umbrella radius 3)', () => {
    const h = 8;
    const jWidest = Math.max(...jungleShape(h).leaves.map(l => Math.abs(l[0]) + Math.abs(l[2])));
    const aWidest = Math.max(...acaciaShape(h).leaves.map(l => Math.abs(l[0]) + Math.abs(l[2])));
    expect(jWidest).toBe(4);
    expect(jWidest).toBeGreaterThan(aWidest);
  });
  it('has an emergent tuft ABOVE the crown AND hanging vines BELOW the rim (a layered tropical span)', () => {
    const h = 8;
    const ys = jungleShape(h).leaves.map(l => l[1]);
    expect(Math.max(...ys)).toBeGreaterThan(h);     // emergent layer pokes above the crown
    expect(Math.min(...ys)).toBeLessThan(h - 1);    // vines droop below the canopy rim
  });
  it('the hanging vines sit at the canopy RIM (full radius), not the trunk', () => {
    const { leaves } = jungleShape(8);
    const vines = leaves.filter(l => l[1] < 8 - 1 && (Math.abs(l[0]) + Math.abs(l[2])) === 3);
    expect(vines.length).toBeGreaterThanOrEqual(4);
  });
  it('is deterministic (same height -> identical offsets)', () => {
    expect(jungleShape(8)).toEqual(jungleShape(8));
  });
});
