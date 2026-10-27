/**
 * compatMouse.js — tell a REAL mouse press from the compatibility mouse events a browser fires after a touch
 * (review F2, Phase 0c; plan docs/superpowers/plans/2026-10-27-crafty-touch-hold.md).
 *
 * THE BUG IT CLOSES. A browser follows a touch tap with compatibility mouse events at the same spot: the Pointer Events
 * spec maps a primary touch's pointerdown to a `mousedown` and its pointerup to a `mouseup`, unless the page cancels the
 * pointerdown (w3c.github.io/pointerevents, "Compatibility mapping with mouse events", read 2026-10-27). The game's
 * primary listens to `mousedown` on window (Components.jsx), and the touch action button presses the SAME primary
 * through the store at its pointerdown. So one tap on the action button swung twice — once as 'touch' at the press,
 * again as 'mouse' from the compat event after the lift — and a tap on ANY touch control (jump, dodge, an Aspect
 * sector) also swung, mined or placed, because its echo reached the same window listener.
 *
 * WHY HERE AND NOT preventDefault ON EACH CONTROL. Cancelling pointerdown suppresses the echo only in a browser that
 * implements that mapping, only for a primary pointer, and only on the controls that remember to do it; the next touch
 * control would have to remember too. The consumer is ONE listener, so the dedupe lives at the consumer: every mouse
 * event inside COMPAT_MOUSE_WINDOW_MS of a touch, or one a browser names as touch-born (Chromium's
 * `sourceCapabilities.firesTouchEvents`), is an echo. The window is measured from the touch's LAST event (its end),
 * since the echo is dispatched after the lift.
 *
 * THE COST, stated: on a device with both a touchscreen and a mouse, a real click within COMPAT_MOUSE_WINDOW_MS of a
 * touch is dropped. A mouse-only desktop never sees a touch event, so it is never filtered.
 *
 * Pure wiring like blurReset.js: the clock is injected, and every installer takes the target, so it is jsdom-testable.
 * installPrimaryMouse is the whole DOM wiring Components uses (review round 2): the filter, its touch listeners and the
 * mousedown / mouseup pair, so a test can drive real window events through exactly what the game installs.
 */

/** How long after a touch a mouse event is treated as its echo, ms. Covers the legacy ~300 ms tap delay with margin. */
export const COMPAT_MOUSE_WINDOW_MS = 800;

/**
 * @param {{ now: () => number, windowMs?: number }} opts
 * @returns {{ noteTouch(): void, isCompat(e: object): boolean }}
 */
export function makeCompatMouseFilter({ now, windowMs = COMPAT_MOUSE_WINDOW_MS }) {
  let lastTouchAt = -Infinity;
  return {
    /** A touch began or ended. */
    noteTouch() {
      lastTouchAt = now();
    },
    /** Whether a mouse event is a touch's compatibility echo rather than a real mouse. */
    isCompat(e) {
      return !!(e && e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) || now() - lastTouchAt < windowMs;
    },
  };
}

/**
 * The game's primary mouse pair, echo-filtered: a mousedown presses the primary as 'mouse' unless it is an echo, and a
 * left mouseup releases the heavy as 'mouse' unless it is one.
 *
 * A MOUSEUP TAKES ITS MOUSEDOWN'S VERDICT (review round 2). Classified on its own, a REAL mouse release that happened to
 * land within the window of a touch (a hybrid device: a finger on the screen while the mouse button is held) was dropped,
 * so the heavy the real press began never threw. The verdict is latched per button at the mousedown; a mouseup with no
 * mousedown seen (pressed before this was installed) is classified on its own.
 *
 * Counts what it DROPS, per event type: the e2e F2 case reads the mousedown count, which a total would let a mouseup
 * echo satisfy alone.
 *
 * @param {{ isCompat(e: object): boolean }} filter
 * @param {(button: number, source: string) => unknown} pressPrimary
 * @param {(source: string) => unknown} releaseHeavySwing
 */
export function makeMouseHandlers(filter, pressPrimary, releaseHeavySwing) {
  const downWasCompat = new Map();
  const dropped = { mousedown: 0, mouseup: 0 };
  return {
    onMouseDown(e) {
      const echo = filter.isCompat(e);
      downWasCompat.set(e.button, echo);
      if (echo) dropped.mousedown += 1;
      else pressPrimary(e.button, 'mouse');
    },
    onMouseUp(e) {
      const echo = downWasCompat.has(e.button) ? downWasCompat.get(e.button) : filter.isCompat(e);
      downWasCompat.delete(e.button);
      if (e.button !== 0) return;
      if (echo) dropped.mouseup += 1;
      else releaseHeavySwing('mouse');
    },
    /** What it has dropped as echoes, per event type: the counts the dev test bridge exposes. */
    dropped: () => ({ ...dropped }),
  };
}

const TOUCH_TYPES = ['touchstart', 'touchend', 'touchcancel'];
const POINTER_TYPES = ['pointerdown', 'pointerup', 'pointercancel'];

/**
 * Feed `filter` every touch on `target` (default window), in CAPTURE phase so no handler that stops propagation can
 * hide one. Pointer events count too when their pointerType is not 'mouse' (a pen on a tablet). Returns a cleanup fn.
 */
export function installCompatMouseFilter(filter, target = typeof window !== 'undefined' ? window : undefined) {
  if (!target || typeof target.addEventListener !== 'function') return () => {};
  const onTouch = () => filter.noteTouch();
  const onPointer = (e) => { if (e.pointerType && e.pointerType !== 'mouse') filter.noteTouch(); };
  const opts = { capture: true, passive: true };
  for (const type of TOUCH_TYPES) target.addEventListener(type, onTouch, opts);
  for (const type of POINTER_TYPES) target.addEventListener(type, onPointer, opts);
  return () => {
    for (const type of TOUCH_TYPES) target.removeEventListener(type, onTouch, opts);
    for (const type of POINTER_TYPES) target.removeEventListener(type, onPointer, opts);
  };
}

/**
 * Install the game's primary mouse on `target` (default window): the compat filter fed by every touch, and the
 * echo-filtered mousedown / mouseup pair. Returns the drop counts and a cleanup that removes every listener.
 *
 * @param {{ pressPrimary: Function, releaseHeavySwing: Function, now: () => number, target?: EventTarget }} opts
 * @returns {{ dropped(): { mousedown: number, mouseup: number }, remove(): void }}
 */
export function installPrimaryMouse({ pressPrimary, releaseHeavySwing, now, target = typeof window !== 'undefined' ? window : undefined }) {
  const filter = makeCompatMouseFilter({ now });
  const handlers = makeMouseHandlers(filter, pressPrimary, releaseHeavySwing);
  if (!target || typeof target.addEventListener !== 'function') return { dropped: handlers.dropped, remove: () => {} };
  const removeFilter = installCompatMouseFilter(filter, target);
  target.addEventListener('mousedown', handlers.onMouseDown);
  target.addEventListener('mouseup', handlers.onMouseUp);
  return {
    dropped: handlers.dropped,
    remove() {
      removeFilter();
      target.removeEventListener('mousedown', handlers.onMouseDown);
      target.removeEventListener('mouseup', handlers.onMouseUp);
    },
  };
}
