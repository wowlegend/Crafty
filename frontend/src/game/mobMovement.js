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

/** Deterministic +1 / -1 from a mob id. No RNG: the worker and the capture gate both forbid one. */
export function flankSide(id) {
  const s = String(id ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h & 1) ? 1 : -1;
}

/**
 * Where this mob should WALK TOWARD this tick. Returns a goal position, never a velocity — the worker
 * already owns pathing and speed, and handing it a goal keeps this module out of both.
 *
 * @param {string} kind  'beeline' | 'flank' | 'shoulder' (anything else -> beeline)
 * @param {{x:number,z:number,playerX:number,playerZ:number,id?:string}} ctx
 * @returns {{targetX:number, targetZ:number}}
 */
export function movementGoal(kind, ctx) {
  const { x, z, playerX, playerZ, id } = ctx || {};
  const beeline = { targetX: playerX, targetZ: playerZ };
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
    return { targetX: playerX + (-dz / dist) * offset, targetZ: playerZ + (dx / dist) * offset };
  }

  if (kind === 'shoulder') {
    // Outside the charge band it walks straight at you like anything else. Inside it, it aims PAST you
    // and commits, which is what makes the slowest, hardest-hitting mob in the game dodgeable instead of
    // merely unavoidable. The overshoot is what a player reads as "it committed".
    if (dist > SHOULDER_CHARGE_DIST) return beeline;
    return {
      targetX: playerX + (dx / dist) * SHOULDER_OVERSHOOT,
      targetZ: playerZ + (dz / dist) * SHOULDER_OVERSHOOT,
    };
  }

  return beeline;
}
