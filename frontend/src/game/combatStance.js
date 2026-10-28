// combatStance.js — once a fight is joined, you can no longer outwalk it (masterpiece Phase 1, refute F1).
// Plan: docs/superpowers/plans/2026-10-27-crafty-combat-stance.md, whose "Why the numbers are what they are"
// section is the derivation this file implements.
//
// PURE. No THREE, no React, no store. The imperative Player controller (src/Components.jsx) calls it through
// transient reads, once per frame.
//
// THE CAPS ARE DERIVED FROM THE ROSTER, never typed. The player travels at BASE_MOVE_SPEED (14 m/s) in every
// direction. A mob steering straight at the player changes the gap at (player velocity . away-unit) - chase
// speed, so what decides whether a fight can be outwalked is the AWAY-FROM-THREAT component of the player's
// velocity, whatever key produced it. The retreat cap sits MIN_CLOSING_RATE under the SLOWEST pursuer, so every
// pursuer closes on any retreat; the strafe and advance caps sit STRAFE_MARGIN over the FASTEST, the footwork
// pace of a fight: it out-circles any chaser's turn and cannot outrun one, because circling adds nothing to the
// radial escape. A slower pursuer added later fails RETREAT_FLOOR at load rather than turning the backpedal into
// a crawl.
import { MOB_TYPES } from './mobTypes.js';
import { archetypeFor } from './mobArchetypes.js';
import { chaseSpeedMult, SHOULDER_CHARGE_SPEED } from './mobMovement.js';
import { BASE_MOVE_SPEED } from './locomotion.js';

export { BASE_MOVE_SPEED };

/** Every pursuer closes at least this fast (m/s) on a player retreating at the cap. */
export const MIN_CLOSING_RATE = 1.0;
/** A derived retreat cap below this is refused at load: the backpedal would read as a crawl. */
export const RETREAT_FLOOR = 1.5;
/** The strafe and advance caps sit this far (m/s) over the fastest pursuer. */
export const STRAFE_MARGIN = 0.5;

/**
 * Hostiles that do not pursue, each with the reason. The derivation skips them, and so does engagement (Task 4's
 * stanceStep): counted as a threat, an archer at the edge of its range would pin a player walking away.
 */
export const NON_PURSUERS = Object.freeze({
  skeleton: 'kites: retreats inside 8 m, shoots from 8-12 m, closes beyond 12 m (ai.worker.js:198-211)',
});

/** What closes on a still player: base speed x the aggro chase multiplier x the shoulder charge, if it charges. */
export function pursuitSpeed(type, roster = MOB_TYPES) {
  const charge = archetypeFor(type).movement === 'shoulder' ? SHOULDER_CHARGE_SPEED : 1;
  return roster[type].speed * chaseSpeedMult(type, true) * charge;
}

/** Every hostile (not passive) that is not a named non-pursuer. */
export function pursuers(roster = MOB_TYPES) {
  return Object.keys(roster).filter((t) => !roster[t].passive && !(t in NON_PURSUERS));
}

/**
 * The stance caps from a roster: { retreat, strafe, advance, slowest, fastest } (m/s, and the two type names the
 * caps were read from). Throws when the roster has no pursuer, or when the retreat cap falls under RETREAT_FLOOR.
 */
export function deriveStanceCaps(roster = MOB_TYPES) {
  const ps = pursuers(roster);
  if (ps.length === 0) throw new Error('deriveStanceCaps: the roster has no pursuer (empty denominator)');
  const speeds = ps.map((t) => pursuitSpeed(t, roster));
  const lo = Math.min(...speeds);
  const hi = Math.max(...speeds);
  const slowest = ps[speeds.indexOf(lo)];
  const fastest = ps[speeds.indexOf(hi)];
  const retreat = lo - MIN_CLOSING_RATE;
  if (retreat < RETREAT_FLOOR) {
    throw new Error(`deriveStanceCaps: retreat ${retreat} m/s (${slowest} pursues at ${lo}) is under RETREAT_FLOOR ${RETREAT_FLOOR}`);
  }
  const strafe = hi + STRAFE_MARGIN;
  return { retreat, strafe, advance: strafe, slowest, fastest };
}

/** Today's caps, derived once at load. */
export const STANCE_CAPS = Object.freeze(deriveStanceCaps());

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * The stance's velocity: the desired planar velocity (vx, vz) with its AWAY-FROM-THREAT component clamped to the
 * retreat cap, its tangential (strafe) component to the strafe cap and its toward (advance) component to the
 * advance cap, blended in by the stance weight w in [0, 1]. Allocation-free: it writes into `out` and returns it.
 *
 *   (vx, vz)        moveVector's output at moveSpeed(loco) x walkMult, exactly as the controller computes it, so it
 *                   already carries the form and walk multipliers.
 *   (awayX, awayZ)  the unit vector from the threat to the player, or (0, 0) when the threat has no direction: then
 *                   the total speed is capped at the strafe cap instead (and no NaN is made).
 *   formMult        the form's loco.moveMult; walkMult the product of the walk slows (heavyWalkMult, later the
 *                   string's). The strafe and advance caps scale with both, so every form keeps its pace; the
 *                   retreat cap with the walk slows only, so no form outwalks a fight. A clamp is positively
 *                   homogeneous, so scaling the caps by walkMult equals applying the walk slow AFTER the clamp while
 *                   the input path stays exactly today's.
 *
 * w === 0 returns (vx, vz) untouched, so out of combat the identity is exact rather than a float coincidence.
 */
export function stanceVelocity(vx, vz, awayX, awayZ, w, formMult = 1, walkMult = 1, caps = STANCE_CAPS, out = { x: 0, z: 0 }) {
  if (w === 0) { out.x = vx; out.z = vz; return out; }
  const pace = formMult * walkMult;
  const retreat = caps.retreat * walkMult;
  const strafe = caps.strafe * pace;
  const advance = caps.advance * pace;
  let cx, cz;
  if (awayX === 0 && awayZ === 0) {
    const s = Math.hypot(vx, vz);
    const k = s > strafe ? strafe / s : 1;
    cx = vx * k; cz = vz * k;
  } else {
    const tx = -awayZ, tz = awayX; // the tangential axis
    let r = vx * awayX + vz * awayZ; // > 0 is away from the threat
    let t = vx * tx + vz * tz;
    if (r > retreat) r = retreat;
    if (r < -advance) r = -advance;
    if (t > strafe) t = strafe;
    if (t < -strafe) t = -strafe;
    cx = awayX * r + tx * t;
    cz = awayZ * r + tz * t;
  }
  out.x = lerp(vx, cx, w);
  out.z = lerp(vz, cz, w);
  return out;
}
