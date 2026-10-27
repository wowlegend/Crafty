import { describe, it, expect } from 'vitest';
import {
  MIN_STRIKE_GAP_MS, STRIKE_SPREAD_MS, FLASH_END_MS, FLASH_PEAK,
  nextStrikeIn, flashAt, flashLight, thunderDelayMs,
} from '../../src/game/lightning.js';

/**
 * STORM LIGHTNING, the pure part (plan 2026-09-23-crafty-storm-lightning, Task 1; EXTERNAL-BASELINE-R2 #4).
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, each observed RED:
 *   N1 the strike floor dropped (strikes may come back to back) -> the spacing case
 *   N2 plausible-wrong: thunder delay in the wrong unit (m / 343, seconds read as ms) -> the delay case
 *   N3 the capture gate dropped -> the no-strike case
 *   N4 the envelope never returns to dark -> the envelope case
 *   N5 the juice dial ignored (0 still flashes — the photosensitivity control) -> the dial case
 *   and N0, an identity mutant (a comment edit in lightning.js, same harness and batch), SURVIVED.
 *
 * BLIND SPOT: nothing here renders or plays. Whether the driver reaches the light and the voice is Task 3's e2e.
 */
const seeded = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

describe('the schedule', () => {
  it('never closer than the floor, never further than floor + spread, averaging inside the band', () => {
    const rng = seeded(7);
    const gaps = Array.from({ length: 2000 }, () => nextStrikeIn(rng, { storm: true, capture: false }));
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(MIN_STRIKE_GAP_MS);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(MIN_STRIKE_GAP_MS + STRIKE_SPREAD_MS);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    expect(mean).toBeGreaterThan(8000);
    expect(mean).toBeLessThan(20000);
  });
  it('no strike in a clear sky, and none under capture — even in a storm', () => {
    const rng = seeded(3);
    expect(nextStrikeIn(rng, { storm: false, capture: false })).toBe(Infinity);
    expect(nextStrikeIn(rng, { storm: true, capture: true })).toBe(Infinity);
  });
});

describe('the flash', () => {
  it('dark at the strike, lit within 60 ms, dark again by FLASH_END_MS, and dark after', () => {
    expect(flashAt(0)).toBe(0);
    let peak = 0;
    for (let t = 0; t <= 60; t += 5) peak = Math.max(peak, flashAt(t));
    expect(peak).toBeGreaterThan(0.9);
    expect(flashAt(FLASH_END_MS)).toBe(0);
    for (const t of [FLASH_END_MS + 1, 1000, 60000]) expect(flashAt(t)).toBe(0);
    expect(flashAt(-5), 'a strike in the future is dark').toBe(0);
    for (let t = 0; t < FLASH_END_MS; t += 3) {
      expect(flashAt(t)).toBeGreaterThanOrEqual(0);
      expect(flashAt(t)).toBeLessThanOrEqual(1);
    }
  });
  it('the juice dial scales the light, and 0 is none at all', () => {
    expect(flashLight(40, 1)).toBeCloseTo(FLASH_PEAK, 6);
    expect(flashLight(40, 0.5)).toBeCloseTo(FLASH_PEAK / 2, 6);
    expect(flashLight(40, 0)).toBe(0);
  });
});

describe('the thunder', () => {
  it('arrives a second after the flash for a strike 343 m away, and in proportion', () => {
    expect(thunderDelayMs(343)).toBeCloseTo(1000, 6);
    expect(thunderDelayMs(686)).toBeCloseTo(2000, 6);
    expect(thunderDelayMs(0)).toBe(0);
    expect(thunderDelayMs(-10)).toBe(0);
  });
});
