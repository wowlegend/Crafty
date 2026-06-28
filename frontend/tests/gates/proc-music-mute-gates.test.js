import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(HERE, '../../src/', rel), 'utf8');

// Regression (2026-06-28 audit, MEDIUM): the combat-scaling arpeggiator ramp bypassed Kevin's
// PROC_MUSIC_GAIN=0 proc-music mute lock — it ramped masterGain to 0.75*volume (audible) without the
// *PROC_MUSIC_GAIN factor the other proc-music ramps use. Every non-zero proc-music gain ramp must
// keep the factor so the mute holds.
describe('proc-music mute lock (PROC_MUSIC_GAIN)', () => {
  const src = read('SoundManager.jsx');

  it('PROC_MUSIC_GAIN is the mute lock (0)', () => {
    expect(src).toMatch(/const PROC_MUSIC_GAIN = 0\b/);
  });

  it('the combat-scaling arp ramp respects the mute (no bare 0.75*volume ramp)', () => {
    expect(src).toMatch(/0\.75 \* volume \* PROC_MUSIC_GAIN/);
    expect(src).not.toMatch(/linearRampToValueAtTime\(0\.75 \* volume,/);
  });
});
