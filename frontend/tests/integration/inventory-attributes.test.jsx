// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Inventory } from '../../src/ui/GamePanels.jsx';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { levelAttributes } from '../../src/game/progression.js';
import { getWeaponBaseDamage } from '../../src/game/equipment.js';

// THE INVENTORY HAS NO ATTRIBUTE PANEL (DECISIONS 2026-10-28 W1-H item 6). Hand allocation is gone: the "+" buttons, the
// "points to spend" line and the Core Attributes block. The combat readout stays, and it is derived from the level, so
// reaching a level moves it with no click. This renders the real Inventory and reads the readout's melee line.
const g = () => useGameStore.getState();
const ORIGINAL = { level: g().level, equipment: g().equipment };

afterEach(() => {
  cleanup();
  useGameStore.setState({ ...ORIGINAL });
});

const expectedMelee = (level) => Math.round(getWeaponBaseDamage(null) + levelAttributes(level).strength * 1.5);

describe('the Inventory (jsdom): no allocation, a readout that follows the level', () => {
  it('renders no allocate button and no Core Attributes block', () => {
    render(<Inventory onClose={() => {}} />);
    expect(screen.getByTestId('inventory-modal'), 'SETUP: the Inventory did not render').toBeTruthy();
    for (const id of ['alloc-strength', 'alloc-agility', 'alloc-intellect']) expect(screen.queryByTestId(id), id).toBeNull();
    expect(screen.queryByText(/Core Attributes/i)).toBeNull();
    expect(screen.queryByText(/to spend/i)).toBeNull();
  });

  it('shows melee damage from the level\'s own strength, and a higher level shows more', () => {
    useGameStore.setState({ level: 1, equipment: { head: null, chest: null, boots: null, weapon: null, offhand: null, relic: null } });
    const { unmount } = render(<Inventory onClose={() => {}} />);
    const atOne = screen.getAllByText(/ DMG$/)[0].textContent;
    expect(atOne).toBe(`${expectedMelee(1)} DMG`);
    unmount();
    useGameStore.setState({ level: 10 });
    render(<Inventory onClose={() => {}} />);
    const atTen = screen.getAllByText(/ DMG$/)[0].textContent;
    expect(atTen, 'the readout did not move with the level').toBe(`${expectedMelee(10)} DMG`);
    expect(expectedMelee(10)).toBeGreaterThan(expectedMelee(1));
  });
});
