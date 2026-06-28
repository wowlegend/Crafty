import { describe, it, expect } from 'vitest';
import {
  isVoidFall, resolveSpawnGround, spawnTargetY,
  SPAWN_FALLBACK_Y, SPAWN_PROBE_MAX_FAILS, SPAWN_EYE_OFFSET,
} from './spawnPlacement.js';

// Pure spawn-placement branch logic extracted from the Player loop (void-fall reset + ground probe with
// bounded retry/fallback). Characterization-pinned to the old inline behavior; safety-critical (a wrong
// branch = fall-through-floor or stuck-in-sky).

describe('isVoidFall', () => {
  it('is true below the void-reset floor, false at/above it', () => {
    expect(isVoidFall(5)).toBe(true);
    expect(isVoidFall(-100)).toBe(true);
    expect(isVoidFall(10)).toBe(false); // == VOID_RESET_Y, not below
    expect(isVoidFall(64)).toBe(false);
  });
});

describe('spawnTargetY', () => {
  it('places the player center one eye-offset above ground', () => {
    expect(spawnTargetY(50)).toBeCloseTo(50 + SPAWN_EYE_OFFSET, 10);
    expect(spawnTargetY(0)).toBeCloseTo(SPAWN_EYE_OFFSET, 10);
  });
});

describe('resolveSpawnGround', () => {
  it('uses a placed block-ground immediately when present (no probe, no retry)', () => {
    expect(resolveSpawnGround(64, null, 0)).toEqual({ groundY: 64, retry: false, incFails: false });
    // block ground wins even if a physics probe value also exists
    expect(resolveSpawnGround(64, 30, 5)).toEqual({ groundY: 64, retry: false, incFails: false });
  });

  it('falls back immediately (no retry) when the physics probe is unavailable', () => {
    expect(resolveSpawnGround(null, null, 0, false)).toEqual({
      groundY: SPAWN_FALLBACK_Y, retry: false, incFails: false,
    });
  });

  it('uses a valid physics ground (> probe-min)', () => {
    expect(resolveSpawnGround(null, 30, 0, true)).toEqual({ groundY: 30, retry: false, incFails: false });
  });

  it('retries (incrementing fails) on an invalid probe while under the fail cap', () => {
    const retry = { groundY: null, retry: true, incFails: true };
    expect(resolveSpawnGround(null, null, 0, true)).toEqual(retry); // null probe
    expect(resolveSpawnGround(null, NaN, 0, true)).toEqual(retry); // NaN probe
    expect(resolveSpawnGround(null, 15, 0, true)).toEqual(retry); // == PROBE_MIN_Y -> rejected (<=)
    expect(resolveSpawnGround(null, 10, SPAWN_PROBE_MAX_FAILS - 2, true)).toEqual(retry); // still under cap
  });

  it('falls back (no more retry) once the bounded probe wait is exhausted', () => {
    // probeFails + 1 == MAX -> stop retrying, fall back, but still mark the final fail
    expect(resolveSpawnGround(null, null, SPAWN_PROBE_MAX_FAILS - 1, true)).toEqual({
      groundY: SPAWN_FALLBACK_Y, retry: false, incFails: true,
    });
  });

  it('accepts a probe value just above the min', () => {
    expect(resolveSpawnGround(null, 16, 0, true)).toEqual({ groundY: 16, retry: false, incFails: false });
  });
});
