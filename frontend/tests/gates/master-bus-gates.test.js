import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.resolve(__dirname, '../../src/SoundManager.jsx'), 'utf8');

// SFX overhaul Slice 2: the WHOLE mix (music pad/arp + every SFX) now routes through ONE master bus
// + limiter (audio/masterBus.js) before the speakers, instead of each voice connecting straight to
// audioContext.current.destination -- which let peaks SUM and clip when many sounds fired at once.
// This static gate locks the routing invariant: a future edit can't silently re-introduce a
// direct-to-destination voice (re-opening the clipping hole). The unit DSP wiring of the bus itself
// is covered by audio/masterBus.test.js; this gate covers the consumer side (SoundManager).
describe('SFX Slice 2 — the whole mix routes through the master bus', () => {
  it('imports createMasterBus from audio/masterBus', () => {
    expect(/import\s*\{\s*createMasterBus\s*\}\s*from\s*'\.\/audio\/masterBus'/.test(src)).toBe(true);
  });

  it('has a lazy getMasterBus() helper that builds the bus on the shared ctx', () => {
    expect(src.includes('const getMasterBus')).toBe(true);
    expect(/createMasterBus\(\s*audioContext\.current\s*\)/.test(src)).toBe(true);
  });

  it('caches the bus + re-creates it when the ctx changes (stores { ctx, input })', () => {
    // The cache must key on the ctx so a fresh AudioContext rebuilds the bus rather than wiring
    // new voices into a dead bus.
    expect(/masterBusRef/.test(src)).toBe(true);
    expect(/\.ctx\s*[!=]==\s*audioContext\.current/.test(src)).toBe(true);
  });

  it('NO voice connects straight to audioContext.current.destination any more', () => {
    // The whole point of the slice: every former destination connect-site now targets the bus input
    // (with a null-safe fallback). Zero remaining direct connects == no clipping hole.
    expect(src.includes('.connect(audioContext.current.destination)')).toBe(false);
  });

  it('routes voices through the bus input with a destination fallback', () => {
    // The fallback keeps audio working if the bus failed to build (nullish ctx) -- never silence.
    expect(/getMasterBus\(\)\s*\|\|\s*audioContext\.current\.destination/.test(src)).toBe(true);
  });
});
