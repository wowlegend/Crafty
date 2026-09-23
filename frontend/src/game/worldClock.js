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

/** Compute this frame's freeze scale. Called once per frame by <WorldClockTicker>; tests call it directly. */
export function tickWorldClock(now = performance.now()) {
  scale = worldTimeScale(now, useGameStore.getState().hitstopUntil);
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
