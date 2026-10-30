// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useGameStore } from '../../src/store/useGameStore.jsx';

// M5 #15 — THE INVENTORY IS A FLAT BUCKET, AND EVERY ACQUIRED ITEM MUST LAND IN IT.
//
// The Inventory panel renders `inventory.blocks`. Nothing renders `inventory.magic` or `inventory.tools`.
// So an item written anywhere else is bought, paid for, and invisible — the lost-buy bug, which this
// project has now shipped twice (M5 #15 for purchases, B3b for a currency spent from a bucket nothing filled).
//
// This gate pinned the invariant as four exact source strings, e.g.
// `/\[resultItem\]: \(prev\.blocks\[resultItem\] \|\| 0\) \+ resultCount/`. It executed nothing, so it
// could not distinguish a correct router from one that writes the right expression into the wrong
// object — and on 2026-08-12 it did exactly what a spelling-gate does: the arithmetic moved into a pure
// module, behaviour unchanged and better covered, and this went RED at the refactor. It reported on
// where characters sit, which is not the invariant.
//
// The invariant is "acquire something, and it shows up in the bucket the player can see". Run that.
vi.mock('../../src/SoundManager', () => ({ useGameSounds: () => ({ playPickup: () => {} }) }));
const { TradingInterface } = await import('../../src/ui/TradingInterface.jsx');
const { Inventory } = await import('../../src/ui/GamePanels.jsx');

const bag = () => useGameStore.getState().inventory?.blocks || {};
const openMerchant = () => render(createElement(TradingInterface, { villager: { npcName: 'Merchant' }, onClose: () => {} }));

const tradeButtonFor = (name) => {
  const row = screen.getByText(name).closest('div.flex.items-center.justify-between');
  expect(row, `no merchant row named "${name}"`).toBeTruthy();
  const btn = [...row.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Trade');
  expect(btn, `the "${name}" row has no Trade button`).toBeTruthy();
  return btn;
};

beforeEach(() => { useGameStore.setState({ coins: 0, inventory: { blocks: {}, magic: {}, tools: {} } }); });
afterEach(cleanup);

describe('M5 #15 — every acquisition path lands in the RENDERED bucket', () => {
  it('a coin purchase banks the bought item in blocks, and touches no other bucket', () => {
    useGameStore.setState({ coins: 30, inventory: { blocks: {}, magic: {}, tools: {} } });
    openMerchant();
    fireEvent.click(tradeButtonFor('Coins to Health Potion'));
    expect(bag()['Health Potion'], 'the bought potion is not in blocks: the player paid for an invisible item').toBe(1);
    expect(useGameStore.getState().inventory.magic, 'the purchase wrote into the unrendered magic bucket').toEqual({});
  });

  it('addToInventory — the shared router every non-trade acquisition uses — writes to blocks', () => {
    // Loot pickup, quest rewards and crafting all funnel through this. The purchase above is one path;
    // this covers the one the rest of the game uses, so the invariant is checked at the choke point
    // rather than once per caller.
    useGameStore.getState().addToInventory('Mana Potion', 3);
    expect(bag()['Mana Potion']).toBe(3);
    expect(useGameStore.getState().inventory.magic).toEqual({});
  });
});

describe('M5 #15 — the bucket the invariant is ABOUT is really the one on screen', () => {
  it('the Inventory panel renders items from inventory.blocks', () => {
    // Without this, every assertion above is about a bucket that might not be displayed — the whole
    // premise. Driven through the real panel rather than grepped for the `.map` call.
    useGameStore.setState({ inventory: { blocks: { stone: 7 }, magic: { hiddenThing: 3 }, tools: { axe: 1 } } });
    const { container } = render(createElement(Inventory, { onClose: () => {} }));

    // Each item is an ICON tile carrying `title={type}` — there is no text node to match, which is
    // itself worth pinning: a text-based assertion here passes vacuously the moment the label moves.
    expect(container.querySelector('[title="stone"]'),
      'the panel does not render inventory.blocks — every assertion above guards a bucket nobody sees').toBeTruthy();
    expect(container.querySelector('[title="hiddenThing"]'),
      'the magic bucket IS rendered after all, so this whole invariant is stale').toBeNull();
    expect(container.querySelector('[title="axe"]'),
      'the tools bucket IS rendered after all, so this whole invariant is stale').toBeNull();
    // The quantity reaches the tile too, so "renders the bucket" is not just "renders a placeholder".
    expect(container.textContent, 'the stack count never made it to the tile').toContain('7');
  });
});
