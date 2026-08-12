import { describe, it, expect } from 'vitest';
import { applyBlockTrade, applyCrystalTrade } from '../../src/game/tradeUpdaters.js';

// SUBTRACT FROM THE FRESH prev, NOT FROM THE RENDER SNAPSHOT.
//
// Regression (2026-06-28 audit, MEDIUM): the trade functions passed a functional updater to
// setInventory but computed the new balance from `currentCount` / `currentCrystals` — values captured
// when the panel last RENDERED — and absolute-set the result. Any inventory change between paint and
// click was silently clobbered. Concretely: kill a mob while the merchant is open, its loot lands in
// the bag, then trade, and the drop is gone.
//
// The gate that guarded the fix asserted the exact fix EXPRESSION as a source string, plus a `.not`
// on the buggy one. Three things wrong with that, all the same thing: it never ran the subtraction, so
// it could not tell a correct updater from one that ignores `prev` entirely and returns the same shape;
// it went red on any equally-correct rewrite; and the property is a RELATIONSHIP between two states,
// which no amount of file text can express.
//
// The arithmetic is now a pure function of `prev` (game/tradeUpdaters.js), so the test can do the one
// thing that actually settles it: hand it a `prev` that DIFFERS from the render snapshot and see which
// one the result was computed from.
describe('block trade computes from prev, and prev alone', () => {
  it('uses the balance in prev even when it has moved since the panel rendered', () => {
    // The panel painted at stone:20. Between paint and click, mining banked 5 more.
    const prev = { blocks: { stone: 25 } };
    const out = applyBlockTrade(prev, 'stone', 16, 'crystals', 1);
    expect(out.blocks.stone, 'the trade computed from the stale render snapshot of 20, deleting the 5 mined in between').toBe(9);
    expect(out.blocks.crystals).toBe(1);
  });

  it('preserves a concurrent drop of an UNRELATED item', () => {
    // The shape of the original bug report: an absolute set over the whole bucket loses everything the
    // snapshot did not know about.
    const prev = { blocks: { stone: 25, bone: 3, gold: 1 } };
    const out = applyBlockTrade(prev, 'stone', 16, 'crystals', 1);
    expect(out.blocks.bone, 'a concurrent loot drop was clobbered by the trade').toBe(3);
    expect(out.blocks.gold).toBe(1);
  });

  it('adds to whatever the fresh prev already holds of the bought item', () => {
    const prev = { blocks: { stone: 40, crystals: 7 } };
    expect(applyBlockTrade(prev, 'stone', 16, 'crystals', 2).blocks.crystals,
      'the result was SET rather than accumulated — existing crystals were overwritten').toBe(9);
  });

  it('never returns a negative balance', () => {
    expect(applyBlockTrade({ blocks: { stone: 3 } }, 'stone', 16, 'crystals').blocks.stone).toBe(0);
  });

  it('does not MUTATE prev — zustand compares by reference', () => {
    // An in-place edit would make the store see no change and skip the re-render, so the panel would
    // show the old balance until something else happened to repaint it.
    const prev = { blocks: { stone: 25 } };
    const out = applyBlockTrade(prev, 'stone', 16, 'crystals', 1);
    expect(prev.blocks.stone, 'prev was mutated in place').toBe(25);
    expect(out).not.toBe(prev);
    expect(out.blocks).not.toBe(prev.blocks);
  });

  it('carries through sibling inventory buckets it does not own', () => {
    const prev = { blocks: { stone: 25 }, magic: { scroll: 1 }, equipped: 'axe' };
    const out = applyBlockTrade(prev, 'stone', 16, 'crystals', 1);
    expect(out.magic, 'an unrelated inventory bucket was dropped by the trade').toEqual({ scroll: 1 });
    expect(out.equipped).toBe('axe');
  });
});

describe('crystal trade computes from prev, and spends from the canonical bucket', () => {
  it('uses the crystal balance in prev, not the render snapshot', () => {
    const prev = { blocks: { crystals: 18 } };
    const out = applyCrystalTrade(prev, 'wand', 15, 1);
    expect(out.blocks.crystals, 'the crystal spend used a stale snapshot').toBe(3);
    expect(out.blocks.wand).toBe(1);
  });

  it('spends from blocks, NOT from magic — B3b, which made the wand trade unreachable', () => {
    // Crystals accumulate in `blocks` (ore->crystal and crafting bank there). Spending from `magic`,
    // where nothing accumulates, meant the balance never fell and the wand could never be bought.
    const prev = { blocks: { crystals: 20 }, magic: { crystals: 99 } };
    const out = applyCrystalTrade(prev, 'wand', 15, 1);
    expect(out.blocks.crystals).toBe(5);
    expect(out.magic, 'the crystal spend reached into `magic`, the bucket nothing accumulates into').toEqual({ crystals: 99 });
    expect(out.blocks.wand, 'the bought wand did not land in `blocks`, the bucket the panels render').toBe(1);
  });

  it('accumulates wands rather than overwriting them, and floors at zero', () => {
    expect(applyCrystalTrade({ blocks: { crystals: 30, wand: 2 } }, 'wand', 15).blocks.wand).toBe(3);
    expect(applyCrystalTrade({ blocks: { crystals: 2 } }, 'wand', 15).blocks.crystals).toBe(0);
  });

  it('does not MUTATE prev', () => {
    const prev = { blocks: { crystals: 18 } };
    applyCrystalTrade(prev, 'wand', 15, 1);
    expect(prev.blocks.crystals).toBe(18);
  });
});

describe('an empty or missing inventory does not throw', () => {
  // The panel can render before the store has hydrated a save. A crash here blanks the merchant.
  it('tolerates an absent blocks bucket', () => {
    expect(() => applyBlockTrade({}, 'stone', 16, 'crystals')).not.toThrow();
    expect(applyBlockTrade({}, 'stone', 16, 'crystals').blocks.crystals).toBe(1);
    expect(applyCrystalTrade(undefined, 'wand', 15).blocks.wand).toBe(1);
  });
});
