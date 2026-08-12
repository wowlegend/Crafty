// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { render, cleanup, screen } from '@testing-library/react';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { enterCaptureMode, exitCaptureMode } from '../../src/devtest/captureMode.js';
import { AbilityBar } from '../../src/ui/AbilityBar.jsx';

afterEach(() => { cleanup(); exitCaptureMode(); useGameStore.setState({ abilityCooldowns: {} }); });
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('ability-bar cooldown mirror wiring', () => {
  it('store defines abilityCooldowns + setter', () => {
    const store = read('store/useGameStore.jsx');
    expect(store).toMatch(/abilityCooldowns:/);
    expect(store).toMatch(/setAbilityCooldowns:/);
  });
  it('Components.jsx writes the mirror via buildCooldownMirror (throttled, not per-frame React state)', () => {
    const c = strip(read('Components.jsx'));
    expect(c).toMatch(/buildCooldownMirror/);
    expect(c).toMatch(/setAbilityCooldowns|abilityCooldowns:/);
    // Game-Loop-Isolation: must use a throttle ref, never a per-frame setState in the hot loop
    expect(c).toMatch(/_lastCdMirror|cdMirrorThrottle/);
  });
});

// THE BAR IS RENDERED. Every case below used to be a regex over AbilityBar.jsx: `/abilityCooldowns/`
// matched the import line, `/Slot/` matched it too, `/isCaptureMode\(\)/` proved the call exists and not
// that it suppresses anything, and the five labels matched a comment listing them. The component is a
// store-reading memo, so jsdom renders it and the claims become observations.
describe('AbilityBar component', () => {
  const bar = read('ui/AbilityBar.jsx');

  // The bar's real contract, read from the component: it renders the abilities PRESENT in
  // abilityCooldowns (dodge is always in the set), and returns null when only dodge is owned so the HUD
  // stays clean before any Aspect is unlocked. The conic sweep is applied imperatively by rAF onto refs,
  // so it is not in the initial HTML and asserting it there would be asserting the wrong thing.
  const OWNED = { grab: { remaining: 3, duration: 6 }, snare: { remaining: 0, duration: 8 } };

  const withStore = (cooldowns) => {
    useGameStore.setState({ abilityCooldowns: cooldowns });
    return render(createElement(AbilityBar));
  };

  it('renders the OWNED ability labels on screen', () => {
    withStore(OWNED);
    for (const k of ['GRAB', 'SNARE', 'DODGE']) {
      expect(screen.queryByText(k), `${k} is owned but not rendered`).toBeTruthy();
    }
    // And only those: an ability the player has not unlocked must not appear.
    expect(screen.queryByText('ROAR'), 'an unowned ability rendered').toBeNull();
  });

  it('stays hidden until an Aspect is unlocked (dodge alone is not a bar)', () => {
    const { container } = withStore({});
    expect(container.textContent, 'the bar rendered with no Aspect unlocked').toBe('');
  });

  it('is capture-SUPPRESSED (renders nothing, not merely calls the guard)', () => {
    // SEEDED WITH OWNED ABILITIES ON PURPOSE. Written with `{}` this passed for the wrong reason — the
    // bar returns null at `owned.length <= 1` whatever capture is doing, so deleting the capture guard
    // left it green. Caught by the mutation, not by review. The bar must be in a state where it WOULD
    // render for the suppression to be the thing under test.
    useGameStore.setState({ abilityCooldowns: OWNED });
    const visible = render(createElement(AbilityBar)).container.textContent;
    expect(visible, 'the fixture does not render at all, so suppression proves nothing').not.toBe('');
    cleanup();

    enterCaptureMode();
    const { container } = render(createElement(AbilityBar));
    expect(container.textContent, 'the ability bar rendered under capture, so it sits in the baselines').toBe('');
  });

  it('does not reach into the state-machine refs (kept as a source assertion: an ABSENCE)', () => {
    // An absence cannot be observed by rendering — the refs simply would not appear. Left as a grep,
    // which is the correct tool for "this module must not import that one".
    expect(bar).not.toMatch(/voidhandSMRef|soulbindSMRef/);
  });
});
