import { describe, it, expect, vi, afterEach } from 'vitest';

// The limiter is wrapped, not replaced: every call is recorded with the buffer's peak BEFORE it, then the real one runs, so
// a test can say both that a voice called it and that the call had something to do.
const seen = vi.hoisted(() => ({ calls: [] }));
vi.mock('./headroom.js', async (importOriginal) => {
  const real = await importOriginal();
  return {
    limitPeak: (d, limit) => {
      let pre = 0;
      for (let i = 0; i < d.length; i++) pre = Math.max(pre, Math.abs(d[i]));
      seen.calls.push({ limit, pre, frames: d.length });
      real.limitPeak(d, limit);
    },
  };
});

import { limitPeak } from './headroom.js';
import { VOICES } from './synthVoices.js';

const peakOf = (d) => d.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

/** A context that builds real Float32Array buffers, so the voices run for real. */
function fakeCtx() {
  return {
    sampleRate: 44100,
    createBuffer(_channels, length, rate) {
      const data = new Float32Array(Math.trunc(length));
      return { length: data.length, sampleRate: rate, getChannelData: () => data };
    },
  };
}

/** mulberry32: a seeded stand-in for Math.random, so a run is the same on every machine. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

afterEach(() => { vi.restoreAllMocks(); seen.calls.length = 0; });

describe('limitPeak: a buffer past the limit is scaled to it, and one within it is left alone', () => {
  it('scales a loud buffer so its peak is the limit and every sample keeps its proportion', () => {
    const d = Float32Array.from([0.5, -2, 1, 0]);
    limitPeak(d, 0.98);
    expect(peakOf(d), 'the loud buffer was not brought down to the limit').toBeCloseTo(0.98, 6);
    expect([d[0], d[2]].map((v) => v / Math.abs(d[1])), 'the samples lost their proportions').toEqual([0.25, 0.5].map((v) => expect.closeTo(v, 5)));
    expect(d[1], 'a negative peak must stay negative').toBeLessThan(0);
  });

  it('leaves a buffer within the limit exactly as it was, the limit itself included', () => {
    const quiet = Float32Array.from([0.1, -0.7, 0.3]);
    const atLimit = Float32Array.from([0.95, -0.2]);
    limitPeak(quiet, 0.98);
    limitPeak(atLimit, Math.fround(0.95));
    expect([...quiet]).toEqual([...Float32Array.from([0.1, -0.7, 0.3])]);
    expect([...atLimit]).toEqual([...Float32Array.from([0.95, -0.2])]);
  });

  it('judges the peak by magnitude: a strong negative sample alone triggers the scaling', () => {
    const d = Float32Array.from([0.2, -1.5]);
    limitPeak(d, 0.95);
    expect(peakOf(d)).toBeCloseTo(0.95, 6);
  });
});

describe('the voices that can sum past full scale all end in the limiter', () => {
  // Each voice that carries the guard, and the limit it passes. The slam, the horn, the chime, the fanfare, the victory sting
  // and the thunder hold 0.98; the four Aspect motifs hold 0.95.
  const LIMITED = {
    slam: 0.98, siegeHorn: 0.98, dawnChime: 0.98, fanfare: 0.98, victory: 0.98, thunder: 0.98,
    motifWildheart: 0.95, motifVoidhand: 0.95, motifSoulbind: 0.95, motifElemancer: 0.95,
  };

  it('calls the limiter once, on its own buffer, with its limit', () => {
    let checked = 0;
    for (const [name, limit] of Object.entries(LIMITED)) {
      seen.calls.length = 0;
      const buffer = VOICES[name](fakeCtx());
      expect(seen.calls, `${name} did not call the limiter exactly once`).toHaveLength(1);
      expect(seen.calls[0].limit, `${name} passed the wrong limit`).toBe(limit);
      expect(seen.calls[0].frames, `${name} limited a buffer that is not the one it returned`).toBe(buffer.length);
      checked++;
    }
    expect(checked, 'SETUP: the table checked no voice').toBe(10);
  });

  it('keeps the slam, whose random parts rarely sum past 1, within 0.98 on every seed', () => {
    const SEEDS = 300;
    let loud = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      vi.spyOn(Math, 'random').mockImplementation(seeded(seed));
      seen.calls.length = 0;
      const peak = peakOf(VOICES.slam(fakeCtx()).getChannelData(0));
      expect(peak, `seed ${seed}: the slam clips`).toBeLessThanOrEqual(0.98 + 1e-6);
      if (seen.calls[0].pre > 0.98) loud++;
      vi.restoreAllMocks();
    }
    // The presence before the absence: some seeds were past the limit, so the guard acted on real input.
    expect(loud, `none of ${SEEDS} seeds went past the limit, so the check above measured nothing`).toBeGreaterThan(0);
  });
});
