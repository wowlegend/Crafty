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
  juiceIntensity: state.juiceIntensity,
  sfxVolume: state.sfxVolume,
  musicVolume: state.musicVolume,
  masterMuted: state.masterMuted,
  lookSensitivity: state.lookSensitivity,
});

const sameSettings = (a, b) =>
  a.juiceIntensity === b.juiceIntensity && a.sfxVolume === b.sfxVolume &&
  a.musicVolume === b.musicVolume && a.masterMuted === b.masterMuted &&
  a.lookSensitivity === b.lookSensitivity;

// Glue (called once at boot): hydrate the store from localStorage, then persist on any dial change.
// Capture-guarded: under the visual harness this is a no-op (defaults only) so baselines stay deterministic.
// `store` is the zustand store (getState/setState/subscribe); `isCapture` gates the localStorage touch.
export function initSettingsPersistence(store, isCapture) {
  if (typeof isCapture === 'function' && isCapture()) return () => {};
  if (typeof localStorage === 'undefined') return () => {};
  const loaded = loadSettings(localStorage);
  if (Object.keys(loaded).length) store.setState(loaded);
  let prev = pick(store.getState());
  return store.subscribe((state) => {
    const cur = pick(state);
    if (!sameSettings(prev, cur)) {
      prev = cur;
      saveSettings(cur, localStorage);
    }
  });
}
