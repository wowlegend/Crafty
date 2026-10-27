// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeCompatMouseFilter, installCompatMouseFilter, COMPAT_MOUSE_WINDOW_MS } from './compatMouse.js';

// compatMouse.js — review F2: a touch tap's compatibility mousedown reached the game's window `mousedown` listener and
// pressed the primary a second time (one tap on the action button swung twice; a tap on any touch control swung, mined
// or placed). The filter tells the echo from a real mouse. The clock is injected, so every window edge is exact.
//
// Mutation-Proof: via scripts/dev/mutate.sh against src/input/compatMouse.js (8 tests), each observed RED unless marked
// (the run is in the commit that added this file):
//   C1 isCompat always false (no dedupe)   C2 plausible-wrong: `<=` -> a window that never closes (`< Infinity`)
//   C3 plausible-wrong: the window timed from the FIRST touch, not the last (noteTouch only when never set)
//   C4 sourceCapabilities ignored   C5 install does not listen to touchend (the echo follows the lift)
//   C6 plausible-wrong: a mouse-type pointer event counted as a touch   C7 the cleanup leaves the listeners on
//   C8 plausible-wrong: every mouse event counted as an echo (the e2e's instrument would read a pass on a desktop click)
//   C0 identity (a comment edit) SURVIVED, as it must.
//
// BLIND SPOT: this proves the filter. That Components.jsx consults it on mousedown and mouseup is
// tests/e2e/touch-hold.spec.js (F2), which taps the real action button and reads the echoes the game dropped.

function rig() {
  let t = 5000;
  const f = makeCompatMouseFilter({ now: () => t });
  return { f, advance: (ms) => { t += ms; } };
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

  it('counts the echoes it identified (the instrument the e2e reads), and only those', () => {
    expect(r.f.echoes()).toBe(0);
    r.f.isCompat(mouse());
    expect(r.f.echoes(), 'a real click was counted').toBe(0);
    r.f.noteTouch();
    r.f.isCompat(mouse());
    r.f.isCompat(mouse({ type: 'mouseup' }));
    expect(r.f.echoes()).toBe(2);
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

  it('a touch or pen pointer opens the window; a MOUSE pointer does not (or every real click would mute the next)', () => {
    remove = installCompatMouseFilter(r.f, window);
    fire('pointerdown', { pointerType: 'mouse' });
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
