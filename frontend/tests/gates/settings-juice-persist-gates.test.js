import { describe, it, expect, afterEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { initSettingsPersistence, SETTINGS_KEY } from '../../src/game/settingsPersist.js';

// A SAVED FEEDBACK INTENSITY SURVIVES A LATER SESSION THAT CHANGES ANOTHER DIAL.
//
// The store keeps two juice fields: juiceIntensityChoice (what the player chose, which is what persists) and
// juiceIntensity (what is in effect; the OS reduced-motion preference forces it to 0). A hydrate that restored only the
// effective value left the choice at its default 1, so in a later session the first change to SFX, music, mute, look
// sensitivity or the frame cap saved juice 1 over the player's 40%, or over the 0 of the in-game Reduced Motion: full
// screenshake and hitstop came back at the next launch.
//
// Each "session" resets the store to its boot defaults (a fresh page load) and calls initSettingsPersistence as App does,
// against the real store and an injected storage. What this does not cover: App's mount order between this hydrate and
// its OS reduced-motion listener, which reads the restored choice (settings-a11y-gates pins the listener).

const S = () => useGameStore.getState();
const BOOT = { juiceIntensity: 1, juiceIntensityChoice: 1, sfxVolume: 1, musicVolume: 1, masterMuted: false, lookSensitivity: 1, frameCap: 60 };
const mkStorage = (seed) => {
  const m = new Map();
  if (seed) m.set(SETTINGS_KEY, JSON.stringify(seed));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
};
const storedJuice = (st) => { const r = st.getItem(SETTINGS_KEY); return r ? JSON.parse(r).juiceIntensity : undefined; };
let unsub = null;
const session = (st) => {
  if (unsub) unsub();
  useGameStore.setState(BOOT);
  unsub = initSettingsPersistence(useGameStore, () => false, st);
};
afterEach(() => { if (unsub) unsub(); unsub = null; useGameStore.setState(BOOT); });

describe('the juice dial across sessions, through the real store', () => {
  it('40% set in one session, SFX changed in the next: the third session still has 40%', () => {
    const st = mkStorage();
    session(st);
    S().setJuiceIntensity(0.4);
    expect(storedJuice(st), 'SETUP: the slider never persisted, so nothing below was asked').toBeCloseTo(0.4, 10);
    session(st);
    expect(S().juiceIntensity, 'the hydrate did not restore the value in effect').toBeCloseTo(0.4, 10);
    expect(S().juiceIntensityChoice, 'the hydrate did not restore the player\'s choice').toBeCloseTo(0.4, 10);
    S().setSfxVolume(0.5);
    expect(storedJuice(st), 'changing SFX saved the default juice over the player\'s').toBeCloseTo(0.4, 10);
    session(st);
    expect(S().juiceIntensity, 'the juice was lost by the third session').toBeCloseTo(0.4, 10);
    expect(S().sfxVolume, 'SETUP: the SFX change itself did not persist').toBeCloseTo(0.5, 10);
  });

  it('the in-game Reduced Motion (juice 0) survives a music change in a later session', () => {
    const st = mkStorage({ juiceIntensity: 0 });
    session(st);
    expect(S().juiceIntensity, 'SETUP: the saved 0 did not load').toBe(0);
    S().setMusicVolume(0.3);
    expect(storedJuice(st), 'a music change saved full screenshake over Reduced Motion').toBe(0);
    session(st);
    expect(S().juiceIntensity).toBe(0);
  });

  it('every other dial leaves a saved 0.4 alone', () => {
    const changes = [
      ['sfx', () => S().setSfxVolume(0.2)],
      ['music', () => S().setMusicVolume(0.2)],
      ['mute', () => S().setMasterMuted(true)],
      ['look', () => S().setLookSensitivity(1.7)],
      ['frame cap', () => S().setFrameCap(0)],
    ];
    const kept = [];
    for (const [name, change] of changes) {
      const st = mkStorage({ juiceIntensity: 0.4 });
      session(st);
      change();
      if (st.getItem(SETTINGS_KEY) === JSON.stringify({ juiceIntensity: 0.4 })) throw new Error(`SETUP: ${name} saved nothing`);
      if (Math.abs(storedJuice(st) - 0.4) < 1e-9) kept.push(name);
    }
    expect(kept, 'dials whose change kept the saved juice').toEqual(changes.map(([n]) => n));
  });

  it('the OS reduced-motion preference turned on then off in a session restores the saved 0.4, not the default', () => {
    const st = mkStorage({ juiceIntensity: 0.4 });
    session(st);
    S().applyReducedMotion(true);
    expect(S().juiceIntensity, 'SETUP: the OS preference did not force 0').toBe(0);
    S().applyReducedMotion(false);
    expect(S().juiceIntensity).toBeCloseTo(0.4, 10);
  });

  it('a session with no saved settings keeps the boot defaults', () => {
    const st = mkStorage();
    session(st);
    expect(S().juiceIntensity).toBe(1);
    expect(S().juiceIntensityChoice).toBe(1);
  });
});
