import { describe, it, expect } from 'vitest';
import { starIntensity } from './nightSky.js';

// iter-165 twilight night sky: stars + moon fade IN at dusk (mood 1) and fade OUT toward both
// day (mood 0, bright blue sky) and obsidian (mood 2, crimson danger sky) — so the star layer
// peaks on the everyday-night mood and NEVER touches the day or boss frames (keeps those
// baselines byte-identical). starIntensity is the pure gate the Atmosphere shader's uStar reads.
describe('starIntensity(mood)', () => {
  it('is 0 at day (mood 0) — the bright-blue sky shows no stars; day frames unchanged', () => {
    expect(starIntensity(0)).toBe(0);
  });

  it('peaks at 1 at dusk (mood 1) — the everyday-night sky', () => {
    expect(starIntensity(1)).toBe(1);
  });

  it('is 0 at obsidian (mood 2) — the crimson danger sky shows no stars; boss frame unchanged', () => {
    expect(starIntensity(2)).toBe(0);
  });

  it('fades symmetrically on the way in (day->dusk) and out (dusk->obsidian)', () => {
    expect(starIntensity(0.5)).toBeCloseTo(0.5, 6);
    expect(starIntensity(1.5)).toBeCloseTo(0.5, 6);
  });

  it('rises monotonically toward dusk and falls monotonically away from it', () => {
    // Clean sample points (no float-accumulation drift across the peak at mood 1).
    const rising = [0, 0.25, 0.5, 0.75, 1];
    for (let i = 1; i < rising.length; i++) {
      expect(starIntensity(rising[i])).toBeGreaterThan(starIntensity(rising[i - 1]));
    }
    const falling = [1, 1.25, 1.5, 1.75, 2];
    for (let i = 1; i < falling.length; i++) {
      expect(starIntensity(falling[i])).toBeLessThan(starIntensity(falling[i - 1]));
    }
  });

  it('clamps to 0 outside [0,2] and tolerates non-finite input', () => {
    expect(starIntensity(3)).toBe(0);
    expect(starIntensity(-1)).toBe(0);
    expect(starIntensity(NaN)).toBe(0);
    expect(starIntensity(undefined)).toBe(0);
  });
});
