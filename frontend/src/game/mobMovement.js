// mobMovement.js — C5/Q25: HOW a mob approaches, as data, not as a fifth `else if`.
//
// THE GAP THIS CLOSES. `mobArchetypes.js` moved the per-type NUMBERS into a table — aggro radius, leash,
// melee reach, cooldown, vertical reach — and its own docblock names the next slice honestly: "a brute
// that shoulders through, a hound that flanks". What it did not move is MOVEMENT. `ai.worker.js` has
// exactly two typed arms, `skeleton` (archery) and `spider` (leap), and everything else falls through to
// beeline-and-bonk. Of seven hostiles, FIVE — zombie, skitterling, duskhound, moss_brute, emberhusk —
// are the same creature wearing different meshes, which is why the archetype table's careful distinctions
// (the duskhound "a pack hunter", the skitterling "swarm chip damage") do not survive contact with play.
//
// THE SAFETY PROPERTY IS THE SAME ONE THE NUMBERS TABLE SHIPPED WITH, and it is what makes this
// incrementally adoptable: A KIND WITH NO ENTRY REPRODUCES TODAY'S BEHAVIOUR EXACTLY. `beeline` is not a
// new approach, it is the current `else` branch expressed as data. A type gains new movement only by
// being named, so nothing changes for anyone until it is.
//
// PURE. No THREE, no store, no RNG, no clock read beyond what the caller passes. That matters twice: the
// AI runs in a worker, and capture determinism forbids a per-frame random. The flank SIDE is derived by
// hashing the mob id, so a given mob always flanks the same way — deterministic, and it also means a pack
// splits instead of all four hounds choosing the same flank and re-forming a beeline.

/** Lateral offset, in blocks, at the widest point of a flank. */
export const FLANK_WIDTH = 6;
/** Inside this distance a flanker stops arcing and commits, or it would circle forever. */
export const FLANK_COMMIT_DIST = 4;
/**
 * Distance at which the arc reaches its full width.
 *
 * The first version ramped from COMMIT to 2x COMMIT, i.e. saturated at 8 blocks — so a duskhound, whose
 * archetype aggro range is 28, beelined for twenty blocks and only arced in the last eight. The flank
 * was real and almost never visible. Written down because the gate is what surfaced it: the case asks
 * that the arc NARROW as the hound closes, and at 8 blocks it was already at full width, so "far" and
 * "mid" measured the same number. A design defect found by an assertion about behaviour rather than by
 * looking at a screenshot.
 */
export const FLANK_FULL_DIST = 16;
/** How far PAST the player a shoulder-charge aims, so the charge overshoots and can be sidestepped. */
export const SHOULDER_OVERSHOOT = 5;
/** Outside this, a brute walks normally; inside it, it commits to a charge. */
export const SHOULDER_CHARGE_DIST = 14;
/** The brute plants and braces this long after committing, before it moves: the read-and-react window. */
export const SHOULDER_BRACE_MS = 450;
/** A charge that has not arrived by now ends anyway (a wall, a slope, a snag). */
export const SHOULDER_CHARGE_MAX_MS = 3000;
/** After a charge the brute is WINDED this long: it neither moves nor swings. The punish window. */
export const SHOULDER_RECOVER_MS = 1600;
/** Multiplier on the brute's aggro speed while charging. At 1.2 x 1.5 x 3.0 = 5.4 blocks/s it covers a
 *  14-block charge in under three seconds — fast enough to threaten, slow enough to sidestep. */
export const SHOULDER_CHARGE_SPEED = 3.0;
/** Within this of the latched point the charge has arrived. */
export const SHOULDER_ARRIVE = 1.0;

/** A mob with no charge in progress and no recovery pending. */
export const IDLE_CHARGE = Object.freeze({ x: 0, z: 0, at: 0, readyAt: 0 });

/** Deterministic +1 / -1 from a mob id. No RNG: the worker and the capture gate both forbid one. */
export function flankSide(id) {
  const s = String(id ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h & 1) ? 1 : -1;
}

/**
 * Where this mob should head this tick, and in which PHASE of its approach it is.
 *
 * Returns a goal position, never a velocity — the worker owns pathing and speed. Every kind returns the
 * same shape: `phase` is 'walk' | 'brace' | 'charge' | 'recover', and `charge` is the state to carry to the
 * next tick (IDLE_CHARGE, unchanged, for every kind that does not charge).
 *
 * @param {string} kind  'beeline' | 'flank' | 'shoulder' (anything else -> beeline)
 * @param {{x:number,z:number,playerX:number,playerZ:number,id?:string,now?:number,
 *          charge?:{x:number,z:number,at:number,readyAt:number}}} ctx
 * @returns {{targetX:number, targetZ:number, phase:string, charge:{x:number,z:number,at:number,readyAt:number}}}
 */
export function movementGoal(kind, ctx) {
  const { x, z, playerX, playerZ, id, now = 0 } = ctx || {};
  const charge = ctx?.charge || IDLE_CHARGE;
  const beeline = { targetX: playerX, targetZ: playerZ, phase: 'walk', charge };

  if (kind === 'shoulder') return shoulderGoal(x, z, playerX, playerZ, now, charge);

  // Degenerate geometry: standing exactly on the player, or a NaN creeping in from a bad position. Every
  // branch below divides by the distance, and a NaN goal propagates into the path request as a mob that
  // walks to nowhere — silent, and indistinguishable from an idle mob.
  const dx = playerX - x;
  const dz = playerZ - z;
  const dist = Math.hypot(dx, dz);
  if (!Number.isFinite(dist) || dist < 1e-6) return beeline;

  if (kind === 'flank') {
    // Arc in from the side, converging as it closes. At FLANK_COMMIT_DIST the offset is zero, so the
    // hound still arrives — a flank that never converges is just a mob that refuses to engage.
    const t = Math.min(1, Math.max(0, (dist - FLANK_COMMIT_DIST) / (FLANK_FULL_DIST - FLANK_COMMIT_DIST)));
    const offset = FLANK_WIDTH * t * flankSide(id);
    // Perpendicular to the approach vector, normalised.
    return { ...beeline, targetX: playerX + (-dz / dist) * offset, targetZ: playerZ + (dx / dist) * offset };
  }

  return beeline;
}

/**
 * The shoulder charge as a LATCHED state machine: walk -> brace -> charge -> recover -> walk.
 *
 * WHY LATCHED (QUEUE R1.2, HIGH). The first version recomputed the goal every tick from the current
 * vector: "aim OVERSHOOT past the player". With no memory that is a homing beeline — a sidestep re-aims it,
 * so it cannot be dodged — and once the brute passes the player the vector flips, so it turned round and
 * oscillated across the player for the whole fight, facing away half the time. Its gate proved one tick
 * aims past the player; a charge is a property of many ticks, and nothing drove more than one.
 *
 * Now the target is fixed at commit time and held until the brute ARRIVES or times out. Then it is winded
 * for SHOULDER_RECOVER_MS — it stands, and the worker suppresses its swing — which is what makes a dodge
 * worth something: sidestep the charge, punish the recovery. The brace before it moves is the tell.
 * State lives in `charge` ({x, z, at, readyAt}), round-tripped through game/mobStateSync.js.
 */
function shoulderGoal(x, z, playerX, playerZ, now, charge) {
  const stay = (phase, next) => ({ targetX: x, targetZ: z, phase, charge: next });
  const release = () => stay('recover', { x: 0, z: 0, at: 0, readyAt: now + SHOULDER_RECOVER_MS });

  if (charge.at > 0) {
    const t = now - charge.at;
    if (t < SHOULDER_BRACE_MS) return stay('brace', charge);
    const arrived = Math.hypot(charge.x - x, charge.z - z) <= SHOULDER_ARRIVE;
    if (arrived || t >= SHOULDER_BRACE_MS + SHOULDER_CHARGE_MAX_MS) return release();
    return { targetX: charge.x, targetZ: charge.z, phase: 'charge', charge };
  }

  if (now < charge.readyAt) return stay('recover', charge);

  const dx = playerX - x;
  const dz = playerZ - z;
  const dist = Math.hypot(dx, dz);
  const walk = { targetX: playerX, targetZ: playerZ, phase: 'walk', charge };
  if (!Number.isFinite(dist) || dist < 1e-6 || dist > SHOULDER_CHARGE_DIST) return walk;

  // Commit: aim OVERSHOOT past where the player stands NOW, and hold that point.
  return stay('brace', {
    x: playerX + (dx / dist) * SHOULDER_OVERSHOOT,
    z: playerZ + (dz / dist) * SHOULDER_OVERSHOOT,
    at: now || 1, // `at` 0 means no charge, so a latch at t=0 must not read as none
    readyAt: 0,
  });
}
