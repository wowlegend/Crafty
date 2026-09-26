// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SettingsPanel } from '../../src/ui/GamePanels.jsx';
import { useGameStore } from '../../src/store/useGameStore.jsx';

// THE FRAME-RATE SETTING, THROUGH ITS BUTTON (plan 2026-09-23-crafty-perf-heat-ipad, Task 4).
//
// tests/gates/frame-cap-gates covers the store action and the persistence; tests/e2e/frame-cap covers the running
// canvas, and calls the store action directly. Neither clicks the button a player has, so a button wired to the wrong
// action, or one whose label reads the wrong side of the choice, would pass both. This clicks it.
//
// Mutation-Proof: via scripts/dev/mutate.sh, each observed RED:
//   T1 the button's onClick removed -> "the click did not change the cap"
//   T2 plausible-wrong: the click always sets 0 (a one-way switch) -> "a second click did not restore the cap"
//   T3 plausible-wrong: the labels swapped -> "the capped state reads as Unlimited"
//   and T0, an identity mutant (a comment edit in GamePanels.jsx, same harness and batch), SURVIVED.
beforeEach(() => {
  useGameStore.setState({ frameCap: 60 });
});
afterEach(cleanup);

const toggle = () => screen.getByTestId('frame-cap-toggle');

describe('Settings — Frame Rate', () => {
  it('reads 60 when capped, and a click switches to Unlimited and back', () => {
    render(<SettingsPanel onClose={() => {}} showStats={false} setShowStats={() => {}} />);
    expect(toggle().textContent, 'the capped state reads as Unlimited').toMatch(/60/);

    fireEvent.click(toggle());
    expect(useGameStore.getState().frameCap, 'the click did not change the cap').toBe(0);
    expect(toggle().textContent, 'Unlimited does not say so on its button').toMatch(/Unlimited/);

    fireEvent.click(toggle());
    expect(useGameStore.getState().frameCap, 'a second click did not restore the cap').toBe(60);
    expect(toggle().textContent).toMatch(/60/);
  });

  it('names what the choice does for a screen reader', () => {
    render(<SettingsPanel onClose={() => {}} showStats={false} setShowStats={() => {}} />);
    expect(toggle().getAttribute('aria-label'), 'the toggle has no accessible name').toMatch(/Frame rate/i);
  });
});
