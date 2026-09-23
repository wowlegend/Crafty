// worldClock.js — the ONE place a useFrame asks "how much world time passed this frame?" (QUEUE R2.6).
//
// Hitstop holds the WORLD (game/hitstop.js). It used to reach only the consumers that had each been edited to
// read worldTimeScale, so allies, projectiles, particles, zones, orbs and loot moved through every freeze.
// Now every useFrame that takes a delta routes it through worldDelta or realDelta, and a census gate
// (world-delta-census-gates) fails on any that reads its frame delta raw — so a new world system cannot
// forget to freeze without saying, at its own call site, that it runs on real time.
//
// ONE ANSWER PER FRAME (review #3, R4.10): the freeze scale is computed once, by systems/WorldClockTicker.jsx
// (mounted in GameScene, running before every other useFrame), and read by every consumer. Recomputed per call,
// it cost a clock read and a store read per mob per frame, and two consumers in one frame could straddle the
// moment the freeze ended and disagree about whether the world was frozen.
import { useGameStore } from '../store/useGameStore';
import { worldTimeScale } from './hitstop.js';

let scale = 1;
let worldMs = null;

/**
 * Advance the world one frame: this frame's freeze scale, and the WORLD clock — wall time minus every frozen
 * span (R2.7). A CLOSED FORM, not an accumulation over ticks: the store banks each finished burst's span when the
 * next one starts (hitstopFrozenTotal), and the burst in force contributes its elapsed part. Summing overlaps per
 * tick lost a burst that ended and another that began between two frames (review #5, R6.6).
 * Called once per frame by systems/WorldClockTicker.jsx; tests call it directly with an injected `now`.
 */
export function tickWorldClock(now = performance.now()) {
  const { hitstopUntil = 0, hitstopStart = 0, hitstopFrozenTotal = 0 } = useGameStore.getState();
  scale = worldTimeScale(now, hitstopUntil);
  worldMs = now - hitstopFrozenTotal - Math.max(0, Math.min(now, hitstopUntil) - hitstopStart);
}

/**
 * The WORLD clock, ms, in performance.now()'s units: it does not advance through a hitstop (QUEUE R2.7). The AI
 * worker's timers (windup, brace, charge, recovery), the windup telegraph and the dragon's attack timers read it,
 * so a freeze HOLDS them rather than spending them — a windup begun before your hit no longer expires inside
 * the freeze and strikes the frame it ends. Before the first tick it is the wall clock.
 */
export function worldNow() {
  return worldMs === null ? performance.now() : worldMs;
}

/** A world-simulating useFrame's delta: 0 through a hitstop freeze, the frame's delta otherwise. */
export function worldDelta(delta) {
  return delta * scale;
}

/** Is the world frozen this frame? For a consumer whose timers are not delta-driven (BossEntity's attacks). */
export function isWorldFrozen() {
  return scale === 0;
}

/**
 * A useFrame that runs on REAL time on purpose — the player controller (it applies the freeze to its own
 * motion), the sky's mood lerp, the weather, the physics debris. Identity: the name is the decision, made where
 * it is reviewed.
 */
export function realDelta(delta) {
  return delta;
}
