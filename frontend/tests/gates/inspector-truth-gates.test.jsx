// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Inventory } from '../../src/ui/GamePanels.jsx';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { RELICS, RELIC_MAX_TIER } from '../../src/game/relics.js';
import { relicEffectText } from '../../src/ui/relicText.js';
import { t } from '../../src/i18n/i18n.js';

// THE INVENTORY'S INSPECTOR SAYS WHAT IS TRUE OF THE ITEM.
//
// A relic tempered at Mara's Forge counts its modifier once per tier (game/verbMods.js foldVerbMods), so words fixed at
// tier I would tell a player holding a tier-III Ember Fang 4 s where the roar gains 12. An item that is not gear names
// only a use the game gives it: a block the place verb puts down, a price the Forge takes, a consumable, a chest, or no
// use yet (Leather, Iron Nugget and Spider Eye, which nothing places and the Forge never takes). Both halves are driven
// through the real Inventory panel by a hover, as the player reaches them, and the relic words are checked at every
// relic and tier against numbers written here by hand from each relic's modifier.
//
// WHAT THIS DOES NOT CHECK: the Forge card's temper line (tests/gates/forge-panel-gates.test.jsx), how the card looks,
// or a touch press-and-hold in place of a hover.
//
// Mutation-Proof: see the commit trailer.

const hover = (item) => {
  const tile = document.querySelector(`[title="${item}"]`);
  expect(tile, `SETUP: no inventory tile for "${item}"`).toBeTruthy();
  fireEvent.mouseEnter(tile);
};
const bag = (blocks, extra = {}) => useGameStore.setState({
  inventory: { blocks, magic: {}, tools: {} },
  equipment: { head: null, chest: null, weapon: null, offhand: null, boots: null, relic: null },
  ...extra,
});

beforeEach(() => { useGameStore.setState(useGameStore.getInitialState(), true); });
afterEach(() => { cleanup(); useGameStore.setState(useGameStore.getInitialState(), true); });

describe('a relic reads what it does at its own tier', () => {
  // Ember Fang +4 s a tier; Lodestone +1 throw; Snare Knot +1 base arc (so tier N is N+1 times as wide); Prism Shard +1
  // leap.
  const WORDS = {
    'Ember Fang': ['Your roar lasts 4 s longer.', 'Your roar lasts 8 s longer.', 'Your roar lasts 12 s longer.'],
    Lodestone: ['A grab holds one more block to hurl.', 'A grab holds 2 more blocks to hurl.', 'A grab holds 3 more blocks to hurl.'],
    'Snare Knot': ['Your snare\'s aim is twice as wide.', 'Your snare\'s aim is 3 times as wide.', 'Your snare\'s aim is 4 times as wide.'],
    'Prism Shard': ['An imbued zone leaps to one more hostile.', 'An imbued zone leaps to 2 more hostiles.', 'An imbued zone leaps to 3 more hostiles.'],
  };

  it('at every relic and tier, the words match the modifier the game folds', () => {
    let checked = 0;
    for (const name of Object.keys(RELICS)) {
      for (let tier = 1; tier <= RELIC_MAX_TIER; tier++) {
        expect(relicEffectText(t, name, tier), `${name} at tier ${tier}`).toBe(WORDS[name][tier - 1]);
        checked++;
      }
    }
    expect(checked, 'the walk covered a different number of relics and tiers than the table').toBe(Object.keys(WORDS).length * RELIC_MAX_TIER);
  });

  it('the inspector shows a bagged relic\'s tier and what it does there', () => {
    bag({ 'Ember Fang': 1, Lodestone: 1 }, { relicTiers: { 'Ember Fang': 3 } });
    render(<Inventory onClose={() => {}} />);
    hover('Ember Fang');
    expect(screen.getByTestId('relic-effect').textContent, 'a tier-III Ember Fang read its tier-I words').toBe('Your roar lasts 12 s longer.');
    expect(screen.getByTestId('relic-tier').textContent).toBe('Tier III');
    hover('Lodestone');
    expect(screen.getByTestId('relic-effect').textContent).toBe('A grab holds one more block to hurl.');
    expect(screen.getByTestId('relic-tier').textContent).toBe('Tier I');
  });

  it('the inspector shows the worn relic at its tier', () => {
    bag({}, { relicTiers: { 'Prism Shard': 2 } });
    useGameStore.setState({ equipment: { ...useGameStore.getState().equipment, relic: 'Prism Shard' } });
    render(<Inventory onClose={() => {}} />);
    const worn = screen.getByTestId('relic-slot').firstElementChild;
    fireEvent.mouseEnter(worn);
    expect(screen.getByTestId('relic-effect').textContent, 'the worn tier-II Prism Shard read its tier-I words').toBe('An imbued zone leaps to 2 more hostiles.');
  });
});

describe('an item that is not gear says what it is for', () => {
  const CASES = [
    ['Leather', 'Nothing in the game uses it yet.'],
    ['Iron Nugget', 'Nothing in the game uses it yet.'],
    ['Spider Eye', 'Nothing in the game uses it yet.'],
    ['stone', 'A block to build with, and a price Mara\'s Forge takes.'],
    ['coal', 'A block to build with.'],
    ['chest', 'A storage chest: place it and keep items in it.'],
    ['Health Potion', 'Consumable: restores health or mana.'],
    ['Raw Beef', 'Consumable: use it from your inventory.'],
  ];

  it('each in the bag reads its own use', () => {
    bag(Object.fromEntries(CASES.map(([k]) => [k, 1])));
    render(<Inventory onClose={() => {}} />);
    let checked = 0;
    for (const [item, words] of CASES) {
      hover(item);
      expect(screen.getByTestId('item-use').textContent, `${item} misstates its use`).toBe(words);
      checked++;
    }
    expect(checked).toBe(CASES.length);
  });

  it('the words come through the locale', () => {
    bag({ Leather: 1, stone: 1 });
    useGameStore.setState({ locale: 'zh-CN' });
    render(<Inventory onClose={() => {}} />);
    hover('Leather');
    expect(screen.getByTestId('item-use').textContent).toBe('游戏里暂时没有用到它。');
    hover('stone');
    expect(screen.getByTestId('item-use').textContent).toBe('可用来建造的方块，也是玛拉锻炉收取的材料。');
  });
});
