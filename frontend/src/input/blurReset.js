/**
 * blurReset.js — clear held input intents when the window loses focus (B8, 18-domain review).
 *
 * The keyboard listeners (Components.jsx) set movement intents on keydown and clear them on keyup. But
 * when the window loses focus — alt-tab, cmd-tab, clicking another window — the browser delivers the
 * KEYDOWN while focused and then DROPS the KEYUP (it fires while another window owns focus). So a held
 * movement intent sticks ON and the player keeps running after you return to the game. Clearing held
 * intents on `blur` and `visibilitychange`->hidden fixes it. Pure wiring around `clearHeldIntents` (so it
 * stays node/jsdom-testable); it does NOT touch the `active` gate — pointer-lock owns that.
 */
import { clearHeldIntents } from './inputState.js';

/**
 * Wire focus-loss -> clearHeldIntents on `win` (defaults to the global window). Returns a cleanup fn that
 * removes the listeners. No-op when there is no window (SSR / node without jsdom).
 * @param {Window} [win]
 * @returns {() => void} cleanup
 */
export function installBlurReset(win = typeof window !== 'undefined' ? window : undefined) {
  if (!win || typeof win.addEventListener !== 'function') return () => {};
  const doc = win.document;
  const onBlur = () => clearHeldIntents();
  const onVisibility = () => { if (doc && doc.visibilityState === 'hidden') clearHeldIntents(); };
  win.addEventListener('blur', onBlur);
  if (doc && typeof doc.addEventListener === 'function') doc.addEventListener('visibilitychange', onVisibility);
  return () => {
    win.removeEventListener('blur', onBlur);
    if (doc && typeof doc.removeEventListener === 'function') doc.removeEventListener('visibilitychange', onVisibility);
  };
}
