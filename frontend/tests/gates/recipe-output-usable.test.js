import { describe, it, expect } from 'vitest';
import { RECIPES } from '../../src/data/recipes.js';
import { BLOCK_ID, BLOCK_ALIAS } from '../../src/world/blockIds.js';
import { CONSUMABLE_EFFECTS } from '../../src/game/consumables.js';
import { EQUIPMENT_STATS } from '../../src/store/useGameStore.jsx';
import { CURRENCY_KEYS } from '../../src/data/items.js';

// A CRAFT THAT DESTROYS MATERIALS FOR AN INERT ITEM (2026-08-09 audit, two HIGH findings).
//
// `Torch` output { torch: 4 } and `Planks` output { planks: 4 }. Neither key existed ANYWHERE else in the
// frontend — no BLOCK_ID, no alias, no icon, no consumable effect, no equipment stat, and not an
// ingredient of any other recipe. `addToInventory` writes any key blindly, so the item appeared in the
// inventory; placing it hit `idForBlock() -> null` and Terrain silently no-opped. Ingredients are debited
// on grid placement and `doCraft` clears the grid before the unmount escrow-return can refund them.
//
// Planks was the worse of the two: the starting loadout ships wood:16, and Planks is [['wood']] — a single
// wood. So the cheapest, most obvious first craft in a voxel game quietly ate the player's starting stack.
//
// This gate is about the CLASS. Nothing checked that a recipe's output was a thing the game could use, so
// any future recipe could reintroduce it. Every output key must now resolve on at least one real path.
describe('every recipe output resolves to something the game can actually use', () => {
  // The four ways an inventory key becomes usable. A key on none of them is a black hole that consumes
  // its ingredients and yields an item with no icon, no placement and no effect.
  const isPlaceable = (k) => (BLOCK_ALIAS[k] || k) in BLOCK_ID;
  const isConsumable = (k) => k in CONSUMABLE_EFFECTS;
  const isEquipment = (k) => k in EQUIPMENT_STATS;
  // CURRENCY — the fifth path: a key with a real spender that is neither an item nor a block. Read from
  // data/items.js CURRENCY_KEYS, which names each one's consumer, so the gate cannot drift from that list.
  const isCurrency = (k) => CURRENCY_KEYS.includes(k);
  const isIngredient = (k) =>
    RECIPES.some((r) => r.pattern.some((row) => row.some((c) => c && String(c).toLowerCase() === k.toLowerCase())));

  const outputs = RECIPES.flatMap((r) => Object.keys(r.output).map((key) => ({ recipe: r.name, key })));

  it('has recipes to check at all — the denominator, not a silent pass over an empty list', () => {
    // A `RECIPES` that failed to import would make every it.each below vanish and the file report green.
    expect(RECIPES.length).toBeGreaterThan(10);
    expect(outputs.length).toBeGreaterThanOrEqual(RECIPES.length);
  });

  it.each(outputs)('$recipe -> "$key" is placeable, consumable, equipment, or an ingredient', ({ key }) => {
    const paths = {
      placeable: isPlaceable(key),
      consumable: isConsumable(key),
      equipment: isEquipment(key),
      ingredient: isIngredient(key),
      currency: isCurrency(key),
    };
    expect(
      Object.values(paths).some(Boolean),
      `"${key}" resolves on NO path (${JSON.stringify(paths)}) — crafting it destroys the ingredients ` +
        'and yields an item with no icon, no placement and no effect'
    ).toBe(true);
  });

  it('the resolver itself can distinguish a real key from a fabricated one', () => {
    // Guards the guard. If BLOCK_ID or CONSUMABLE_EFFECTS failed to import as an object, every `in` check
    // would throw or every key would look absent — but a checker that says NOTHING is usable would also
    // fail loudly, whereas one that says EVERYTHING is usable passes silently. Prove the negative case.
    expect(isPlaceable('stone') || isConsumable('stone') || isIngredient('stone')).toBe(true);
    const fabricated = 'definitely_not_a_real_item_key_9f3a';
    expect(isCurrency('coins')).toBe(true);
    // crystals and the wand are no currency (DECISIONS 2026-10-28 W1-H item 6): no recipe may mint them.
    expect(isCurrency('crystals')).toBe(false);
    expect(isCurrency('wand')).toBe(false);
    expect(isPlaceable(fabricated)).toBe(false);
    expect(isCurrency(fabricated)).toBe(false);
    expect(isConsumable(fabricated)).toBe(false);
    expect(isEquipment(fabricated)).toBe(false);
    expect(isIngredient(fabricated)).toBe(false);
  });
});
