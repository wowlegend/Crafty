import { describe, it, expect } from 'vitest';
import { shrineParts } from '../../src/world/shrineShape.js';

// B3 — the shrine silhouette (replaces the generic tapered tower). Pins the recognizable shrine
// structure: a wide altar plinth at the base, >=4 framing pillars, a canopy lintel, and a single
// warm crystal heart crowning the centre — deterministic so the capture frame stays byte-stable.
describe('B3 shrineParts — a distinct sacred silhouette', () => {
  const baseY = 60;
  const topY = 110;
  const parts = shrineParts(baseY, topY);

  it('is non-trivial + deterministic (same input -> identical parts)', () => {
    expect(parts.length).toBeGreaterThanOrEqual(10);
    expect(shrineParts(baseY, topY)).toEqual(parts);
  });

  it('has a WIDE altar plinth at the base (footprint wider than anything above it)', () => {
    const base = parts.filter(p => p.position[1] <= baseY + 4);
    const maxBaseW = Math.max(...base.map(p => p.size[0]));
    const maxUpperW = Math.max(...parts.filter(p => p.position[1] > baseY + 6).map(p => p.size[0]));
    expect(maxBaseW).toBeGreaterThanOrEqual(10);          // a real platform
    expect(maxBaseW).toBeGreaterThan(maxUpperW);          // base is the widest mass (reads as built)
  });

  it('frames the heart with >=4 tall corner pillars (offset on BOTH x and z)', () => {
    const pillars = parts.filter(p => Math.abs(p.position[0]) > 2 && Math.abs(p.position[2]) > 2 && p.size[1] > 8);
    expect(pillars.length).toBeGreaterThanOrEqual(4);
  });

  it('crowns the CENTRE with exactly one warm crystal heart near the top', () => {
    const crystals = parts.filter(p => p.tone === 'crystal');
    expect(crystals).toHaveLength(1);
    const c = crystals[0];
    expect(c.position[0]).toBe(0);                          // centred
    expect(c.position[2]).toBe(0);
    expect(c.position[1]).toBeGreaterThan(baseY + (topY - baseY) * 0.7); // up high (the peak/focal light)
  });

  it('keeps every part within the silhouette envelope (no runaway geometry)', () => {
    for (const p of parts) {
      expect(p.position[1]).toBeGreaterThanOrEqual(baseY);
      expect(p.position[1] + p.size[1] / 2).toBeLessThanOrEqual(topY + 6);
      expect(Math.abs(p.position[0])).toBeLessThanOrEqual(7);
      expect(Math.abs(p.position[2])).toBeLessThanOrEqual(7);
    }
  });
});
