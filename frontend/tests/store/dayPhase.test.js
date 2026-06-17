import { describe, it, expect } from 'vitest';
import { cycleFraction, dayPhase, halfCycleFraction, isDuskApproaching } from '../../src/game/dayPhase.js';

// M6 #10 (day-phase dial): pure cycle math for the HUD sun/moon dial. CYCLE_UNITS=1200 (full day+night),
// HALF_CYCLE_UNITS=600. cycleFraction drives the marker's orbit angle; dayPhase is the dial descriptor.
// The component does ZERO arithmetic -> all math is locked here (Game-Loop-Isolation + determinism).
describe('M6 #10 cycleFraction (full-cycle progress for the dial arc)', () => {
  it('maps gameTime to [0,1) over the full 1200-unit cycle', () => {
    expect(cycleFraction(0)).toBe(0);
    expect(cycleFraction(600)).toBe(0.5);
    expect(cycleFraction(300)).toBe(0.25);
    expect(cycleFraction(900)).toBe(0.75);
  });

  it('wraps the unbounded monotonic gameTime (mod a full cycle)', () => {
    expect(cycleFraction(1200)).toBe(0);     // exactly one cycle -> wrap to 0
    expect(cycleFraction(1800)).toBe(0.5);   // 1.5 cycles -> 0.5
  });

  it('handles negative gameTime with a positive modulo', () => {
    expect(cycleFraction(-300)).toBe(0.75);
  });

  it('finite-guards NaN / undefined / Infinity to 0 (never throws)', () => {
    expect(cycleFraction(NaN)).toBe(0);
    expect(cycleFraction(undefined)).toBe(0);
    expect(cycleFraction(Infinity)).toBe(0);
  });

  it('is monotonic within a cycle', () => {
    expect(cycleFraction(300)).toBeGreaterThan(cycleFraction(0));
    expect(cycleFraction(900)).toBeGreaterThan(cycleFraction(600));
  });
});

describe('M6 #10 dayPhase (the dial descriptor)', () => {
  it('day start (gameTime 0, isDay true): noon-relative fields + no dusk', () => {
    const p = dayPhase(0, true);
    expect(p.isDay).toBe(true);
    expect(p.halfFraction).toBe(0);
    expect(p.phaseRemaining).toBe(1);
    expect(p.duskApproaching).toBe(false);
    expect(p.angleDeg).toBe(0);
    expect(p.nightCount).toBe(0);
  });

  it('mid-half (gameTime 300): halfFraction 0.5, angleDeg 90, no dusk yet', () => {
    const p = dayPhase(300, true);
    expect(p.halfFraction).toBe(0.5);
    expect(p.phaseRemaining).toBe(0.5);
    expect(p.duskApproaching).toBe(false);
    expect(p.angleDeg).toBe(90);
  });

  it('dusk fires in the final ~0.18 of the day half (default lead), not before', () => {
    expect(dayPhase(510, true).duskApproaching).toBe(true);  // 510/600 = 0.85 >= 0.82
    expect(dayPhase(470, true).duskApproaching).toBe(false); // 470/600 = 0.783 < 0.82
    expect(dayPhase(510, true).nightImminent).toBe(true);    // alias mirrors
    expect(dayPhase(470, true).nightImminent).toBe(false);
  });

  it('night (gameTime 700, isDay false): not day, dusk gated off, phaseRemaining tracks the half', () => {
    const p = dayPhase(700, false);
    expect(p.isDay).toBe(false);
    expect(p.duskApproaching).toBe(false);
    expect(p.phaseRemaining).toBeCloseTo(1 - 100 / 600, 6); // 700 % 600 = 100
  });

  it('nightCount is echoed + clamped to a non-negative integer', () => {
    expect(dayPhase(700, false, 3).nightCount).toBe(3);
    expect(dayPhase(0, true, -2).nightCount).toBe(0);
    expect(dayPhase(0, true, NaN).nightCount).toBe(0);
  });

  it('finite-guards a bad gameTime without throwing', () => {
    const p = dayPhase(NaN, true);
    expect(p.cycleFraction).toBe(0);
    expect(p.halfFraction).toBe(0);
    expect(p.angleDeg).toBe(0);
  });

  it('respects a duskLead override (wires the parameter through to isDuskApproaching)', () => {
    expect(dayPhase(480, true).duskApproaching).toBe(false);        // 0.80 < 0.82 (default lead)
    expect(dayPhase(480, true, 0, 0.25).duskApproaching).toBe(true); // 0.80 >= 0.75 (wider lead)
  });

  it('re-exports the existing kernel helpers it builds on', () => {
    expect(typeof halfCycleFraction).toBe('function');
    expect(typeof isDuskApproaching).toBe('function');
  });
});
