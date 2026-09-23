// worldClock.js — the ONE place a useFrame asks "how much world time passed this frame?" (QUEUE R2.6).
//
// Hitstop holds the WORLD (game/hitstop.js). It used to reach only the consumers that had each been edited to
// read worldTimeScale, so allies, projectiles, particles, zones, orbs and loot moved through every freeze.
// Now every useFrame that takes a delta routes it through one of these two, and a census gate
// (world-delta-census-gates) fails on any that reads its frame delta raw — so a new world system cannot
// forget to freeze without saying, at its own call site, that it runs on real time.
import { useGameStore } from '../store/useGameStore';
import { worldTimeScale } from './hitstop.js';

/** A world-simulating useFrame's delta: 0 through a hitstop freeze, the frame's delta otherwise. */
export function worldDelta(delta) {
  return delta * worldTimeScale(performance.now(), useGameStore.getState().hitstopUntil);
}

/**
 * A useFrame that runs on REAL time on purpose — the player controller (it applies the freeze to its own
 * motion), the sky's mood lerp, the weather. Identity: the name is the decision, made where it is reviewed.
 */
export function realDelta(delta) {
  return delta;
}
