// tierGovernor — what the quality tier does when drei's PerformanceMonitor asks for a step (plan
// docs/superpowers/plans/2026-10-27-crafty-steady-cool.md, item d; masterpiece 0f, roadmap move 1 with refute F7).
//
// PerformanceMonitor decides every 2.5 s (10 samples of 250 ms) whether the frame rate sits above or below its bounds,
// and GameScene used to step the tier on EVERY decision with no memory. A device that holds med but not high would then
// climb to high, fail, fall to med, climb again — each step a set of shader compiles and render-target reallocations,
// seen as flicker and hitches (Kevin's iPad: "very buggy / broken"). F7 is right that this oscillation is a hypothesis
// until a device run records it; nothing prevented it either. The rules, all constants:
//   1. after a decline from tier T, re-inclining to T is blocked for REINCLINE_BLOCK_MS (60 s): one transient dip costs
//      a capable machine a minute, not the session;
//   2. after SETTLE_AFTER_DECLINES (2) declines the governor settles: it never inclines again this session (it may still
//      decline — a machine that heats up later must be able to step down);
//   3. a decision is honoured only while the canvas runs at its PLAY pace (governorSamples): behind the title, a panel or
//      an unfocused window the canvas is paced down on purpose, and a frame-rate sampler reads that as a slow GPU;
//   4. a fresh monitor's FIRST window is warm-up and its decision is ignored (governorWarm; review 2026-10-27, steady-cool
//      MED 4). GameScene keys the monitor on the tier, so every step mounts a fresh one: the step's own cost (the per-tier
//      point-light pool changes NUM_POINT_LIGHTS and re-links every lit shader; shadow and composer targets reallocate)
//      lands in that window, and a capable machine could read its own step as a slow GPU and walk itself down to low. Boot
//      and every return to the play pace mount a fresh monitor too, and get the same warm-up.
//
// WHY NO "DOUBLING PER REPEAT" (the brief's third rule). With the settle at 2 declines, at most ONE block is ever set
// before the governor settles, so a block that doubles on each repeat can never reach its second value: it would be dead
// code. Measured the other way in tests/gates/tier-governor-gates.test.js: a per-tier ban instead of a global settle let
// an oscillating monitor probe back (re-incline, then fail) once a block expired — two changes inside one minute — which
// breaks the roadmap's acceptance (at most 1 change a minute after warm-up, 0 after 60 s). If the settle count is ever
// raised, add the doubling with it, and the gate's oscillation case is what will demand it.
import { TIERS } from './quality.js';

export const REINCLINE_BLOCK_MS = 60000;
export const SETTLE_AFTER_DECLINES = 2;

const up = (t) => (t === 'low' ? 'med' : 'high');
const down = (t) => (t === 'high' ? 'med' : 'low');

/** A fresh governor: one per game canvas, for the session. */
export function createGovernor() {
  return { declines: 0, settled: false, blockedUntil: {} };
}

/**
 * A decline decision. Records it and returns the tier to step to, or null when already at the floor.
 * @param {{declines:number, settled:boolean, blockedUntil:Object}} g  mutated
 * @param {string} cur the tier in force
 * @param {number} now ms (performance.now)
 */
export function governorDecline(g, cur, now) {
  const next = down(cur);
  if (next === cur) return null;
  g.declines += 1;
  g.blockedUntil[cur] = now + REINCLINE_BLOCK_MS;
  if (g.declines >= SETTLE_AFTER_DECLINES) g.settled = true;
  return next;
}

/** An incline decision. Returns the tier to step to, or null when settled, at the ceiling, or the target is blocked. */
export function governorIncline(g, cur, now) {
  if (g.settled) return null;
  const next = up(cur);
  if (next === cur) return null;
  if (now < (g.blockedUntil[next] || 0)) return null;
  return next;
}

/** drei PerformanceMonitor's `iterations` (its default; GameScene passes none): the samples in one decision window. */
export const MONITOR_ITERATIONS = 10;

/**
 * PURE. Whether a PerformanceMonitor decision counts: never one from the monitor's first window (rule 4 above). `samples`
 * is the monitor's api.index, the samples it has taken since it mounted; drei calls onIncline/onDecline with that api at
 * the end of each window of MONITOR_ITERATIONS samples, so the first window's decision arrives at exactly that count.
 */
export function governorWarm(samples) {
  return samples > MONITOR_ITERATIONS;
}

/** PURE. Whether the governor may sample this canvas: only at its play pace — the setting's cap, or uncapped. */
export function governorSamples(pace, frameCap) {
  if (pace.loop === 'always') return true;
  return frameCap > 0 && pace.fps === frameCap;
}

/**
 * PURE. The render distance a tier step may use. On a coarse pointer (a phone, an iPad) a runtime step never changes it:
 * it moves the chunk-load radius (world/Terrain.jsx), the far field and the shadow extent, so a step re-streams the world
 * on exactly the devices least able to afford it. `pinTier` is the boot tier on a coarse pointer, null otherwise.
 */
export function renderDistanceFor(tier, pinTier) {
  const t = TIERS[pinTier] || TIERS[tier] || TIERS.low;
  return t.renderDistance;
}
