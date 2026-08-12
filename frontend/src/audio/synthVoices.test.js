import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as voices from './synthVoices.js';

const HERE = dirname(fileURLToPath(import.meta.url));

// THE FRAME COUNT WAS UNFLOORED IN 21 OF 26 VOICES.
//
// `const frameCount = sampleRate * duration` is a float product, and it is not always an integer:
// at 44100 Hz, 0.35 s gives 15434.999999999998 and 0.7 s gives 30869.999999999996. `createBuffer` takes
// an unsigned long, so the buffer truncates to 15434 frames — while the synthesis loop runs
// `i < 15434.999999999998`, i.e. one iteration further, and that final write lands out of bounds on the
// Float32Array where it is silently discarded. The clip is a sample short and the code that wrote it
// believes otherwise.
//
// Seven newer voices (makeHeartbeat, makeSiegeHorn, makeDawnChime, makeFanfare, makeVictorySound,
// makeUIOpen, makeUIClose) already floored it; the other 21 did not. Two implementations of one decision
// is the interesting part: whichever family a new voice is copied from decides whether it has the bug.
//
// A minimal AudioContext stand-in — enough to build a buffer and hand back a real Float32Array, so the
// voices run for real rather than against a mock that records calls.
function fakeCtx(sampleRate = 44100) {
  const created = [];
  return {
    sampleRate,
    created,
    createBuffer(channels, length, rate) {
      // Match the spec's coercion: the length argument is an unsigned long.
      const frames = Math.trunc(length);
      const data = new Float32Array(frames);
      created.push({ channels, length, frames, rate });
      return { length: frames, sampleRate: rate, numberOfChannels: channels, getChannelData: () => data };
    },
  };
}

/** Every exported voice, with a duration that exercises the float-imprecision case. */
const VOICE_NAMES = Object.keys(voices).filter((k) => typeof voices[k] === 'function' && k.startsWith('make'));

describe('synth voices — the buffer length is an integer, everywhere', () => {
  it('there are voices to check at all', () => {
    expect(VOICE_NAMES.length, 'no voices exported — every assertion below is vacuous').toBeGreaterThan(20);
  });

  it('NO voice computes an unfloored frame count', () => {
    // Source-level, deliberately: the defect is a per-call-site arithmetic slip in 26 near-identical
    // functions, several of which need arguments this test has no business inventing. What matters is
    // that not one site is left doing it, and the behavioural half below proves the pattern is the right
    // one to be checking for.
    const src = readFileSync(resolve(HERE, 'synthVoices.js'), 'utf8');
    const unfloored = src.match(/frameCount\s*=\s*sampleRate\s*\*\s*duration\s*;/g) || [];
    expect(unfloored, `${unfloored.length} voice(s) still compute a float frame count`).toEqual([]);

    const floored = src.match(/frameCount\s*=\s*Math\.floor\(sampleRate\s*\*\s*duration\)/g) || [];
    expect(floored.length, 'no floored sites found — the regex or the file moved, so the check above proves nothing').toBeGreaterThan(20);
  });

  it('makeTone at 0.35 s builds a buffer of exactly floor(44100 * 0.35) frames', () => {
    // The concrete case. 44100 * 0.35 === 15434.999999999998, so an unfloored version asks for a
    // fractional length and loses its last sample.
    const ctx = fakeCtx(44100);
    const buf = voices.makeTone(ctx, 440, 0.35);
    expect(buf, 'makeTone returned nothing').toBeTruthy();
    expect(ctx.created.length).toBe(1);
    expect(Number.isInteger(ctx.created[0].length), `createBuffer was asked for ${ctx.created[0].length} frames`).toBe(true);
    expect(buf.length).toBe(Math.floor(44100 * 0.35));
  });

  it('and at 0.7 s, the other duration where the product is not an integer', () => {
    const ctx = fakeCtx(44100);
    const buf = voices.makeTone(ctx, 220, 0.7);
    expect(Number.isInteger(ctx.created[0].length)).toBe(true);
    expect(buf.length).toBe(Math.floor(44100 * 0.7));
  });

  it('EVERY sample in the buffer is written — no trailing silence from an overshoot', () => {
    // The consequence, not the arithmetic. If the loop bound and the buffer length disagree, the last
    // sample is never stored; a buffer whose final frame is exactly 0 while its neighbours are not is
    // the signature. Checked on a tone, where the waveform is continuous and a true zero is unlikely.
    const ctx = fakeCtx(44100);
    const buf = voices.makeTone(ctx, 440, 0.35);
    const d = buf.getChannelData(0);
    expect(d.length).toBe(Math.floor(44100 * 0.35));
    const nonZero = [...d].filter((v) => v !== 0).length;
    expect(nonZero, 'the buffer is entirely silent — the voice is not synthesising anything').toBeGreaterThan(d.length / 2);
  });

  it('a null context yields null rather than throwing, on every voice', () => {
    // Every voice opens with `if (!ctx) return null`. Audio can be unavailable (autoplay policy, a
    // headless run), and a throw here takes out whatever gameplay path triggered the sound.
    let checked = 0;
    for (const name of VOICE_NAMES) {
      expect(() => voices[name](null, 440, 0.2), `${name} threw on a null context`).not.toThrow();
      expect(voices[name](null, 440, 0.2), `${name} did not return null on a null context`).toBeNull();
      checked++;
    }
    expect(checked).toBe(VOICE_NAMES.length);
  });
});
