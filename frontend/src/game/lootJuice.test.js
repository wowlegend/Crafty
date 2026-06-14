import { describe, it, expect } from 'vitest';
import { rarityBeam, RARITY_TIERS } from './lootJuice.js';
import { RARITY_FILL } from '../theme/tokens.js';

// M3c-T1: pure rarity -> drop-beam look. The beam is the only across-the-map
// rarity tell, so the mapping is pure + tested: color comes from the LOCKED
// RARITY_FILL palette (coherence), and height/intensity climb monotonically
// from common (short/dim) to legendary (tall/bright/saturated).

describe('rarityBeam', () => {
  it('maps the hex tiers to their RARITY_FILL ring color unchanged', () => {
    expect(rarityBeam('rare').color).toBe(RARITY_FILL.rare.ring);
    expect(rarityBeam('epic').color).toBe(RARITY_FILL.epic.ring);
    expect(rarityBeam('legendary').color).toBe(RARITY_FILL.legendary.ring);
  });

  it('returns a THREE.Color-safe color for every tier (alpha stripped — no rgba())', () => {
    // RARITY_FILL.common.ring is an rgba() string (authored for CSS box-shadows);
    // THREE.Color cannot use alpha + warns, so rarityBeam strips it to rgb().
    for (const tier of RARITY_TIERS) {
      expect(rarityBeam(tier).color).not.toMatch(/rgba\(/);
    }
    expect(rarityBeam('common').color).toMatch(/^rgb\(/); // common was rgba -> now rgb
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

// iter-163 loot rarity AURA: a soft additive glow-shell around the drop gem (bloom-softened,
// mirroring the spellVfx outer-glow-shell technique) so a drop reads as premium + rarity-legible
// from ANY angle (the beam is the across-map tell; the aura is the up-close "it glows" tell).
// Radius climbs strictly by tier; opacity climbs but is capped so it always reads as a glow,
// never a solid coloured ball (the taste guard).
describe('rarityBeam aura (rarity glow shell)', () => {
  it('returns numeric auraRadius + auraOpacity > 0 for every tier', () => {
    for (const tier of RARITY_TIERS) {
      const b = rarityBeam(tier);
      expect(typeof b.auraRadius).toBe('number');
      expect(typeof b.auraOpacity).toBe('number');
      expect(b.auraRadius).toBeGreaterThan(0);
      expect(b.auraOpacity).toBeGreaterThan(0);
    }
  });

  it('auraRadius is strictly monotonic increasing common -> legendary', () => {
    const r = RARITY_TIERS.map((t) => rarityBeam(t).auraRadius);
    for (let i = 1; i < r.length; i++) {
      expect(r[i]).toBeGreaterThan(r[i - 1]);
    }
  });

  it('auraOpacity climbs (non-decreasing) and is capped at 0.38 (a glow, never a solid ball)', () => {
    const o = RARITY_TIERS.map((t) => rarityBeam(t).auraOpacity);
    for (let i = 1; i < o.length; i++) {
      expect(o[i]).toBeGreaterThanOrEqual(o[i - 1]);
    }
    for (const v of o) {
      expect(v).toBeLessThanOrEqual(0.38);
    }
  });
});
