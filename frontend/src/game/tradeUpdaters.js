/**
 * tradeUpdaters.js — the merchant's inventory updaters, as pure functions of `prev`.
 *
 * WHY THEY LIVE HERE. The property these encode is "compute the new balance from the FRESH prev, never
 * from the render snapshot". A 2026-06-28 regression had them using a functional `setInventory(prev =>
 * ...)` while computing from `currentCount` / `currentCrystals` — values captured at RENDER time — and
 * absolute-setting the result, so any inventory change between paint and click was clobbered. A mob
 * dropping loot while the trade panel was open silently deleted the drop.
 *
 * The gate that guarded the fix asserted the exact fix EXPRESSION as a source string. That can only
 * confirm the characters are present: it never runs the subtraction, so it cannot tell a correct updater
 * from one that ignores `prev` and returns the same shape, and it goes red on any rewrite that is
 * equally correct. The property is about the RELATIONSHIP between two states, which is exactly what a
 * pure function of `prev` makes checkable — feed it a `prev` that differs from the snapshot and see
 * which one the arithmetic used.
 *
 * B3b: crystals are spent from `blocks`, the canonical bucket ore->crystal and crafting bank into. They
 * were briefly spent from `magic`, where nothing accumulates, which made the wand trade unreachable.
 * M5 #15: bought items land in `blocks` too, the flat bucket the Inventory panel renders — landing them
 * in `magic` is the lost-buy bug, where the purchase succeeds and the item is never seen again.
 */

/** Spend `required` of `blockType` from prev, and bank `resultCount` of `resultItem`. */
export function applyBlockTrade(prev, blockType, required, resultItem, resultCount = 1) {
  const blocks = prev?.blocks || {};
  return {
    ...prev,
    blocks: {
      ...blocks,
      [blockType]: Math.max(0, (blocks[blockType] || 0) - required),
      [resultItem]: (blocks[resultItem] || 0) + resultCount,
    },
  };
}

/** Spend `requiredCrystals` from prev.blocks.crystals, and bank `resultCount` of `magicItem`. */
export function applyCrystalTrade(prev, magicItem, requiredCrystals, resultCount = 1) {
  const blocks = prev?.blocks || {};
  return {
    ...prev,
    blocks: {
      ...blocks,
      crystals: Math.max(0, (blocks.crystals || 0) - requiredCrystals),
      [magicItem]: (blocks[magicItem] || 0) + resultCount,
    },
  };
}
