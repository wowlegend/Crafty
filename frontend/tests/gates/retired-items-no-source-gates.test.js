// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { LOOT_TABLES, CHEST_LOOT } from '../../src/data/lootTables.js';
import { ITEMS } from '../../src/data/items.js';
import { CONSUMABLE_EFFECTS } from '../../src/game/consumables.js';
import { GOODS, WEAPON_LINE } from '../../src/game/forge.js';
import { RETIRED_INVENTORY_KEYS, RETIRED_QUESTS } from '../../src/game/saveSchema.js';
import { QUEST_LIST } from '../../src/QuestSystem.jsx';
import { useGameStore } from '../../src/store/useGameStore.jsx';

// A RETIRED ITEM HAS NO SOURCE (W2-F; DECISIONS 2026-10-29 items 66 and 71). An inventory key in RETIRED_INVENTORY_KEYS
// leaves every live bag and chest on load (game/saveSchema.js liveInventory, liveChests), but that only empties what a
// save held: a loot row, a quest reward or a registry entry left behind would hand the player the item again, and the
// next load would take it away. So every place the game gives an item from is read here, and none may name a retired
// key. The food is the step-6 case: hunger left the game, so no consumable may carry `feed`, the effect that filled it.
//
// The sources, each counted below: every mob's loot table, the chest loot, every authored quest's item reward, every
// retired quest's reward (paid once on load), the starting bags, the Forge's goods and blades, the item registry's
// display names, and the consumable registry.
//
// WHAT THIS DOES NOT CHECK: the merchant's two trades, written inside ui/TradingInterface.jsx (Health and Mana Potion);
// the bounty quests (makeRepeatableQuest gives XP only); an item a later build adds through a path none of these lists.

const RETIRED = new Set(RETIRED_INVENTORY_KEYS);
const MEAT = ['Raw Porkchop', 'Raw Beef', 'Cooked Porkchop', 'Cooked Beef', 'Rotten Flesh'];

/** Every [source, item name] pair the game can hand the player, by the lists above. */
function givenItems() {
  const out = [];
  for (const [mob, rows] of Object.entries(LOOT_TABLES)) for (const r of rows) out.push([`loot:${mob}`, r.item]);
  for (const r of CHEST_LOOT) out.push(['chest loot', r.item]);
  for (const q of QUEST_LIST) if (q.itemReward) out.push([`quest:${q.id}`, q.itemReward.item]);
  for (const q of Object.values(RETIRED_QUESTS)) if (q.itemReward) out.push([`retired quest:${q.id}`, q.itemReward.item]);
  for (const [bag, items] of Object.entries(useGameStore.getInitialState().inventory)) {
    for (const k of Object.keys(items || {})) out.push([`start:${bag}`, k]);
  }
  for (const g of GOODS) out.push([`forge:${g.id}`, g.give]);
  for (const blade of WEAPON_LINE) out.push(['forge:weapon line', blade]);
  for (const def of Object.values(ITEMS)) out.push(['item registry', def.name]);
  for (const name of Object.keys(CONSUMABLE_EFFECTS)) out.push(['consumables', name]);
  return out;
}

describe('a retired item has no source', () => {
  it('the retired list holds the five foods beside the crystals, the wand and the pickaxe', () => {
    expect(MEAT.filter((k) => !RETIRED.has(k)), 'a food is not retired, so an old save keeps it live').toEqual([]);
    expect(['crystals', 'wand', 'pickaxe'].filter((k) => !RETIRED.has(k))).toEqual([]);
  });

  it('no loot row, reward, starting bag, Forge offer or registry names one', () => {
    const given = givenItems();
    const sources = new Set(given.map(([s]) => s.split(':')[0]));
    console.log(`[retired-items] ${given.length} items read from ${sources.size} kinds of source, against ${RETIRED.size} retired keys`);
    // The denominator: each kind of source was read, and not as an empty list.
    expect([...sources].sort()).toEqual(['chest loot', 'consumables', 'forge', 'item registry', 'loot', 'quest', 'retired quest', 'start'].sort());
    expect(given.length).toBeGreaterThan(60);
    // Presence: the reader sees a real, live item in the places it should (a potion in chest loot, the Stone Sword in
    // the starting bag), so an empty answer below is an answer.
    expect(given.some(([s, k]) => s === 'chest loot' && k === 'Health Potion')).toBe(true);
    expect(given.some(([s, k]) => s.startsWith('start:') && k === 'Stone Sword')).toBe(true);
    const offenders = given.filter(([, k]) => RETIRED.has(k)).map(([s, k]) => `${s} gives ${k}`);
    expect(offenders, 'a retired item still has a source').toEqual([]);
  });

  it('no consumable fills a hunger meter', () => {
    const effects = Object.entries(CONSUMABLE_EFFECTS);
    expect(effects.length, 'SETUP: the consumable registry is empty').toBeGreaterThan(0);
    expect(effects.some(([, fx]) => fx.heal > 0), 'SETUP: no consumable heals, so the effect reader is blind').toBe(true);
    expect(effects.filter(([, fx]) => 'feed' in fx).map(([k]) => k), 'a consumable still feeds').toEqual([]);
  });
});
