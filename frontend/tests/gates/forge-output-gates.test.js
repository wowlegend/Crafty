import { describe, it, expect } from 'vitest';
import { WEAPON_LINE, GOODS, forgeOffers, buy } from '../../src/game/forge.js';
import { RELICS, RELIC_MAX_TIER } from '../../src/game/relics.js';
import { getItemSlot, getWeaponBaseDamage } from '../../src/game/equipment.js';
import { ITEMS, NAME_TO_ID, CURRENCY_KEYS, isDeliverableKey } from '../../src/data/items.js';
import { BLOCK_TYPES } from '../../src/world/Blocks.js';
import { idForBlock } from '../../src/world/blockIds.js';
import { foldVerbMods, VERB_BASE } from '../../src/game/verbMods.js';

// A PURCHASE THAT DELIVERS NOTHING (DECISIONS 2026-10-29 items 60-64: the Forge sells nothing that does nothing).
//
// The crafting grid shipped Bow -> Arrow x5, Torch and Planks: outputs whose keys resolved on NO path in the frontend.
// addToInventory writes any string blindly, so the item appeared in the bag and then did nothing, and the materials
// were gone (removed 2026-08-09). The Forge replaces the grid, so the class moves here: every offer it can make, at every
// tier, must give a thing the game uses, and every price must be paid in blocks the world can yield. A DENOMINATOR gate:
// it walks every state that lists a different offer and states the count.
//
// WHAT THIS DOES NOT CHECK: whether the prices are fair (no playtest), or the card that shows them
// (tests/gates/forge-panel-gates.test.jsx).

// Every offer the Forge can list: each blade's next, each relic at each tier, and the goods.
function everyOffer() {
  const empty = { inventory: { blocks: {}, tools: {}, magic: {} }, coins: 0, equipment: {}, relicTiers: {} };
  const seen = new Map();
  for (const weapon of [null, ...WEAPON_LINE]) {
    for (const relic of [null, ...Object.keys(RELICS)]) {
      for (let tier = 1; tier <= RELIC_MAX_TIER; tier++) {
        const s = { ...empty, equipment: { weapon, relic }, relicTiers: relic ? { [relic]: tier } : {} };
        for (const o of forgeOffers(s)) seen.set(o.id, o);
      }
    }
  }
  return [...seen.values()];
}

describe('every Forge offer gives a thing the game uses', () => {
  const offers = everyOffer();
  // The sword (holding no blade) and the three after it; two tempers for each relic; the goods.
  const expected = WEAPON_LINE.length + Object.keys(RELICS).length * (RELIC_MAX_TIER - 1) + GOODS.length;

  it('enumerates every offer the Forge can list', () => {
    expect(offers.length, 'the walk found a different number of offers than the lines hold').toBe(expected);
  });

  it('a weapon offer is a blade the weapon slot takes, harder-hitting than bare hands', () => {
    const blades = offers.filter((o) => o.line === 'weapon');
    expect(blades.length).toBe(WEAPON_LINE.length);
    for (const o of blades) {
      expect(getItemSlot(o.give), `${o.give} does not equip as a weapon`).toBe('weapon');
      expect(getWeaponBaseDamage(o.give), `${o.give} hits no harder than a fist`).toBeGreaterThan(getWeaponBaseDamage(null));
      expect(isDeliverableKey(o.give), `${o.give} is not a registered item`).toBe(true);
    }
  });

  it('a relic offer is a relic, and its tier moves a verb further than the tier below', () => {
    const tempers = offers.filter((o) => o.line === 'relic');
    expect(tempers.length).toBe(Object.keys(RELICS).length * (RELIC_MAX_TIER - 1));
    for (const o of tempers) {
      const key = RELICS[o.give]?.mod.key;
      expect(key, `${o.give} is not a relic`).toBeTruthy();
      const before = foldVerbMods({}, o.give, o.tier - 1)[key];
      const after = foldVerbMods({}, o.give, o.tier)[key];
      expect(Math.abs(after - VERB_BASE[key]), `${o.give} tier ${o.tier} changes nothing over tier ${o.tier - 1}`).toBeGreaterThan(Math.abs(before - VERB_BASE[key]));
    }
  });

  it('a good is a block the engine places', () => {
    const goods = offers.filter((o) => o.line === 'goods');
    expect(goods.length).toBe(GOODS.length);
    for (const o of goods) expect(idForBlock(o.give), `${o.give} places as no voxel`).not.toBeNull();
  });

  it('every price is paid in blocks the engine places, so the world can yield them, and coins', () => {
    let checked = 0;
    for (const o of offers) {
      for (const key of Object.keys(o.price.blocks)) {
        expect(idForBlock(key), `${o.id} is priced in '${key}', which no voxel yields`).not.toBeNull();
        checked++;
      }
      expect(Number.isInteger(o.price.coins) && o.price.coins >= 0, `${o.id} has a price in coins of ${o.price.coins}`).toBe(true);
    }
    expect(checked, 'no price part was examined').toBeGreaterThanOrEqual(offers.length);
  });

  it('what a purchase adds is what the offer says, at every offer', () => {
    const rich = { blocks: Object.fromEntries(Object.keys(BLOCK_TYPES).map((k) => [k, 99])), tools: {}, magic: {} };
    let bought = 0;
    for (const o of offers) {
      const blade = o.price.blade;
      const s = {
        inventory: { ...rich, blocks: { ...rich.blocks, ...(blade ? { [blade]: 1 } : {}) } },
        coins: 9999,
        equipment: { weapon: blade ?? null, relic: o.line === 'relic' ? o.give : null },
        relicTiers: o.line === 'relic' ? { [o.give]: o.tier - 1 } : {},
      };
      const r = buy(s, o);
      expect(r.ok, `${o.id} could not be bought with everything in hand`).toBe(true);
      if (o.line === 'weapon') expect(r.state.equipment.weapon).toBe(o.give);
      else if (o.line === 'relic') expect(r.state.relicTiers[o.give]).toBe(o.tier);
      else expect(r.state.inventory.blocks[o.give]).toBe(99 + o.count);
      bought++;
    }
    expect(bought).toBe(expected);
  });
});

// Three categories, because the inventory holds three kinds of thing: registered items, placeable blocks, and a short
// justified list of CURRENCIES (coins) that are neither. The currency list lives in source with its consumers named:
// an unjustified entry would turn isDeliverableKey into an allowlist that hides the very class it catches.
const asItem = (k) => !!(ITEMS[k] || NAME_TO_ID[k]);
const asBlock = (k) => !!BLOCK_TYPES[k];

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
    // The three that were removed on 2026-08-09, plus the nonsense a bare string map happily accepts. Crystals and the
    // wand are no currency (DECISIONS 2026-10-28 W1-H item 6), and the pickaxe is retired (2026-10-29 item 66).
    for (const bad of ['Bow', 'torch', 'planks', 'crystals', 'wand', 'pickaxe', '', null, undefined, 42, {}]) {
      expect(isDeliverableKey(bad), `${String(bad)} was accepted as deliverable`).toBe(false);
    }
    expect(isDeliverableKey('sword')).toBe(true);
    expect(isDeliverableKey('coins')).toBe(true);
  });
});
