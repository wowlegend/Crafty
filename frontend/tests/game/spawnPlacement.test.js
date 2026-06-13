import { describe, it, expect } from 'vitest';
import { resolveSpawnGround, spawnTargetY, isVoidFall, SPAWN_FALLBACK_Y, SPAWN_EYE_OFFSET, SPAWN_PROBE_MAX_FAILS } from '../../src/game/spawnPlacement.js';

describe('spawnPlacement (S3-M5 p2) — the spawn-ground decision (pinned to the old inline logic)', () => {
  it('placed-block ground wins immediately (no probe)', () => {
    expect(resolveSpawnGround(72, 50, 5)).toEqual({ groundY: 72, retry: false, incFails: false });
  });
  it('valid physics ground (>15, not NaN) is used', () => {
    expect(resolveSpawnGround(null, 41, 0)).toEqual({ groundY: 41, retry: false, incFails: false });
  });
  it('invalid physics (null / NaN / <=15) increments fails + retries while under the cap', () => {
    for (const py of [null, NaN, 15, 10]) {
      const r = resolveSpawnGround(null, py, 3);
      expect(r.retry).toBe(true); expect(r.incFails).toBe(true); expect(r.groundY).toBe(null);
    }
  });
  it('no probe available (getMobGroundLevel missing) -> immediate fallback, NO retry (old edge)', () => {
    expect(resolveSpawnGround(null, null, 3, false)).toEqual({ groundY: SPAWN_FALLBACK_Y, retry: false, incFails: false });
  });
  it('at the fail cap, falls back to SPAWN_FALLBACK_Y (no infinite wait)', () => {
    const r = resolveSpawnGround(null, null, SPAWN_PROBE_MAX_FAILS - 1); // +1 reaches the cap
    expect(r).toEqual({ groundY: SPAWN_FALLBACK_Y, retry: false, incFails: true });
  });
  it('spawnTargetY lands the player SPAWN_EYE_OFFSET above ground', () => {
    expect(spawnTargetY(56)).toBe(56 + SPAWN_EYE_OFFSET);
    expect(SPAWN_EYE_OFFSET).toBe(1.2);
  });
  it('isVoidFall triggers below the void threshold (10)', () => {
    expect(isVoidFall(9.9)).toBe(true); expect(isVoidFall(10)).toBe(false); expect(isVoidFall(120)).toBe(false);
  });
});
