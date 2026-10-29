import { describe, it, expect } from 'vitest';
import { ASPECT_GUIDE } from './aspectGuide';
import { ASPECT_TREES } from './talentTree';
import { ROAR_COST, GRAB_COST, SNARE_COST, IMBUE_COST, DAILY_BUILD_CAP } from './ember.js';

// The guide must never drift from the game: ids lock against ASPECT_TREES; keys lock
// against the shipped Aspect-verb row (R/V/X/Z).
describe('the Aspect guide (the UX clarity pass)', () => {
  it('covers EXACTLY the aspects in ASPECT_TREES (no orphans, no gaps)', () => {
    const treeIds = ASPECT_TREES.map((t) => t.aspect).sort();
    expect(Object.keys(ASPECT_GUIDE).sort()).toEqual(treeIds);
  });
  it('the Aspect-verb key row: R/V/X/Z', () => {
    expect(ASPECT_GUIDE.wildheart.key).toBe('R');
    expect(ASPECT_GUIDE.voidhand.key).toBe('V');
    expect(ASPECT_GUIDE.soulbind.key).toBe('X');
    expect(ASPECT_GUIDE.elemancer.key).toBe('Z');
  });
  it('every card has a meter line + a 3-5 step loop', () => {
    for (const g of Object.values(ASPECT_GUIDE)) {
      expect(g.meter.length).toBeGreaterThan(10);
      expect(g.steps.length).toBeGreaterThanOrEqual(3);
      expect(g.steps.length).toBeLessThanOrEqual(5);
    }
  });
  // One bar pays all four verbs (game/ember.js): each card names it and states its own verb's price from the constant.
  it('every card names the ember bar and its verb\'s price', () => {
    const price = { wildheart: ROAR_COST, voidhand: GRAB_COST, soulbind: SNARE_COST, elemancer: IMBUE_COST };
    for (const [aspect, g] of Object.entries(ASPECT_GUIDE)) {
      expect(g.meter, `${aspect} does not name the ember bar`).toMatch(/^EMBER\b/);
      expect(g.meter, `${aspect} does not state its price`).toMatch(new RegExp(`\\b${price[aspect]}\\b`));
      expect(JSON.stringify(g), `${aspect} still names a retired meter`).not.toMatch(/Ferocity|Kinetic|Resonance|\bSoul\b/i);
    }
  });
  it('building is stated as a source, with its daily limit', () => {
    expect(ASPECT_GUIDE.elemancer.meter).toMatch(/BUILDING/);
    expect(ASPECT_GUIDE.elemancer.steps[0]).toContain(String(DAILY_BUILD_CAP));
  });
});
