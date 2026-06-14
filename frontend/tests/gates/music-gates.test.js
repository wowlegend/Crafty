import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Music overhaul (2026-06-14): ElevenLabs-generated tracks replace the procedural pad/arp Kevin disliked.
// MusicPlayer plays day/night tracks (capture-safe, musicEnabled-gated); the procedural music is muted via
// SoundManager PROC_MUSIC_GAIN=0 while the biome-ambience wind bed stays. (Ear-check owed to Kevin.)
const __dir = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(__dir, '../../src', p), 'utf8');
const asset = (p) => resolve(__dir, '../../public', p);

describe('music overhaul', () => {
  it('the day + night track assets exist and are non-trivial audio', () => {
    for (const f of ['music/day.mp3', 'music/night.mp3']) {
      expect(existsSync(asset(f)), `${f} missing`).toBe(true);
      expect(statSync(asset(f)).size).toBeGreaterThan(50000); // real audio, not an empty/error file
    }
  });
  it('MusicPlayer loads the tracks, is capture-safe + musicEnabled-gated, renders null', () => {
    const mp = read('ui/MusicPlayer.jsx');
    expect(mp).toMatch(/\/music\/day\.mp3/);
    expect(mp).toMatch(/\/music\/night\.mp3/);
    expect(mp).toMatch(/isCaptureMode\(\)/);
    expect(mp).toMatch(/musicEnabled/);
    expect(mp).toMatch(/return null/);
  });
  it('MusicPlayer is mounted in the HUD', () => {
    const hud = read('HUD.jsx');
    expect(hud).toMatch(/import MusicPlayer from '\.\/ui\/MusicPlayer'/);
    expect(hud).toMatch(/<MusicPlayer \/>/);
  });
  it('the procedural pad/arp music is muted (PROC_MUSIC_GAIN=0) but ambience kept', () => {
    const sm = read('SoundManager.jsx');
    expect(sm).toMatch(/PROC_MUSIC_GAIN\s*=\s*0/);
    expect(sm).toMatch(/0\.22 \* volume \* PROC_MUSIC_GAIN/); // pad chords muted
    expect(sm).toMatch(/0\.75 \* volume \* PROC_MUSIC_GAIN/); // arpeggiator muted
    expect(sm).toMatch(/windBedRef/); // biome-ambience wind bed still present
  });
});
