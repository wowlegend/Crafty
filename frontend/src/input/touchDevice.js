/**
 * isTouchDevice() -- capability detection for whether to mount the touch overlay (spec section 5).
 * Uses any-pointer:coarse (NOT pointer:coarse) so a hybrid iPad-with-trackpad -- which reports a
 * desktop-class UA + pointer:fine -- still registers its touchscreen. 3-tier, SSR-safe.
 * NOTE: capability, not intent -- M2 adds a Settings Auto/On/Off override + last-input-wins.
 */
export function isTouchDevice() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (window.PointerEvent && 'maxTouchPoints' in navigator) {
    if (navigator.maxTouchPoints > 0) return true;
    // a fine-only device with PointerEvent + 0 touch points is desktop, UNLESS any-pointer:coarse
    return window.matchMedia?.('(any-pointer: coarse)')?.matches ?? false;
  }
  return (window.matchMedia?.('(any-pointer: coarse)')?.matches ?? false) || 'ontouchstart' in window;
}

/**
 * "Touch-UI mode" -- whether the touch UI (overlay + HUD adaptations like hiding the keyboard
 * cheatsheet) should be active. True on a real touch device, AND under the mobile.png capture
 * fixture (isCaptureMode + showTouch) so the baseline shows the touch UI. Lets the overlay AND the
 * HUD key off ONE consistent predicate. Imported lazily-safe (captureMode is dev-inert in prod).
 */
import { isCaptureMode, getCaptureOpts } from '../devtest/captureMode';
export function isTouchUIMode() {
  if (isCaptureMode()) return !!getCaptureOpts().showTouch;
  return isTouchDevice();
}
