import { describe, it, expect } from 'vitest';
import { motionIntensity } from './a11y.js';

describe('motionIntensity (reduced-motion -> feedback-intensity dial)', () => {
  it('returns 0 when the user prefers reduced motion (kills shake/hitstop)', () => {
    expect(motionIntensity(true)).toBe(0);
    expect(motionIntensity(true, 1)).toBe(0);
    expect(motionIntensity(true, 0.7)).toBe(0);
  });
  it('passes through the user scale when reduced motion is OFF', () => {
    expect(motionIntensity(false, 1)).toBe(1);
    expect(motionIntensity(false, 0.5)).toBe(0.5);
  });
  it('defaults the scale to full', () => {
    expect(motionIntensity(false)).toBe(1);
  });
  it('clamps the user scale to [0,1]', () => {
    expect(motionIntensity(false, 2)).toBe(1);
    expect(motionIntensity(false, -1)).toBe(0);
  });
});
