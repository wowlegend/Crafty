// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { Slot } from '../../src/ui/primitives/index.js';

// THE TRANSFER TILES WERE POINTER-ONLY.
//
// Both grids in ChestInventoryPanel move an item by putting `onClick` on a <Slot>, and Slot renders a
// plain div. A div with a click handler is invisible to the keyboard: not focusable, not announced as
// interactive, and Enter/Space do nothing — so the only way to move an item between backpack and chest
// was a mouse or a tap. That is the whole feature, unreachable.
//
// This asserts the CONTRACT the panel now relies on rather than re-rendering the panel itself (which
// needs the store, i18n and a live chest at real coordinates): Slot must forward role/tabIndex/onKeyDown
// onto its element, and the activation shape must fire on Enter and Space and nothing else. If Slot ever
// stops spreading props, the panel's a11y silently reverts and this goes red.
afterEach(cleanup);

// The same activation shape the panel uses.
const keyActivate = (fn) => (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  fn();
};

describe('chest transfer tiles are keyboard-operable', () => {
  it('Slot forwards role, tabIndex and a name onto a focusable element', () => {
    render(createElement(Slot, { role: 'button', tabIndex: 0, 'aria-label': 'Move 3 Stone to chest' }, 'Stone'));
    const el = screen.getByRole('button', { name: 'Move 3 Stone to chest' });
    expect(el).toBeTruthy();
    expect(el.tabIndex, 'the tile is not reachable by Tab').toBe(0);
  });

  it('Enter and Space activate it; other keys do not', () => {
    const onActivate = vi.fn();
    render(createElement(Slot, {
      role: 'button', tabIndex: 0, 'aria-label': 'Move 1 Wood to chest',
      onKeyDown: keyActivate(onActivate),
    }, 'Wood'));
    const el = screen.getByRole('button', { name: 'Move 1 Wood to chest' });

    fireEvent.keyDown(el, { key: 'Enter' });
    expect(onActivate, 'Enter did not transfer').toHaveBeenCalledTimes(1);
    fireEvent.keyDown(el, { key: ' ' });
    expect(onActivate, 'Space did not transfer').toHaveBeenCalledTimes(2);

    // The negative case, so "it activates" is not just "it activates on everything".
    fireEvent.keyDown(el, { key: 'a' });
    fireEvent.keyDown(el, { key: 'Escape' });
    fireEvent.keyDown(el, { key: 'Tab' });
    expect(onActivate, 'an unrelated key transferred an item').toHaveBeenCalledTimes(2);
  });

  it('Space is prevented, so activating a tile does not also scroll the grid', () => {
    const onActivate = vi.fn();
    render(createElement(Slot, {
      role: 'button', tabIndex: 0, 'aria-label': 'Move 1 Coal to chest',
      onKeyDown: keyActivate(onActivate),
    }, 'Coal'));
    const el = screen.getByRole('button', { name: 'Move 1 Coal to chest' });
    const ev = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    expect(ev.defaultPrevented, 'Space would scroll the overflow-y grid out from under the tile').toBe(true);
  });
});
