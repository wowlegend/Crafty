import { describe, it, expect } from 'vitest';
import { audioGain } from './audioSettings.js';

describe('audioGain (volume slider -> GainNode value)', () => {
  it('passes through a 0..1 volume', () => {
    expect(audioGain(1)).toBe(1);
    expect(audioGain(0.5)).toBe(0.5);
    expect(audioGain(0)).toBe(0);
  });
  it('muted -> 0 regardless of volume', () => {
    expect(audioGain(1, true)).toBe(0);
    expect(audioGain(0.8, true)).toBe(0);
  });
  it('clamps out-of-range volume', () => {
    expect(audioGain(2)).toBe(1);
    expect(audioGain(-0.5)).toBe(0);
  });
});
