import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { VOICES } from '../../src/audio/synthVoices.js';

// SFX overhaul Slice 4 — the CLIMAX payoff was SILENT. VictoryOverlay (Blight Heart shattered -> the win
// screen, the single biggest beat in the game) was a purely presentational component that fired NO sound.
// This adds a dedicated triumphant `victory` voice (grander than the short reward fanfare) wired on the
// overlay's mount via the codebase's window.* sound-bridge pattern (set once from App's useGameSounds
// consumer, mirroring window.playFanfare / window.playLevelUpSound). This gate locks that wiring.
const __dir = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(__dir, '../../src', p), 'utf8');
const app = read('App.jsx');
const sm = read('SoundManager.jsx');
const gs = read('GameSystems.jsx');

describe('SFX Slice 4 — the victory climax has a triumphant sting', () => {
  it('the victory voice is registered + is a function', () => {
    expect(typeof VOICES.victory).toBe('function');
  });
  it('SoundManager exposes a playVictory verb that plays the victory voice', () => {
    expect(/playVictory:\s*\(\)\s*=>\s*playSound\(['"]victory['"]\)/.test(sm)).toBe(true);
  });
  it('App bridges playVictory onto window (set once from the useGameSounds consumer)', () => {
    expect(/window\.playVictory\s*=/.test(app)).toBe(true);
    expect(/playVictory/.test(app)).toBe(true);
  });
  it('VictoryOverlay fires the victory sting on mount', () => {
    // The overlay component must trigger the bridged sound when it appears (boss-defeat -> win screen).
    const vi = gs.indexOf('VictoryOverlay');
    expect(vi).toBeGreaterThan(-1);
    const block = gs.slice(vi, vi + 600);
    expect(block.includes('window.playVictory')).toBe(true);
  });
});
