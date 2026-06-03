import { describe, it, expect } from 'vitest';
import { rarityBeam, RARITY_TIERS } from './lootJuice.js';
import { RARITY_FILL } from '../theme/tokens.js';

// M3c-T1: pure rarity -> drop-beam look. The beam is the only across-the-map
// rarity tell, so the mapping is pure + tested: color comes from the LOCKED
// RARITY_FILL palette (coherence), and height/intensity climb monotonically
// from common (short/dim) to legendary (tall/bright/saturated).

describe('rarityBeam', () => {
  it('maps each of the 4 tiers to its RARITY_FILL ring color', () => {
    expect(rarityBeam('common').color).toBe(RARITY_FILL.common.ring);
    expect(rarityBeam('rare').color).toBe(RARITY_FILL.rare.ring);
    expect(rarityBeam('epic').color).toBe(RARITY_FILL.epic.ring);
    expect(rarityBeam('legendary').color).toBe(RARITY_FILL.legendary.ring);
  });

  it('returns numeric height + intensity for every tier', () => {
    for (const tier of RARITY_TIERS) {
      const b = rarityBeam(tier);
      expect(typeof b.height).toBe('number');
      expect(typeof b.intensity).toBe('number');
      expect(b.height).toBeGreaterThan(0);
      expect(b.intensity).toBeGreaterThan(0);
    }
  });

  it('height is strictly monotonic increasing common -> legendary', () => {
    const h = RARITY_TIERS.map((t) => rarityBeam(t).height);
    for (let i = 1; i < h.length; i++) {
      expect(h[i]).toBeGreaterThan(h[i - 1]);
    }
  });

  it('intensity is strictly monotonic increasing common -> legendary', () => {
    const v = RARITY_TIERS.map((t) => rarityBeam(t).intensity);
    for (let i = 1; i < v.length; i++) {
      expect(v[i]).toBeGreaterThan(v[i - 1]);
    }
  });

  it('falls back to the common look for an unknown/missing rarity', () => {
    const common = rarityBeam('common');
    expect(rarityBeam('mythic')).toEqual(common);
    expect(rarityBeam(undefined)).toEqual(common);
    expect(rarityBeam(null)).toEqual(common);
    expect(rarityBeam('')).toEqual(common);
  });

  it('RARITY_TIERS is ordered low -> high', () => {
    expect(RARITY_TIERS).toEqual(['common', 'rare', 'epic', 'legendary']);
  });
});
