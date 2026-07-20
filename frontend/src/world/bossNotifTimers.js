// bossNotifTimers.js — tracks the boss-notification auto-clear timeouts so they can all be cancelled on
// unmount. Without this, a raw `setTimeout(() => setBossNotification(null), N)` fires setState AFTER the
// bossSystem unmounts (a setState-after-unmount leak — 2026-06-28 audit). Pure factory over an injected
// setNotification; uses the global setTimeout/clearTimeout (fake-timer testable).
export function makeNotifClearTracker(setNotification) {
  const timers = new Set();
  return {
    /** Schedule setNotification(null) after `ms`; the timer self-removes when it fires. */
    schedule(ms) {
      const t = setTimeout(() => {
        setNotification(null);
        timers.delete(t);
      }, ms);
      timers.add(t);
      return t;
    },
    /** Cancel every pending timer (call from the unmount cleanup). */
    clearAll() {
      for (const t of timers) clearTimeout(t);
      timers.clear();
    },
    get size() {
      return timers.size;
    },
  };
}
