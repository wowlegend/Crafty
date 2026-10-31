// stuckInRock.js — the stuck-in-rock recovery: a body whose centre is inside solid ground is stood on the nearest clear
// spot, wherever it is (Components.jsx, on every frame in play, after the spawn branch).
//
// A chunk's trimesh is hollow (world/mesher.js closes each chunk), so a body that clipped into the ground (a chunk that
// landed round it, a drop onto ground still streaming in) touches no face from inside and falls through the rock until
// the back of a face stops it. Under most of the world that is the bottom face of the cells at y 0, under the void guard's
// line (spawnPlacement.js isVoidFall); over a cave it is the cave's ceiling, above the line, and the controller has no
// depenetration, so the player stayed in the rock (DECISIONS 2026-10-30 item 196: a cave ceiling between y 1.5 and 9
// under 1483 of 6400 columns within 40 m of the spawn). The void line handles a fall out of the world; this handles a
// body in the rock.
//
// The centre's cell is read from the trimeshes (formFit.js cellSolid: a ray up the cell's middle crosses an odd number of
// faces from inside the ground) once every STUCK_CHECK_SEC, and the body is moved only once every reading for
// STUCK_CONFIRM_SEC has been solid: a reading is of the colliders, which change between steps as chunks land and re-mesh,
// and a body truly in the rock is still in it three readings on. The spot is the load fit's search (formFit.js
// fitLoadedSpot, for the body's own shape): the nearest spot within a few decimetres whose cell is not solid and where the
// capsule is clear, else the top of the columns the capsule stands across. Never the origin.
//
// Cost: a frame adds its step to a counter; a reading is one ray cast per face above the centre, ten times a second, and
// allocates only Rapier's ray and hit objects; the fit runs only when the body is moved.
import { cellSolid, fitLoadedSpot } from './formFit.js';

export const STUCK_CHECK_SEC = 0.1;
export const STUCK_CONFIRM_SEC = 0.2;
const EPS = 1e-9; // a frame's steps summed in floating point fall a hair short of the second they add up to

/** A watch: the seconds since its last reading, and how long its readings have been solid (-1: the last one was not). */
export function makeStuckWatch() {
  return { sinceRead: 0, solidFor: -1 };
}

/**
 * One Player frame in play. Returns the centre to stand the body at once its centre has read solid for STUCK_CONFIRM_SEC,
 * else null.
 *   watch      makeStuckWatch()'s state, kept per player
 *   body       the player's kinematic body; its collider(0) is the shape it has now (a beast form's too)
 *   stepSec    this frame's step
 *   probe      the ground probe (Terrain.jsx getMobGroundLevel), for the column-top fallback
 *   unindexed  the colliders made since the last world step (world/placedCellColliders.js), which queries cannot see yet
 */
export function stuckInRock(watch, world, rapier, body, stepSec, probe, unindexed) {
  watch.sinceRead += stepSec;
  if (watch.sinceRead < STUCK_CHECK_SEC - EPS) return null;
  const since = watch.sinceRead;
  watch.sinceRead = 0;
  const at = body.translation();
  if (!cellSolid(world, rapier, Math.floor(at.x), Math.floor(at.y), Math.floor(at.z))) {
    watch.solidFor = -1;
    return null;
  }
  watch.solidFor = watch.solidFor < 0 ? 0 : watch.solidFor + since;
  if (watch.solidFor < STUCK_CONFIRM_SEC - EPS) return null;
  watch.solidFor = -1;
  const c = body.collider(0);
  const spot = fitLoadedSpot(world, rapier, body, at, probe, { unindexed, shape: { halfHeight: c.halfHeight(), radius: c.radius() } });
  return { x: spot.x, y: spot.y, z: spot.z };
}
