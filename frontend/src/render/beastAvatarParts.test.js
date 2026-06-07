import { describe, it, expect } from 'vitest';
import { beastAvatarParts, BEAST_AVATAR_ELEMENTS } from './beastAvatarParts.js';

// S2-B1-M7b: the beast avatar's box-construction is pure data -> the per-form silhouettes (the
// content-variety / grayscale test) are unit-checkable; BeastAvatar.jsx renders them + the glow layers.

describe('beastAvatarParts', () => {
  it('covers the 4 beast elements; unknown -> null', () => {
    expect(BEAST_AVATAR_ELEMENTS.sort()).toEqual(['arcane', 'fire', 'ice', 'lightning']);
    expect(beastAvatarParts('mythic')).toBeNull();
    expect(beastAvatarParts(null)).toBeNull();
  });

  it('every form has a color, a near-white core tint, >=1 box, a core, and a positive aura', () => {
    for (const el of BEAST_AVATAR_ELEMENTS) {
      const p = beastAvatarParts(el);
      expect(p.bodyColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(p.glowColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(p.coreColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(p.boxes.length).toBeGreaterThanOrEqual(1);
      expect(p.aura).toBeGreaterThan(0);
      expect(p.core.radius).toBeGreaterThan(0);
      for (const b of p.boxes) {
        expect(b.pos).toHaveLength(3);
        expect(b.size).toHaveLength(3);
        expect(b.size.every((s) => s > 0)).toBe(true); // no zero/negative box dims
        expect(b.rot).toHaveLength(3);
      }
    }
  });

  it('the 4 silhouettes are genuinely DISTINCT in mass (height + footprint), not recolors (sampler-trap)', () => {
    const sig = (el) => {
      const p = beastAvatarParts(el);
      const maxW = Math.max(...p.boxes.map((b) => b.size[0]));
      const maxD = Math.max(...p.boxes.map((b) => b.size[2]));
      return `${p.height}|${maxW.toFixed(2)}|${maxD.toFixed(2)}`;
    };
    const sigs = BEAST_AVATAR_ELEMENTS.map(sig);
    expect(new Set(sigs).size).toBe(BEAST_AVATAR_ELEMENTS.length);
    // and the design intent: bull widest, golem/hawk tallest, comet shortest+thin
    const h = Object.fromEntries(BEAST_AVATAR_ELEMENTS.map((el) => [el, beastAvatarParts(el).height]));
    expect(h.ice).toBeLessThan(h.fire);          // bull (short/wide) is the shortest mass
    expect(h.ice).toBeLessThan(h.lightning);     // ...shorter than the tall hawk
    expect(h.arcane).toBe(Math.max(...Object.values(h))); // golem is the tallest monolith
  });
});
