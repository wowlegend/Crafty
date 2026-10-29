// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { EmberBar } from '../../src/ui/EmberBar.jsx';
import { EMBER_MAX } from '../../src/game/ember.js';

// ONE EMBER-GOLD BAR IN PLACE OF FOUR (DECISIONS 2026-10-28 W1-H item 5). The bar reads the store's one bank, live,
// and takes no room when it is empty.
//
// WHAT THIS DOES NOT CHECK: that the HUD's stat stack mounts it in place of the four retired bars (tests/e2e/ember.spec.js
// reads the live stack), or how the colour looks on a real screen.
//
// Mutation-Proof: see the commit trailer.

beforeEach(() => useGameStore.setState(useGameStore.getInitialState(), true));
afterEach(() => {
  cleanup();
  useGameStore.setState(useGameStore.getInitialState(), true);
});

describe('the ember bar', () => {
  it('shows the bank, labelled, in its own colour, and follows it live; an empty bar takes no room', () => {
    useGameStore.setState({ ember: 40 });
    render(<EmberBar />);
    const bar = screen.getByTestId('ember-bar');
    expect(bar.textContent, 'the bar does not read its value').toContain(`40/${EMBER_MAX}`);
    expect(bar.textContent, 'the bar is not labelled').toContain('Ember');
    const fill = bar.querySelector('[data-fill]');
    expect(fill.className, 'the bar is not ember-gold').toMatch(/\bbg-ember\b/);
    expect(fill.style.width).toBe('40%');
    act(() => useGameStore.getState().gainEmber(16));
    expect(screen.getByTestId('ember-bar').textContent, 'the bar did not follow a kill').toContain(`56/${EMBER_MAX}`);
    act(() => useGameStore.setState({ ember: 0 }));
    expect(screen.queryByTestId('ember-bar'), 'an empty bar is still drawn').toBeNull();
  });

  it('is drawn from the first ember: a bar holding 1 shows, 0 does not', () => {
    useGameStore.setState({ ember: 1 });
    render(<EmberBar />);
    expect(screen.queryByTestId('ember-bar'), 'a bar holding 1 ember is hidden').not.toBeNull();
    expect(screen.getByTestId('ember-bar').textContent).toContain(`1/${EMBER_MAX}`);
    act(() => useGameStore.setState({ ember: 0 }));
    expect(screen.queryByTestId('ember-bar'), 'an empty bar is still drawn').toBeNull();
  });

  it('is labelled in the player\'s language', () => {
    useGameStore.setState({ ember: 12, locale: 'zh-CN' });
    render(<EmberBar />);
    expect(screen.getByTestId('ember-bar').textContent).toContain('余烬');
  });
});
