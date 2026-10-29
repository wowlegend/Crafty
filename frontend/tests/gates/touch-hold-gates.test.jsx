// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, createEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { setActive, getInput, setIntent } from '../../src/input/inputState.js';
import { ASPECT_VERBS, TAP_HOLD_MS } from '../../src/input/aspectWheel.js';
import { openTalents } from '../../src/ui/touchTray.js';
import { t as translate } from '../../src/i18n/i18n.js';
import { pressHeavy, releaseHeavy, cancelHeavy, isHeavyHeld, HEAVY_HOLD_MS, HEAVY_CHARGE_MS } from '../../src/game/heavyAttack.js';
import TouchControls from '../../src/ui/TouchControls.jsx';
import TouchControlsSurface from '../../src/ui/TouchControlsSurface.jsx';

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
// Task 3 (the held action button; subject src/ui/TouchControls.jsx unless named):
//   N1 plausible-wrong: the button swings at the press but never charges (performVerb, not pressPrimary)
//   N2 plausible-wrong: the press sent as 'mouse'   N3 the charge released on pointerup only
//   N4 the press does not capture its pointer   N5 plausible-wrong: the release sent as 'mouse'
//   N6 src/game/heavyAttack.js: releaseHeavy ignores which input holds the charge
//   N0 identity (a comment edit) SURVIVED, as it must.
// Task 4 (the charge rings; subject src/ui/TouchControlsSurface.jsx), all re-run against this file's final form:
//   F1 plausible-wrong: the roar ring fills whether or not the machine charges
//   F2 plausible-wrong: the heavy ring shows through the tap window (>= for >)
//   F3 plausible-wrong: the roar duration in the wrong unit (x100)   F4 the roar start never cleared on cancel
//   F5 the paint cache ignores which element it painted (SURVIVED the first draft, which re-mounted a ring mid-sweep;
//      the case now re-mounts it full, the one state a value-only cache gets wrong)
//   F6 the hidden state never written   F7 plausible-wrong: the ring on every unlocked sector
//   F0 identity (a comment edit) SURVIVED, as it must.
// Review fixes, 2026-10-27 (31 tests; subject src/ui/TouchControls.jsx unless named), each observed RED:
//   F4/H1 the ring-close release effect deleted   F4/H2 plausible-wrong: the opener toggles on the press
//   F6/P1g src/input/touchHold.js: a claim ignores an existing owner   F6/P3 plausible-wrong: the action lift frees any
//   finger   F6/P4 plausible-wrong: the roar lift ends the hold for any finger
//   F3/Q1 panelOpen ignores the store   F3/Q2 plausible-wrong: the old four-flag tray selector
//   F3/Q3 plausible-wrong: the panel THROWS the heavy (release) instead of cancelling it
//   F3/Q4 the roar sector takes a press with a panel open   F3/Q5 the action button does
//   F3/Q6 talentsOpen dropped   F3/Q7 otherPanelOpen dropped
//   F5/R1g src/input/touchHold.js: chargeRingDeg returns an object again   F5/R2 src/ui/TouchControlsSurface.jsx: the
//   painter's cache removed   I2 identity (a comment edit in TouchControls.jsx) SURVIVED, as it must.
// Review round 2, item 2 (35 tests; subject src/ui/TouchControls.jsx), each observed RED:
//   A1 the window blur listener removed   A2 the pagehide listener removed   A4 the visibilitychange listener removed
//   A3 plausible-wrong: ANY visibilitychange drops the holds (the page coming back cancelled a live charge)
//   A5 plausible-wrong: dropHolds cancels the heavy but keeps the claim (every later press refused)
//   A6 dropHolds leaves the roar's hold   A7 the input-dead effect ignores `active` (only a panel drops the holds)
//   A0 identity (a comment edit in TouchControls.jsx) SURVIVED, as it must.
// Review round 2, item 4 (the heavy's F3 case looped over the roar case's three openers; 35 tests), each observed RED,
// the heavy's loop among the red titles:
//   B1 talentsOpen dropped from panelOpen   B2 otherPanelOpen dropped   B3 the store's panels dropped
//   B4 the action button takes a press with a panel open (the heavy's loop alone)
//   B0 identity (a comment edit in TouchControls.jsx) SURVIVED, as it must.
// The input-time hold (2026-10-27, 36 tests; subject src/ui/TouchControls.jsx), each observed RED:
//   T1 the action press passes no timeStamp   T2 the action lift passes no timeStamp (both: "the press and every way a
//   touch can end hand the game the event's OWN time")   T0 identity (a comment edit) SURVIVED, as it must.
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
  useGameStore.setState({ showChestInterface: false });
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

  // REWRITTEN 2026-10-27 (review F4): this tap was IMPOSSIBLE when written — the ring's first sector sat on its own
  // opener, so no finger could reach the opener while the ring was open, and the "tap" was a bare pointerup with no
  // press and no pointer of its own. The fan now starts one step inward (tests/gates/touch-layout-gates.test.jsx asserts
  // no sector covers its opener in any viewport), and the second finger is modelled as a device delivers it: its own
  // pointerId, pointerType touch, a press and then a lift, while the first finger stays down on the sector.
  it('a second finger tapping the (uncovered) opener mid-hold closes the ring and releases the roar', () => {
    withRoar();
    render(<TouchControls isWorldBuilt />);
    openRing();
    fireEvent.pointerDown(roarSector(), { pointerId: 7, pointerType: 'touch' });
    advance(600);
    expect(getInput().roar).toBe(true);
    const opener = screen.getByTestId('touch-aspects');
    fireEvent.pointerDown(opener, { pointerId: 8, pointerType: 'touch' });
    advance(60);
    expect(getInput().roar, 'the second finger\'s PRESS on the opener ended the first finger\'s hold').toBe(true);
    fireEvent.pointerUp(opener, { pointerId: 8, pointerType: 'touch' }); // the opener toggles the ring shut on its lift
    expect(screen.queryByTestId('touch-aspect-roar'), 'SETUP: the opener did not close the ring').toBeNull();
    expect(getInput().roar, 'the sector unmounted under the finger and left the roar held').toBe(false);
  });

  it('with every Aspect locked, the opener closes the ring WITHOUT opening Talents (F4: the ring is no trap)', () => {
    const onOpenTalents = vi.fn();
    render(<TouchControls isWorldBuilt onOpenTalents={onOpenTalents} />);
    openRing();
    expect(roarSector(), 'PRESENCE: the ring opened').toHaveAttribute('data-locked', 'true');
    openRing();
    expect(screen.queryByTestId('touch-aspect-roar'), 'the opener did not close the ring').toBeNull();
    expect(onOpenTalents).not.toHaveBeenCalled();
    expect(getInput().active, 'closing the ring dropped touch focus').toBe(true);
  });

  // REVIEW F6: the hold was GLOBAL — any pointer's press restarted it and any pointer's lift ended it, so a second finger
  // brushing the sector cancelled the first finger's charge (the transform cancels the frame its intent drops).
  it('F6: a second finger on the sector neither restarts nor ends the first finger\'s hold', () => {
    withRoar();
    render(<TouchControls isWorldBuilt />);
    openRing();
    fireEvent.pointerDown(roarSector(), { pointerId: 7, pointerType: 'touch' });
    advance(200);
    fireEvent.pointerDown(roarSector(), { pointerId: 8, pointerType: 'touch' });
    expect(captured.map((c) => c.id), 'the second finger captured the sector it does not own').toEqual([7]);
    advance(60);
    fireEvent.pointerUp(roarSector(), { pointerId: 8, pointerType: 'touch' });
    expect(getInput().roar, 'the second finger\'s lift ended the first finger\'s roar').toBe(true);
    expect(screen.queryByTestId('touch-aspect-roar'), 'the second finger\'s lift closed the ring under the first').not.toBeNull();
    advance(300);
    expect(getInput().roar).toBe(true);
    fireEvent.pointerUp(roarSector(), { pointerId: 7, pointerType: 'touch' });
    expect(getInput().roar, 'PRESENCE: the owning finger\'s lift must end it').toBe(false);
  });

  // REVIEW F3: a panel opened by the WORLD (a chest, through the interact verb) leaves `active` true on touch — there is
  // no pointer lock to lose — so a roar held across it kept charging and committed the form behind the panel.
  it('F3: any panel opening mid-hold drops the roar at once, with input still live — store, Talents and App-local (3 of 3)', () => {
    const openers = [
      ['the chest (a store flag)', () => act(() => useGameStore.setState({ showChestInterface: true }))],
      ['Talents (App-local)', (rerender) => rerender(<TouchControls isWorldBuilt talentsOpen />)],
      ['Achievements / Stats (App-local)', (rerender) => rerender(<TouchControls isWorldBuilt otherPanelOpen />)],
    ];
    let dropped = 0;
    for (const [name, open] of openers) {
      withRoar();
      setActive(true);
      const { rerender } = render(<TouchControls isWorldBuilt />);
      openRing();
      fireEvent.pointerDown(roarSector(), { pointerId: 7, pointerType: 'touch' });
      advance(300);
      expect(getInput().roar, `SETUP (${name}): the press did not hold`).toBe(true);
      open(rerender);
      expect(getInput().active, `SETUP (${name}): input went dead — this case is the panel that keeps it live`).toBe(true);
      expect(getInput().roar, `${name} opened under a held roar and the roar kept charging`).toBe(false);
      fireEvent.pointerUp(roarSector(), { pointerId: 7, pointerType: 'touch' });
      fireEvent.pointerDown(roarSector(), { pointerId: 9, pointerType: 'touch' });
      expect(getInput().roar, `with ${name} open, a fresh press on the sector raised the roar`).toBe(false);
      dropped += 1;
      cleanup();
      useGameStore.setState({ showChestInterface: false });
    }
    expect(dropped).toBe(openers.length);
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

// The action button talks to the game only through the store seams Components publishes beside performVerb
// (pressPrimary / releasePrimary). They are stand-ins here that RECORD each call, because the real ones live inside the
// R3F Player and cannot run in jsdom: this proves the overlay's half of the seam. The game's half — the press swinging
// the light attack and charging, the release throwing the heavy — is tests/e2e/touch-hold.spec.js (and, for the mouse
// on the same function, tests/e2e/heavy-melee.spec.js).
describe('the action button is press-and-hold: the light swing at the press, the heavy on the release', () => {
  let calls;
  beforeEach(() => {
    calls = [];
    useGameStore.setState({
      pressPrimary: (button, source) => { calls.push(['press', button, source]); return 'attack'; },
      releasePrimary: (source) => { calls.push(['release', source]); },
      performVerb: (button) => { calls.push(['performVerb', button]); return 'attack'; },
    });
  });
  afterEach(() => {
    useGameStore.setState({ pressPrimary: null, releasePrimary: null, performVerb: null });
    cancelHeavy();
  });
  const action = () => screen.getByTestId('touch-action');

  it('the press calls pressPrimary(0, "touch") AT ONCE — the light swing is never delayed to the release', () => {
    render(<TouchControls isWorldBuilt />);
    fireEvent.pointerDown(action(), { pointerId: 3 });
    expect(calls, 'the press reached nothing, or reached it late').toEqual([['press', 0, 'touch']]);
    fireEvent.pointerUp(action(), { pointerId: 3 });
    expect(calls[1]).toEqual(['release', 'touch']);
    expect(calls.some(([k]) => k === 'performVerb'), 'the lift dispatched a verb — the old pointerup wiring').toBe(false);
  });

  it('a TAP is still exactly one press — one light swing — whatever lift events follow it', () => {
    render(<TouchControls isWorldBuilt />);
    fireEvent.pointerDown(action(), { pointerId: 3 });
    fireEvent.pointerUp(action(), { pointerId: 3 });
    fireEvent.lostPointerCapture(action(), { pointerId: 3 });
    fireEvent.pointerLeave(action(), { pointerId: 3 });
    expect(calls.filter(([k]) => k === 'press')).toHaveLength(1);
    expect(calls.filter(([k]) => k === 'release').every(([, s]) => s === 'touch')).toBe(true);
  });

  it('every way a touch can end releases the charge as "touch" — up, cancel, lost capture, leave (4 of 4)', () => {
    const endings = ['pointerUp', 'pointerCancel', 'lostPointerCapture', 'pointerLeave'];
    let released = 0;
    for (const end of endings) {
      setActive(true); // the previous iteration's unmount relinquished the gate
      render(<TouchControls isWorldBuilt />);
      calls.length = 0;
      fireEvent.pointerDown(action(), { pointerId: 3 });
      fireEvent[end](action(), { pointerId: 3 });
      expect(calls, `${end} did not release the touch charge — a stuck heavy that slows the walk`).toEqual([['press', 0, 'touch'], ['release', 'touch']]);
      released += 1;
      cleanup();
    }
    expect(released).toBe(endings.length);
  });

  // A lift that came 40 ms after its press but was HANDLED seconds later read as a charged hold and threw a heavy
  // (tests/e2e/touch-hold.spec.js, the late lift). The overlay hands the game each event's own time (`timeStamp`) beside
  // the source, and heavyAttack reads the hold on it (tests/gates/heavy-melee-gates.test.js).
  it('the press and every way a touch can end hand the game the event\'s OWN time, not the handler\'s (4 of 4)', () => {
    const stamped = (kind, ts, init) => {
      // React builds onPointerLeave from the native pointerout (fireEvent.pointerLeave aliases to it); a raw
      // pointerleave event never reaches the handler, so the stamped leave is dispatched as the event React reads.
      const ev = createEvent[kind === 'pointerLeave' ? 'pointerOut' : kind](action(), init);
      Object.defineProperty(ev, 'timeStamp', { value: ts }); // a real event's time, as the browser stamps it
      fireEvent(action(), ev);
    };
    const endings = ['pointerUp', 'pointerCancel', 'lostPointerCapture', 'pointerLeave'];
    let stampedEnds = 0;
    for (const end of endings) {
      setActive(true);
      calls.length = 0;
      useGameStore.setState({
        pressPrimary: (button, source, at) => { calls.push(['press', button, source, at]); return 'attack'; },
        releasePrimary: (source, at) => { calls.push(['release', source, at]); },
      });
      render(<TouchControls isWorldBuilt />);
      stamped('pointerDown', 1234.5, { pointerId: 3, pointerType: 'touch' });
      stamped(end, 1274.5, { pointerId: 3, pointerType: 'touch' });
      expect(calls, `${end}: the press or the lift reached the game without its own time`)
        .toEqual([['press', 0, 'touch', 1234.5], ['release', 'touch', 1274.5]]);
      stampedEnds += 1;
      cleanup();
    }
    expect(stampedEnds).toBe(endings.length);
  });

  it('the press captures its pointer, so a drifting thumb still releases on the button', () => {
    render(<TouchControls isWorldBuilt />);
    fireEvent.pointerDown(action(), { pointerId: 9 });
    expect(captured.map((c) => c.id)).toEqual([9]);
    expect(captured[0].el).toBe(action());
  });

  it('F6: a second finger on the action button neither swings again nor ends the first finger\'s charge', () => {
    render(<TouchControls isWorldBuilt />);
    fireEvent.pointerDown(action(), { pointerId: 3, pointerType: 'touch' });
    fireEvent.pointerDown(action(), { pointerId: 4, pointerType: 'touch' });
    fireEvent.pointerUp(action(), { pointerId: 4, pointerType: 'touch' });
    fireEvent.pointerLeave(action(), { pointerId: 4, pointerType: 'touch' });
    expect(calls, 'the second finger pressed or released the first finger\'s primary').toEqual([['press', 0, 'touch']]);
    fireEvent.pointerUp(action(), { pointerId: 3, pointerType: 'touch' });
    expect(calls, 'PRESENCE: the owning finger\'s lift must release it').toEqual([['press', 0, 'touch'], ['release', 'touch']]);
  });

  // Review round 2, item 4: this case used to open only the store's chest. The three openers are the same three the roar
  // case above loops over — the store flag, the App-local Talents flag and the App-local Achievements / Stats flag — since
  // each reaches `panelOpen` by a different path, and dropping any one of them leaves a heavy charging behind its panel.
  it('F3: any panel opening mid-charge CANCELS the heavy (never throws it), and the button refuses a press while it is open (3 of 3)', () => {
    const openers = [
      ['the chest (a store flag)', () => act(() => useGameStore.setState({ showChestInterface: true })),
        () => act(() => useGameStore.setState({ showChestInterface: false }))],
      ['Talents (App-local)', (rerender) => rerender(<TouchControls isWorldBuilt talentsOpen />),
        (rerender) => rerender(<TouchControls isWorldBuilt />)],
      ['Achievements / Stats (App-local)', (rerender) => rerender(<TouchControls isWorldBuilt otherPanelOpen />),
        (rerender) => rerender(<TouchControls isWorldBuilt />)],
    ];
    let cancelled = 0;
    for (const [name, open, close] of openers) {
      setActive(true);
      calls.length = 0;
      // The press stand-in charges the real heavyAttack module, as Components' pressPrimary does for 'touch'.
      useGameStore.setState({ pressPrimary: (button, source) => { calls.push(['press', button, source]); pressHeavy(performance.now(), source); return 'attack'; } });
      const { rerender } = render(<TouchControls isWorldBuilt />);
      fireEvent.pointerDown(action(), { pointerId: 3, pointerType: 'touch' });
      advance(HEAVY_HOLD_MS + 100);
      expect(isHeavyHeld(), `SETUP (${name}): the press did not charge`).toBe(true);
      open(rerender);
      expect(getInput().active, `SETUP (${name}): input went dead — this case is the panel that keeps it live`).toBe(true);
      expect(isHeavyHeld(), `${name} opened under a held heavy and the charge survived`).toBe(false);
      fireEvent.pointerUp(action(), { pointerId: 3, pointerType: 'touch' });
      expect(calls.filter(([k]) => k === 'release'), `the lift after ${name} cancelled the heavy released (threw) it`).toEqual([]);
      fireEvent.pointerDown(action(), { pointerId: 5, pointerType: 'touch' });
      expect(calls.filter(([k]) => k === 'press'), `a press went through with ${name} open`).toHaveLength(1);
      close(rerender);
      fireEvent.pointerDown(action(), { pointerId: 6, pointerType: 'touch' });
      expect(calls.filter(([k]) => k === 'press'), `PRESENCE: with ${name} closed the button presses again`).toHaveLength(2);
      cancelled += 1;
      cleanup();
      cancelHeavy();
      useGameStore.setState({ showChestInterface: false });
    }
    expect(cancelled).toBe(openers.length);
  });

  // REVIEW ROUND 2: input going dead (pause, death) UNMOUNTS the action button under the finger, so its lift can never
  // arrive. The charge must be cancelled and the claim forgotten, or after resume every press is refused.
  it('input going dead mid-charge cancels the heavy and frees the claim: after resume a new finger presses again', () => {
    useGameStore.setState({ pressPrimary: (button, source) => { calls.push(['press', button, source]); pressHeavy(performance.now(), source); return 'attack'; } });
    render(<TouchControls isWorldBuilt />);
    fireEvent.pointerDown(action(), { pointerId: 3, pointerType: 'touch' });
    advance(HEAVY_HOLD_MS + 100);
    expect(isHeavyHeld(), 'SETUP: the press did not charge').toBe(true);
    act(() => setActive(false));
    expect(screen.queryByTestId('touch-action'), 'SETUP: input went dead and the button stayed mounted').toBeNull();
    expect(isHeavyHeld(), 'input went dead under a held heavy and the charge survived').toBe(false);
    expect(calls.filter(([k]) => k === 'release'), 'the dead input released (threw) the heavy').toEqual([]);
    act(() => setActive(true));
    fireEvent.pointerDown(action(), { pointerId: 4, pointerType: 'touch' });
    expect(calls.filter(([k]) => k === 'press'), 'after resume the button refused a new finger — the dead claim is still held').toHaveLength(2);
  });

  // REVIEW ROUND 2: the page losing focus or going away takes the finger with no lift. Each of the three must cancel the
  // heavy and free the claim, AND drop the roar's hold: blurReset clears the roar intent but not the hold's claim, so a
  // sector whose claim survived refused every later press. A visibilitychange to VISIBLE is the control: it drops nothing.
  const pageEvents = [
    ['window blur', () => window.dispatchEvent(new Event('blur'))],
    ['pagehide', () => window.dispatchEvent(new Event('pagehide'))],
    ['visibilitychange (hidden)', () => { setVisibility('hidden'); document.dispatchEvent(new Event('visibilitychange')); }],
  ];
  const setVisibility = (v) => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
  afterEach(() => { delete document.visibilityState; });

  it('the page losing focus or going away mid-charge cancels the heavy and frees the claim (3 of 3)', () => {
    let checked = 0;
    for (const [name, leave] of pageEvents) {
      setActive(true);
      calls.length = 0;
      useGameStore.setState({ pressPrimary: (button, source) => { calls.push(['press', button, source]); pressHeavy(performance.now(), source); return 'attack'; } });
      render(<TouchControls isWorldBuilt />);
      fireEvent.pointerDown(action(), { pointerId: 3, pointerType: 'touch' });
      advance(HEAVY_HOLD_MS + 100);
      expect(isHeavyHeld(), `SETUP (${name}): the press did not charge`).toBe(true);
      act(leave);
      expect(isHeavyHeld(), `${name} left the heavy charging with no finger down`).toBe(false);
      expect(calls.filter(([k]) => k === 'release'), `${name} released (threw) the heavy`).toEqual([]);
      fireEvent.pointerDown(action(), { pointerId: 4, pointerType: 'touch' });
      expect(calls.filter(([k]) => k === 'press'), `after ${name} the button refused a new finger — the claim is still held`).toHaveLength(2);
      checked += 1;
      cleanup();
      cancelHeavy();
      delete document.visibilityState;
    }
    expect(checked).toBe(pageEvents.length);
  });

  it('the page losing focus or going away mid-hold drops the roar and frees the sector (3 of 3)', () => {
    let checked = 0;
    for (const [name, leave] of pageEvents) {
      setActive(true);
      withRoar();
      render(<TouchControls isWorldBuilt />);
      openRing();
      fireEvent.pointerDown(roarSector(), { pointerId: 7, pointerType: 'touch' });
      advance(300);
      expect(getInput().roar, `SETUP (${name}): the press did not hold`).toBe(true);
      act(leave);
      expect(getInput().roar, `${name} left the roar held`).toBe(false);
      fireEvent.pointerDown(roarSector(), { pointerId: 9, pointerType: 'touch' });
      expect(getInput().roar, `after ${name} the sector refused a new finger — the hold's claim is still held`).toBe(true);
      fireEvent.pointerUp(roarSector(), { pointerId: 9, pointerType: 'touch' });
      advance(TAP_HOLD_MS);
      checked += 1;
      cleanup();
      delete document.visibilityState;
    }
    expect(checked).toBe(pageEvents.length);
  });

  it('a visibilitychange to VISIBLE drops nothing (the control for the hidden case)', () => {
    useGameStore.setState({ pressPrimary: (button, source) => { calls.push(['press', button, source]); pressHeavy(performance.now(), source); return 'attack'; } });
    render(<TouchControls isWorldBuilt />);
    fireEvent.pointerDown(action(), { pointerId: 3, pointerType: 'touch' });
    advance(HEAVY_HOLD_MS + 100);
    act(() => { setVisibility('visible'); document.dispatchEvent(new Event('visibilitychange')); });
    expect(isHeavyHeld(), 'the page coming BACK cancelled a live charge').toBe(true);
    fireEvent.pointerUp(action(), { pointerId: 3, pointerType: 'touch' });
    expect(calls.filter(([k]) => k === 'release'), 'PRESENCE: the owning finger still releases it').toHaveLength(1);
  });

  it('a "touch" charge is ended only by the "touch" release — a compat mouseup from another finger cannot take it', () => {
    const t0 = 1000;
    const ready = t0 + HEAVY_HOLD_MS + HEAVY_CHARGE_MS;
    pressHeavy(t0, 'touch');
    expect(releaseHeavy(ready + 5, 'mouse'), 'a mouse release ended the touch charge').toBe(false);
    expect(isHeavyHeld()).toBe(true);
    expect(releaseHeavy(ready + 10, 'touch'), 'the touch release lost its heavy').toBe(true);
  });
});

// The rings are written by TouchControlsSurface's existing rAF tick (Game-Loop Isolation: transient reads, DOM writes,
// no per-frame React state). The fake clock drives that tick, so these read what the tick actually painted.
describe('the radial charge rings read the TRUE charge, never the touch', () => {
  // The sweep angle from the conic-gradient the tick wrote: the number after the colour's closing paren.
  const sweepDeg = (el) => {
    const m = /\)\s(\d+)deg/.exec(el.style.background || '');
    return m ? Number(m[1]) : null;
  };
  afterEach(() => {
    useGameStore.setState({ beastCharging: false });
    cancelHeavy();
  });

  it('the roar ring follows the state machine\'s charge: hidden, half-way, full at ANTICIPATION_SEC, gone on cancel', () => {
    withRoar();
    render(<TouchControlsSurface wheelOpen />);
    const ring = screen.getByTestId('touch-charge-roar');
    advance(48);
    expect(ring.style.opacity, 'the ring shows with no charge').toBe('0');
    act(() => useGameStore.setState({ beastCharging: true }));
    advance(16); // the tick stamps the charge on the frame it first sees it
    advance(224); // ~half of 450 ms, give or take a frame
    expect(ring.style.opacity).toBe('1');
    const half = sweepDeg(ring);
    expect(half, `half-way through the charge the ring swept ${half} deg`).toBeGreaterThan(150);
    expect(half).toBeLessThan(215);
    advance(400);
    expect(sweepDeg(ring), 'the ring is not full once the charge has run').toBe(360);
    act(() => useGameStore.setState({ beastCharging: false }));
    advance(16);
    expect(ring.style.opacity, 'a cancelled charge left the ring up').toBe('0');
  });

  it('a roar the state machine REFUSED draws nothing, however long the sector is held — then the same ring CAN light', () => {
    withRoar();
    render(<TouchControlsSurface wheelOpen />);
    const ring = screen.getByTestId('touch-charge-roar');
    act(() => setIntent('roar', true)); // the finger is down on the sector, but no bank: the machine never charges
    advance(600);
    expect(ring.style.opacity, 'the ring filled for a roar the state machine refused').toBe('0');
    act(() => useGameStore.setState({ beastCharging: true }));
    advance(32);
    expect(ring.style.opacity, 'PRESENCE: the same ring must light when the machine does charge').toBe('1');
  });

  // The ring is re-mounted while FULL on purpose: mid-sweep the angle changes every frame, so a reopened ring would be
  // repainted whatever the paint cache did. A full ring paints the same value frame after frame — the one state in
  // which a cache keyed only by value would leave the new element blank (found by mutant F5 surviving the first draft).
  it('a ring re-mounted while full (the ring reopened) is painted again', () => {
    withRoar();
    const { rerender } = render(<TouchControlsSurface wheelOpen />);
    act(() => useGameStore.setState({ beastCharging: true }));
    advance(600);
    expect(sweepDeg(screen.getByTestId('touch-charge-roar')), 'SETUP: the ring is not full').toBe(360);
    rerender(<TouchControlsSurface wheelOpen={false} />);
    advance(16);
    rerender(<TouchControlsSurface wheelOpen />);
    advance(16);
    expect(screen.getByTestId('touch-charge-roar').style.opacity, 'the reopened ring was never painted').toBe('1');
  });

  // REVIEW F5: the tick allocated a style object, its template string and a key string per ring per frame. A heap
  // allocation cannot be observed from a test, so this asserts the property that the allocation-free painter has and
  // the old one lacked under a per-frame object key: a ring at rest is written NOTHING, frame after frame.
  it('F5: a full ring at rest is written nothing for 60 frames; a change is written at once (the presence)', () => {
    withRoar();
    render(<TouchControlsSurface wheelOpen />);
    const ring = screen.getByTestId('touch-charge-roar');
    act(() => useGameStore.setState({ beastCharging: true }));
    advance(600);
    expect(sweepDeg(ring), 'SETUP: the ring is not full').toBe(360);
    let writes = 0;
    for (const prop of ['opacity', 'background']) {
      Object.defineProperty(ring.style, prop, {
        configurable: true,
        get() { return this.getPropertyValue(prop); },
        set(v) { writes += 1; this.setProperty(prop, v); },
      });
    }
    advance(16 * 60);
    expect(writes, `a ring at rest was written ${writes} times in 60 frames`).toBe(0);
    act(() => useGameStore.setState({ beastCharging: false }));
    advance(16);
    expect(writes, 'PRESENCE: the cancel was never written — the instrument is blind').toBeGreaterThan(0);
  });

  it('the heavy ring follows heavyAttack\'s charge: nothing through a tap, half-way, full when ready, gone on cancel', () => {
    render(<TouchControlsSurface />);
    const ring = screen.getByTestId('touch-charge-heavy');
    pressHeavy(performance.now(), 'touch');
    advance(HEAVY_HOLD_MS - 40);
    expect(ring.style.opacity, 'a tap flashed the heavy ring').toBe('0');
    advance(40 + HEAVY_CHARGE_MS / 2);
    expect(ring.style.opacity).toBe('1');
    const mid = sweepDeg(ring);
    expect(mid, `half-way through the heavy's charge the ring swept ${mid} deg`).toBeGreaterThan(150);
    expect(mid).toBeLessThan(215);
    advance(HEAVY_CHARGE_MS);
    expect(sweepDeg(ring)).toBe(360);
    cancelHeavy();
    advance(16);
    expect(ring.style.opacity, 'a cancelled heavy left the ring up').toBe('0');
  });

  it('with every Aspect unlocked there is exactly ONE roar ring, and it sits inside the roar sector\'s glyph', () => {
    useGameStore.setState({ unlockedTalents: Object.fromEntries(ASPECT_VERBS.map((a) => [a.talent, 1])) });
    render(<TouchControlsSurface wheelOpen />);
    const rings = screen.getAllByTestId('touch-charge-roar');
    expect(rings).toHaveLength(1);
    expect(screen.getByTestId('aspect-glyph-roar').contains(rings[0])).toBe(true);
  });

  it('a locked roar draws a lock and no ring; an unlocked one draws its ring (the presence)', () => {
    render(<TouchControlsSurface wheelOpen />);
    expect(screen.getByTestId('aspect-glyph-roar')).toHaveAttribute('data-locked', 'true');
    expect(screen.queryByTestId('touch-charge-roar')).toBeNull();
    cleanup();
    withRoar();
    render(<TouchControlsSurface wheelOpen />);
    expect(screen.getByTestId('aspect-glyph-roar')).toHaveAttribute('data-locked', 'false');
    expect(screen.getByTestId('touch-charge-roar')).toBeInTheDocument();
  });
});

describe('openTalents — the touch form of the KeyU open branch', () => {
  it('closes every other panel, then opens Talents', () => {
    const calls = [];
    const store = Object.fromEntries(
      ['setShowInventory', 'setShowForge', 'setShowMagic', 'setShowBuildingTools', 'setShowSettings']
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
