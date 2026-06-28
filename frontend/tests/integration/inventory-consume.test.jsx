// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Inventory } from '../../src/ui/GamePanels.jsx';
import { useGameStore } from '../../src/store/useGameStore.jsx';

// Real consumable-Use wiring (the GamePanels handler at handleConsume): the audit flagged
// "consumable Use -> heal/destroy never E2E'd". The button is hover-revealed via CSS (group-hover),
// but it IS in the DOM — jsdom ignores CSS so fireEvent.click reaches it. This renders the REAL
// Inventory panel, clicks Use on a Health Potion, and asserts the player healed + one potion consumed.
const ORIGINAL_INV = useGameStore.getState().inventory;

beforeEach(() => {
  useGameStore.setState({
    playerHealth: 10,
    maxHealth: 100,
    inventory: { blocks: { 'Health Potion': 2 }, tools: {}, magic: {} },
  });
});
afterEach(() => {
  cleanup();
  useGameStore.setState({ inventory: ORIGINAL_INV });
});

describe('inventory consumable Use (jsdom) — heal + decrement', () => {
  it('clicking Use on a Health Potion heals +30 and removes one', () => {
    render(<Inventory onClose={() => {}} />);
    expect(useGameStore.getState().playerHealth).toBe(10);
    expect(useGameStore.getState().inventory.blocks['Health Potion']).toBe(2);

    const useButtons = screen.getAllByRole('button', { name: /^use$/i });
    expect(useButtons.length).toBeGreaterThan(0);
    fireEvent.click(useButtons[0]);

    const after = useGameStore.getState();
    expect(after.playerHealth).toBe(40); // +30 (CONSUMABLE_EFFECTS['Health Potion'].heal)
    expect(after.inventory.blocks['Health Potion']).toBe(1); // exactly one consumed
  });
});
