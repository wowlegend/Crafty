// worldClock.js — the ONE place a useFrame asks "how much world time passed this frame?" (QUEUE R2.6).
// Two things hold the world: a hitstop, and the player pausing (isPlayPaused below). Both reach every consumer through
// the one scale, the world clock, and isWorldFrozenNow for the timers that run outside the frame loop.
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
import { getInput } from '../input/inputState';
import { isCaptureMode } from '../devtest/captureMode';
import { worldTimeScale } from './hitstop.js';

let scale = 1;
let worldMs = null;
// The pause is seen per tick, so its span is counted on the hitstop-adjusted clock: a freeze that overlaps a pause
// is then subtracted once, and the world clock can never run backwards.
let pausedAt = null; // that clock's reading at the tick a pause was first seen; null while playing
let pausedTotal = 0; // that clock's ms spent in every finished pause

/**
 * The player has stopped the game: play has begun, they are alive, and their input is dead. ESC, an open panel, a
 * lost focus and the touch Pause all clear the one input gate (input/inputState.js), so every pause path lands here.
 * The world behind the title keeps running, the death screen is not a pause, and under capture the visual harness
 * holds the world its own way.
 */
export function isPlayPaused({ gameStarted, isAlive, active, captureMode } = {}) {
  return !!gameStarted && isAlive !== false && !active && !captureMode;
}

function pausedIn(state) {
  return isPlayPaused({ gameStarted: state.gameStarted, isAlive: state.isAlive, active: getInput().active, captureMode: isCaptureMode() });
}

/**
 * Advance the world one frame: this frame's freeze scale, and the WORLD clock — wall time minus every frozen
 * span (R2.7). A CLOSED FORM, not an accumulation over ticks: the store banks each finished burst's span when the
 * next one starts (hitstopFrozenTotal), and the burst in force contributes its elapsed part. Summing overlaps per
 * tick lost a burst that ended and another that began between two frames (review #5, R6.6). A pause holds the
 * clock at the reading of the tick that first saw it.
 * Called once per frame by systems/WorldClockTicker.jsx; tests call it directly with an injected `now`.
 */
export function tickWorldClock(now = performance.now()) {
  const state = useGameStore.getState();
  const { hitstopUntil = 0, hitstopStart = 0, hitstopFrozenTotal = 0 } = state;
  const paused = pausedIn(state);
  const unfrozen = now - hitstopFrozenTotal - Math.max(0, Math.min(now, hitstopUntil) - hitstopStart);
  if (paused && pausedAt === null) pausedAt = unfrozen;
  else if (!paused && pausedAt !== null) { pausedTotal += unfrozen - pausedAt; pausedAt = null; }
  scale = paused ? 0 : worldTimeScale(now, hitstopUntil);
  worldMs = (paused ? pausedAt : unfrozen) - pausedTotal;
}

/**
 * Is the world held RIGHT NOW, paused or in a hitstop? The same rule the frame scale applies, read at the call, for a
 * setInterval tick: a timer fires between frames, and keeps firing when the frame loop has stopped, so the last
 * frame's answer can be stale. A tick that lands while the world is held is skipped, so a 1 Hz accumulator loses, on
 * average, the time the world spent held: the same time worldNow loses.
 */
export function isWorldFrozenNow(now = performance.now()) {
  const state = useGameStore.getState();
  return pausedIn(state) || worldTimeScale(now, state.hitstopUntil || 0) === 0;
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

/** A world-simulating useFrame's delta: 0 through a hitstop freeze or a pause, the frame's delta otherwise. */
export function worldDelta(delta) {
  return delta * scale;
}

/** Is the world frozen this frame? For a frame consumer whose timers are not delta-driven (BossEntity's attacks, the spawner). */
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
