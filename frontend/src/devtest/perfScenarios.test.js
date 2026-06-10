import { describe, it, expect } from 'vitest';
import {
  SCENARIOS, scenarioEvents, SCENARIO_SEC, EDGE_PERIOD_SEC, HURL_PERIOD_SEC,
  SIEGE_NIGHTS, NIGHT_T, DAY_T, PROBE_DPR,
} from './perfScenarios';

describe('perfScenarios (S2-B2-M2)', () => {
  it('defines exactly the five review-prescribed scenarios', () => {
    expect(Object.keys(SCENARIOS)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(SCENARIOS.A.timeOfDay).toBe(DAY_T);
    expect(SCENARIOS.B.held).toBe(false);          // the honest control
    expect(SCENARIOS.C.held).toBe(true);           // the gated delta is C−B
    expect(SCENARIOS.B.nights).toBe(SIEGE_NIGHTS); // saturated siege ramp
    expect(SCENARIOS.D.edge).toBe(true);
    expect(SCENARIOS.E.hurl).toBe(true);
    expect(SCENARIOS.B.timeOfDay).toBe(NIGHT_T);
  });

  it('night/day fractions actually map to night/day and survive the 60s window', () => {
    expect(NIGHT_T >= 0.75 || NIGHT_T < 0.25).toBe(true);
    expect(DAY_T).toBeGreaterThanOrEqual(0.25);
    expect(DAY_T).toBeLessThan(0.75);
    // 60s at 4 units/s = 240 units = 0.2 of a cycle; neither start may cross its day/night boundary
    expect(NIGHT_T + 0.2 < 1.25).toBe(true); // night spans [0.75, 1.25) unwrapped
    expect(DAY_T + 0.2).toBeLessThan(0.75);
  });

  it('steady-state scenarios have empty schedules', () => {
    expect(scenarioEvents('A')).toEqual([]);
    expect(scenarioEvents('B')).toEqual([]);
    expect(scenarioEvents('C')).toEqual([]);
  });

  it('D alternates setHeld at the edge cadence, starting true', () => {
    const ev = scenarioEvents('D');
    expect(ev[0]).toEqual({ t: EDGE_PERIOD_SEC, type: 'setHeld', value: true });
    expect(ev[1]).toEqual({ t: 2 * EDGE_PERIOD_SEC, type: 'setHeld', value: false });
    expect(ev.length).toBe(Math.ceil(SCENARIO_SEC / EDGE_PERIOD_SEC) - 1);
  });

  it('E hurls on its cadence', () => {
    const ev = scenarioEvents('E');
    expect(ev.length).toBe(Math.ceil(SCENARIO_SEC / HURL_PERIOD_SEC) - 1);
    expect(ev.every((e) => e.type === 'hurl')).toBe(true);
  });

  it('throws on an unknown scenario id', () => {
    expect(() => scenarioEvents('Z')).toThrow(/unknown perf scenario/);
  });

  it('pins the probe DPR', () => {
    expect(PROBE_DPR).toBe(1.5);
  });
});
