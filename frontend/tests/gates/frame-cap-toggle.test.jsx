// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
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

// A night siege is survived, never skipped: no control in the pause menu may turn night into day.
//
// Every control is driven, in each game mode, and the clock is read after each one, so the failure names the control.
// The panel is rendered with every optional row it has. Buttons are re-queried after each click and the mode is put
// back, so a row that one mode shows, or that a click mounts, is clicked in that mode instead of being unmounted before
// its turn. Every slider is driven to its min and its max. This drives only buttons and range sliders, so the census
// fails on any other control a player can reach: by native element, by ARIA widget role, or by a tab stop on anything
// else. It runs on mount and after every click. An element with only a click handler (no role, no tab stop) is invisible
// to it, as it is to a keyboard.
describe('Settings — no control moves the clock', () => {
  const NIGHT = { isDay: false, gameTime: 0.75 };
  const UNDRIVEN = [
    'input:not([type="range"])', 'select', 'textarea', 'a[href]', '[contenteditable]:not([contenteditable="false"])',
    '[role="switch"]', '[role="checkbox"]', '[role="combobox"]', '[role="radio"]', '[role="tab"]', '[role^="menuitem"]',
    '[role="option"]', '[role="spinbutton"]', '[role="link"]', '[role="slider"]:not(input[type="range"])',
    '[tabindex]:not([tabindex^="-"]):not(button):not([role="button"]):not(input[type="range"])',
  ].join(', ');

  it.each(['creative', 'survival'])('in %s mode, every button and every slider leaves night as night and the clock where it was', (mode) => {
    useGameStore.setState({ ...NIGHT, gameMode: mode, frameCap: 60, masterMuted: false, lookSensitivity: 1 });
    render(<SettingsPanel onClose={() => {}} showStats={false} setShowStats={() => {}}
      onOpenWorldManager={() => {}} onOpenCredits={() => {}} />);
    const held = (what) => {
      const s = useGameStore.getState();
      expect(s.isDay, `${what} turned night into day (${mode})`).toBe(false);
      expect(s.gameTime, `${what} moved the clock (${mode})`).toBe(0.75);
    };

    const census = (when) => {
      const others = [...document.body.querySelectorAll(UNDRIVEN)].map((e) => e.outerHTML.slice(0, 120));
      expect(others, `${when}, the panel has a control this gate does not drive (${mode})`).toEqual([]);
    };
    census('on mount');

    const clicked = new Set();
    for (let next; (next = screen.queryAllByRole('button').find((b) => !clicked.has(b)));) {
      clicked.add(next);
      expect(clicked.size, 'a click keeps minting new buttons').toBeLessThan(60);
      const name = next.getAttribute('aria-label') || next.textContent.trim();
      fireEvent.click(next);
      held(`the "${name}" button`);
      act(() => { useGameStore.setState({ gameMode: mode }); }); // flushed, so the next query sees this mode's rows
      census(`after the "${name}" click`);
    }
    expect(clicked.size, 'the panel rendered too few buttons for this to have clicked anything').toBeGreaterThanOrEqual(9);

    const sliders = screen.getAllByRole('slider');
    expect(sliders.length, 'the panel rendered too few sliders for this to have driven anything').toBeGreaterThanOrEqual(4);
    for (const s of sliders) {
      for (const v of [s.min, s.max]) {
        fireEvent.change(s, { target: { value: v } });
        held(`the "${s.getAttribute('aria-label')}" slider at ${v}`);
      }
    }

    // Presence, same instruments: a click and a slider move both reach the store.
    const s = useGameStore.getState();
    expect(s.frameCap, 'the Frame Rate click never landed').toBe(0);
    expect(s.masterMuted, 'the Mute All click never landed').toBe(true);
    expect(s.lookSensitivity, 'the Look Sensitivity slider never reached the store').toBe(2.5);
  });
});
