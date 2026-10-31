import { describe, it, expect } from 'vitest';
import {
  isVoidFall, resolveSpawnGround, spawnTargetY, spawnCornerGround, resumeColumnProbe,
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

// The spawn stands at x 0 z 0, where four block columns meet, and its capsule stands across all four. The probe is
// Terrain.jsx's getMobGroundLevel, which casts at x + 0.1, z + 0.1: called at (x, z) it reads column (x, z).
describe('spawnCornerGround', () => {
  const probeOf = (tops) => (x, z) => tops[`${x},${z}`];
  it('is the highest of the four columns around the corner, whichever it is', () => {
    const flat = { '-1,-1': 51, '0,-1': 51, '-1,0': 51, '0,0': 51 };
    expect(spawnCornerGround(probeOf(flat))).toBe(51);
    // A dug column (0, 0) is not the ground: the three around it still stand at 51.
    expect(spawnCornerGround(probeOf({ ...flat, '0,0': 48 }))).toBe(51);
    for (const k of Object.keys(flat)) {
      expect(spawnCornerGround(probeOf({ ...flat, [k]: 54 })), `column ${k} standing higher was not the ground`).toBe(54);
    }
  });
  it('asks the four columns the corner touches, and no other', () => {
    const asked = [];
    spawnCornerGround((x, z) => { asked.push(`${x},${z}`); return 51; });
    expect(asked.sort()).toEqual(['-1,-1', '-1,0', '0,-1', '0,0']);
  });
  it('is null until every column answers above the probe floor', () => {
    const flat = { '-1,-1': 51, '0,-1': 51, '-1,0': 51, '0,0': 51 };
    for (const k of Object.keys(flat)) {
      for (const bad of [null, undefined, NaN, 15, 3]) {
        expect(spawnCornerGround(probeOf({ ...flat, [k]: bad })), `column ${k} reading ${bad} gave a ground`).toBeNull();
      }
    }
    expect(spawnCornerGround(probeOf({ ...flat, '0,0': 16 })), 'a column just over the floor is an answer').toBe(51);
  });
});

// A loaded save's column counts as in only once every chunk the load fit reads (a metre round the saved centre) has
// answered: the probe is asked at the four corners of that square, each a column, and at the saved column itself.
describe('resumeColumnProbe', () => {
  it('is the saved column\'s ground once all four corners answer, and asks each corner\'s column', () => {
    const asked = [];
    const probe = (x, z) => { asked.push([x, z]); return 51; };
    expect(resumeColumnProbe(probe, { x: 15.95, y: 52, z: 0.5 })).toBe(51);
    // 1 m either way of 15.95 is 14.95 and 16.95: columns 14 and 16, across the chunk border at 16; 0.5 gives -1 and 1.
    expect(asked.slice(0, 4).map(([x, z]) => [Math.floor(x), Math.floor(z)]).sort()).toEqual([[14, -1], [14, 1], [16, -1], [16, 1]]);
    expect(asked[4]).toEqual([15.95, 0.5]);
  });
  it('is null while any corner has not answered, whatever the saved column says', () => {
    for (let k = 0; k < 4; k++) {
      let n = 0;
      const probe = () => (n++ === k ? null : 51);
      expect(resumeColumnProbe(probe, { x: 15.95, y: 52, z: 0.5 }), `corner ${k} unanswered`).toBeNull();
    }
    expect(resumeColumnProbe(() => NaN, { x: 0.5, y: 52, z: 0.5 })).toBeNull();
  });
});
