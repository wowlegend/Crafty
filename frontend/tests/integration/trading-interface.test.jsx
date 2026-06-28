// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { TradingInterface } from '../../src/ui/TradingInterface.jsx';
import { SoundProvider } from '../../src/SoundManager.jsx';
import { useGameStore } from '../../src/store/useGameStore.jsx';

// The audit flagged "villager trade -> inventory mutation never E2E'd", and the M5 #15 stale-closure
// fix (subtract from the FRESH `prev`, not the render-snapshot) had only static-gate coverage. This
// renders the REAL TradingInterface, clicks the REAL "Trade" button for a specific trade, and asserts
// the store mutated correctly across all three trade code-paths:
//   block   -> executeBlockTrade   (functional setInventory(prev=>...) — the fresh-prev fix)
//   crystal -> executeCrystalTrade (functional setInventory(prev=>...) — the fresh-prev fix)
//   coin    -> executeCoinTrade    (spendCoins + addToInventory store actions)
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
  it('block trade: Stone -> Crystal deducts 16 stone (from fresh prev) and grants 1 crystal', () => {
    useGameStore.setState({ inventory: { blocks: { stone: 20 }, tools: {}, magic: {} } });
    renderTrade();

    clickTradeFor('Stone to Crystal');

    const inv = useGameStore.getState().inventory;
    expect(inv.blocks.stone).toBe(4); // 20 - 16
    expect(inv.blocks.crystals).toBe(1); // routed into the rendered `blocks` bucket (M5 #15)
  });

  it('crystal trade: Crystals -> Wand spends 15 crystals (from fresh prev) and grants 1 wand', () => {
    useGameStore.setState({ inventory: { blocks: {}, tools: {}, magic: { crystals: 20 } } });
    renderTrade();

    clickTradeFor('Crystals to Wand');

    const inv = useGameStore.getState().inventory;
    expect(inv.magic.crystals).toBe(5); // 20 - 15, spent from magic
    expect(inv.blocks.wand).toBe(1); // bought item lands in the rendered blocks bucket
  });

  it('coin trade: Coins -> Health Potion spends 12 coins and grants 1 potion', () => {
    useGameStore.setState({ coins: 20, inventory: { blocks: {}, tools: {}, magic: {} } });
    renderTrade();

    clickTradeFor('Coins to Health Potion');

    const s = useGameStore.getState();
    expect(s.coins).toBe(8); // 20 - 12
    expect(s.inventory.blocks['Health Potion']).toBe(1);
  });

  it('disabled trade does not mutate the store (insufficient stock)', () => {
    // only 5 stone — Stone->Crystal needs 16, so the button is disabled and the click is a no-op
    useGameStore.setState({ inventory: { blocks: { stone: 5 }, tools: {}, magic: {} } });
    renderTrade();

    clickTradeFor('Stone to Crystal');

    const inv = useGameStore.getState().inventory;
    expect(inv.blocks.stone).toBe(5); // unchanged
    expect(inv.blocks.crystals).toBeUndefined(); // no phantom grant
  });
});
