import { describe, it, expect } from 'vitest';
import { normalizeInventoryKeys } from './invNormalize.js';
import { normalizeItemName } from '../data/items.js';

// Save-migration: legacy saves keyed inventory items by an emoji-prefixed name; the registry decoupled
// identity from emoji, so on load every key is normalized (emoji stripped) and colliding keys MERGE
// their quantities. Locks the merge + the structure/garbage passthrough so a load can't drop or double
// items. NOTE: emoji are written as \u{...} escapes (not literal glyphs) so this test does not trip the
// zero-emoji-in-src/ hard gate (tests/gates/static-gates.test.js) — the runtime string is identical.
const FIRE_CRYSTAL = '\u{1F525} Crystal'; // fire-emoji-prefixed "Crystal" -> normalizes to "Crystal"
const DAGGER_SWORD = '\u{1F5E1}\u{FE0F} Sword'; // dagger-emoji(+VS16)-prefixed "Sword" -> normalizes to "Sword"

describe('normalizeInventoryKeys', () => {
  it('sanity: the helper it relies on strips a leading emoji', () => {
    expect(normalizeItemName(FIRE_CRYSTAL)).toBe('Crystal');
    expect(normalizeItemName('Crystal')).toBe('Crystal');
  });

  it('leaves a clean (emoji-free) inventory structurally unchanged', () => {
    const inv = { blocks: { stone: 5, wood: 3 }, tools: { pickaxe: 1 }, magic: { crystals: 2 } };
    expect(normalizeInventoryKeys(inv)).toEqual(inv);
  });

  it('merges quantities when an emoji key collides with its clean twin', () => {
    const out = normalizeInventoryKeys({ blocks: { [FIRE_CRYSTAL]: 2, Crystal: 3 } });
    expect(out.blocks).toEqual({ Crystal: 5 }); // 2 + 3, no double-key, no drop
  });

  it('renames an emoji-only key to its clean name (quantity preserved)', () => {
    const out = normalizeInventoryKeys({ blocks: { [DAGGER_SWORD]: 1 } });
    expect(out.blocks).toEqual({ Sword: 1 });
  });

  it('passes through a null / non-object inventory unchanged', () => {
    expect(normalizeInventoryKeys(null)).toBeNull();
    expect(normalizeInventoryKeys(42)).toBe(42);
    expect(normalizeInventoryKeys(undefined)).toBeUndefined();
  });

  it('preserves a non-object section as-is and normalizes the rest', () => {
    const out = normalizeInventoryKeys({ blocks: null, tools: { [FIRE_CRYSTAL]: 1, Crystal: 1 } });
    expect(out.blocks).toBeNull();
    expect(out.tools).toEqual({ Crystal: 2 });
  });

  it('does not mutate the input object', () => {
    const inv = { blocks: { [FIRE_CRYSTAL]: 1, Crystal: 1 } };
    normalizeInventoryKeys(inv);
    expect(inv.blocks).toEqual({ [FIRE_CRYSTAL]: 1, Crystal: 1 }); // original untouched
  });
});
