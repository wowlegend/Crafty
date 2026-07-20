// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { TradingInterface } from '../../src/ui/TradingInterface.jsx';
import { SoundProvider } from '../../src/SoundManager.jsx';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { getCrystals, getWands } from '../../src/game/crystalWallet.js';
import { applyWandFocus } from '../../src/game/wandFocus.js';

// B3b — THE CRYSTAL/WAND ECONOMY WAS A BLACK HOLE. (18-domain review, CRITICAL.)
//
// The currency lived in TWO buckets. WRITES (ore->crystal trade, the craft recipe, addToInventory) bank
// into `inventory.blocks` — the flat bucket the Inventory panel renders. But the READS/SPEND/SEED pointed
// at `inventory.magic`: starting crystals+wand seeded into magic, the wand trade read/spent magic.crystals,
// the mana-discount consumer read magic.wand. So crystals you EARNED (blocks) could never buy a wand (the
// trade read magic), the wand trade was mathematically unreachable, and a bought wand (blocks) gave 0%
// discount (the consumer read magic).
//
// FIX: `blocks` is canonical (the only rendered bucket, what every writer already targets). One accessor
// (game/crystalWallet.js) that every reader/spender/seed goes through.
//
// MUTATION-PROOF: point getCrystals back at `inv?.magic?.crystals` -> the black-hole trade test goes RED.

const ORIGINAL_INV = useGameStore.getState().inventory;
beforeEach(() => useGameStore.setState({ inventory: { blocks: {}, tools: {}, magic: {} } }));
afterEach(() => { cleanup(); useGameStore.setState({ inventory: ORIGINAL_INV }); });

const renderTrade = () =>
  render(<TradingInterface villager={{ npcName: 'Test Merchant' }} onClose={() => {}} />, { wrapper: SoundProvider });

function clickTradeFor(name) {
  const label = screen.getByText(name);
  let row = label.parentElement;
  while (row && !within(row).queryByRole('button', { name: /^trade$/i })) row = row.parentElement;
  if (!row) throw new Error(`No Trade button row found for "${name}"`);
  fireEvent.click(within(row).getByRole('button', { name: /^trade$/i }));
}

describe('B3b crystalWallet — the canonical accessor reads the rendered bucket', () => {
  it('getCrystals / getWands read inventory.blocks (never the unrendered magic bucket)', () => {
    expect(getCrystals({ blocks: { crystals: 12 }, magic: { crystals: 99 } })).toBe(12);
    expect(getWands({ blocks: { wand: 2 }, magic: { wand: 99 } })).toBe(2);
    expect(getCrystals({})).toBe(0);
    expect(getWands(undefined)).toBe(0);
  });
});

describe('B3b — the economy is reachable end to end', () => {
  it('THE BLACK HOLE: crystals earned via ore->crystal (blocks) can actually buy a wand', () => {
    useGameStore.setState({ inventory: { blocks: { crystals: 20 }, tools: {}, magic: {} } });
    renderTrade();

    clickTradeFor('Crystals to Wand'); // costs 15

    const inv = useGameStore.getState().inventory;
    expect(getCrystals(inv)).toBe(5);  // 20 - 15, spent from the rendered bucket (RED before: it read magic=0)
    expect(getWands(inv)).toBe(1);     // the wand landed where the consumer reads it
  });

  it("the wand trade row shows the player's EARNED crystals as spendable (Have: 20, not 0)", () => {
    useGameStore.setState({ inventory: { blocks: { crystals: 20 }, tools: {}, magic: {} } });
    renderTrade();
    // The row surfaces the live "Have" count from the bucket the player actually earns into.
    const label = screen.getByText('Crystals to Wand');
    let row = label.parentElement;
    while (row && !within(row).queryByText(/Have:/)) row = row.parentElement;
    expect(within(row).getByText(/Have:\s*20/)).toBeTruthy();
  });

  it('a wand discounts the resolved mana cost (the consumer reads the same bucket the wand lands in)', () => {
    const inv = { blocks: { wand: 1 }, magic: {} };
    expect(applyWandFocus(25, getWands(inv))).toBeLessThan(25); // RED before: getWands read magic (0) -> no discount
  });
});
