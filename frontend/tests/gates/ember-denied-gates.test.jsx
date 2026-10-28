// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { setActive, setIntent } from '../../src/input/inputState.js';
import { ASPECT_VERBS } from '../../src/input/aspectWheel.js';
import { denyAspectPress } from '../../src/input/aspectDeny.js';
import { ROAR_COST, GRAB_COST, SNARE_COST, IMBUE_COST } from '../../src/game/ember.js';
import TouchControls from '../../src/ui/TouchControls.jsx';

// A PRESS THE EMBER BAR CANNOT PAY FOR SAYS SO (OPEN_ITEMS:OI-60, "aspect-underbanked", built as "not enough ember";
// DECISIONS 2026-10-28 W1-H item 5). Before Ember an unlocked verb pressed with too little in its meter did nothing
// at all: only a locked one spoke. denyAspectPress is what the keyboard's R/V/X/Z handler (Components.jsx) and the
// touch ring (TouchControls.jsx) both call; these cases drive it against the real store with the toast pipe captured,
// in both locales, and drive the touch ring by its real pointer events.
//
// WHAT THIS DOES NOT CHECK: that the keydown handler calls it (a real R press in tests/e2e/ember.spec.js shows the
// notice), the fuse's notice, which the frame loop raises (src/game/soulbind.test.js, and the X case of
// tests/e2e/ember.spec.js), or the refusals the Components spend sites give when a bind, a fuse or an armed imbue lands
// on a bar another verb has emptied (no test drives those at the call site).
//
// Mutation-Proof: see the commit trailer.

vi.mock('../../src/input/touchDevice', async (orig) => ({
  ...(await orig()),
  isTouchDevice: () => true,
  isTouchUIMode: () => true,
}));

const PRICE = { roar: ROAR_COST, grab: GRAB_COST, snare: SNARE_COST, imbue: IMBUE_COST };
const ALL = Object.fromEntries(ASPECT_VERBS.map((a) => [a.talent, 1]));
let notes;
// The toast is throttled to one a second on performance.now; every read here is 5 s on, so none is swallowed.
let clock = 1e7;

beforeEach(() => {
  useGameStore.setState(useGameStore.getInitialState(), true);
  notes = [];
  vi.spyOn(performance, 'now').mockImplementation(() => (clock += 5000));
  useGameStore.setState({ addNotification: (text, type) => notes.push({ text, type }) });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const a of ASPECT_VERBS) setIntent(a.verb, false);
  setActive(false);
  useGameStore.setState(useGameStore.getInitialState(), true);
});

describe('denyAspectPress', () => {
  // Every press below is a live one (input held, player alive) unless the case says otherwise.
  beforeEach(() => setActive(true));

  it('covers the four Aspect verbs', () => {
    expect(ASPECT_VERBS.map((a) => a.verb).sort()).toEqual(Object.keys(PRICE).sort());
  });

  for (const [verb, cost] of Object.entries(PRICE)) {
    it(`${verb}: one short says "Not enough ember"; at its price, nothing`, () => {
      useGameStore.setState({ unlockedTalents: ALL, ember: cost });
      expect(denyAspectPress(verb, useGameStore.getState()), `${verb} at its price was refused`).toBeNull();
      expect(notes, `${verb} at its price raised a notice`).toEqual([]);
      useGameStore.setState({ ember: cost - 1 });
      expect(denyAspectPress(verb, useGameStore.getState())).toBe('no-ember');
      expect(notes, `${verb} one short was refused in silence`).toEqual([{ text: 'Not enough ember', type: 'warn' }]);
    });
  }

  it('says it in the player\'s language', () => {
    useGameStore.setState({ unlockedTalents: ALL, ember: 0, locale: 'zh-CN' });
    denyAspectPress('grab', useGameStore.getState());
    expect(notes.map((n) => n.text), 'the zh-CN notice is not translated').toEqual(['余烬不足']);
  });

  it('a locked verb still teaches the unlock path, whatever the bar holds', () => {
    useGameStore.setState({ unlockedTalents: {}, ember: 0 });
    expect(denyAspectPress('roar', useGameStore.getState())).toBe('aspect-locked');
    expect(notes.map((n) => n.text)).toEqual(['WILDHEART not yet unlocked — open Talents (U)']);
  });

  // The keydown handler is on window, so R, V, X and Z typed into a text field (a world's name) or pressed while dead
  // reach it. Those presses do nothing, so they say nothing, the way Shift arms no dodge then.
  it('says nothing while input is released or the player is dead, for a short bar or a locked verb', () => {
    const live = () => { setActive(true); useGameStore.setState({ isAlive: true }); };
    for (const [why, enter] of [['input released', () => setActive(false)], ['dead', () => useGameStore.setState({ isAlive: false })]]) {
      for (const [bar, talents] of [['short', ALL], ['locked', {}]]) {
        live();
        useGameStore.setState({ unlockedTalents: talents, ember: 0 });
        expect(denyAspectPress('roar', useGameStore.getState()), `SETUP: a live ${bar} roar was not refused`).not.toBeNull();
        notes.length = 0;
        enter();
        for (const verb of Object.keys(PRICE)) {
          expect(denyAspectPress(verb, useGameStore.getState()), `${verb}, ${bar}, ${why}: refused with a reason`).toBeNull();
        }
        expect(notes, `a ${bar} press with ${why} raised a notice`).toEqual([]);
      }
    }
  });

  it('a press that releases is not a spend and says nothing', () => {
    useGameStore.setState({ unlockedTalents: ALL, ember: 0, beastFormActive: true, voidhandHeld: true, imbueArmed: true });
    for (const verb of ['roar', 'grab', 'imbue']) expect(denyAspectPress(verb, useGameStore.getState()), verb).toBeNull();
    expect(notes).toEqual([]);
  });
});

describe('the touch ring says it too', () => {
  const openRing = () => {
    render(<TouchControls isWorldBuilt />);
    fireEvent.pointerUp(screen.getByTestId('touch-aspects'));
  };

  it('a tapped grab sector with the bar short shows the notice; with the bar full enough, none', () => {
    setActive(true);
    useGameStore.setState({ unlockedTalents: ALL, ember: GRAB_COST });
    openRing();
    fireEvent.pointerUp(screen.getByTestId('touch-aspect-grab'));
    expect(notes, 'a paid-for tap raised a notice').toEqual([]);
    useGameStore.setState({ ember: GRAB_COST - 1 });
    fireEvent.pointerUp(screen.getByTestId('touch-aspects'));
    fireEvent.pointerUp(screen.getByTestId('touch-aspect-grab'));
    expect(notes.map((n) => n.text), 'a short grab tap on the ring was refused in silence').toEqual(['Not enough ember']);
  });

  it('a pressed roar sector with the bar short shows the notice', () => {
    setActive(true);
    useGameStore.setState({ unlockedTalents: ALL, ember: ROAR_COST - 1 });
    openRing();
    fireEvent.pointerDown(screen.getByTestId('touch-aspect-roar'), { pointerId: 3 });
    expect(notes.map((n) => n.text), 'a short roar press on the ring was refused in silence').toEqual(['Not enough ember']);
    fireEvent.pointerUp(screen.getByTestId('touch-aspect-roar'), { pointerId: 3 });
  });
});
