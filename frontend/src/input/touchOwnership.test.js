import { describe, it, expect } from 'vitest';
import { ownsTouch, UI_OWNED_SELECTOR } from './touchOwnership.js';

// A fake node whose `closest` answers from a list of selectors it claims to match. Deliberately NOT jsdom:
// the point is to pin the SELECTOR contract, and a jsdom test here would tempt the vacuity trap described
// in touchOwnership.js (elementFromPoint has no layout, so it always returns null).
const node = (...matches) => ({
  closest: (sel) => (sel === UI_OWNED_SELECTOR && matches.length ? { tag: matches[0] } : null),
});

describe('ownsTouch — surfaces that handle their own touches', () => {
  it('claims a touch-layer button (pause, action, cast, jump, the Aspect ring)', () => {
    expect(ownsTouch(node('button[data-touch-btn]'))).toBe(true);
  });

  it('claims a HUD interactive surface — the hotbar, which is the whole X3 bug', () => {
    // The hotbar slot is `<button data-hotbar-block>` inside `[data-hud-interactive]`. Before this it
    // matched neither branch of the router's test, so the tap was routed into a look-drag and
    // preventDefault() killed the click.
    expect(ownsTouch(node('[data-hud-interactive]'))).toBe(true);
  });

  it('does NOT claim scenery — a touch on the world is still a move or a look', () => {
    // The canary. If this ever returns true the router stops working entirely: no joystick, no camera.
    expect(ownsTouch(node())).toBe(false);
  });
});

describe('ownsTouch — cannot throw inside a touchstart handler', () => {
  // An exception here would strand the whole move/look system for the session, which is a far worse
  // failure than a mis-routed tap. elementFromPoint returns null for a point outside the viewport.
  it('reads a null or undefined node as not-owned rather than throwing', () => {
    expect(ownsTouch(null)).toBe(false);
    expect(ownsTouch(undefined)).toBe(false);
  });

  it('reads a node with no closest (a bare text node) as not-owned', () => {
    expect(ownsTouch({})).toBe(false);
    expect(ownsTouch({ closest: 'not-a-function' })).toBe(false);
  });
});

describe('the selector names BOTH ownership kinds', () => {
  it('covers the touch-layer buttons and the HUD surfaces', () => {
    // Asserted directly because dropping either half is a silent regression: losing data-touch-btn makes
    // every action button also drag the camera; losing data-hud-interactive reinstates X3 exactly.
    expect(UI_OWNED_SELECTOR).toContain('button[data-touch-btn]');
    expect(UI_OWNED_SELECTOR).toContain('[data-hud-interactive]');
  });
});
