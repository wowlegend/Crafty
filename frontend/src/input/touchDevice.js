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
