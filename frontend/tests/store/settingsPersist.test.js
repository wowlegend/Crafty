import { describe, it, expect } from 'vitest';
import { sanitizeSettings, loadSettings, saveSettings, SETTINGS_KEY, SETTINGS_DEFAULTS } from '../../src/game/settingsPersist.js';

// in-memory localStorage stand-in (the real one is capture-guarded out + only available in the browser)
const fakeStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

// M6 settings-persistence: audio/feedback/look prefs were reset every session (no localStorage). The
// PERSISTABLE surface is exactly the 5 store dials; this pins the sanitize/clamp + round-trip so a corrupt
// or tampered blob can never inject bad state, and only known keys are ever written/read.
describe('M6 settings-persistence sanitize (clamp + whitelist)', () => {
  it('keeps only the known dials and clamps them to range', () => {
    const out = sanitizeSettings({ sfxVolume: 0.5, musicVolume: 2, juiceIntensity: -1, lookSensitivity: 5, masterMuted: 1, bogus: 'x' });
    expect(out.sfxVolume).toBe(0.5);
    expect(out.musicVolume).toBe(1);      // clamped 0..1
    expect(out.juiceIntensity).toBe(0);   // clamped 0..1
    expect(out.lookSensitivity).toBe(2.5); // clamped 0.3..2.5
    expect(out.masterMuted).toBe(true);   // coerced to bool
    expect('bogus' in out).toBe(false);   // unknown key dropped
  });

  it('drops non-finite / missing values rather than writing NaN', () => {
    const out = sanitizeSettings({ sfxVolume: 'loud', musicVolume: NaN });
    expect('sfxVolume' in out).toBe(false);
    expect('musicVolume' in out).toBe(false);
  });

  it('returns an empty object for non-object input (never throws)', () => {
    expect(sanitizeSettings(null)).toEqual({});
    expect(sanitizeSettings(undefined)).toEqual({});
    expect(sanitizeSettings('nope')).toEqual({});
  });

  it('exposes the 5 dial defaults', () => {
    expect(Object.keys(SETTINGS_DEFAULTS).sort()).toEqual(
      ['juiceIntensity', 'lookSensitivity', 'masterMuted', 'musicVolume', 'sfxVolume']
    );
  });
});

describe('M6 settings-persistence load/save round-trip', () => {
  it('saves only sanitized known keys and loads them back', () => {
    const s = fakeStorage();
    expect(saveSettings({ sfxVolume: 0.3, masterMuted: true, bogus: 9 }, s)).toBe(true);
    expect(JSON.parse(s.getItem(SETTINGS_KEY))).toEqual({ sfxVolume: 0.3, masterMuted: true });
    expect(loadSettings(s)).toEqual({ sfxVolume: 0.3, masterMuted: true });
  });

  it('loads an empty object when nothing is stored', () => {
    expect(loadSettings(fakeStorage())).toEqual({});
  });

  it('survives a corrupt blob without throwing (returns empty)', () => {
    const s = fakeStorage();
    s.setItem(SETTINGS_KEY, '{not valid json');
    expect(loadSettings(s)).toEqual({});
  });

  it('save/load tolerate a throwing storage (quota / blocked)', () => {
    const boom = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); } };
    expect(saveSettings({ sfxVolume: 0.5 }, boom)).toBe(false);
    expect(loadSettings(boom)).toEqual({});
  });
});
