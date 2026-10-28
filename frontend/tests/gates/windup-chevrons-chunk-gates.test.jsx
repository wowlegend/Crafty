// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup, waitFor } from '@testing-library/react';

/**
 * A FAILED CHEVRON CHUNK DROPS THE CHEVRONS, NOT THE GAME.
 *
 * The windup chevrons load as their own lazy chunk (HUD.jsx). A rejected React.lazy rethrows its error on every render,
 * and the nearest boundary would be the app-wide one (index.jsx), so a chevron chunk that failed at boot (an iPad on
 * flaky Wi-Fi, or a tab left open across a deploy whose hashed chunk now 404s) would replace the game with the reload
 * screen. The panels' boundary (ui/panels/lazyPanels.js PanelBoundary) holds it in the slot.
 *
 * This mounts the REAL HUD.jsx slot with the chevron module made to fail its import, inside a stand-in for the app-wide
 * boundary, beside a sibling. PRESENCE first: the failure must be seen thrown (React reports a caught error on
 * console.error), so "nothing rendered" cannot be a lazy still pending. Then: the outer boundary caught nothing, the
 * sibling is still on screen, and the slot rendered nothing.
 *
 * WHAT THIS DOES NOT CHECK: a real network failure in a browser (the import is made to reject here), and the slot's
 * bounded retry, which tests/gates/windup-chevrons-retry-gates.test.jsx drives.
 */

vi.mock('../../src/ui/WindupChevrons', () => {
  throw new Error('SIMULATED chevron chunk failure');
});
const { WindupChevronsSlot } = await import('../../src/HUD.jsx');

class AppBoundary extends React.Component {
  state = { caught: null };
  static getDerivedStateFromError(error) { return { caught: error }; }
  render() {
    return this.state.caught ? <div data-testid="app-reload-screen">{String(this.state.caught.message)}</div> : this.props.children;
  }
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the windup chevrons\' lazy chunk', () => {
  it('a failed load renders nothing in the slot and leaves the game on screen', async () => {
    const errors = [];
    vi.spyOn(console, 'error').mockImplementation((...args) => { errors.push(args); });
    // vitest wraps a throwing mock factory's error ("There was an error when mocking a module"), keeping ours as cause.
    const ours = (a) => [a?.message, a?.cause?.message, a].some((x) => String(x).includes('SIMULATED chevron chunk failure'));
    const seen = () => errors.some((args) => args.some(ours));
    const { queryByTestId } = render(
      <AppBoundary>
        <div data-testid="hud-sibling">hud</div>
        <div data-testid="chevron-slot"><WindupChevronsSlot /></div>
      </AppBoundary>,
    );
    await waitFor(() => {
      expect(seen() || queryByTestId('app-reload-screen') !== null, 'SETUP: the simulated chunk failure was never thrown').toBe(true);
    });
    expect(queryByTestId('app-reload-screen'), 'a failed chevron chunk took the game down to the reload screen').toBeNull();
    expect(queryByTestId('hud-sibling'), 'the HUD beside the chevrons went with them').not.toBeNull();
    expect(queryByTestId('chevron-slot').childNodes.length, 'the failed slot rendered something').toBe(0);
  });
});
