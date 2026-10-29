import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { RELICS } from '../../src/game/relics.js';
import { VERB_BASE } from '../../src/game/verbMods.js';
import { getItemSlot } from '../../src/game/equipment.js';
import { LOOT_TABLES } from '../../src/data/lootTables.js';
import { NAME_TO_ID, ITEMS } from '../../src/data/items.js';
import { MOB_TYPES } from '../../src/game/mobTypes.js';
import { buildSaveData } from '../../src/game/saveSchema.js';

// THE RELIC SLOT (DECISIONS 2026-10-28 W1-H item 6): loot brings relics, one slot holds one, and the one held changes its
// verb through the same vocabulary a talent does. Driven through the store's own equip actions, the ones the Inventory's
// item click and slot click call.
const NAMES = Object.keys(RELICS);
const s = () => useGameStore.getState();
const bag = () => s().inventory.blocks;

beforeEach(() => {
  useGameStore.setState(useGameStore.getInitialState(), true);
  useGameStore.setState({ inventory: { blocks: Object.fromEntries(NAMES.map((n) => [n, 1])), tools: {}, magic: {} } });
});

describe('a relic in the slot', () => {
  it('goes to the relic slot, and equipping it from the bag changes its verb; unequipping returns it and the verb', () => {
    let checked = 0;
    for (const name of NAMES) {
      const { key, add } = RELICS[name].mod;
      expect(getItemSlot(name), `${name} has no slot`).toBe('relic');
      expect(s().getVerbMods()[key], `SETUP: ${key} is not at its base`).toBeCloseTo(VERB_BASE[key], 10);
      s().equipItem('relic', name);
      expect(s().equipment.relic).toBe(name);
      expect(bag()[name], `${name} stayed in the bag as well as the slot`).toBe(0);
      expect(s().getVerbMods()[key], `${name} did not change ${key}`).toBeCloseTo(VERB_BASE[key] + add, 10);
      s().unequipItem('relic');
      expect(s().equipment.relic).toBeNull();
      expect(bag()[name]).toBe(1);
      expect(s().getVerbMods()[key]).toBeCloseTo(VERB_BASE[key], 10);
      checked++;
    }
    expect(checked).toBe(4);
  });

  it('holds one relic: equipping a second returns the first to the bag', () => {
    s().equipItem('relic', 'Ember Fang');
    s().equipItem('relic', 'Lodestone');
    expect(s().equipment.relic).toBe('Lodestone');
    expect(bag()['Ember Fang']).toBe(1);
    expect(s().getVerbMods().roarSec).toBe(VERB_BASE.roarSec);
    expect(s().getVerbMods().grabThrows).toBe(VERB_BASE.grabThrows + 1);
  });

  it('adds no stat and moves no health or mana cap', () => {
    const eff = s().getEffectiveAttributes();
    s().equipItem('relic', 'Prism Shard');
    const withRelic = { max: s().maxHealth, mana: s().maxMana };
    expect(s().getEffectiveAttributes()).toEqual(eff);
    s().unequipItem('relic');
    expect({ max: s().maxHealth, mana: s().maxMana }, 'the relic moved a cap').toEqual(withRelic);
  });

  it('is written to the save with the rest of the equipment', () => {
    s().equipItem('relic', 'Snare Knot');
    expect(JSON.parse(JSON.stringify(buildSaveData(s()))).progression.equipment.relic).toBe('Snare Knot');
  });
});

describe('relics come from loot', () => {
  it('every relic is a registered item that some hostile drops', () => {
    const hostiles = Object.keys(MOB_TYPES).filter((t) => !MOB_TYPES[t].passive);
    for (const name of NAMES) {
      expect(ITEMS[NAME_TO_ID[name]], `${name} is not in the item registry`).toBeTruthy();
      const droppers = hostiles.filter((t) => (LOOT_TABLES[t] || []).some((row) => row.item === name && row.chance > 0));
      expect(droppers.length, `no hostile drops ${name}`).toBeGreaterThan(0);
    }
  });
});
