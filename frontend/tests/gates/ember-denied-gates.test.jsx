// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { setActive, setIntent, getInput } from '../../src/input/inputState.js';
import { ASPECT_VERBS } from '../../src/input/aspectWheel.js';
import { denyAspectPress } from '../../src/input/aspectDeny.js';
import { ROAR_COST, GRAB_COST, SNARE_COST, IMBUE_COST, EMBER_MAX } from '../../src/game/ember.js';
import TouchControls from '../../src/ui/TouchControls.jsx';

// WHERE AN ASPECT PRESS IS TOLD WHY IT DID NOTHING (DECISIONS 2026-10-28 W1-H item 5). Two notices, said in two places:
// a LOCKED verb teaches the unlock path at the keydown (denyAspectPress), and an unlocked verb the ember bar cannot pay
// for is told by the frame loop, from its reducer's 'short' or 'unpaid' (src/game/*.test.js prove each reducer's). The
// keydown cannot judge the bar: whether X would start a snare, a fuse or nothing turns on a target in the aim, a pair
// near the player, a recipe and the squad's room, so a press-time copy of those gates said "Not enough ember" for a
// press no bar would have started. These cases drive denyAspectPress against the real store with the toast pipe
// captured, and the touch ring by its real pointer events: the ring writes the intent the frame loop reads, as the key
// does, and says nothing of the bar itself.
//
// WHAT THIS DOES NOT CHECK: that the frame loop raises the ember notice from the reducers' verdicts (the frame loop is not
// rendered outside a browser; tests/e2e/ember.spec.js drives R, V, X and Z in the booted game), or the touch ring's
// locked sector, which opens the Talents panel (tests/gates/aspect-ring-gates.test.jsx).
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

  it('a locked verb teaches the unlock path, whatever the bar holds', () => {
    for (const ember of [0, EMBER_MAX]) {
      for (const a of ASPECT_VERBS) {
        notes.length = 0;
        useGameStore.setState({ unlockedTalents: {}, ember });
        expect(denyAspectPress(a.verb, useGameStore.getState()), `${a.verb} locked at ${ember}`).toBe('aspect-locked');
        expect(notes, `${a.verb} locked at ${ember}`).toEqual([{ text: `${a.aspect} not yet unlocked — open Talents (U)`, type: 'warn' }]);
      }
    }
  });

  // Read against the locked case above: the same instrument raised a notice there, so its silence here is the press's.
  it('an unlocked verb says nothing at the press at any bar: the bar is the frame loop\'s to judge', () => {
    useGameStore.setState({ unlockedTalents: ALL });
    expect(denyAspectPress('roar', { ...useGameStore.getState(), unlockedTalents: {} }), 'SETUP: a locked roar was not refused').toBe('aspect-locked');
    notes.length = 0;
    for (const [verb, cost] of Object.entries(PRICE)) {
      for (const ember of [0, cost - 1, cost]) {
        useGameStore.setState({ ember });
        expect(denyAspectPress(verb, useGameStore.getState()), `${verb} at ${ember} was refused at the press`).toBeNull();
      }
    }
    expect(notes, 'an unlocked press raised a notice at the keydown').toEqual([]);
  });

  // The keydown handler is on window, so R, V, X and Z typed into a text field (a world's name) or pressed while dead
  // reach it. Those presses do nothing, so they say nothing, the way Shift arms no dodge then.
  it('says nothing while input is released or the player is dead', () => {
    for (const [why, enter] of [['input released', () => setActive(false)], ['dead', () => useGameStore.setState({ isAlive: false })]]) {
      setActive(true);
      useGameStore.setState({ isAlive: true, unlockedTalents: {}, ember: 0 });
      expect(denyAspectPress('roar', useGameStore.getState()), 'SETUP: a live locked roar was not refused').toBe('aspect-locked');
      notes.length = 0;
      enter();
      for (const verb of Object.keys(PRICE)) {
        expect(denyAspectPress(verb, useGameStore.getState()), `${verb}, ${why}: refused with a reason`).toBeNull();
      }
      expect(notes, `a locked press with ${why} raised a notice`).toEqual([]);
    }
  });
});

describe('the touch ring writes the intent and leaves the bar to the frame loop', () => {
  const openRing = () => {
    render(<TouchControls isWorldBuilt />);
    fireEvent.pointerUp(screen.getByTestId('touch-aspects'));
  };

  it('a tapped grab sector writes the grab intent and raises no notice, on a bar short of the grab', () => {
    setActive(true);
    useGameStore.setState({ unlockedTalents: ALL, ember: GRAB_COST - 1 });
    openRing();
    expect(getInput().grab, 'SETUP: the grab intent was already set').toBe(false);
    fireEvent.pointerUp(screen.getByTestId('touch-aspect-grab'));
    expect(getInput().grab, 'the grab tap wrote no intent, so the frame loop never sees the press').toBe(true);
    expect(notes, 'the ring judged the bar itself').toEqual([]);
  });

  it('a pressed roar sector holds the roar intent and raises no notice, on a bar short of the roar', () => {
    setActive(true);
    useGameStore.setState({ unlockedTalents: ALL, ember: ROAR_COST - 1 });
    openRing();
    fireEvent.pointerDown(screen.getByTestId('touch-aspect-roar'), { pointerId: 3 });
    expect(getInput().roar, 'the roar press wrote no intent').toBe(true);
    expect(notes, 'the ring judged the bar itself').toEqual([]);
    fireEvent.pointerUp(screen.getByTestId('touch-aspect-roar'), { pointerId: 3 });
  });
});
