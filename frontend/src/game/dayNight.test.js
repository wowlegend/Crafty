import { describe, it, expect } from 'vitest';
import {
  HALF_CYCLE_UNITS,
  CYCLE_UNITS,
  GAME_UNITS_PER_SECOND,
  crossedHalfCycle,
  isDayAtUnit,
} from './dayNight.js';

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
});
