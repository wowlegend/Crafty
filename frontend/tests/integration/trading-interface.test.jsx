// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { TradingInterface } from '../../src/ui/TradingInterface.jsx';
import { SoundProvider } from '../../src/SoundManager.jsx';
import { useGameStore } from '../../src/store/useGameStore.jsx';

// The villager merchant sells consumables for coins, and only that: there is no ore-to-crystal or crystal-to-wand trade
// (DECISIONS 2026-10-28 W1-H item 6). This renders the REAL TradingInterface, clicks the REAL
// "Trade" button for a row, and asserts the store mutated (spendCoins + addToInventory).
// jsdom has no AudioContext, so useGameSounds' playSound early-returns (guarded) — render-safe.
const ORIGINAL_INV = useGameStore.getState().inventory;
const ORIGINAL_COINS = useGameStore.getState().coins;

beforeEach(() => {
  useGameStore.setState({ coins: 0, inventory: { blocks: {}, tools: {}, magic: {} } });
});
afterEach(() => {
  cleanup();
  useGameStore.setState({ inventory: ORIGINAL_INV, coins: ORIGINAL_COINS });
});

// TradingInterface calls useGameSounds() -> useSounds(), which requires the SoundProvider context.
const renderTrade = () => render(
  <TradingInterface villager={{ npcName: 'Test Merchant' }} onClose={() => {}} />,
  { wrapper: SoundProvider }
);

// Click the "Trade" button belonging to the row whose label is `name` — robust to trade-array
// reordering and Panel wrapper nesting (climb to the nearest ancestor that owns a Trade button).
function clickTradeFor(name) {
  const label = screen.getByText(name);
  let row = label.parentElement;
  while (row && !within(row).queryByRole('button', { name: /^trade$/i })) {
    row = row.parentElement;
  }
  if (!row) throw new Error(`No Trade button row found for "${name}"`);
  fireEvent.click(within(row).getByRole('button', { name: /^trade$/i }));
}

describe('TradingInterface (jsdom) — real trade buttons mutate the store', () => {
  it('coin trade: Coins -> Health Potion spends 12 coins and grants 1 potion', () => {
    useGameStore.setState({ coins: 20, inventory: { blocks: {}, tools: {}, magic: {} } });
    renderTrade();

    clickTradeFor('Coins to Health Potion');

    const s = useGameStore.getState();
    expect(s.coins).toBe(8); // 20 - 12
    expect(s.inventory.blocks['Health Potion']).toBe(1);
  });

  it('a disabled trade does not mutate the store (too few coins)', () => {
    useGameStore.setState({ coins: 5, inventory: { blocks: {}, tools: {}, magic: {} } });
    renderTrade();

    clickTradeFor('Coins to Health Potion');

    const s = useGameStore.getState();
    expect(s.coins).toBe(5); // unchanged
    expect(s.inventory.blocks['Health Potion']).toBeUndefined(); // no phantom grant
  });

  it('offers no crystal or wand trade and shows no crystal or wand count', () => {
    renderTrade();
    expect(screen.getByText('Coins to Health Potion'), 'SETUP: the merchant rendered no rows').toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^trade$/i }).length, 'the merchant offers other than its two coin trades').toBe(2);
    expect(screen.queryByText(/crystal/i)).toBeNull();
    expect(screen.queryByText(/wand/i)).toBeNull();
  });
});
