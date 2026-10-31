import { PERSISTED_KEYS } from './saveSchema.js';

/**
 * The autosave scheduler (pure; the save is injected). schedule() arms one save `delayMs` after the first change since
 * the last save, and further changes join it rather than push it back: the clock advances gameTime every second, so a
 * timer restarted on each change would never fire while a game is being played. flush() saves at once if a save is
 * pending; cancel() drops it.
 */
export function createAutosave({ save, delayMs = 5000 }) {
  let timer = null;
  const clear = () => { if (timer !== null) { clearTimeout(timer); timer = null; } };
  return {
    schedule() { if (timer === null) timer = setTimeout(() => { timer = null; save(); }, delayMs); },
    flush() { if (timer !== null) { clear(); save(); } },
    cancel() { clear(); },
  };
}

// The keys whose change schedules a save: every key a save records, so a field cannot be persisted and never saved,
// and isAlive: a death changes what the save writes (store saveActiveWorld, game/saveSchema.js asRespawned), and with
// the clock held on the death screen nothing else would schedule one: a refresh there would load the save made alive.
const TRIGGER_KEYS = Object.freeze([...PERSISTED_KEYS, 'isAlive']);

/**
 * Autosave `store`: a change to any persisted key schedules `save`, and hiding the tab or unloading saves a pending one
 * at once. While the page is hidden a change schedules nothing; it is held, and scheduled when the page is shown again:
 * with two tabs on one world, a write from the hidden one is newer than the save the visible one read, which refuses the
 * visible tab's next save (store saveActiveWorld; DECISIONS 2026-10-31 item 331). Another page's write of the storage
 * is handed to the store at once (noteStorageWrite), so a stale tab is told when the other saves. Returns the
 * uninstall. The store subscription runs on every write, the per-frame position writes included, so the comparison is
 * a plain loop over a frozen array.
 */
export function installAutosave(store, { save, delayMs = 5000, doc = document, win = window }) {
  const autosave = createAutosave({ save, delayMs });
  let held = false;
  const unsub = store.subscribe((s, prev) => {
    for (let i = 0; i < TRIGGER_KEYS.length; i++) {
      if (s[TRIGGER_KEYS[i]] !== prev[TRIGGER_KEYS[i]]) {
        if (doc.visibilityState === 'hidden') held = true;
        else autosave.schedule();
        return;
      }
    }
  });
  const onVisibility = () => {
    if (doc.visibilityState === 'hidden') autosave.flush();
    else if (held) { held = false; autosave.schedule(); }
  };
  const onUnload = () => autosave.flush();
  const onStorage = () => store.getState().noteStorageWrite?.();
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('beforeunload', onUnload);
  win.addEventListener('storage', onStorage);
  return () => {
    unsub();
    doc.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('beforeunload', onUnload);
    win.removeEventListener('storage', onStorage);
    autosave.cancel();
  };
}
