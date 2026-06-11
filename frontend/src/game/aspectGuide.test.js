import { describe, it, expect } from 'vitest';
import { ASPECT_GUIDE } from './aspectGuide';
import { ASPECT_TREES } from './talentTree';

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
  it('the build-verb economy is stated for elemancer (the one non-kill meter)', () => {
    expect(ASPECT_GUIDE.elemancer.meter).toMatch(/BUILDING/);
  });
});
