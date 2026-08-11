// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Inventory } from '../../src/ui/GamePanels.jsx';
import { useGameStore } from '../../src/store/useGameStore.jsx';

// THE EQUIP CTA COULD NEVER BE ENABLED, AND HAS BEEN DELETED.
//
// Its enable condition was `hoveredItem`, which every bag tile nulls on mouseleave -- and the button was a
// sibling OUTSIDE every tile, separated by margin. There is no pointer path that is over a tile and over
// the button at once, so the mouseleave setState always committed before the pointer arrived: the button
// was permanently disabled, and a native disabled button is neither clickable nor tab-focusable. On touch,
// onMouseEnter never fires at all, so it was disabled there for a second, independent reason.
//
// It was also redundant. The tile's own onClick equips, which the panel footer has always told the player.
// So the CTA was deleted rather than repaired, and these assertions are the two halves of that decision:
// the path that remains WORKS, and the control that could not work is gone.
const ORIGINAL_INV = useGameStore.getState().inventory;
const ORIGINAL_EQUIP = useGameStore.getState().equipment;

beforeEach(() => {
  useGameStore.setState({
    inventory: { blocks: { 'Iron Sword': 1 }, tools: {}, magic: {} },
    equipment: {},
  });
});
afterEach(() => {
  cleanup();
  useGameStore.setState({ inventory: ORIGINAL_INV, equipment: ORIGINAL_EQUIP });
});

describe('inventory equip (jsdom)', () => {
  it('clicking a gear tile equips it — the path the deleted CTA duplicated', () => {
    render(<Inventory onClose={() => {}} />);
    const tile = screen.getByTitle('Iron Sword');
    expect(tile, 'the gear tile is not rendered, so this test proves nothing').toBeTruthy();
    fireEvent.click(tile);
    const equipped = Object.values(useGameStore.getState().equipment || {});
    expect(equipped, 'clicking the gear tile did not equip it').toContain('Iron Sword');
  });

  it('renders NO permanently-disabled control — a button that cannot be enabled is worse than none', () => {
    // The general form of the defect rather than the specific button: any disabled control in this panel
    // at rest is one the player can look at and never use. jsdom has no hover, which is precisely the
    // state a touch device is in permanently.
    render(<Inventory onClose={() => {}} />);
    const disabled = Array.from(document.querySelectorAll('button')).filter((b) => b.disabled);
    expect(
      disabled.map((b) => b.textContent.trim()),
      'a control renders disabled with nothing the player can do to enable it'
    ).toEqual([]);
  });

  it('the panel still offers buttons at all — the control for the assertion above', () => {
    // Without this, deleting every button in the panel would make the previous test pass.
    render(<Inventory onClose={() => {}} />);
    expect(document.querySelectorAll('button').length).toBeGreaterThan(0);
  });
});
