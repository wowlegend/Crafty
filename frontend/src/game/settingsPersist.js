// settingsPersist.js — persist the player's audio/feedback/look prefs across sessions (local-first,
// mirrors the worldSaves.js safe-localStorage pattern). The PERSISTABLE surface is exactly the 5 store
// dials; everything is sanitized/clamped on the way in AND out so a corrupt or tampered blob can never
// inject bad state, and only known keys are ever written. Capture-GUARDED at the init seam so the visual
// harness never reads/writes localStorage (deterministic baselines).
export const SETTINGS_KEY = 'crafty_settings';

export const SETTINGS_DEFAULTS = {
  juiceIntensity: 1,
  sfxVolume: 1,
  musicVolume: 1,
  masterMuted: false,
  lookSensitivity: 1,
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const NUM = {
  juiceIntensity: (v) => clamp(v, 0, 1),
  sfxVolume: (v) => clamp(v, 0, 1),
  musicVolume: (v) => clamp(v, 0, 1),
  lookSensitivity: (v) => clamp(v, 0.3, 2.5),
};

// Pure: pick only the known dials from `raw`, coercing/clamping each; drop unknown + non-finite values.
export function sanitizeSettings(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  if ('masterMuted' in raw) out.masterMuted = !!raw.masterMuted;
  for (const k of Object.keys(NUM)) {
    if (k in raw) {
      const n = Number(raw[k]);
      if (Number.isFinite(n)) out[k] = NUM[k](n);
    }
  }
  return out;
}

// Read + sanitize the stored prefs. `storage` is injectable for tests; never throws.
export function loadSettings(storage) {
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return {};
  }
}

// Sanitize + write the known dials. Returns false on a throwing/blocked storage. Never throws.
export function saveSettings(settings, storage) {
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(sanitizeSettings(settings)));
    return true;
  } catch {
    return false;
  }
}

const pick = (state) => ({
  // The CHOICE persists, not the effective value: saving the effective one would write a 0 forced by an
  // OS preference into the player's own setting, and they would find their juice dial at zero next
  // session with the OS preference long since turned off.
  juiceIntensity: state.juiceIntensityChoice,
  sfxVolume: state.sfxVolume,
  musicVolume: state.musicVolume,
  masterMuted: state.masterMuted,
  lookSensitivity: state.lookSensitivity,
});

const sameSettings = (a, b) =>
  a.juiceIntensity === b.juiceIntensity && a.sfxVolume === b.sfxVolume &&
  a.musicVolume === b.musicVolume && a.masterMuted === b.masterMuted &&
  a.lookSensitivity === b.lookSensitivity;

// Glue (called once at boot): hydrate the store from storage, then persist on any dial change.
// Capture-guarded at BOTH ends: once at boot (for a harness that is already in capture) and again inside
// the subscriber (for the normal case, where capture is entered after boot). This comment used to claim
// the no-op property while only the boot check existed, which is the situation it could never cover.
// `store` is the zustand store (getState/setState/subscribe); `isCapture` gates the storage touch; `storage`
// defaults to localStorage but is INJECTABLE so the hydrate+persist glue is unit-testable with a fake store.
export function initSettingsPersistence(store, isCapture, storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  if (typeof isCapture === 'function' && isCapture()) return () => {};
  if (!storage) return () => {};
  const loaded = loadSettings(storage);
  if (Object.keys(loaded).length) store.setState(loaded);
  let prev = pick(store.getState());
  return store.subscribe((state) => {
    // The LATE check, and it is the load-bearing one. The guard at the top of this function runs at boot,
    // and the harness enters capture AFTER boot — so that check can only ever answer "we are not in
    // capture", the one answer it never needed to give. Without this line the subscriber persisted every
    // dial change for the whole capture session, while the header six lines up claimed the opposite.
    //
    // Placed BEFORE the sameSettings comparison so `prev` does not advance while suppressed. Honest
    // limit: moving it after the comparison was mutation-tested and NO failing sequence could be
    // constructed — capture is harness-only, so a dial changed under it is never a value a player wanted
    // kept. The position is kept for clarity of intent, not because a bug depends on it.
    if (typeof isCapture === 'function' && isCapture()) return;
    const cur = pick(state);
    if (!sameSettings(prev, cur)) {
      prev = cur;
      saveSettings(cur, storage);
    }
  });
}
