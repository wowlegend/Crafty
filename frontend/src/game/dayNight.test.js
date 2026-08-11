import { describe, it, expect } from 'vitest';
import { HALF_CYCLE_UNITS, CYCLE_UNITS, GAME_UNITS_PER_SECOND, crossedHalfCycle, isDayAtUnit, shouldAdvanceClock, gameTimeForTimeOfDay } from './dayNight.js';

describe('dayNight pure module', () => {
  describe('constants', () => {
    it('HALF_CYCLE_UNITS = 600, CYCLE_UNITS = 1200', () => {
      expect(HALF_CYCLE_UNITS).toBe(600);
      expect(CYCLE_UNITS).toBe(1200);
    });

    it('the ticker step evenly divides a half-cycle (integer landings still align)', () => {
      expect(HALF_CYCLE_UNITS % GAME_UNITS_PER_SECOND).toBe(0);
      // The plan asserts this exactly:
      expect(600 % GAME_UNITS_PER_SECOND).toBe(0);
    });
  });

  describe('crossedHalfCycle(prev, next)', () => {
    it('no cross within a half (100 -> 200)', () => {
      expect(crossedHalfCycle(100, 200)).toBe(false);
    });

    it('crosses the first boundary 599 -> 601 (across 600)', () => {
      expect(crossedHalfCycle(599, 601)).toBe(true);
    });

    it('crosses the second boundary 1199 -> 1201 (across 1200)', () => {
      expect(crossedHalfCycle(1199, 1201)).toBe(true);
    });

    it('crosses on a multi-step jump 580 -> 640 (skips exact 600)', () => {
      expect(crossedHalfCycle(580, 640)).toBe(true);
    });

    it('does NOT cross when both ends share a half (1200 -> 1300)', () => {
      expect(crossedHalfCycle(1200, 1300)).toBe(false);
    });

    it('resume case: start 437, add 4 repeatedly -> crosses exactly once at the step landing >= 600', () => {
      let t = 437;
      let crossings = 0;
      let crossedAt = null;
      // Step until we are well past the boundary.
      while (t < 620) {
        const next = t + 4;
        if (crossedHalfCycle(t, next)) {
          crossings += 1;
          crossedAt = next;
        }
        t = next;
      }
      expect(crossings).toBe(1);
      // 437 + 4*k: lands on 597 (<600) then 601 (>=600) -> crossing step is 601.
      expect(crossedAt).toBe(601);
    });
  });

  describe('isDayAtUnit(t)', () => {
    it('0..599 is day', () => {
      expect(isDayAtUnit(0)).toBe(true);
      expect(isDayAtUnit(300)).toBe(true);
      expect(isDayAtUnit(599)).toBe(true);
    });

    it('600..1199 is night', () => {
      expect(isDayAtUnit(600)).toBe(false);
      expect(isDayAtUnit(900)).toBe(false);
      expect(isDayAtUnit(1199)).toBe(false);
    });

    it('1200..1799 is day again', () => {
      expect(isDayAtUnit(1200)).toBe(true);
      expect(isDayAtUnit(1500)).toBe(true);
      expect(isDayAtUnit(1799)).toBe(true);
    });
  });

  describe('shouldAdvanceClock(guards)', () => {
    const ALL_PASS = { isWorldBuilt: true, active: true, isAlive: true, captureMode: false };

    it('advances only when ALL guards pass', () => {
      expect(shouldAdvanceClock(ALL_PASS)).toBe(true);
    });

    it('pauses when the world is not built', () => {
      expect(shouldAdvanceClock({ ...ALL_PASS, isWorldBuilt: false })).toBe(false);
    });

    it('pauses when input is not active (menu open / click-to-play)', () => {
      expect(shouldAdvanceClock({ ...ALL_PASS, active: false })).toBe(false);
    });

    it('pauses when the player is dead', () => {
      expect(shouldAdvanceClock({ ...ALL_PASS, isAlive: false })).toBe(false);
    });

    it('pauses in visual-capture mode (determinism guard)', () => {
      expect(shouldAdvanceClock({ ...ALL_PASS, captureMode: true })).toBe(false);
    });

    it('treats undefined isAlive as alive (advances)', () => {
      expect(shouldAdvanceClock({ isWorldBuilt: true, active: true, isAlive: undefined, captureMode: false })).toBe(true);
    });

    it('a missing/empty guard object does NOT advance', () => {
      expect(shouldAdvanceClock()).toBe(false);
      expect(shouldAdvanceClock({})).toBe(false);
    });
  });
});

// TWO CLOCKS THAT DISAGREED BY A QUARTER CYCLE.
//
// setTimeOfDay carried its own day window, [0.25, 0.75) -- correct for a MIDNIGHT origin -- while
// isDayAtUnit says [0, 0.5) on a DAWN origin. Both internally coherent, and they disagreed: setTimeOfDay(0.5)
// wrote gameTime 600 with isDay TRUE while every other reader of 600 says night. A save taken there reloaded
// inverted (loadWorldData re-derives isDay from gameTime), and the compass dial drew SUNSET beside a daytime
// readout. Converting once leaves exactly one opinion about which half is day.
describe('gameTimeForTimeOfDay — one origin, not two', () => {
  it('noon is DAY and midnight is NIGHT — what every caller already meant', () => {
    // Every probe in scripts/visual reads `setTimeOfDay(0.5) // midday`. It has to be day.
    expect(isDayAtUnit(gameTimeForTimeOfDay(0.5)), 'noon came out as night').toBe(true);
    expect(isDayAtUnit(gameTimeForTimeOfDay(0.0)), 'midnight came out as day').toBe(false);
  });

  it('dawn opens the day half and dusk opens the night half', () => {
    expect(gameTimeForTimeOfDay(0.25)).toBe(0);              // dawn = the top of the clock's day half
    expect(gameTimeForTimeOfDay(0.75)).toBe(HALF_CYCLE_UNITS); // dusk = the top of the night half
    expect(isDayAtUnit(gameTimeForTimeOfDay(0.25))).toBe(true);
    expect(isDayAtUnit(gameTimeForTimeOfDay(0.75))).toBe(false);
  });

  it('the day half is exactly half the cycle — no quarter-cycle gap between the two conventions', () => {
    // The assertion that would have caught the original defect: walk the whole dial and count.
    let day = 0;
    const N = 1200;
    for (let i = 0; i < N; i++) if (isDayAtUnit(gameTimeForTimeOfDay(i / N))) day++;
    expect(day).toBe(N / 2);
  });

  it('daylight is a CONTIGUOUS arc centred on noon, not two disjoint pieces', () => {
    // A half-cycle offset would also satisfy the count above while putting daylight around midnight.
    const isDayAt = (f) => isDayAtUnit(gameTimeForTimeOfDay(f));
    expect(isDayAt(0.3) && isDayAt(0.5) && isDayAt(0.7)).toBe(true);
    expect(isDayAt(0.05) || isDayAt(0.95)).toBe(false);
  });

  it('wraps instead of running off the end, and refuses to emit NaN', () => {
    expect(gameTimeForTimeOfDay(1)).toBe(gameTimeForTimeOfDay(0));
    expect(gameTimeForTimeOfDay(2.5)).toBe(gameTimeForTimeOfDay(0.5));
    expect(gameTimeForTimeOfDay(-0.25)).toBe(gameTimeForTimeOfDay(0.75));
    for (const bad of [undefined, null, NaN, 'noon']) {
      expect(Number.isFinite(gameTimeForTimeOfDay(bad)), `${bad} produced a non-finite gameTime`).toBe(true);
    }
  });

  it('always lands inside the cycle', () => {
    for (let i = 0; i <= 100; i++) {
      const g = gameTimeForTimeOfDay(i / 100);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThan(CYCLE_UNITS);
    }
  });
});
