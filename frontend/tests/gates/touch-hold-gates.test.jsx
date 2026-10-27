// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { setActive, getInput, setIntent } from '../../src/input/inputState.js';
import { ASPECT_VERBS, TAP_HOLD_MS } from '../../src/input/aspectWheel.js';
import { openTalents } from '../../src/ui/touchTray.js';
import { t as translate } from '../../src/i18n/i18n.js';
import TouchControls from '../../src/ui/TouchControls.jsx';

// PHASE 0c — TOUCH PLAYS THE SIGNATURE (plan docs/superpowers/plans/2026-10-27-crafty-touch-hold.md).
//
// BEHAVIOURAL: this renders the REAL touch overlay and drives it with pointer events under a fake clock, so every
// timing below is exact. It asserts what the controls WRITE (the roar intent, the store seams), not what the markup
// mentions. Before this phase the roar sector pulsed its intent for TAP_HOLD_MS on pointerup, the transform needs it
// held 0.45 s, so a touch player could never become the beast; and the ring hid every locked Aspect while nothing on
// touch opens the Talents panel, so a touch player could never unlock one either (refute F9).
//
// Mutation-Proof: via scripts/dev/mutate.sh, one defect at a time against this file's tests, each observed RED unless
// marked. Task 2 (the roar hold and the F9 ring; subject src/ui/TouchControls.jsx unless named):
//   M1 plausible-wrong: the old 120 ms pulse moved to the press   M2 pointercancel not a release
//   M3 the press does not capture its pointer   M4 input going dead does not drop the hold
//   M5 the ring closing under the finger does not release   M6 plausible-wrong: the ring closes on the press
//   M7 plausible-wrong: the ring gated again (the old decision)
//   M8 plausible-wrong: a locked tap lets the intent through, as the desktop key does
//   M9 a locked tap does not yield touch focus   M10 tap-to-play shown over Talents
//   M11 a locked sector named as the bare Aspect   M12 plausible-wrong: no minimum pulse on the roar
//   M13 src/ui/touchTray.js: openTalents leaves Settings open
//   M0 identity (a comment edit) SURVIVED, as it must.
//
// BLIND SPOT: jsdom has no layout and no real pointer capture; whether a thumb on an iPad reaches these targets, and
// whether a held touch commits the beast form in the running game, is tests/e2e/touch-hold.spec.js.

vi.mock('../../src/input/touchDevice', async (orig) => ({
  ...(await orig()),
  isTouchDevice: () => true,
  isTouchUIMode: () => true,
}));

const ROAR = ASPECT_VERBS.find((a) => a.verb === 'roar');
const GRAB = ASPECT_VERBS.find((a) => a.verb === 'grab');
const roarSector = () => screen.getByTestId('touch-aspect-roar');
const openRing = () => fireEvent.pointerUp(screen.getByTestId('touch-aspects'));
const advance = (ms) => act(() => { vi.advanceTimersByTime(ms); });

let captured;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] });
  // jsdom implements no pointer capture; install a recorder so the press can be seen capturing its pointer.
  captured = [];
  Element.prototype.setPointerCapture = function setPointerCapture(id) { captured.push({ el: this, id }); };
  useGameStore.setState({ unlockedTalents: {} });
  setActive(true);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete Element.prototype.setPointerCapture;
  for (const a of ASPECT_VERBS) setIntent(a.verb, false);
  setActive(false);
});

const withRoar = (extra = {}) => useGameStore.setState({ unlockedTalents: { [ROAR.talent]: 1, ...extra } });

describe('the roar sector is press-and-hold', () => {
  it('a HOLD keeps the roar raised past the old 120 ms pulse, and the release clears it', () => {
    withRoar();
    render(<TouchControls isWorldBuilt />);
    openRing();
    expect(getInput().roar).toBe(false);
    fireEvent.pointerDown(roarSector(), { pointerId: 7 });
    expect(getInput().roar, 'the press did not raise the roar intent').toBe(true);
    advance(600); // the transform needs 450 ms held; the old pulse had dropped it at 120
    expect(getInput().roar, 'the roar dropped while the finger was still down').toBe(true);
    fireEvent.pointerUp(roarSector(), { pointerId: 7 });
    expect(getInput().roar, 'the release did not clear the roar').toBe(false);
  });

  it('a TAP is today\'s pulse: raised at the press, cleared TAP_HOLD_MS later — never shorter', () => {
    withRoar();
    render(<TouchControls isWorldBuilt />);
    openRing();
    fireEvent.pointerDown(roarSector(), { pointerId: 7 });
    advance(30);
    fireEvent.pointerUp(roarSector(), { pointerId: 7 });
    expect(getInput().roar, 'a 30 ms tap cleared before a once-per-frame consumer could see it').toBe(true);
    advance(TAP_HOLD_MS - 30 - 1);
    expect(getInput().roar).toBe(true);
    advance(1);
    expect(getInput().roar).toBe(false);
  });

  it('every way a touch can end releases the hold — cancel, lost capture, leave (3 of 3)', () => {
    const endings = ['pointerCancel', 'lostPointerCapture', 'pointerLeave'];
    let released = 0;
    for (const end of endings) {
      withRoar();
      setActive(true); // the previous iteration's unmount relinquished the gate (TouchControls cleanup)
      render(<TouchControls isWorldBuilt />);
      openRing();
      fireEvent.pointerDown(roarSector(), { pointerId: 7 });
      advance(600);
      expect(getInput().roar, `SETUP (${end}): the press did not hold`).toBe(true);
      fireEvent[end](roarSector(), { pointerId: 7 });
      expect(getInput().roar, `${end} left the roar held — a stuck charge`).toBe(false);
      released += 1;
      cleanup();
    }
    expect(released).toBe(endings.length);
  });

  it('the press captures its pointer, so a drifting thumb still releases on the sector', () => {
    withRoar();
    render(<TouchControls isWorldBuilt />);
    openRing();
    fireEvent.pointerDown(roarSector(), { pointerId: 42 });
    expect(captured.map((c) => c.id)).toEqual([42]);
    expect(captured[0].el).toBe(roarSector());
  });

  it('the ring stays open while held (the sector must not unmount under the finger) and closes on release', () => {
    withRoar();
    render(<TouchControls isWorldBuilt />);
    openRing();
    fireEvent.pointerDown(roarSector(), { pointerId: 7 });
    advance(600);
    expect(screen.queryByTestId('touch-aspect-roar'), 'the ring closed under a held finger').not.toBeNull();
    fireEvent.pointerUp(roarSector(), { pointerId: 7 });
    expect(screen.queryByTestId('touch-aspect-roar'), 'the ring stayed open after the roar').toBeNull();
  });

  it('input going dead mid-hold (pause, panel, death) drops the roar at once', () => {
    withRoar();
    render(<TouchControls isWorldBuilt />);
    openRing();
    fireEvent.pointerDown(roarSector(), { pointerId: 7 });
    advance(300);
    expect(getInput().roar).toBe(true);
    act(() => setActive(false));
    expect(getInput().roar, 'the roar stayed held with input dead — the next press would have no rising edge').toBe(false);
  });

  it('a second finger closing the ring mid-hold releases the roar', () => {
    withRoar();
    render(<TouchControls isWorldBuilt />);
    openRing();
    fireEvent.pointerDown(roarSector(), { pointerId: 7 });
    advance(600);
    expect(getInput().roar).toBe(true);
    openRing(); // the opener toggles the ring shut
    expect(getInput().roar, 'the sector unmounted under the finger and left the roar held').toBe(false);
  });

  it('the other unlocked sectors keep the tap pulse on release — they have no charge to hold', () => {
    withRoar({ [GRAB.talent]: 1 });
    render(<TouchControls isWorldBuilt />);
    openRing();
    fireEvent.pointerUp(screen.getByTestId('touch-aspect-grab'));
    expect(getInput().grab).toBe(true);
    advance(TAP_HOLD_MS);
    expect(getInput().grab).toBe(false);
  });
});

describe('F9 — every Aspect is offered; a locked one opens Talents', () => {
  it('with nothing unlocked the opener is offered and all four sectors render, each marked locked', () => {
    render(<TouchControls isWorldBuilt />);
    openRing();
    const sectors = ASPECT_VERBS.map((a) => screen.getByTestId(`touch-aspect-${a.verb}`));
    expect(sectors).toHaveLength(4);
    for (const s of sectors) expect(s).toHaveAttribute('data-locked', 'true');
  });

  it('a locked sector is named as locked for a screen reader, in both locales', () => {
    render(<TouchControls isWorldBuilt />);
    openRing();
    const label = roarSector().getAttribute('aria-label');
    expect(label).toBe(translate('a11y.aspectLocked', { aspect: ROAR.aspect }));
    expect(label).not.toBe(ROAR.aspect);
    expect(label).toContain(ROAR.aspect);
  });

  it('only the locked ones are marked — an unlocked sector is live (the presence for the marks above)', () => {
    withRoar();
    render(<TouchControls isWorldBuilt />);
    openRing();
    expect(roarSector()).toHaveAttribute('data-locked', 'false');
    expect(screen.getByTestId('touch-aspect-grab')).toHaveAttribute('data-locked', 'true');
  });

  it('tapping a locked sector opens Talents and yields touch focus, writing NO intent — while an unlocked tap does write', () => {
    useGameStore.setState({ unlockedTalents: { [GRAB.talent]: 1 } }); // grab live, roar locked
    const onOpenTalents = vi.fn();
    render(<TouchControls isWorldBuilt onOpenTalents={onOpenTalents} />);
    openRing();
    fireEvent.pointerUp(screen.getByTestId('touch-aspect-grab'));
    expect(getInput().grab, 'PRESENCE: the same instrument must see an unlocked tap write').toBe(true);
    openRing();
    fireEvent.pointerDown(roarSector(), { pointerId: 7 });
    expect(getInput().roar, 'a locked roar wrote its intent on the press').toBe(false);
    fireEvent.pointerUp(roarSector(), { pointerId: 7 });
    expect(getInput().roar, 'a locked roar wrote its intent on the release').toBe(false);
    expect(onOpenTalents).toHaveBeenCalledTimes(1);
    expect(getInput().active, 'the panel opened under a live touch surface — its taps would be routed into look').toBe(false);
  });

  it('tap-to-play is withheld while Talents is open, or it would sit over the panel', () => {
    act(() => setActive(false));
    const { rerender } = render(<TouchControls isWorldBuilt talentsOpen={false} />);
    expect(screen.queryByTestId('touch-tap-to-play'), 'PRESENCE: tap-to-play shows with no panel open').not.toBeNull();
    rerender(<TouchControls isWorldBuilt talentsOpen />);
    expect(screen.queryByTestId('touch-tap-to-play')).toBeNull();
  });
});

describe('openTalents — the touch form of the KeyU open branch', () => {
  it('closes every other panel, then opens Talents', () => {
    const calls = [];
    const store = Object.fromEntries(
      ['setShowInventory', 'setShowCrafting', 'setShowMagic', 'setShowBuildingTools', 'setShowSettings']
        .map((k) => [k, (v) => calls.push([k, v])]),
    );
    openTalents(store, {
      setShowAchievements: (v) => calls.push(['setShowAchievements', v]),
      setShowSpellUpgrades: (v) => calls.push(['setShowSpellUpgrades', v]),
    });
    expect(calls).toHaveLength(7);
    expect(calls.slice(0, 6).every(([, v]) => v === false)).toBe(true);
    expect(calls[6]).toEqual(['setShowSpellUpgrades', true]);
  });
});
