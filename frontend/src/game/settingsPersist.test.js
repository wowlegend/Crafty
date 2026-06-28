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
    expect(sanitizeSettings({ hacker: 'evil', __proto__: {}, sfxVolume: 0.5 })).toEqual({ sfxVolume: 0.5 });
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
