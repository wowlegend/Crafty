import { describe, it, expect } from 'vitest';
import { chestHasItems } from './chestState.js';

// This predicate decides whether a left-click can destroy a chest, so its FALSE cases are the dangerous
// ones: every false here is a chest the router will let you mine.
describe('chestHasItems — the input to the chest-destruction guard', () => {
  it('true for a chest holding something', () => {
    expect(chestHasItems({ inventory: { wood: 3 } })).toBe(true);
  });

  it('false for an empty chest — removing one you placed must stay possible', () => {
    expect(chestHasItems({ inventory: {} })).toBe(false);
  });

  // The store decrements in place and leaves the key behind, so `{ wood: 0 }` is a real state and
  // `Object.keys(...).length > 0` would be the wrong test — it would protect an empty chest forever.
  it('false when every entry is zero — a drained chest is empty, not protected', () => {
    expect(chestHasItems({ inventory: { wood: 0, stone: 0 } })).toBe(false);
  });

  it('true when ONE entry survives a partial drain', () => {
    expect(chestHasItems({ inventory: { wood: 0, stone: 2 } })).toBe(true);
  });

  // Absence must read as "not protected" and never throw: the ray-hit site calls this on whatever the
  // Map returns, which is undefined for a coord that is not a chest.
  it('false for undefined / missing inventory rather than throwing', () => {
    expect(chestHasItems(undefined)).toBe(false);
    expect(chestHasItems(null)).toBe(false);
    expect(chestHasItems({})).toBe(false);
  });
});
