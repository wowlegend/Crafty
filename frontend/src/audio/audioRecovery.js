// Bringing the shared AudioContext back after the platform stops it.
//
// iOS WebKit leaves a context 'interrupted' after an app switch, a call or Siri, and resume() alone can leave it there
// (WebKit bugs 273511 and 276016); it can also report 'running' while its clock has stopped (bug 263627). A suspend()
// then resume() recovers both (MDN, BaseAudioContext.state, "Resuming interrupted play states in iOS Safari", and the
// workaround in bug 276016). Nothing here changes a level: it only restarts the clock the mix already runs on.

// The events that carry user activation (HTML, "activation-triggering input event": keydown, mousedown, pointerdown
// from a mouse, pointerup otherwise, touchend), plus click, which WebKit dispatches inside the tap's gesture.
const GESTURE_EVENTS = ['keydown', 'mousedown', 'pointerdown', 'pointerup', 'touchend', 'click'];
const LISTEN = { capture: true, passive: true };

/** @internal How long a 'running' context's clock may stand still after the page comes back before it counts as stopped. */
export const FROZEN_CLOCK_MS = 300;

/** Calls `fn` at the start of every user gesture on `win`, before the page's own handlers; returns the uninstaller. */
export function onUserGesture(fn, win = window) {
  for (const type of GESTURE_EVENTS) win.addEventListener(type, fn, LISTEN);
  return () => { for (const type of GESTURE_EVENTS) win.removeEventListener(type, fn, LISTEN); };
}

/** True for any state the game cannot play in but can leave: 'suspended', 'interrupted' or a state not yet named. */
function contextNeedsRecovery(ctx) {
  return !!ctx && ctx.state !== 'running' && ctx.state !== 'closed';
}

const warn = (e) => console.warn('Audio context restart refused:', e);

/** suspend() then resume(), both asked for now: the context runs them in order, and resume() is inside the caller's gesture. */
function restartContext(ctx) {
  if (!ctx || ctx.state === 'closed') return;
  if (typeof ctx.suspend === 'function') Promise.resolve(ctx.suspend()).catch(warn);
  Promise.resolve(ctx.resume()).catch(warn);
}

/** Restarts the context if it needs recovery. */
export function wakeContext(ctx) {
  if (contextNeedsRecovery(ctx)) restartContext(ctx);
}

/**
 * Recovery for the context `getCtx()` returns: on every gesture, and when the page is shown again (visibilitychange to
 * visible, pageshow). On a return, a 'running' context is restarted only when its clock has not moved for
 * FROZEN_CLOCK_MS, so a healthy one on a desktop tab is left alone. Returns the uninstaller.
 */
export function installAudioRecovery(getCtx, { win = window, doc = document } = {}) {
  let frozenCheck = null;
  const offGesture = onUserGesture(() => wakeContext(getCtx()), win);
  const onReturn = () => {
    if (doc.visibilityState === 'hidden') return;
    const ctx = getCtx();
    if (!ctx || ctx.state === 'closed') return;
    if (contextNeedsRecovery(ctx)) { restartContext(ctx); return; }
    const before = ctx.currentTime;
    clearTimeout(frozenCheck);
    frozenCheck = setTimeout(() => {
      if (ctx.state === 'running' && ctx.currentTime === before) restartContext(ctx);
    }, FROZEN_CLOCK_MS);
  };
  doc.addEventListener('visibilitychange', onReturn);
  win.addEventListener('pageshow', onReturn);
  return () => {
    offGesture();
    clearTimeout(frozenCheck);
    doc.removeEventListener('visibilitychange', onReturn);
    win.removeEventListener('pageshow', onReturn);
  };
}
