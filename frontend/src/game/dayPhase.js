// dayPhase.js — PURE day/night PHASE math for HUD legibility (no React/Three; node-testable).
// Builds on dayNight.js: each half-cycle (one day half OR one night half) spans HALF_CYCLE_UNITS
// gameTime units. Used by the dusk pre-warning (and, later, a day-phase dial) so the player can read
// "how much day is left" — the actionable half of the onboarding promise "build by day, survive the night".
import { HALF_CYCLE_UNITS } from './dayNight.js';

// Fraction [0,1) through the CURRENT half-cycle for a gameTime value. Handles negative / nullish / NaN
// (clamps to a real fraction so a resumed or uninitialized clock never throws).
export function halfCycleFraction(gameTime) {
  const t = Number(gameTime);
  if (!Number.isFinite(t)) return 0;
  const into = ((t % HALF_CYCLE_UNITS) + HALF_CYCLE_UNITS) % HALF_CYCLE_UNITS; // positive modulo
  return into / HALF_CYCLE_UNITS;
}

// True when it is currently DAY and within the final `leadFraction` of the day half -> night is imminent.
// Gated on the caller's `isDay` (the store's authoritative phase, robust to the crossing logic) so it can
// never fire at night. leadFraction 0.18 of a ~150s day half ~= the last ~27s of warning. Pure.
export function isDuskApproaching(gameTime, isDay, leadFraction = 0.18) {
  if (!isDay) return false;
  const lf = Math.min(Math.max(Number(leadFraction) || 0, 0), 1);
  return halfCycleFraction(gameTime) >= (1 - lf);
}
