// dayPhase.js — PURE day/night PHASE math for HUD legibility (no React/Three; node-testable).
// Builds on dayNight.js: each half-cycle (one day half OR one night half) spans HALF_CYCLE_UNITS
// gameTime units. Used by the dusk pre-warning (and, later, a day-phase dial) so the player can read
// "how much day is left" — the actionable half of the onboarding promise "build by day, survive the night".
import { HALF_CYCLE_UNITS, CYCLE_UNITS } from './dayNight.js';

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

// Fraction [0,1) through the FULL day+night cycle (CYCLE_UNITS) -> drives the day-phase dial's sun/moon
// orbit angle (cycleFraction 0=midnight, 0.25=dawn, 0.5=noon, 0.75=dusk). Same finite-guard as above.
export function cycleFraction(gameTime) {
  const t = Number(gameTime);
  if (!Number.isFinite(t)) return 0;
  return (((t % CYCLE_UNITS) + CYCLE_UNITS) % CYCLE_UNITS) / CYCLE_UNITS;
}

// Pure descriptor for the HUD day-phase dial -- the component reads this and does ZERO arithmetic
// (Game-Loop-Isolation + determinism). isDay is echoed straight from the store's authoritative phase
// (matches sky/lighting); duskApproaching delegates to isDuskApproaching so the dial's "night soon" cue
// fires on the EXACT same predicate as the DuskWarning toast (no divergence). All finite-guarded.
export function dayPhase(gameTime, isDay, nightCount = 0, duskLead = 0.18) {
  const cf = cycleFraction(gameTime);
  const hf = halfCycleFraction(gameTime);
  const dusk = isDuskApproaching(gameTime, isDay, duskLead);
  return {
    cycleFraction: cf,         // [0,1) around the full cycle
    halfFraction: hf,          // [0,1) into the current half
    isDay: !!isDay,            // echo the authoritative store phase
    phaseRemaining: 1 - hf,    // [0,1] of the current phase left
    duskApproaching: dusk,     // night/siege imminent (same trigger as DuskWarning)
    nightImminent: dusk,       // alias
    nightCount: Math.max(0, Math.floor(Number(nightCount) || 0)),
    angleDeg: cf * 360,        // ready-to-use marker orbit angle (component applies a -180 display offset)
  };
}
