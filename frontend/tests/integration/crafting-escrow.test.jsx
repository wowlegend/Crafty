// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CraftingTable } from '../../src/ui/panels/CraftingTable.jsx';
import { useGameStore } from '../../src/store/useGameStore.jsx';

// MATERIALS PAID FOR AND GONE.
//
// Placing an item into the crafting grid DEBITS it immediately, and the grid lives only in React-local
// state. The escrow was returned on React unmount — and React does not run effect cleanups when the tab
// closes, while the autosave DOES flush on pagehide. The debit had already gone through
// removeFromInventory, which spreads a new inventory object and therefore schedules a save. So a save
// written mid-crafting recorded the debit WITHOUT the escrow: up to nine items, surfacing only when the
// player later loaded that slot.
//
// The B3d decision record chose "return on unmount" over "defer the removal" on blast-radius grounds and
// never considered the persistence path, so this is an unclosed residual rather than an accepted trade.
const ORIGINAL = useGameStore.getState().inventory;

beforeEach(() => {
  useGameStore.setState({
    inventory: { blocks: { stone: 4 }, tools: {}, magic: {} },
    selectedBlock: 'stone',
  });
});
afterEach(() => {
  cleanup();
  useGameStore.setState({ inventory: ORIGINAL });
});

const stone = () => useGameStore.getState().inventory.blocks.stone || 0;

describe('crafting escrow survives page teardown', () => {
  it('placing into the grid debits — the precondition, and the reason escrow exists', () => {
    render(<CraftingTable onClose={() => {}} />);
    const cells = document.querySelectorAll('.cursor-pointer');
    expect(cells.length, 'the crafting grid did not render').toBeGreaterThan(8);
    fireEvent.click(cells[0]);
    expect(stone(), 'placing into the grid no longer debits, so this whole suite is moot').toBe(3);
  });

  it('PAGEHIDE returns the escrow — React runs no cleanup when the tab closes', () => {
    render(<CraftingTable onClose={() => {}} />);
    const cells = document.querySelectorAll('.cursor-pointer');
    fireEvent.click(cells[0]);
    fireEvent.click(cells[1]);
    expect(stone()).toBe(2);
    window.dispatchEvent(new Event('pagehide'));
    expect(stone(), 'the tab closed with two stone escrowed and they were never returned').toBe(4);
  });

  it('is idempotent — pagehide can fire more than once per session', () => {
    render(<CraftingTable onClose={() => {}} />);
    fireEvent.click(document.querySelectorAll('.cursor-pointer')[0]);
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('pagehide'));
    expect(stone(), 'a second pagehide duplicated the refund').toBe(4);
  });

  it('returns nothing when the grid is empty, rather than crediting phantom items', () => {
    render(<CraftingTable onClose={() => {}} />);
    window.dispatchEvent(new Event('pagehide'));
    expect(stone()).toBe(4);
  });

  it('unmount still returns the escrow — the original path is not regressed', () => {
    const { unmount } = render(<CraftingTable onClose={() => {}} />);
    fireEvent.click(document.querySelectorAll('.cursor-pointer')[0]);
    expect(stone()).toBe(3);
    unmount();
    expect(stone(), 'closing the panel normally no longer refunds').toBe(4);
  });
});
