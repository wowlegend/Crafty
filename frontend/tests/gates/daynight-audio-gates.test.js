import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { VOICES } from '../../src/audio/synthVoices.js';

// "Signature-fires" insurance for the day/night TRANSITION audio beats. The night siege + dawn had a
// SurvivalWarning banner + a gradual music shift but NO one-shot sting to punctuate the moment -- so the
// siege onset (the beat the onboarding nudge promises) began silently. This gate locks the two voices in,
// their SoundManager verbs, and the DayNightAudio watcher that fires them on the isDay edge + its HUD mount.
const __dir = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(__dir, '../../src', p), 'utf8');
const dna = read('ui/DayNightAudio.jsx');
const sm = read('SoundManager.jsx');
const hud = read('HUD.jsx');

describe('day/night transition audio is wired', () => {
  it('the siegeHorn + dawnChime voices are registered', () => {
    expect(typeof VOICES.siegeHorn).toBe('function');
    expect(typeof VOICES.dawnChime).toBe('function');
  });
  it('SoundManager exposes playSiegeHorn / playDawnChime', () => {
    expect(sm).toMatch(/playSiegeHorn:/);
    expect(sm).toMatch(/playDawnChime:/);
  });
  it('DayNightAudio watches isDay + fires the horn on day->night and the chime on night->day', () => {
    expect(dna).toMatch(/\(s\)\s*=>\s*s\.isDay/);
    expect(dna).toMatch(/playSiegeHorn\?\.\(\)/);
    expect(dna).toMatch(/playDawnChime\?\.\(\)/);
  });
  it('DayNightAudio is mounted in the HUD', () => {
    expect(hud).toMatch(/import DayNightAudio from '\.\/ui\/DayNightAudio'/);
    expect(hud).toMatch(/<DayNightAudio \/>/);
  });
});
