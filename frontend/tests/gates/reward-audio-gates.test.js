import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { VOICES } from '../../src/audio/synthVoices.js';

// Reward-beat audio (2026-06-14, next-levers #7 + a real BUG fix). Two designed reward beats were silent:
// (1) LEVEL-UP was a DEAD reference — SimpleExperienceSystem calls window.playLevelUpSound but NOTHING ever
// assigned it (the levelUp voice + playLevelUpSound verb both exist, just never reached); (2) achievement /
// quest-complete fired only a text toast, no sting. This wires both via the codebase's window.* sound-global
// pattern (set once from App's useGameSounds consumer) + a new triumphant fanfare voice.
const __dir = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(__dir, '../../src', p), 'utf8');
const app = read('App.jsx');
const quest = read('QuestSystem.jsx');
const exp = read('SimpleExperienceSystem.jsx');

describe('reward-beat audio is wired', () => {
  it('the fanfare voice is registered', () => {
    expect(typeof VOICES.fanfare).toBe('function');
  });
  it('App bridges the reward sounds onto window (fixing the dead level-up + enabling fanfare)', () => {
    expect(app).toMatch(/window\.playLevelUpSound\s*=/);
    expect(app).toMatch(/window\.playFanfare\s*=/);
    expect(app).toMatch(/playLevelUpSound,\s*playFanfare/); // both pulled from useGameSounds
  });
  it('level-up still triggers its (now-live) sound', () => {
    expect(exp).toMatch(/window\.playLevelUpSound/);
  });
  it('achievement-unlock and quest-complete fire the fanfare', () => {
    // both reward beats call the bridged fanfare
    const fanfareCalls = (quest.match(/window\.playFanfare/g) || []).length;
    expect(fanfareCalls).toBeGreaterThanOrEqual(2);
  });
});
