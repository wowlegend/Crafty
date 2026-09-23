// mobFloor.js — the floor a mob stands on, which is NOT the top of its column (QUEUE R7.1).
//
// The mob ground probe casts down from y = 255 and takes the first surface it meets: the TOP of the column. Under
// a roof, a bridge, an overhang or a tree canopy (leaves are solid in the collider) that is the wrong floor. The
// snap used to lift a mob onto the roof; after P1's step rule it REFUSED the move instead, so a mob could not walk
// under a tree at all — and R6.4's own-column exemption brought the lift back for any mob a roof was built over.
// The floor is the bottom of the AIR GAP the mob's feet are in.
//
// Why the gaps can be read off a ray: the terrain collider is the mesher's boundary surface — a horizontal face
// exactly where a solid block meets a non-solid one (world/mesher.js: water emits no faces, leaves are solid,
// solid-against-solid is culled). So a vertical ray down from the sky crosses faces that strictly alternate TOP
// (entering solid), BOTTOM (leaving it), TOP, ... and every air gap of the column is [a top, the bottom above it].
// Rapier's trimesh casts hit a face from either side (verified against @dimforge/rapier3d-compat 0.19.2), which
// is what lets the walk continue from just past each face.
//
// Pure: columnFaces walks a column with an injected downward cast; floorInColumn picks the floor from its faces.
// world/mobFloorProbe.js binds them to Rapier; Terrain.jsx registers the result as the store's getMobFloor.

/** A gap lower than this cannot be stood in: a mob is ~2 blocks tall, and 1.5 still lets it through a 2-high door. */
export const MOB_CLEARANCE = 1.5;
/** How far above its feet a mob looks for a floor to climb to: the 9x9 grid's half-width, plus slack for stairs. */
export const FLOOR_REACH = 4.5;
/** The feet are tested this far above the feet: the snap sets them exactly ON a face. */
const FEET_EPS = 0.1;
/** The most faces one column walk collects before calling the column unknown. */
const MAX_FACES = 16;
/** How far past a face the next cast starts, so it cannot meet the same face again (faces sit on whole blocks). */
const STEP_PAST = 0.01;

/**
 * The floor under a mob whose feet are at `feet`, given the column's faces from the sky down (descending,
 * alternating top, bottom, top, ...):
 *  - the top of the gap the feet are in, if the mob fits there at its current height;
 *  - else the LOWEST roomy top above the feet within FLOOR_REACH (a step, a stair, a block built under it);
 *  - else Infinity: the column is a wall to this mob. The caller's step rule refuses it like any tall wall.
 * null when the column has no faces (nothing loaded there) or `faces` is null (the walk gave up).
 * @param {number[]|null} faces
 * @param {number} feet
 * @param {number} [clearance]  the gap height the mover needs
 * @returns {number|null}
 */
export function floorInColumn(faces, feet, clearance = MOB_CLEARANCE) {
  if (!faces || faces.length === 0) return null;
  const p = feet + FEET_EPS;
  let above = Infinity;
  for (let i = 0; i < faces.length; i += 2) {
    const top = faces[i];
    const ceiling = i === 0 ? Infinity : faces[i - 1];
    // Room from where the mob would STAND: on the top when it steps up, at its own feet when it walks level or
    // drops — a gap it would have to squeeze into at its current height is not one it can enter.
    const roomy = ceiling - Math.max(top, feet) >= clearance;
    if (top > p) {
      if (roomy && top - feet <= FLOOR_REACH) above = top; // descending: the last one kept is the lowest
      continue;
    }
    if (roomy && ceiling > p) return top; // the gap the feet are in
    break; // the feet are inside solid (or squeezed): only a floor above can take them
  }
  return above;
}

/**
 * Collect the faces of one column from the sky down, stopping at the first TOP at or below the feet: the gap it
 * opens is the lowest that can matter. `castDown(y)` returns the height of the first face below y, or null.
 * @returns {number[]|null} the faces, descending; null when more than MAX_FACES lie above the feet (unknown, not
 *   a wall — the caller skips the snap, as it does for an unloaded column)
 */
export function columnFaces(castDown, feet, sky = 255) {
  const faces = [];
  const p = feet + FEET_EPS;
  let y = sky;
  while (faces.length < MAX_FACES) {
    const hit = castDown(y);
    if (hit === null) return faces;
    faces.push(hit);
    if (faces.length % 2 === 1 && hit <= p) return faces; // a TOP at or below the feet
    y = hit - STEP_PAST;
  }
  return null;
}

/**
 * The floor under a POINT — a spell in flight, a dropped orb (QUEUE R7.9): the bottom of the air gap containing
 * it, with no headroom asked. A point inside solid gets the top of that solid — the column top when it is taller
 * than FLOOR_REACH — so a caller's "y <= floor + r" reads it as a hit and an orb buried in a wall surfaces on it.
 * Falls back to the column top when no floor probe is registered.
 */
export function floorUnderPoint(getFloor, getTop, x, z, y) {
  if (!getFloor) return getTop ? getTop(x, z) : null;
  const floor = getFloor(x, z, y - FEET_EPS, 0);
  return floor === Infinity && getTop ? getTop(x, z) : floor;
}

/**
 * The ground a mover snaps to: its floor; for a climber facing a wall, the column top (a spider goes up it).
 * Falls back to the top-down probe when no floor probe is registered.
 */
export function groundForMover(getFloor, getTop, x, z, feet, climber = false) {
  if (!getFloor) return getTop ? getTop(x, z) : null;
  const floor = getFloor(x, z, feet);
  if (floor === Infinity && climber && getTop) return getTop(x, z);
  return floor;
}
