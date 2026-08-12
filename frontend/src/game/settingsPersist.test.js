import { describe, it, expect, vi } from 'vitest';
import {
  sanitizeSettings, loadSettings, saveSettings, initSettingsPersistence,
  SETTINGS_KEY, SETTINGS_DEFAULTS,
} from './settingsPersist.js';

// Anti-tamper settings persistence: only the 5 known dials are ever read/written, each clamped, and a
// corrupt/tampered/throwing blob can never inject bad state or throw. Storage is injected so this is a
// pure unit (no jsdom/localStorage needed).

// minimal in-memory Storage stand-in
const fakeStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    _dump: () => m,
  };
};

describe('sanitizeSettings', () => {
  it('returns {} for non-object input', () => {
    expect(sanitizeSettings(null)).toEqual({});
    expect(sanitizeSettings(42)).toEqual({});
    expect(sanitizeSettings(undefined)).toEqual({});
  });

  it('coerces masterMuted to a boolean', () => {
    expect(sanitizeSettings({ masterMuted: 1 })).toEqual({ masterMuted: true });
    expect(sanitizeSettings({ masterMuted: 0 })).toEqual({ masterMuted: false });
    expect(sanitizeSettings({ masterMuted: 'yes' })).toEqual({ masterMuted: true });
  });

  it('clamps numeric dials to their ranges', () => {
    expect(sanitizeSettings({ sfxVolume: 5 })).toEqual({ sfxVolume: 1 });
    expect(sanitizeSettings({ sfxVolume: -3 })).toEqual({ sfxVolume: 0 });
    expect(sanitizeSettings({ juiceIntensity: 0.5 })).toEqual({ juiceIntensity: 0.5 });
    expect(sanitizeSettings({ lookSensitivity: 99 })).toEqual({ lookSensitivity: 2.5 });
    expect(sanitizeSettings({ lookSensitivity: 0 })).toEqual({ lookSensitivity: 0.3 }); // lo clamp 0.3
  });

  it('coerces numeric strings then clamps', () => {
    expect(sanitizeSettings({ sfxVolume: '0.7' })).toEqual({ sfxVolume: 0.7 });
  });

  it('drops non-finite numeric values', () => {
    expect(sanitizeSettings({ sfxVolume: NaN })).toEqual({});
    expect(sanitizeSettings({ sfxVolume: 'abc' })).toEqual({});
    expect(sanitizeSettings({ musicVolume: Infinity })).toEqual({});
  });

  it('drops unknown keys (only the known dials survive)', () => {
    expect(sanitizeSettings({ hacker: 'evil', sfxVolume: 0.5 })).toEqual({ sfxVolume: 0.5 });
  });

  // THE `__proto__: {}` TERM THAT USED TO SIT IN THE TEST ABOVE EXERCISED NOTHING.
  //
  // In an object literal, a bare `__proto__:` key SETS THE PROTOTYPE — it does not create an own
  // property. So the input was just `{ hacker, sfxVolume }` with a plain prototype, and the pollution
  // defense the term was standing in for was never reached. These do reach it.
  it('does not inherit a dial from the prototype chain', () => {
    // The real vector: `sanitizeSettings` decided membership with `k in raw`, and `in` walks the
    // prototype chain. Any object arriving with a polluted prototype — or a globally polluted
    // Object.prototype, which is what a pollution attack produces — would have had that value read
    // straight into the sanitized output, which is the opposite of sanitizing.
    expect(sanitizeSettings(Object.create({ sfxVolume: 0.9 }))).toEqual({});
    expect(sanitizeSettings(Object.create({ masterMuted: true }))).toEqual({});
  });

  it('a JSON payload naming __proto__ cannot pollute Object.prototype', () => {
    // The path loadSettings actually takes. JSON.parse creates an OWN "__proto__" key rather than
    // setting the prototype, so this is the shape a stored-settings attack would really have.
    const parsed = JSON.parse('{"__proto__":{"pwned":1},"sfxVolume":0.5}');
    expect(sanitizeSettings(parsed)).toEqual({ sfxVolume: 0.5 });
    expect({}.pwned, 'Object.prototype was polluted').toBeUndefined();
  });

  it('the defaults are themselves a valid (idempotent) sanitized set', () => {
    expect(sanitizeSettings(SETTINGS_DEFAULTS)).toEqual(SETTINGS_DEFAULTS);
  });
});

describe('loadSettings', () => {
  it('returns {} when nothing is stored', () => {
    expect(loadSettings(fakeStorage())).toEqual({});
  });
  it('reads + sanitizes a stored blob (clamps + drops unknowns)', () => {
    const s = fakeStorage({ [SETTINGS_KEY]: JSON.stringify({ sfxVolume: 9, hacker: 1, masterMuted: 1 }) });
    expect(loadSettings(s)).toEqual({ sfxVolume: 1, masterMuted: true });
  });
  it('never throws on invalid JSON -> {}', () => {
    expect(loadSettings(fakeStorage({ [SETTINGS_KEY]: '{not json' }))).toEqual({});
  });
  it('never throws on a throwing storage -> {}', () => {
    expect(loadSettings({ getItem: () => { throw new Error('blocked'); } })).toEqual({});
  });
});

describe('saveSettings', () => {
  it('writes the SANITIZED dials under SETTINGS_KEY and returns true', () => {
    const s = fakeStorage();
    expect(saveSettings({ sfxVolume: 5, hacker: 1 }, s)).toBe(true);
    const written = JSON.parse(s.getItem(SETTINGS_KEY));
    expect(written).toEqual({ sfxVolume: 1 }); // clamped, unknown dropped
  });
  it('returns false (never throws) when storage write is blocked', () => {
    expect(saveSettings({ sfxVolume: 0.5 }, { setItem: () => { throw new Error('quota'); } })).toBe(false);
  });
});

describe('initSettingsPersistence guards', () => {
  it('is a safe no-op under capture (returns a cleanup fn, never touches the store)', () => {
    const store = { setState: vi.fn(), getState: () => ({}), subscribe: vi.fn() };
    const cleanup = initSettingsPersistence(store, () => true);
    expect(typeof cleanup).toBe('function');
    expect(store.setState).not.toHaveBeenCalled();
    expect(store.subscribe).not.toHaveBeenCalled();
  });

  it('is a safe no-op when localStorage is absent (node env) -> returns a cleanup fn', () => {
    const store = { setState: vi.fn(), getState: () => ({}), subscribe: vi.fn() };
    const cleanup = initSettingsPersistence(store); // no isCapture; node test env has no localStorage
    expect(typeof cleanup).toBe('function');
    expect(store.setState).not.toHaveBeenCalled();
  });
});

// A minimal zustand-shaped store: getState/setState (merge) + a real subscribe so the persist glue can fire.
const fakeStore = (initial = {}) => {
  let state = { juiceIntensity: 1, sfxVolume: 1, musicVolume: 1, masterMuted: false, lookSensitivity: 1, ...initial };
  const subs = new Set();
  return {
    getState: () => state,
    setState: (patch) => { state = { ...state, ...patch }; },
    subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb); },
    _change: (patch) => { state = { ...state, ...patch }; for (const cb of subs) cb(state); }, // fire a store change
  };
};

describe('initSettingsPersistence hydrate + persist glue (injected storage)', () => {
  it('HYDRATES the store from stored prefs on boot (sanitized)', () => {
    const storage = fakeStorage({ [SETTINGS_KEY]: JSON.stringify({ sfxVolume: 0.4, masterMuted: true, bogus: 9 }) });
    const store = fakeStore();
    initSettingsPersistence(store, () => false, storage);
    expect(store.getState().sfxVolume).toBe(0.4);       // MUTATION-PROOF: drop store.setState(loaded) -> RED
    expect(store.getState().masterMuted).toBe(true);
    expect('bogus' in store.getState()).toBe(false);    // unknown key never hydrated
  });

  it('PERSISTS a watched-dial change to storage (sanitized)', () => {
    const storage = fakeStorage();
    const store = fakeStore();
    initSettingsPersistence(store, () => false, storage);
    store._change({ sfxVolume: 0.25 });
    expect(JSON.parse(storage.getItem(SETTINGS_KEY)).sfxVolume).toBe(0.25); // MUTATION-PROOF: drop saveSettings -> RED
  });

  it('does NOT persist when no watched dial changed (the sameSettings guard, no redundant writes)', () => {
    const storage = fakeStorage();
    const store = fakeStore();
    initSettingsPersistence(store, () => false, storage);
    store._change({ unrelated: 42 }); // not one of the 5 dials
    expect(storage.getItem(SETTINGS_KEY)).toBeNull();
  });

  it('the returned cleanup unsubscribes (no persist after cleanup)', () => {
    const storage = fakeStorage();
    const store = fakeStore();
    const cleanup = initSettingsPersistence(store, () => false, storage);
    cleanup();
    store._change({ sfxVolume: 0.9 });
    expect(storage.getItem(SETTINGS_KEY)).toBeNull();
  });

  it('under capture: injected storage is NEVER read (no hydrate) even when seeded', () => {
    const storage = fakeStorage({ [SETTINGS_KEY]: JSON.stringify({ sfxVolume: 0.4 }) });
    const store = fakeStore();
    initSettingsPersistence(store, () => true, storage);
    expect(store.getState().sfxVolume).toBe(1); // defaults, not hydrated
  });
});
