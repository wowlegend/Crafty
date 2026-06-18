import { describe, it, expect } from 'vitest';
import { routinePosition, shouldRetreatAtNight, nextEmote } from '../../src/game/npcRoutine.js';

describe('npc ambient routine', () => {
  it('routinePosition follows a small loop around the home anchor over time (day)', () => {
    const home = { x: 10, z: 8 };
    const p0 = routinePosition(home, 0, true);
    const p1 = routinePosition(home, 5, true);
    expect(p0.x).not.toBe(p1.x); // moves along the patrol over time
    expect(Math.hypot(p0.x - home.x, p0.z - home.z)).toBeLessThan(5); // stays near home
  });
  it('at night townsfolk retreat to home (stationary at the anchor)', () => {
    const home = { x: 10, z: 8 };
    expect(shouldRetreatAtNight(true)).toBe(false); // isDay=true -> no retreat
    expect(shouldRetreatAtNight(false)).toBe(true);
    const night = routinePosition(home, 10, false);
    expect(night.x).toBeCloseTo(home.x);
    expect(night.z).toBeCloseTo(home.z);
  });
  it('nextEmote cycles deterministically on a timer', () => {
    expect(nextEmote(0)).toBeTruthy();
    expect(typeof nextEmote(0)).toBe('string');
  });
});
