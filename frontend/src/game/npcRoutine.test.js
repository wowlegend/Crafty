import { describe, it, expect } from 'vitest';
import { shouldRetreatAtNight, routinePosition, nextEmote } from './npcRoutine.js';

// Pure ambient-routine math for hub NPCs: a small day patrol circle around a home anchor, retreat-home
// at night, and a cycling emote. Deterministic from (home, time) so the render layer just reads it in a
// throttled tick (Game-Loop-Isolation). Locks the on-circle radius, the night-retreat, and emote cycling.
const PATROL_R = 2.0; // mirrors the module constant
const home = { x: 10, z: 20 };
const distFromHome = (p) => Math.hypot(p.x - home.x, p.z - home.z);

describe('shouldRetreatAtNight', () => {
  it('retreats only at night', () => {
    expect(shouldRetreatAtNight(true)).toBe(false);
    expect(shouldRetreatAtNight(false)).toBe(true);
  });
});

describe('routinePosition', () => {
  it('sits exactly on the home anchor at night (retreat)', () => {
    expect(routinePosition(home, 123, false)).toEqual({ x: home.x, z: home.z });
  });

  it('starts the day patrol due-east of home at t=0 (cos0=1, sin0=0)', () => {
    const p = routinePosition(home, 0, true);
    expect(p.x).toBeCloseTo(home.x + PATROL_R, 10);
    expect(p.z).toBeCloseTo(home.z, 10);
  });

  it('walks a quarter of the loop by t = 2*PI (angle = PI/2)', () => {
    const p = routinePosition(home, 2 * Math.PI, true); // a = (2PI * 0.25) % 2PI = PI/2
    expect(p.x).toBeCloseTo(home.x, 10);
    expect(p.z).toBeCloseTo(home.z + PATROL_R, 10);
  });

  it('always stays exactly PATROL_R from home during the day (any t, modulo-wrapped)', () => {
    for (const t of [0.3, 5, 13.7, 100, 1000]) {
      expect(distFromHome(routinePosition(home, t, true))).toBeCloseTo(PATROL_R, 10);
    }
  });
});

describe('nextEmote', () => {
  it('returns a non-empty string and cycles with period 5', () => {
    for (let i = 0; i < 5; i++) expect(typeof nextEmote(i)).toBe('string');
    expect(nextEmote(0)).toBe(nextEmote(5));
    expect(nextEmote(2)).toBe(nextEmote(12));
  });

  it('yields 5 distinct emotes across one period', () => {
    const set = new Set([0, 1, 2, 3, 4].map(nextEmote));
    expect(set.size).toBe(5);
  });

  it('floors fractional and abs-folds negative sequence values', () => {
    expect(nextEmote(1.9)).toBe(nextEmote(1)); // floor
    expect(nextEmote(-1)).toBe(nextEmote(1)); // Math.abs
  });
});
