// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { setActive, getInput, setIntent } from '../../src/input/inputState.js';
import { ASPECT_VERBS } from '../../src/input/aspectWheel.js';
import { SPELL_ORDER } from '../../src/input/spellPicker.js';
import TouchControls from '../../src/ui/TouchControls.jsx';
import TouchControlsSurface from '../../src/ui/TouchControlsSurface.jsx';

// X1 — BEHAVIOURAL, not a source-grep.
//
// 85% of this repo's gate corpus asserts source TEXT, which is how a dead desktop mouse-look, a dead iOS
// cold-start and a permanently 0/100 health bar all shipped "green". This one RENDERS the touch overlay and
// drives it: it asserts what a thumb can reach and what the tap actually writes, so deleting the ring or
// unwiring setIntent turns it RED.
//
// The lived browser check is separate and still owed — `touch-probe.mjs` drives the real cold-start — but
// that harness needs a compositor, and this machine's frame production is intermittently dead. This gate
// covers everything that does NOT require a rendered frame.
afterEach(() => {
  cleanup();
  for (const a of ASPECT_VERBS) setIntent(a.verb, false);
  setActive(false);
});

const withAspects = (unlocked) => {
  useGameStore.setState({ unlockedTalents: unlocked });
  // The overlay only routes when the input gate is open (it is paused/panelled otherwise).
  setActive(true);
};

// isTouchUIMode() decides whether the overlay renders at all; force it on for the test.
vi.mock('../../src/input/touchDevice', async (orig) => ({
  ...(await orig()),
  isTouchDevice: () => true,
  isTouchUIMode: () => true,
}));

describe('X1 — the Aspect ring makes the four verbs reachable on touch', () => {
  beforeEach(() => {
    useGameStore.setState({ unlockedTalents: {} });
  });

  it('offers NO ring toggle when no Aspect is unlocked', () => {
    withAspects({});
    render(<TouchControls isWorldBuilt />);
    expect(screen.queryByTestId('touch-aspects')).toBeNull();
  });

  it('offers the toggle once an Aspect is unlocked', () => {
    withAspects({ [ASPECT_VERBS[0].talent]: 1 });
    render(<TouchControls isWorldBuilt />);
    expect(screen.getByTestId('touch-aspects')).toBeInTheDocument();
  });

  it('shows ONLY the unlocked verbs when opened — a locked sector is never offered', () => {
    const [first, second] = ASPECT_VERBS;
    withAspects({ [first.talent]: 1 });
    render(<TouchControls isWorldBuilt />);
    fireEvent.pointerUp(screen.getByTestId('touch-aspects'));
    expect(screen.getByTestId(`touch-aspect-${first.verb}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`touch-aspect-${second.verb}`)).toBeNull();
  });

  it('TAPPING A SECTOR WRITES THE REAL INTENT — the whole point of the feature', () => {
    const a = ASPECT_VERBS[0];
    withAspects({ [a.talent]: 1 });
    render(<TouchControls isWorldBuilt />);
    expect(getInput()[a.verb]).toBe(false);
    fireEvent.pointerUp(screen.getByTestId('touch-aspects'));
    fireEvent.pointerUp(screen.getByTestId(`touch-aspect-${a.verb}`));
    // The same boolean intent the keyboard's KeyR writes — no new downstream path.
    expect(getInput()[a.verb]).toBe(true);
  });

  it('closes the ring after a selection so it cannot eat the next tap', () => {
    const a = ASPECT_VERBS[0];
    withAspects({ [a.talent]: 1 });
    render(<TouchControls isWorldBuilt />);
    fireEvent.pointerUp(screen.getByTestId('touch-aspects'));
    fireEvent.pointerUp(screen.getByTestId(`touch-aspect-${a.verb}`));
    expect(screen.queryByTestId(`touch-aspect-${a.verb}`)).toBeNull();
  });

  it('offers all four sectors when every Aspect is unlocked', () => {
    withAspects(Object.fromEntries(ASPECT_VERBS.map((a) => [a.talent, 1])));
    render(<TouchControls isWorldBuilt />);
    fireEvent.pointerUp(screen.getByTestId('touch-aspects'));
    for (const a of ASPECT_VERBS) expect(screen.getByTestId(`touch-aspect-${a.verb}`)).toBeInTheDocument();
  });
});

// X2 — COOLDOWN FEEDBACK ON TOUCH.
//
// Touch had none at all: HUD.jsx:590 gates <AbilityBar> behind !isTouchUIMode() because its bottom-4
// anchor lands inside the touch joystick/action band. That was survivable while the Aspect verbs were
// unreachable on touch (X1); once the ring made them tappable, firing blind became the gap.
//
// The sweep is written by a rAF into a DOM ref (Game-Loop-Isolation — no per-frame React state), so what
// is asserted here is the WIRING: the elements exist, are keyed per verb, and the closed toggle carries an
// aggregate. The arithmetic itself is covered purely in src/input/aspectWheel.test.js, where it can be.
describe('X2 — the ring shows cooldown, so touch is not firing blind', () => {
  beforeEach(() => useGameStore.setState({ unlockedTalents: {}, abilityCooldowns: {} }));

  it('gives the CLOSED toggle an aggregate indicator — the ring is shut most of the time', () => {
    withAspects({ [ASPECT_VERBS[0].talent]: 1 });
    render(<TouchControlsSurface wheelOpen={false} />);
    expect(screen.getByTestId('aspect-cooling')).toBeInTheDocument();
  });

  it('gives every OPEN sector its own sweep element, keyed to its verb', () => {
    withAspects(Object.fromEntries(ASPECT_VERBS.map((a) => [a.talent, 1])));
    render(<TouchControlsSurface wheelOpen />);
    for (const a of ASPECT_VERBS) expect(screen.getByTestId(`aspect-sweep-${a.verb}`)).toBeInTheDocument();
  });

  it('draws NO sweep for a locked Aspect — it has no sector to draw on', () => {
    const [first, second] = ASPECT_VERBS;
    withAspects({ [first.talent]: 1 });
    render(<TouchControlsSurface wheelOpen />);
    expect(screen.getByTestId(`aspect-sweep-${first.verb}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`aspect-sweep-${second.verb}`)).toBeNull();
  });
});

// X2b — TOUCH WAS LOCKED TO ONE SPELL.
//
// `setActiveSpell` was called from exactly one place in the codebase — InputManager.jsx:131-134, on
// Digit1-4. A tablet has no keyboard, so a touch player cast the store default (`fireball`) forever and
// three of four spells were unreachable on the stated iPad target. Behavioural, like X1: the assertion is
// that a tap actually CHANGES the store, not that the markup mentions a spell.
describe('X2b — every spell is reachable on touch', () => {
  beforeEach(() => {
    useGameStore.setState({ activeSpell: 'fireball' });
    setActive(true);
  });

  it('offers a picker toggle whenever the touch overlay is live', () => {
    render(<TouchControls isWorldBuilt />);
    expect(screen.getByTestId('touch-spells')).toBeInTheDocument();
  });

  it('offers EVERY spell in the roster — not a subset', () => {
    render(<TouchControls isWorldBuilt />);
    fireEvent.pointerUp(screen.getByTestId('touch-spells'));
    for (const id of SPELL_ORDER) expect(screen.getByTestId(`touch-spell-${id}`)).toBeInTheDocument();
  });

  it('TAPPING A SPELL CHANGES THE ACTIVE SPELL — the whole defect', () => {
    const target = SPELL_ORDER.find((id) => id !== 'fireball');
    render(<TouchControls isWorldBuilt />);
    expect(useGameStore.getState().activeSpell).toBe('fireball');
    fireEvent.pointerUp(screen.getByTestId('touch-spells'));
    fireEvent.pointerUp(screen.getByTestId(`touch-spell-${target}`));
    // The same store seam Digit1-4 writes — no new downstream path.
    expect(useGameStore.getState().activeSpell).toBe(target);
  });

  it('reaches spells beyond the second — the default made only fireball castable', () => {
    render(<TouchControls isWorldBuilt />);
    for (const id of SPELL_ORDER.slice(1)) {
      fireEvent.pointerUp(screen.getByTestId('touch-spells'));
      fireEvent.pointerUp(screen.getByTestId(`touch-spell-${id}`));
      expect(useGameStore.getState().activeSpell).toBe(id);
    }
  });

  it('closes after a selection so it cannot eat the next tap', () => {
    render(<TouchControls isWorldBuilt />);
    fireEvent.pointerUp(screen.getByTestId('touch-spells'));
    fireEvent.pointerUp(screen.getByTestId(`touch-spell-${SPELL_ORDER[1]}`));
    expect(screen.queryByTestId(`touch-spell-${SPELL_ORDER[1]}`)).toBeNull();
  });

  it('draws a glyph per spell, tinted from the roster', () => {
    render(<TouchControlsSurface spellOpen />);
    for (const id of SPELL_ORDER) expect(screen.getByTestId(`spell-glyph-${id}`)).toBeInTheDocument();
  });
});
