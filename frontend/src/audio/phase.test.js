import { describe, it, expect } from 'vitest';
import { makePhaseAccumulator, triangleFromPhase } from './phase.js';
import { makeFreezeSound, makeBindSound, makeDefeatSound } from './synthVoices.js';

// THE SWEEPS RAN AT DOUBLE SPEED, AND ONE OF THEM TURNED AROUND.
//
// Three voices wrote `Math.sin(2 * Math.PI * f(t) * t)` with a time-varying f. The instantaneous frequency
// of sin(2*pi*g(t)) is g'(t), and for g = f(t)*t that is f(t) + t*f'(t) -- twice the intended sweep rate.
// makeFreezeSound passed its declared 700 Hz at the MIDPOINT and reached 0 Hz before the buffer ended;
// makeDefeatSound crossed ZERO at t = 0.667 of a 0.8s buffer and then rose again; and makeBindSound's
// frequency STEP became a phase step, which is a click, on the "binding lands" resolve.
//
// These assertions are on the RENDERED SAMPLES, not on the formula, because the formula was the thing that
// looked right. A minimal AudioContext stub is enough: createBuffer is the only API these voices touch.
const ctx = (sampleRate = 44100) => ({
  sampleRate,
  createBuffer(_ch, frameCount) {
    const data = new Float32Array(frameCount);
    return { length: frameCount, getChannelData: () => data };
  },
});

/** Zero crossings per second over a window — a cheap, robust instantaneous-frequency estimate. */
function freqOver(data, sampleRate, from, to) {
  const a = Math.floor(from * sampleRate);
  const b = Math.min(Math.floor(to * sampleRate), data.length - 1);
  let crossings = 0;
  for (let i = a + 1; i <= b; i++) if ((data[i - 1] < 0) !== (data[i] < 0)) crossings++;
  return crossings / (2 * ((b - a) / sampleRate));
}

describe('makePhaseAccumulator', () => {
  it('starts at phase 0, so the first sample is not already mid-waveform', () => {
    const ph = makePhaseAccumulator(48000);
    expect(ph(440)).toBe(0);
  });

  it('advances by exactly one sample of the given frequency', () => {
    const sr = 1000;
    const ph = makePhaseAccumulator(sr);
    ph(100);
    expect(ph(100)).toBeCloseTo((2 * Math.PI * 100) / sr, 12);
  });

  it('a frequency STEP moves the phase continuously — no jump, no click', () => {
    const sr = 48000;
    const ph = makePhaseAccumulator(sr);
    for (let i = 0; i < 100; i++) ph(392);
    const before = ph(392);
    const after = ph(523.25); // the step
    const step = after - before;
    expect(step, 'the phase jumped at the frequency change').toBeLessThan((2 * Math.PI * 600) / sr);
    expect(step).toBeGreaterThan(0);
  });

  it('survives a garbage frequency rather than poisoning every later sample with NaN', () => {
    const ph = makePhaseAccumulator(48000);
    ph(NaN);
    expect(Number.isFinite(ph(440))).toBe(true);
  });

  it('triangleFromPhase spans -1..1 and is continuous across a cycle boundary', () => {
    const vals = [];
    for (let i = 0; i <= 400; i++) vals.push(triangleFromPhase((i / 100) * Math.PI));
    expect(Math.min(...vals)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...vals)).toBeLessThanOrEqual(1);
    for (let i = 1; i < vals.length; i++) expect(Math.abs(vals[i] - vals[i - 1])).toBeLessThan(0.2);
  });
});

describe('synth voices — the sweep is the sweep the comment declares', () => {
  it('freeze descends 1400 -> 700 across the WHOLE buffer, not by its midpoint', () => {
    const d = makeFreezeSound(ctx()).getChannelData();
    const early = freqOver(d, 44100, 0.01, 0.06);
    const late = freqOver(d, 44100, 0.42, 0.48);
    expect(early, 'the sweep does not start near 1400 Hz').toBeGreaterThan(1100);
    expect(late, 'the sweep has already collapsed past its declared endpoint').toBeGreaterThan(500);
    expect(late, 'the sweep never descends').toBeLessThan(early);
  });

  it('defeat keeps DESCENDING for the whole buffer — it used to cross zero and rise again', () => {
    // MONOTONE across the whole buffer, sampled either side of where the broken version crossed zero
    // (t = 0.667). The first draft of this assertion compared the start, the middle and one late window
    // and stayed GREEN against the defect: the zero-crossing estimator reads |frequency|, so after the
    // turnaround |f| is small again and a single late sample looks like a continued descent. The
    // turnaround is only visible as a RISE between two windows that straddle it.
    const d = makeDefeatSound(ctx()).getChannelData();
    const windows = [[0.02, 0.10], [0.28, 0.36], [0.58, 0.66], [0.71, 0.79]];
    const f = windows.map(([lo, hi]) => freqOver(d, 44100, lo, hi));
    for (let i = 1; i < f.length; i++) {
      expect(
        f[i],
        `window ${i} (${f[i].toFixed(1)} Hz) is not below window ${i - 1} (${f[i - 1].toFixed(1)} Hz) — the sting turned around`
      ).toBeLessThan(f[i - 1] + 1);
    }
    expect(f[f.length - 1], 'the tail went silent').toBeGreaterThan(30);
  });

  it('bind resolves without a discontinuity at the G4 -> C5 step', () => {
    // A phase jump shows up as one sample-to-sample delta far larger than any neighbouring one.
    const d = makeBindSound(ctx()).getChannelData();
    const at = Math.floor(0.18 * 44100);
    let neighbourMax = 0;
    for (let i = at - 400; i < at - 5; i++) neighbourMax = Math.max(neighbourMax, Math.abs(d[i + 1] - d[i]));
    let stepMax = 0;
    for (let i = at - 2; i <= at + 2; i++) stepMax = Math.max(stepMax, Math.abs(d[i + 1] - d[i]));
    expect(stepMax, 'the waveform jumps at the frequency step — that is the click').toBeLessThanOrEqual(neighbourMax * 3 + 1e-6);
  });

  it('every voice renders a non-silent buffer — the control for the three assertions above', () => {
    for (const [name, make] of [['freeze', makeFreezeSound], ['bind', makeBindSound], ['defeat', makeDefeatSound]]) {
      const d = make(ctx()).getChannelData();
      const peak = d.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
      expect(peak, `${name} rendered silence`).toBeGreaterThan(0.01);
    }
  });
});
