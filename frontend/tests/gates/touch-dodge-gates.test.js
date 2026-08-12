// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { createElement } from 'react';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setActive, getInput, setIntent } from '../../src/input/inputState.js';
import { TAP_HOLD_MS } from '../../src/input/aspectWheel.js';

const HERE = dirname(fileURLToPath(import.meta.url));

// SOTA M3 #6 (touch dodge): touch had no dodge at all — Shift-only, unreachable on iPad. A dodge button
// now dispatches the SAME edge-triggered intent the keyboard uses, and PULSES it: set, then cleared after
// TAP_HOLD_MS. The clear is the load-bearing half. Setting the intent with no release relied on the
// consumer to clear it, and the consumer only clears while input is LOCKED — so a tap that landed as a
// panel opened stayed queued and spent itself as an unrequested roll on the way back.
//
// THIS GATE HAS NOW GONE RED AT A CORRECT CHANGE TWICE. First it pinned the exact inline arrow function
// and reddened at the fix, so it was re-anchored to `aria-label="Dodge"` … which reddened the moment that
// label was routed through i18n for zh-CN. Both times it reported on how the source is SPELLED. The
// repo's own rule for this is one line long — copy is not a selector, use data-testid — and the third
// version stops spelling-matching altogether: it renders the overlay, taps the button, and watches the
// intent go true and then false on a real timer.
vi.mock('../../src/input/touchDevice', async (orig) => ({
  ...(await orig()),
  isTouchDevice: () => true,
  isTouchUIMode: () => true,
}));
const TouchControls = (await import('../../src/ui/TouchControls.jsx')).default;

beforeEach(() => { vi.useFakeTimers(); setActive(true); });
afterEach(() => { vi.runOnlyPendingTimers(); vi.useRealTimers(); cleanup(); setIntent('dodge', false); setActive(false); });

describe('touch dodge — driven, not grepped (M3 #6 S4)', () => {
  it('the button is reachable on a touch device', () => {
    render(createElement(TouchControls, { isWorldBuilt: true }));
    expect(screen.getByTestId('touch-dodge'), 'no dodge button — touch players have no dodge at all').toBeTruthy();
  });

  it('tapping it RAISES the dodge intent', () => {
    render(createElement(TouchControls, { isWorldBuilt: true }));
    expect(getInput().dodge, 'dodge is already set before the tap — the baseline is dirty').toBeFalsy();
    fireEvent.pointerDown(screen.getByTestId('touch-dodge'));
    expect(getInput().dodge, 'tapping dodge writes no intent — the button is inert').toBe(true);
  });

  it('and PULSES it — the intent clears itself instead of waiting for a consumer', () => {
    // The regression this gate exists for. Without the clear, a tap that lands as a panel opens stays
    // queued and spends itself as a roll the player never asked for, on the way back into the game.
    render(createElement(TouchControls, { isWorldBuilt: true }));
    fireEvent.pointerDown(screen.getByTestId('touch-dodge'));
    expect(getInput().dodge).toBe(true);

    act(() => { vi.advanceTimersByTime(TAP_HOLD_MS + 1); });
    expect(getInput().dodge, 'the dodge intent never clears — it stays queued for whenever input unlocks').toBeFalsy();
  });

  it('the hold is long enough for a once-per-frame consumer to see the rising edge', () => {
    // The other direction: clearing immediately would make the pulse invisible to a state machine that
    // samples once per frame (33ms at 30fps), which is a dodge that silently does nothing.
    render(createElement(TouchControls, { isWorldBuilt: true }));
    fireEvent.pointerDown(screen.getByTestId('touch-dodge'));
    act(() => { vi.advanceTimersByTime(33); });
    expect(getInput().dodge, `the pulse is shorter than one frame at 30fps (TAP_HOLD_MS=${TAP_HOLD_MS})`).toBe(true);
    expect(TAP_HOLD_MS).toBeGreaterThan(33);
  });

  it('routes to the SAME dodge intent the keyboard uses — no gameplay fork', () => {
    // Components' Shift path and the roll/i-frame state machine are unchanged; what matters is that touch
    // writes the identical key rather than a parallel one that only the touch layer understands.
    const comp = readFileSync(resolve(HERE, '../../src/Components.jsx'), 'utf8');
    expect(comp, 'the keyboard dodge path no longer writes this intent, so touch and keyboard have forked')
      .toMatch(/setIntent\('dodge',\s*true\)/);
  });
});

describe('touch dodge — the glyph a thumb aims at', () => {
  it('the surface draws the Wind glyph the button stands for', () => {
    // Kept textual: TouchControlsSurface is the CAPTURE-mode paint-only mirror, so there is no interaction
    // to drive here — but anchored to the JSX element form rather than to a bare token.
    const surface = readFileSync(resolve(HERE, '../../src/ui/TouchControlsSurface.jsx'), 'utf8');
    expect(surface).toMatch(/import \{[^}]*\bWind\b[^}]*\} from 'lucide-react'/);
    expect(surface).toMatch(/<Wind size=/);
  });
});
