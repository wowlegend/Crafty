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
import { CLIMBERS } from './localPath.js';
import { LEAP_RANGE, mobSensePoint } from './mobSenses.js';
import { rampVelocity, ACCEL_RATE, DECEL_RATE } from './gameFeel.js';
import { isHostile } from '../combat/targeting.js';

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
 *   gapM, dtS       the horizontal distance from the threat to the point the frame's step starts from, and the
 *                   frame's seconds: THE STEP BOUND (round-1 review b). Within a frame the body moves in a straight
 *                   line, so a tangential step L at gap g ends sqrt(g² + L²) - g further out, a leak of about
 *                   t² dt / 2g m/s on top of the clamped retreat, which grows with the frame interval (3.4 m/s at a
 *                   400 ms frame at 2.5 m, against a husk that closes at 3.0). When the step would end further than
 *                   gapM + retreat x dtS from the threat, its end is pulled in radially to exactly that, which scales
 *                   the step's away and tangential parts down together. So the TARGET's step never takes the body
 *                   further from the threat than the retreat cap allows, at any frame interval; a pure retreat is
 *                   untouched, and at 60 fps the cost is a few cm/s of strafe. gapM 0 (unknown) skips the bound. The
 *                   ramp after it can still lean the velocity away from the threat when the target turns, so stanceWalk
 *                   holds the same bound again on what the ramp returns (holdStepBound, round-2 review); the limits of
 *                   what either proves are the seam's KNOWN LIMITS below.
 *
 * w === 0 returns (vx, vz) untouched, so out of combat the identity is exact rather than a float coincidence.
 */
export function stanceVelocity(vx, vz, awayX, awayZ, w, formMult = 1, walkMult = 1, caps = STANCE_CAPS, out = { x: 0, z: 0 }, gapM = 0, dtS = 0) {
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
    if (gapM > 0 && dtS > 0) {
      const ex = gapM + r * dtS, et = t * dtS; // where the step ends, in the (away, tangent) frame from the threat
      const reach = Math.hypot(ex, et);
      const limit = gapM + retreat * dtS;
      if (reach > limit) {
        const k = limit / reach;
        r = (ex * k - gapM) / dtS;
        t = (et * k) / dtS;
      }
    }
    cx = awayX * r + tx * t;
    cz = awayZ * r + tz * t;
  }
  out.x = lerp(vx, cx, w);
  out.z = lerp(vz, cz, w);
  return out;
}

// ---- Engage, calm, blend: the stance state machine (Task 4) -------------------------------------------------------

/** A threat engages within this HORIZONTAL distance (m). */
export const ENGAGE_RADIUS_M = 12;
/** The stance stays engaged this long (ms) after the last frame a threat qualified. */
export const CALM_MS = 2000;
/** w rises 0 -> 1 over ENTER_S and falls 1 -> 0 over EXIT_S (seconds). */
export const ENTER_S = 0.2;
export const EXIT_S = 0.6;
/** The current threat holds until another qualifier is MORE than this much nearer (m): no jitter between equals. */
export const THREAT_SWITCH_M = 1.0;
/** A mob outside its strike reach that has made less than STALL_PROGRESS_M (m) of its OWN progress toward the player
 *  in STALL_MS (ms) stops qualifying: a husk stranded under a ledge must not hold the stance forever. */
export const STALL_MS = 1500;
export const STALL_PROGRESS_M = 0.5;
/** A mob within its strike reach plus this (m) is never stalled: it can hit you standing still. */
export const MELEE_MARGIN_M = 1.0;

// Per type, cached once: archetypeFor builds a fresh object per call, and stanceStep runs per mob per frame.
const _reach = new Map();
function reachOf(type) {
  let r = _reach.get(type);
  if (!r) {
    const a = archetypeFor(type);
    // A climber (the spider) strikes with its leap, which covers LEAP_RANGE across AND up (ai.worker.js, the leap
    // branch: canReach(dx, dy, dz, LEAP_RANGE, LEAP_RANGE)); every other type with its melee reach.
    const leaps = CLIMBERS.has(type);
    r = { dy: leaps ? LEAP_RANGE : a.verticalReach, strike: leaps ? LEAP_RANGE : a.meleeRange };
    _reach.set(type, r);
  }
  return r;
}

/** How far above or below the player a mob of `type` may stand and still engage (m): the reach it strikes with. */
export function engageDyM(type) {
  return reachOf(type).dy;
}

const _state = {
  w: 0, engaged: false, threatId: null, awayX: 0, awayZ: 0, gap: 0, lastEngagedAt: -Infinity,
  threatX: 0, threatZ: 0, playerX: 0, playerY: 0, playerZ: 0, frame: 0,
};

// The stall clocks: id -> { ax, az, at, seen }, the mob's position when it last made STALL_PROGRESS_M of its own
// progress, and when. Kept for EVERY aggro'd hostile pursuer, not only those in range (a deviation from the plan,
// which scoped them to range): a range-scoped clock restarts each time a stranded mob flickers across the 12 m radius
// or its reach bound (the eye bobs a few cm a step), so a mob that never gains could hold the stance forever. A clock
// whose mob was not an aggro'd hostile this frame is dropped, so the map is bounded by the live mobs.
const _anchors = new Map();
let _tag = 0;
const _sweep = (a, id) => { if (a.seen !== _tag) _anchors.delete(id); };

/**
 * One frame of the stance. Mutates and returns `state` (pass getStance()). Allocation-free in steady state: one small
 * object per newly aggro'd mob, for its stall clock.
 *
 *   mobs    the live mob entities (mobsQuery.entities), read only.
 *   player  { x, y, z }. y is THE HEIGHT MOBS MEASURE THE PLAYER FROM: mobSensePoint(camera).y (game/mobSenses.js),
 *           the point AIWorkerSystem posts to the worker, so a mob counted as able to reach you is one the worker would
 *           let swing (the plan's height-reference deviation). x and z are the body this frame, the point the frame's
 *           step starts from (stanceFrame builds it): the away vector and `gap` must be measured from there, not from
 *           the camera, which trails the body by about 1.2 frames (round-1 review b).
 *   nowMs   performance.now(): the stance is the player's real-time feel, like heavyAttack.js.
 *   dtS     the frame's seconds, for the blend.
 *
 * A mob QUALIFIES when it is hostile (isHostile: not protected, passive or dead/dying), aggro'd, not a NON_PURSUER,
 * within ENGAGE_RADIUS_M horizontally and engageDyM(type) vertically, and not stalled. The threat is the current one
 * while it qualifies, unless another is more than THREAT_SWITCH_M nearer; else the nearest. With no qualifier the
 * last threat's position is kept, so the calm and the exit blend still clamp against where the fight was. `gap` is the
 * horizontal distance from the player point to the threat (0 with no threat), for stanceVelocity's step bound.
 */
export function stanceStep(state, mobs, player, nowMs, dtS) {
  state.frame++;
  _tag = state.frame;
  const px = player.x, py = player.y, pz = player.z;
  let nearId = null, nearD = Infinity, nearX = 0, nearZ = 0;
  let curD = Infinity, curX = 0, curZ = 0;
  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    if (!isHostile(m) || !m.isAggro || m.type in NON_PURSUERS) continue;
    const mx = m.position.x, mz = m.position.z;
    const dx = px - mx, dz = pz - mz;
    const d = Math.hypot(dx, dz);
    let a = _anchors.get(m.id);
    if (!a) { a = { ax: mx, az: mz, at: nowMs, seen: 0 }; _anchors.set(m.id, a); }
    a.seen = _tag;
    // The mob's OWN displacement since its anchor, projected on the direction to the player. The player's motion
    // never enters it: walking up to a stranded husk is not the husk making progress.
    if (d > 1e-9 && ((mx - a.ax) * dx + (mz - a.az) * dz) / d >= STALL_PROGRESS_M) { a.ax = mx; a.az = mz; a.at = nowMs; }
    if (d > ENGAGE_RADIUS_M) continue;
    const r = reachOf(m.type);
    if (Math.abs(m.position.y - py) > r.dy) continue;
    if (d > r.strike + MELEE_MARGIN_M && nowMs - a.at >= STALL_MS) continue;
    if (d < nearD) { nearD = d; nearId = m.id; nearX = mx; nearZ = mz; }
    if (m.id === state.threatId) { curD = d; curX = mx; curZ = mz; }
  }
  _anchors.forEach(_sweep);

  if (nearId !== null) {
    state.lastEngagedAt = nowMs;
    if (curD !== Infinity && !(nearD < curD - THREAT_SWITCH_M)) {
      state.threatX = curX; state.threatZ = curZ;
    } else {
      state.threatId = nearId; state.threatX = nearX; state.threatZ = nearZ;
    }
  }
  state.engaged = nowMs - state.lastEngagedAt < CALM_MS;

  if (state.engaged) state.w = Math.min(1, state.w + dtS / ENTER_S);
  else state.w = Math.max(0, state.w - dtS / EXIT_S);
  if (!state.engaged && state.w === 0) state.threatId = null;

  state.playerX = px; state.playerY = py; state.playerZ = pz;
  if (state.threatId === null) {
    state.awayX = 0; state.awayZ = 0; state.gap = 0;
  } else {
    const ax = px - state.threatX, az = pz - state.threatZ;
    const l = Math.hypot(ax, az);
    if (l < 1e-3) { state.awayX = 0; state.awayZ = 0; state.gap = 0; } else { state.awayX = ax / l; state.awayZ = az / l; state.gap = l; }
  }
  return state;
}

/** The live stance, read transiently by the controller and passed back to stanceStep. Never subscribed. */
export function getStance() {
  return _state;
}

// The controller's own record of the frame's movement command (Task 5): `raw` is moveVector's output, `target` what
// the stance handed rampVelocity, `applied` what stanceWalk returns (the ramp's output with the step bound held on it),
// which is the planar velocity the KCC is fed (before knockback and hitstop), and `frame` the stance frame it belongs
// to. Read by the DEV hook readMoveTarget. Round-1 review c: the e2e judged only `target`, so a bypass placed AFTER the
// record (the ramp fed the raw move) passed every frame-rate-independent assertion; it judges `applied` now. The record
// is written INSIDE stanceWalk, so a bypass placed after stanceWalk returns, in Components.jsx, is not in it (the seam's
// known limit 2). Number writes into one object; no allocation.
const _moveTarget = { rawX: 0, rawZ: 0, targetX: 0, targetZ: 0, appliedX: 0, appliedZ: 0, w: 0, frame: 0 };

/** Record this frame's raw, target and applied planar velocities and the weight they were blended with. */
export function noteMoveTarget(rawX, rawZ, targetX, targetZ, appliedX, appliedZ, w) {
  _moveTarget.rawX = rawX; _moveTarget.rawZ = rawZ;
  _moveTarget.targetX = targetX; _moveTarget.targetZ = targetZ;
  _moveTarget.appliedX = appliedX; _moveTarget.appliedZ = appliedZ;
  _moveTarget.w = w; _moveTarget.frame = _state.frame;
}

// ---- The controller's seam (round-1 review c) ---------------------------------------------------------------------
// Everything between the Player controller's inputs and the planar velocity it hands the KCC runs through these two,
// so a unit test drives what that wiring DOES WITH ITS ARGUMENTS, which only the e2e could see before: the point the
// stance measures from, the order of the form and walk multipliers, that the ramp is fed the clamped target, and that
// the bound holds on what the ramp returns. What stays in Components.jsx is one call each, in the frame's order.
//
// KNOWN LIMITS:
//   1. F1 IS PROVEN FOR THE PLAYER'S OWN STEP ONLY, AND ONLY AT FULL STANCE WEIGHT (w = 1): at every frame interval from
//      8 to 400 ms, for every key sequence the unit sweep drives in the human form (held keys, strafe reversals,
//      releases, a turning view) and for a strafe reversal in each beast form, the velocity stanceWalk returns never
//      takes the body away from the threat faster than the retreat cap, except while it decays a dodge's burst
//      (limit 4). During the enter and exit
//      blends (w < 1) the post-ramp bound pulls the step in by only w of its excess (holdStepBound), so the body may
//      leave faster than the cap there. F1 also needs the husk to close, and the AI worker caps a tick at 0.25 s
//      (AIWorkerSystem.jsx) while the player steps by the whole frame: above 250 ms frames a mob covers speed x
//      0.25 / dt per second, so above 375 ms (about 2.7 fps) a 3.0 m/s husk cannot close on the 2.0 backpedal at all. The
//      husk's 15 Hz aim on A* cell centres lowers its closing speed further, and is not measured.
//   2. THE CALL SITES' ARGUMENTS in Components.jsx are pinned by no unit test: the unit tests hand the seam their own.
//      Unpinned: stanceFrame's body (camera.position in its place brings back a low-frame-rate kite, the camera trailing
//      the body), stanceWalk's walkMult (1 in its place stops the heavy-charge and swing slows from slowing the retreat),
//      the order of the form and the walk slow, the KCC being fed what stanceWalk returns, the void guard teleporting
//      through teleportPlayer, and the dodge branch marking its burst with dodgeBurst. In the e2e, case 0 pins only the
//      HEIGHT of stanceFrame's point: x and z are compared standing still, where the camera has converged on the body,
//      and mobSensePoint is the camera's position. A wrong body or a bypassed stanceWalk can show only in a chase
//      sub-assertion, judged only at a median frame interval of 250 ms or less (the catch only when every frame of the
//      hold up to it was); no e2e case charges a heavy in a fight,
//      or dodges in one.
//   3. THE KCC IS DOWNSTREAM. The bound is on the velocity FED to computeColliderMovement, not on the movement it
//      returns, and a slide along a wall can raise a step's away part (plausible by arithmetic, unmeasured). Knockback
//      and hitstop are added after the stance on purpose: a blow that throws the player is not the player's own step.
//   4. A DODGE'S DECAY IS NOT BOUNDED. The dodge is the deliberate escape, so the ramp brings its burst down unbounded,
//      as it does out of a fight, for at most the burst's carry window (dodgeBurst) and no longer than it takes to reach
//      its target. Keys changed inside that window are clamped on the target only.

const _point = { x: 0, y: 0, z: 0 };
const _clamped = { x: 0, z: 0 };

/**
 * One frame of the stance, as the controller runs it: stanceStep on the live stance, with the player point built from
 * this frame's BODY across (the point the frame's step starts from, so the away vector and the gap are this frame's)
 * and the height the AI worker strikes from (mobSensePoint(camera).y). Returns the live stance.
 *   mobs    mobsQuery.entities
 *   body    the rigid body's translation this frame
 *   camera  the game camera
 */
export function stanceFrame(mobs, body, camera, nowMs, dtS) {
  _point.x = body.x; _point.y = mobSensePoint(camera).y; _point.z = body.z;
  return stanceStep(_state, mobs, _point, nowMs, dtS);
}

/**
 * The planar velocity a dodge's burst sets, marked as a burst. The controller writes it while the dodge runs; the burst
 * itself never passes through stanceWalk. `carryS` is how long the walk ramp may take to bring it down: each axis moves
 * toward its target at no less than the slower of the ramp's two rates, so by then the burst's largest axis is spent.
 */
export function dodgeBurst(x, z) {
  return { x, z, carryS: Math.max(Math.abs(x), Math.abs(z)) / Math.min(ACCEL_RATE, DECEL_RATE) };
}

/**
 * The frame's walk (Components.jsx, the pointer-locked branch): moveVector's output `mv` clamped by the stance, then the
 * W4 ramp from `planarVel`, then the step bound held on the ramped velocity (holdStepBound). Records raw, target and
 * applied (noteMoveTarget) and returns the applied velocity (a fresh object, as rampVelocity's), which the controller
 * feeds the KCC and keeps as next frame's planarVel.
 *   loco      the form's locomotion (formLocomotion): its moveMult is the form's pace. The object, not a bare number,
 *             so the form and the walk slow cannot be transposed as two numbers.
 *   walkMult  the product of the walk slows (heavyWalkMult x stringWalkMult)
 *   planarVel last frame's velocity. One made by dodgeBurst, or carried on from one, is a dodge's burst decaying: the
 *             dodge is the deliberate escape, so the ramp brings it down unbounded, as it does out of a fight. The
 *             carry ends when the ramp reaches its target or its window runs out, and the walk is bounded again.
 */
export function stanceWalk(mv, stance, loco, walkMult, planarVel, dtS) {
  let tx = mv.moving ? mv.x : 0;
  let tz = mv.moving ? mv.z : 0;
  if (mv.moving) {
    // The stance clamps the AWAY-from-threat component of the move, whatever key produced it; at w = 0 it is the
    // identity, so travel keeps 14 m/s.
    stanceVelocity(mv.x, mv.z, stance.awayX, stance.awayZ, stance.w, loco.moveMult, walkMult, STANCE_CAPS, _clamped, stance.gap, dtS);
    tx = _clamped.x; tz = _clamped.z;
  }
  const ramped = rampVelocity(planarVel, { x: tx, z: tz }, dtS);
  if (planarVel.carryS > 0) {
    const left = planarVel.carryS - dtS;
    if (left > 0 && (ramped.x !== tx || ramped.z !== tz)) ramped.carryS = left;
  } else {
    holdStepBound(ramped, stance, walkMult, tx, tz, dtS);
  }
  noteMoveTarget(mv.x, mv.z, tx, tz, ramped.x, ramped.z, stance.w);
  return ramped;
}

/**
 * The step bound, held on the velocity the body is fed. stanceVelocity bounds the target, but rampVelocity moves each
 * world axis toward it on its own, so when the target turns (a strafe that changes side, keys released mid-strafe) the
 * two axes arrive at different times and the ramped velocity `v` leans away from the threat. So the bound runs again
 * on `v`, in place. Ramping in the (away, tangent) frame would not hold it: that frame turns as the player circles, and
 * the bound is a disc about the threat, which a per-axis step between two points inside it can still leave.
 *   The allowed reach is the larger of the hard one (gap + retreat x walkMult x dt) and the target's own (tx, tz), and
 *   the step's end is pulled in radially by w of its excess over it. Only at w = 1 is that the hard bound: the target's
 *   own reach is then inside the hard one, so the fed velocity leaves no faster than the retreat cap. During the enter
 *   and exit blends (w < 1) the pull-in covers only w of the excess, so the fed velocity may leave faster than both its
 *   target and the cap, by (1 - w) of that excess. w = 0 is the identity, and nothing jumps as the weight moves. A
 *   settled velocity (v = target) is never touched, so the blend stays one linear blend at every frame interval. Radial
 *   only: the strafe and advance caps are held on the target, and the ramp may overshoot them while it turns.
 */
function holdStepBound(v, stance, walkMult, tx, tz, dtS) {
  const w = stance.w, gap = stance.gap;
  if (w === 0 || !(gap > 0) || !(dtS > 0)) return v;
  const ax = stance.awayX, az = stance.awayZ, nx = -az, nz = ax; // away, and the tangential axis
  const ex = gap + (v.x * ax + v.z * az) * dtS, et = (v.x * nx + v.z * nz) * dtS; // the step's end, from the threat
  const reach = Math.hypot(ex, et);
  const own = Math.hypot(gap + (tx * ax + tz * az) * dtS, (tx * nx + tz * nz) * dtS);
  const allowed = Math.max(gap + STANCE_CAPS.retreat * walkMult * dtS, own);
  if (reach <= allowed) return v;
  const k = (reach - w * (reach - allowed)) / reach;
  const r = (ex * k - gap) / dtS, t = (et * k) / dtS;
  v.x = ax * r + nx * t;
  v.z = az * r + nz * t;
  return v;
}

/** The live move-target record (the DEV hook copies it). */
export function readMoveTarget() {
  return _moveTarget;
}

/**
 * A NON-DEATH TELEPORT: the void-fall guard (Components.jsx) and a save load (useGameStore loadWorldData). The body is
 * moved, stopped when `stop` (the void guard's falling body; a load's kinematic body carries none), and the stance is
 * reset: the fight it was in is somewhere else now. Round-1 review f: both sites teleported and kept the stance, so for
 * up to CALM_MS + EXIT_S (2.6 s) the walk at the new site was clamped against the old fight's threat, with no mob near.
 */
export function teleportPlayer(rb, pos, stop = false) {
  rb.setTranslation(pos, true);
  if (stop) rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
  resetStance();
}

/** Death: no weight, no engagement, no threat, no calm carried over, and every stall clock dropped. */
export function resetStance() {
  _state.w = 0; _state.engaged = false; _state.threatId = null; _state.awayX = 0; _state.awayZ = 0; _state.gap = 0;
  _state.lastEngagedAt = -Infinity;
  _anchors.clear();
}
