// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeCompatMouseFilter, installCompatMouseFilter, makeMouseHandlers, installPrimaryMouse, COMPAT_MOUSE_WINDOW_MS } from './compatMouse.js';

// compatMouse.js — review F2: a touch tap's compatibility mousedown reached the game's window `mousedown` listener and
// pressed the primary a second time (one tap on the action button swung twice; a tap on any touch control swung, mined
// or placed). The filter tells the echo from a real mouse. The clock is injected, so every window edge is exact.
//
// Mutation-Proof: via scripts/dev/mutate.sh against src/input/compatMouse.js, each observed RED unless marked (each run is
// in the commit that added it). F2 (8 tests then):
//   C1 isCompat always false (no dedupe)   C2 plausible-wrong: `<=` -> a window that never closes (`< Infinity`)
//   C3 plausible-wrong: the window timed from the FIRST touch, not the last (noteTouch only when never set)
//   C4 sourceCapabilities ignored   C5 install does not listen to touchend (the echo follows the lift)
//   C6 plausible-wrong: a mouse-type pointer event counted as a touch   C7 the cleanup leaves the listeners on
//   C0 identity (a comment edit) SURVIVED, as it must.
// Review round 2 (the opener matrix; the handler pair and its latch; the installed wiring):
//   K1 install does not listen to pointerup   K2 install does not listen to pointercancel
//   K3 plausible-wrong: only pointerType 'touch' opens the window (a pen's echo is a real click)
//   K4 makeMouseHandlers: a compat mousedown pressed anyway (the filter bypassed: F2 itself)
//   K5 plausible-wrong: the mouseup classified on its own again (the hybrid device's real release dropped)
//   K6 plausible-wrong: the latch is never cleared (a stale verdict decides the next unmatched mouseup)
//   K11 plausible-wrong: a mouseup spends EVERY button's latch (a right-button release erases the left press's verdict)
//   K7 plausible-wrong: the drops counted in one total (a mouseup echo alone satisfies the e2e)
//   K8 installPrimaryMouse: the mousedown listener bound to the unfiltered press (the Components-level F2 regression)
//   K9 installPrimaryMouse: the compat filter's touch listeners never installed
//   K10 installPrimaryMouse: remove() leaves the mousedown listener on
//   K0 identity (a comment edit) SURVIVED, as it must.
//
// BLIND SPOT: installPrimaryMouse is the whole DOM wiring, driven here by real window events. That Components.jsx CALLS
// it (rather than binding its own unfiltered listener beside it) is tests/e2e/touch-hold.spec.js (F2), which taps the
// real action button and reads the presses per source and the drops per type through the dev test bridge.

function rig() {
  let t = 5000;
  const f = makeCompatMouseFilter({ now: () => t });
  return { f, now: () => t, advance: (ms) => { t += ms; } };
}
const mouse = (extra = {}) => ({ type: 'mousedown', button: 0, ...extra });

describe('the compat-mouse filter', () => {
  let r;
  beforeEach(() => { r = rig(); });

  it('a mouse press with no touch ever seen is REAL (a mouse-only desktop is never filtered)', () => {
    expect(r.f.isCompat(mouse())).toBe(false);
    r.advance(10 * 60 * 1000);
    expect(r.f.isCompat(mouse())).toBe(false);
  });

  it('a mouse press inside the window after a touch is its ECHO; at the window\'s edge it is real again', () => {
    r.f.noteTouch();
    r.advance(30);
    expect(r.f.isCompat(mouse()), 'the compat mousedown right after a tap was taken for a real click').toBe(true);
    r.advance(COMPAT_MOUSE_WINDOW_MS - 30 - 1);
    expect(r.f.isCompat(mouse())).toBe(true);
    r.advance(1);
    expect(r.f.isCompat(mouse()), 'the window never closed — a real mouse after a touch is dead forever').toBe(false);
  });

  it('the window runs from the touch\'s LAST event (the lift), not its first — a long hold is still deduped', () => {
    r.f.noteTouch(); // touchstart
    r.advance(COMPAT_MOUSE_WINDOW_MS + 500); // a hold far longer than the window
    r.f.noteTouch(); // touchend
    r.advance(20);
    expect(r.f.isCompat(mouse()), 'the echo after a long hold was taken for a real click').toBe(true);
  });

  it('a mouse event the browser names as touch-born is an echo whatever the clock says', () => {
    r.advance(60 * 1000);
    expect(r.f.isCompat(mouse({ sourceCapabilities: { firesTouchEvents: true } }))).toBe(true);
    expect(r.f.isCompat(mouse({ sourceCapabilities: { firesTouchEvents: false } }))).toBe(false);
  });
});

describe('installCompatMouseFilter — every touch on the target feeds the filter', () => {
  let r;
  let remove;
  beforeEach(() => { r = rig(); });
  afterEach(() => { remove?.(); remove = undefined; });

  const fire = (type, init = {}) => {
    const e = new Event(type, { bubbles: true });
    Object.assign(e, init);
    window.dispatchEvent(e);
  };

  it('touchstart, touchend and touchcancel each open the window (3 of 3)', () => {
    remove = installCompatMouseFilter(r.f, window);
    let seen = 0;
    for (const type of ['touchstart', 'touchend', 'touchcancel']) {
      r.advance(COMPAT_MOUSE_WINDOW_MS * 2);
      expect(r.f.isCompat(mouse()), `SETUP (${type}): the window was already open`).toBe(false);
      fire(type);
      expect(r.f.isCompat(mouse()), `${type} did not open the window`).toBe(true);
      seen += 1;
    }
    expect(seen).toBe(3);
  });

  // Review round 2: only pointerdown was ever tested. A pen has no touch events at all, so for a pen the pointer events
  // are the ONLY openers, and its echo follows the LIFT (pointerup), or a cancel.
  it('pointerdown, pointerup and pointercancel each open the window, for a touch and for a pen (6 of 6)', () => {
    remove = installCompatMouseFilter(r.f, window);
    let seen = 0;
    for (const pointerType of ['touch', 'pen']) {
      for (const type of ['pointerdown', 'pointerup', 'pointercancel']) {
        r.advance(COMPAT_MOUSE_WINDOW_MS * 2);
        expect(r.f.isCompat(mouse()), `SETUP (${pointerType} ${type}): the window was already open`).toBe(false);
        fire(type, { pointerType });
        expect(r.f.isCompat(mouse()), `a ${pointerType} ${type} did not open the window`).toBe(true);
        seen += 1;
      }
    }
    expect(seen).toBe(6);
  });

  it('a pen held past the window: its pointerdown\'s window has closed, and the pointerup ALONE reopens it', () => {
    remove = installCompatMouseFilter(r.f, window);
    fire('pointerdown', { pointerType: 'pen' });
    r.advance(COMPAT_MOUSE_WINDOW_MS + 500);
    expect(r.f.isCompat(mouse()), 'SETUP: the press\'s window is still open — this case cannot isolate the lift').toBe(false);
    fire('pointerup', { pointerType: 'pen' });
    r.advance(20);
    expect(r.f.isCompat(mouse()), 'the echo after a long pen press was taken for a real click').toBe(true);
  });

  it('a MOUSE pointer opens nothing, on any of the three (or every real click would mute the next)', () => {
    remove = installCompatMouseFilter(r.f, window);
    for (const type of ['pointerdown', 'pointerup', 'pointercancel']) fire(type, { pointerType: 'mouse' });
    expect(r.f.isCompat(mouse()), 'a mouse pointer was counted as a touch').toBe(false);
    fire('pointerdown', { pointerType: 'pen' });
    expect(r.f.isCompat(mouse()), 'PRESENCE: a pen pointer must open the window').toBe(true);
  });

  it('the cleanup removes every listener', () => {
    installCompatMouseFilter(r.f, window)();
    fire('touchend');
    fire('pointerup', { pointerType: 'touch' });
    expect(r.f.isCompat(mouse())).toBe(false);
  });
});

// The handler pair Components installs (through installPrimaryMouse). Stand-ins RECORD every press and release.
describe('makeMouseHandlers — an echo never reaches the primary; a mouseup takes its mousedown\'s verdict', () => {
  let r;
  let calls;
  let h;
  beforeEach(() => {
    r = rig();
    calls = [];
    h = makeMouseHandlers(r.f, (button, source) => calls.push(['press', button, source]), (source) => calls.push(['release', source]));
  });
  const down = (button = 0) => h.onMouseDown(mouse({ button }));
  const up = (button = 0) => h.onMouseUp(mouse({ type: 'mouseup', button }));

  it('a compat mousedown never reaches pressPrimary; a real one does, as "mouse", with its button (the presence)', () => {
    r.f.noteTouch();
    r.advance(30);
    down(0);
    up(0);
    expect(calls, 'a touch tap\'s compat mousedown / mouseup pressed or released the primary — the F2 double press').toEqual([]);
    r.advance(COMPAT_MOUSE_WINDOW_MS * 2);
    down(2);
    down(0);
    up(0);
    expect(calls).toEqual([['press', 2, 'mouse'], ['press', 0, 'mouse'], ['release', 'mouse']]);
  });

  // Review round 2 (hybrid device): a finger touches the screen WHILE the real mouse button is held. Classified on its
  // own, the real mouseup fell inside that touch's window and was dropped, so the heavy the real press began never threw.
  it('a REAL press keeps its verdict to the release, even with a touch inside the hold', () => {
    down(0);
    r.advance(400);
    r.f.noteTouch(); // a finger on the screen mid-hold
    r.advance(30);
    expect(r.f.isCompat(mouse()), 'SETUP: the touch did not open the window — this case cannot discriminate').toBe(true);
    up(0);
    expect(calls, 'the real release was dropped as an echo because a touch landed during the hold').toEqual([['press', 0, 'mouse'], ['release', 'mouse']]);
  });

  it('an ECHO press keeps its verdict to the release, even after the window has closed', () => {
    r.f.noteTouch();
    down(0);
    r.advance(COMPAT_MOUSE_WINDOW_MS * 2);
    expect(r.f.isCompat(mouse()), 'SETUP: the window is still open — this case cannot discriminate').toBe(false);
    up(0);
    expect(calls, 'the echo\'s own mouseup released the heavy as a real mouse').toEqual([]);
  });

  it('the latch is spent by its mouseup: an unmatched mouseup later is classified on its own', () => {
    r.f.noteTouch();
    down(0);
    up(0); // the echo pair: latched echo, spent
    r.advance(COMPAT_MOUSE_WINDOW_MS * 2);
    up(0); // no mousedown seen for this one (pressed before install, or off the window)
    expect(calls, 'a stale echo verdict swallowed a later real release').toEqual([['release', 'mouse']]);
  });

  it('a mouseup of another button releases nothing, and spends only its own latch', () => {
    down(0);
    down(2);
    up(2);
    expect(calls).toEqual([['press', 0, 'mouse'], ['press', 2, 'mouse']]);
    r.f.noteTouch();
    up(0); // left's latch (real) is still there
    expect(calls.at(-1), 'the right button\'s mouseup spent the left button\'s latch').toEqual(['release', 'mouse']);
  });

  it('counts what it DROPPED per event type; a real click is counted nowhere', () => {
    down(0);
    up(0);
    expect(h.dropped()).toEqual({ mousedown: 0, mouseup: 0 });
    r.f.noteTouch();
    down(0);
    expect(h.dropped(), 'the echo mousedown was not counted as a mousedown').toEqual({ mousedown: 1, mouseup: 0 });
    up(0);
    expect(h.dropped()).toEqual({ mousedown: 1, mouseup: 1 });
  });
});

// The WIRING: installPrimaryMouse is everything Components installs for the mouse. Real window events, one fake clock.
describe('installPrimaryMouse — real window events through the wiring Components installs', () => {
  let t;
  let calls;
  let wired;
  beforeEach(() => {
    t = 5000;
    calls = [];
    wired = installPrimaryMouse({
      pressPrimary: (button, source) => calls.push(['press', button, source]),
      releaseHeavySwing: (source) => calls.push(['release', source]),
      now: () => t,
      target: window,
    });
  });
  afterEach(() => wired.remove());
  const dispatch = (type, init = {}) => window.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), init));
  const click = () => {
    window.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
  };

  it('a tap followed by its compat mousedown / mouseup never reaches pressPrimary — a real click does (the presence)', () => {
    dispatch('touchstart');
    dispatch('pointerdown', { pointerType: 'touch' });
    t += 60;
    dispatch('pointerup', { pointerType: 'touch' });
    dispatch('touchend');
    t += 5;
    click();
    expect(calls, 'the tap\'s compat mouse events pressed the primary').toEqual([]);
    expect(wired.dropped()).toEqual({ mousedown: 1, mouseup: 1 });
    t += COMPAT_MOUSE_WINDOW_MS * 2;
    click();
    expect(calls, 'PRESENCE: a real click must press and release').toEqual([['press', 0, 'mouse'], ['release', 'mouse']]);
  });

  it('remove() takes every listener with it: neither a touch nor a click reaches anything afterwards', () => {
    wired.remove();
    dispatch('touchend');
    t += 5;
    click();
    expect(calls).toEqual([]);
    expect(wired.dropped(), 'a removed filter still saw the touch').toEqual({ mousedown: 0, mouseup: 0 });
  });
});
