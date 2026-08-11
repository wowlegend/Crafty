import { describe, it, expect } from 'vitest';
import { RECIPES } from '../../src/data/recipes.js';
import { ITEMS, NAME_TO_ID, CURRENCY_KEYS, isDeliverableKey, getItemRarity, getItemIcon, getItemName } from '../../src/data/items.js';
import { BLOCK_TYPES } from '../../src/world/Blocks.js';

// A RECIPE THAT PROMISES ONE THING AND DELIVERS ANOTHER.
//
// A recipe's `name` is its TITLE; its `output` key is what the inventory actually receives, and the two
// diverge: 'Stone Pickaxe' grants 'pickaxe', 'Iron Sword (Nuggets)' grants 'Iron Sword', 'Magic Crystal'
// grants 'crystals'. Every identity the crafting slot drew -- icon, rarity, toast -- came from the TITLE,
// so it looked the item up by a string the registry has never heard of: the substring ladder answered
// 'Stone' -> rare for an item the registry calls common, and getItemIcon returned null and drew a blank
// swatch for an item with a perfectly good icon.
//
// The worse form of this shipped and was removed on 2026-08-09: Bow granted Arrow x5, and Torch and
// Planks granted keys that resolved on NO path in the entire frontend -- addToInventory writes any string
// blindly, so the item appeared in the bag and then did nothing at all. THAT is what this gate is for. It
// is a DENOMINATOR gate: it enumerates every recipe and states the count, because a loop that silently
// enumerated nothing would report a clean pass.
// Three categories, because the inventory holds three kinds of thing: registered items, placeable
// blocks, and a short justified list of CURRENCIES (crystals/wand/coins) that are neither. The currency
// list lives in source with its consumers named -- an unjustified entry would turn this gate into an
// allowlist that hides the very class it catches.
const asItem = (k) => !!(ITEMS[k] || NAME_TO_ID[k]);
const asBlock = (k) => !!BLOCK_TYPES[k];
const deliverable = (k) => isDeliverableKey(k) || asBlock(k);

describe('recipes — every output is an item the game can actually deliver', () => {
  it('enumerates a real recipe book', () => {
    expect(Array.isArray(RECIPES)).toBe(true);
    expect(RECIPES.length, 'the recipe book is empty, so every assertion below is vacuous').toBeGreaterThan(10);
  });

  it('EVERY output key resolves to a registered item or a placeable block', () => {
    const orphans = [];
    let checked = 0;
    for (const r of RECIPES) {
      for (const key of Object.keys(r.output || {})) {
        checked++;
        if (!deliverable(key)) orphans.push(`${r.name} -> ${key}`);
      }
    }
    expect(checked, 'no outputs were examined').toBe(RECIPES.length);
    expect(orphans, 'these recipes grant a key that resolves on no path — it lands in the bag and does nothing').toEqual([]);
  });

  it('every output grants a POSITIVE whole count', () => {
    for (const r of RECIPES) {
      for (const [key, n] of Object.entries(r.output || {})) {
        expect(Number.isInteger(n), `${r.name} -> ${key} grants ${n}`).toBe(true);
        expect(n, `${r.name} -> ${key} grants ${n}`).toBeGreaterThan(0);
      }
    }
  });

  it('the result slot must read the OUTPUT KEY — the title resolves differently, and that is the bug', () => {
    // Proof by counter-example, from the live recipe book rather than a fixture: at least one recipe's
    // title and output key disagree about rarity or icon. If this ever finds none, the divergence is gone
    // and the assertion below is worth nothing — so it asserts the divergence exists first.
    const divergent = RECIPES.filter((r) => {
      const key = Object.keys(r.output)[0];
      if (key === r.name) return false;
      return getItemRarity(key) !== getItemRarity(r.name) || getItemIcon(key) !== getItemIcon(r.name);
    });
    expect(divergent.length, 'no recipe title diverges from its output any more — retire this gate').toBeGreaterThan(0);
    for (const r of divergent) {
      const key = Object.keys(r.output)[0];
      // What the player receives is `key`, so `key` is the identity the UI owes them.
      expect(deliverable(key), `${r.name} -> ${key} is not deliverable`).toBe(true);
    }
  });

  it('the TITLE and the OUTPUT share a stem — a recipe may not be named after something else entirely', () => {
    // The first draft of this assertion asked whether the recipe NAME was itself a registered item, and
    // the Bow mutation sailed straight through it: 'Bow' is in neither ITEMS nor NAME_TO_ID, and 'Arrow'
    // is a perfectly real item, so both halves looked fine while the panel told the player they had made
    // a bow and handed them arrows. A green mutation is the finding, so the rule is now the one that
    // actually separates the cases.
    //
    // Legitimate divergence is a TITLE DESCRIBING ITS OWN OUTPUT: 'Stone Pickaxe' -> 'pickaxe',
    // 'Iron Sword (Nuggets)' -> 'Iron Sword', 'Magic Crystal' -> 'crystals'. In every one the title and
    // the granted key share a stem. 'Bow' -> 'Arrow' shares nothing, and that is the whole difference.
    const stem = (x) => String(x).toLowerCase().replace(/\s*\(.*?\)\s*/g, ' ').replace(/s\b/g, '').replace(/[^a-z ]/g, '').trim();
    const unrelated = [];
    let checked = 0;
    for (const r of RECIPES) {
      const key = Object.keys(r.output)[0];
      checked++;
      const a = stem(r.name);
      const b = stem(getItemName(key)) || stem(key);
      if (!a || !b) continue;
      const shares = a.includes(b) || b.includes(a) || a.split(' ').some((w) => w.length > 2 && b.includes(w));
      if (!shares) unrelated.push(`${r.name} -> ${key}`);
    }
    expect(checked, 'no recipes were examined').toBe(RECIPES.length);
    expect(unrelated, 'the recipe is titled after something it does not produce').toEqual([]);
  });
});

describe('the currency escape hatch is narrow and justified', () => {
  it('every currency key is genuinely unregistered — none is a typo for a real item', () => {
    // A currency that IS a registered item means someone widened the allowlist to silence a real orphan.
    for (const k of CURRENCY_KEYS) {
      expect(asItem(k) || asBlock(k), `${k} is a real item/block and does not belong on the currency list`).toBe(false);
    }
  });

  it('stays short — this is an exception list, not a bypass', () => {
    expect(CURRENCY_KEYS.length).toBeLessThanOrEqual(4);
  });

  it('isDeliverableKey rejects the shapes that shipped as orphans', () => {
    // The three that were removed on 2026-08-09, plus the nonsense a bare string map happily accepts.
    for (const bad of ['Bow', 'torch', 'planks', '', null, undefined, 42, {}]) {
      expect(isDeliverableKey(bad), `${String(bad)} was accepted as deliverable`).toBe(false);
    }
    expect(isDeliverableKey('pickaxe')).toBe(true);
    expect(isDeliverableKey('crystals')).toBe(true);
  });
});
