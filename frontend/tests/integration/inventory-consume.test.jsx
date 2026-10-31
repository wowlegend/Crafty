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

// A potion whose whole effect the cap would clamp away is refused, not spent (registry AUDIT:numeric:potion-spent-at-full):
// at full health or mana, Use spent it for nothing and said nothing. Below the cap it still applies and is spent.
//
// Mutation-Proof: see the commit trailer.
describe('inventory consumable Use at the cap (jsdom) — refused and said, never spent for nothing', () => {
  let notes;
  let clock = 1e9;
  beforeEach(() => {
    notes = [];
    vi.spyOn(performance, 'now').mockImplementation(() => (clock += 5000)); // every notice past the deny toast's throttle
    useGameStore.setState({ addNotification: (text, type) => notes.push({ text, type }), isAlive: true });
  });
  afterEach(() => { vi.restoreAllMocks(); });
  const use = (potion) => {
    render(<Inventory onClose={() => {}} />);
    const row = screen.getAllByRole('button', { name: /^use$/i });
    expect(row.length, `SETUP: the bag shows no Use button for the ${potion}`).toBe(1);
    fireEvent.click(row[0]);
  };

  it.each([
    ['Health Potion', { playerHealth: 100, maxHealth: 100 }, 'playerHealth'],
    ['Mana Potion', { mana: 100, maxMana: 100 }, 'mana'],
  ])('a %s at full keeps the potion and raises one notice', (potion, full, field) => {
    useGameStore.setState({ ...full, inventory: { blocks: { [potion]: 2 }, tools: {}, magic: {} } });
    use(potion);
    const s = useGameStore.getState();
    expect({ count: s.inventory.blocks[potion], value: s[field], notices: notes.length },
      `a ${potion} at full was spent for nothing, or refused in silence`).toEqual({ count: 2, value: 100, notices: 1 });
    expect(notes[0].type, 'the refusal is not a denial notice').toBe('warn');
    expect(notes[0].text, 'the refusal does not say the potion is kept because the player is already full').toBe('Already full: keep it for later');
  });

  it.each([
    ['Health Potion', { playerHealth: 90, maxHealth: 100 }, 'playerHealth'],
    ['Mana Potion', { mana: 90, maxMana: 100 }, 'mana'],
  ])('a %s just below full is drunk: it applies to the cap and is spent', (potion, below, field) => {
    useGameStore.setState({ ...below, inventory: { blocks: { [potion]: 2 }, tools: {}, magic: {} } });
    use(potion);
    const s = useGameStore.getState();
    expect({ count: s.inventory.blocks[potion], value: s[field], notices: notes.length },
      `a ${potion} below the cap was not drunk`).toEqual({ count: 1, value: 100, notices: 0 });
  });
});
