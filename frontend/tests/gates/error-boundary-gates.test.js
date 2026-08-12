// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createElement } from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../../src/ui/ErrorBoundary.jsx';

// M6 #8 — THE CRASH SCREEN, RENDERED BY ACTUALLY CRASHING SOMETHING.
//
// This gate used to read index.jsx as text and assert that `border: '4px solid #0A0F1A'`,
// `boxShadow: '8px 8px 0 #0A0F1A'` and the substring `window.location.reload` appeared somewhere in the
// file. Three problems, all of them the same problem: a literal hex string is a spelling, not a rendered
// pixel; a substring is not a wired handler; and none of it says whether the fallback appears AT ALL when
// a child throws. The gate would have gone red on a palette refactor that changed nothing a player sees,
// and stayed green if the boundary had stopped catching.
//
// It was source-grepped because ErrorBoundary lived inside the bootstrap module, next to
// `ReactDOM.createRoot(document.getElementById('root'))`, so importing it booted the app. Moving it to
// src/ui/ErrorBoundary.jsx is what makes the rest of this file possible — the fix for an untestable
// component is usually to make it importable, not to write a cleverer regex.
const Boom = () => { throw new Error('the sky fell'); };
const Fine = () => createElement('div', null, 'the game');

let consoleError;
beforeEach(() => { consoleError = vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { cleanup(); consoleError.mockRestore(); });

describe('the crash screen appears when something crashes', () => {
  it('passes children through untouched when nothing throws', () => {
    // The presence case first. Without it, a boundary that rendered the fallback unconditionally — or one
    // that rendered nothing ever — would satisfy every assertion below.
    render(createElement(ErrorBoundary, null, createElement(Fine)));
    expect(screen.getByText('the game')).toBeTruthy();
    expect(screen.queryByTestId('error-boundary'), 'the fallback shows when nothing has gone wrong').toBeNull();
  });

  it('catches a throwing child and shows the fallback instead of a white screen', () => {
    render(createElement(ErrorBoundary, null, createElement(Boom)));
    expect(screen.getByTestId('error-boundary'), 'the app unmounted to nothing — the player sees a blank page').toBeTruthy();
  });

  it('shows the player what went wrong, in text they can read back', () => {
    render(createElement(ErrorBoundary, null, createElement(Boom)));
    expect(screen.getByTestId('error-boundary').textContent).toContain('the sky fell');
  });

  it('the Reload button is WIRED, not merely present', () => {
    // `window.location.reload` appearing in the source proves nothing about the button. Clicking it does.
    const reload = vi.fn();
    const original = window.location;
    delete window.location;
    window.location = { ...original, reload };
    try {
      render(createElement(ErrorBoundary, null, createElement(Boom)));
      fireEvent.click(screen.getByTestId('error-reload'));
      expect(reload, 'the only way out of the crash screen does nothing').toHaveBeenCalledTimes(1);
    } finally { window.location = original; }
  });

  it('paints its own background and border rather than inheriting a stylesheet that may not have loaded', () => {
    // Read off the RENDERED element, not the source. The point is not the specific hex — it is that the
    // crash screen carries its own paint, because a crash can predate applyThemeVars and the CSS.
    render(createElement(ErrorBoundary, null, createElement(Boom)));
    const root = screen.getByTestId('error-boundary');
    expect(root.style.background, 'the crash screen has no background of its own').not.toBe('');
    const panel = root.firstElementChild;
    expect(panel.style.border, 'the panel has no self-contained border').toMatch(/solid/);
    expect(panel.style.boxShadow, 'the bold-flat hard offset shadow is gone').not.toBe('');
  });
});

describe('the component stack is for developers, not players', () => {
  it('is withheld unless import.meta.env.DEV', () => {
    // The assertion that matters for a shipped build: a player must never get an internals dump. Vitest
    // runs with DEV true, so this reads the flag rather than hardcoding an expectation — asserting
    // "absent" unconditionally would pass in prod and fail here, and asserting "present" would be a
    // gate that literally cannot hold in the build it is protecting.
    render(createElement(ErrorBoundary, null, createElement(Boom)));
    const stack = screen.queryByTestId('error-stack');
    if (import.meta.env.DEV) {
      expect(stack, 'the DEV stack dump is missing — debugging a crash gets harder').toBeTruthy();
      expect(stack.textContent, 'the stack element is empty').toContain('Boom');
    } else {
      expect(stack, 'a production player is shown the React component stack').toBeNull();
    }
  });

  it('logs the crash so it reaches the console capture the E2E reads', () => {
    render(createElement(ErrorBoundary, null, createElement(Boom)));
    const logged = consoleError.mock.calls.some((args) => String(args[0]).includes('ErrorBoundary caught an error'));
    expect(logged, 'a crash leaves no trace in the console — the probes cannot see it').toBe(true);
  });
});

describe('the raw red debug box is gone for good', () => {
  it('renders no inline red-on-pink debug styling', () => {
    // Kept from the original gate, but read off the DOM: the old fallback was `backgroundColor: '#fee'`
    // with `color: 'red'`, and the regression would be visible, not textual.
    render(createElement(ErrorBoundary, null, createElement(Boom)));
    const root = screen.getByTestId('error-boundary');
    for (const el of [root, ...root.querySelectorAll('*')]) {
      expect(el.style.color, 'the raw red debug text is back').not.toBe('red');
      expect(el.style.backgroundColor, 'the raw #fee debug box is back').not.toBe('rgb(255, 238, 238)');
    }
  });
});
