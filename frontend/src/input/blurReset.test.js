// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { installBlurReset } from './blurReset.js';
import { getInput, setIntent, setActive, resetInput, clearHeldIntents } from './inputState.js';

// B8 (18-domain review): "alt-tab leaves movement keys stuck ON". The keyboard listeners set movement
// intents on keydown and clear them on keyup, but when the window loses focus (alt-tab / cmd-tab / click
// away) the browser delivers the KEYDOWN while focused and then drops the KEYUP (it fires while another
// window owns focus). So a held movement intent sticks ON and the player keeps running after you return.
// Fix: clear held intents on `blur` / `visibilitychange`->hidden, WITHOUT touching the `active` gate
// (pointer-lock owns that).
//
// MUTATION-PROOF: remove the `win.addEventListener('blur', ...)` line in blurReset.js and the
// "blur clears held movement intents" assertion goes RED (moveF stays true).

describe('B8 alt-tab — held input intents are cleared on focus loss', () => {
  beforeEach(() => resetInput());

  it('clearHeldIntents() clears every held intent but preserves the active gate', () => {
    setActive(true);
    setIntent('moveF', true);
    setIntent('jump', true);
    setIntent('roar', true);
    clearHeldIntents();
    expect(getInput().moveF).toBe(false);
    expect(getInput().jump).toBe(false);
    expect(getInput().roar).toBe(false);
    expect(getInput().active).toBe(true); // active is owned by pointer-lock, not cleared here
  });

  it('a window blur clears held movement intents (the alt-tab freeze fix)', () => {
    const cleanup = installBlurReset(window);
    setActive(true);
    setIntent('moveF', true);
    expect(getInput().moveF).toBe(true);
    window.dispatchEvent(new Event('blur'));
    expect(getInput().moveF).toBe(false); // RED before the fix: no blur listener -> stays true
    expect(getInput().active).toBe(true);  // active untouched
    cleanup();
  });

  it('a visibilitychange to hidden also clears held intents; a visible one does not', () => {
    const cleanup = installBlurReset(window);
    setIntent('moveB', true);
    // visible -> no clear
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(getInput().moveB).toBe(true);
    // hidden -> clear
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(getInput().moveB).toBe(false);
    cleanup();
  });

  it('the cleanup fn removes the listeners (no clear after cleanup)', () => {
    const cleanup = installBlurReset(window);
    cleanup();
    setIntent('moveL', true);
    window.dispatchEvent(new Event('blur'));
    expect(getInput().moveL).toBe(true); // listener removed -> not cleared
  });
});
