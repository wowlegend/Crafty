// Spawn-placement decision (S3-M5 part 2) — extracted from the Player loop: the math and the branch logic,
// characterization-pinned to the old inline behavior, and returnToSpawn, the one way back to the spawn's wait, which is
// handed the Rapier world, the body and the camera. No React or Rapier import.
import { LOAD_FIT_SPAN } from './formFit.js';
import { BASE_CAPSULE } from './beasts.js';
import { placeBody } from './kinematicMove.js';
import { resetStance } from './stanceState.js';

export const SPAWN_FREEZE_Y = 120;      // hold in the sky until the world builds / on void-fall
// THE SPAWN'S WAIT FOR ITS GROUND IS TIME, NOT FRAMES. Chunk streaming follows the camera (world/Terrain.jsx): two
// requests every 150 ms, row by row across the box round the camera's chunk, so after a respawn the last of the spawn
// corner's four chunks (0_0) is asked for on the 21st tick at the top tier (render distance 4: 3.15 s), the 13th at med
// (1.95 s) and the 7th at low (1.05 s), and the worker builds it after that. Counted as 120 frames, the wait was 2 s at
// 60 Hz and 1 s at 120 Hz: the player was dropped from SPAWN_FALLBACK_Y over ground still streaming in at med and high,
// and at every tier on a 120 Hz display, and a chunk whose trimesh landed round the falling body left them inside the
// rock (registry REVIEW:l4:spawn-wait-counted-in-frames). Six seconds is past the top tier's request for the corner; it
// does not bound the build. The one terrain worker builds its chunks one after another, in the order asked
// (world/Terrain.jsx, world/terrain.worker.js), and after a respawn far out 0_0 is the top tier's 41st request, so a
// worker slower than about 0.15 s a chunk is still building it when the wait runs out. So the drop is followed
// (followBlindDrop), and a body left in the rock anyway is stood clear (game/stuckInRock.js).
export const SPAWN_PROBE_MAX_SEC = 6;
export const SPAWN_FALLBACK_Y = 60;      // if the probe never resolves
export const SPAWN_EYE_OFFSET = 1.2;     // player center this far above ground (instant land)
const PROBE_MIN_Y = 15;                  // physicsY <= this is rejected (origin chunks still streaming)

// THE VOID LINE IS THE WORLD'S. Its cells run from y 0 up (world/chunkLayout.js), so no floor lies lower than the top of
// the cells at y 0, at 1: a body standing anywhere in the world, on the deep seabed (world/oceanProfile.js DEEP_FLOOR, 6)
// or at the foot of a shaft dug to the last cell, stands on 1 or above. A body under the world has nothing below it, and
// one standing on the bottom face of those cells, at 0, is out of the world too. The line is the base capsule's centre
// with its lowest point at the middle of that last cell, half a metre from either floor; each beast form's centre,
// standing on either, falls on the same side of it (spawnPlacement.test.js stands every shape on both). A centre under
// y 10 reset a player standing on the seabed (registry AUDIT:desync:void-guard-fires-inside-the-playable-world).
// The line is not a rescue for a body clipped into the ground: inside the hollow rock it falls until the back of a face
// stops it, and over a cave that is the cave's ceiling, above the line (DECISIONS 2026-10-30 item 196). game/stuckInRock.js
// stands that body clear.
const VOID_LINE_Y = 0.5 + BASE_CAPSULE.halfHeight + BASE_CAPSULE.radius;

/** Has the body, its centre at `y`, fallen out of the bottom of the world. */
export function isVoidFall(y) { return y < VOID_LINE_Y; }

const SPAWN_HOLD = Object.freeze({ x: 0, y: SPAWN_FREEZE_Y, z: 0 });
const STILL = Object.freeze({ x: 0, y: 0, z: 0 });

/**
 * BACK TO THE ORIGIN SPAWN'S WAIT, ONE WAY: the void guard's reset and the respawn after a death (Components.jsx). The body
 * is held over the origin and stopped, its collider with it (kinematicMove.js placeBody), and the fight is left behind
 * (stanceState.js). The camera goes there too: chunk streaming follows the camera (world/Terrain.jsx), and the void
 * guard's reset, which once left it where the player fell, held the body over an origin that never streamed in until the
 * probe gave up and dropped it there (registry AUDIT:ultra:ultra-player-world-7). The spawn branch runs next, with the
 * probe's whole wait.
 *   body   the Player's kinematic body (none yet: only the spawn state and the camera move)
 *   eye    the camera's height over the body's centre (combat/swingOrigin.js EYE_HEIGHT_M)
 *   spawn  the Player's refs: { placed (spawnPosSet), probeWait (spawnProbeWaitRef, seconds) }
 */
export function returnToSpawn(world, body, camera, eye, spawn) {
  spawn.placed.current = false;
  spawn.probeWait.current = 0;
  if (body) {
    placeBody(world, body, SPAWN_HOLD);
    body.setLinvel(STILL, true);
  }
  resetStance();
  camera.position.set(SPAWN_HOLD.x, SPAWN_HOLD.y + eye, SPAWN_HOLD.z);
}

// blockGroundY: highest placed-block y at origin, or null. physicsY: raycast ground, or null.
// waitedSec: the seconds already waited (before this frame); stepSec: this frame's step. Returns { groundY, retry,
// incFails }: the caller adds stepSec to its wait when incFails, teleports-to-freeze + returns when retry, else spawns at
// spawnTargetY(groundY). The fallback comes on the frame whose step reaches SPAWN_PROBE_MAX_SEC, and carries
// `blind: true`: the caller follows that drop (followBlindDrop).
// probeAvailable: whether the physics raycast (getMobGroundLevel) exists this frame. If NOT, the
// old code skipped the probe branch entirely -> immediate fallback (no retry, no fail-increment).
export function resolveSpawnGround(blockGroundY, physicsY, waitedSec, probeAvailable = true, stepSec = 0) {
  if (blockGroundY != null) return { groundY: blockGroundY, retry: false, incFails: false };
  if (!probeAvailable) return { groundY: SPAWN_FALLBACK_Y, retry: false, incFails: false };
  const invalid = physicsY == null || Number.isNaN(physicsY) || physicsY <= PROBE_MIN_Y;
  if (!invalid) return { groundY: physicsY, retry: false, incFails: false };
  if (waitedSec + stepSec < SPAWN_PROBE_MAX_SEC) return { groundY: null, retry: true, incFails: true };
  return { groundY: SPAWN_FALLBACK_Y, retry: false, incFails: true, blind: true };
}

export function spawnTargetY(groundY) { return groundY + SPAWN_EYE_OFFSET; }

// THE BLIND DROP IS FOLLOWED. The fallback drops the body from SPAWN_FALLBACK_Y over a corner whose ground has not
// answered, and a chunk whose trimesh lands round the falling body leaves it in the rock: at the corner the capsule
// straddles the closed edges of four chunks, the only faces there, and they stop it inside them
// (tests/gates/stuck-in-rock-gates.test.jsx lands the corner's chunks round the falling body).
// So for the wait's length again (SPAWN_PROBE_MAX_SEC) after the drop the corner is read each frame, the wait's own probe
// and cost, and once it answers, a body whose lowest point is under that ground is stood on it. A body that has walked
// off the corner, or a corner that never answers, is left to the stuck-in-rock recovery (game/stuckInRock.js).
const CORNER_REACH = 1; // further from the corner than this, the body stands on other ground, not the corner's

/**
 * One frame of following the blind drop. Returns the centre's y to stand the body at, over the corner, or null; counts
 * the follow's time down and ends it once the corner answers or the body has left it.
 *   follow  { left }: the seconds of following left (SPAWN_PROBE_MAX_SEC from the drop)
 *   ground  spawnCornerGround's answer this frame (null until every column answers)
 *   at      the body's centre; reach: its centre's height over its lowest point (half-height + radius)
 */
export function followBlindDrop(follow, ground, at, reach, stepSec) {
  if (Math.hypot(at.x, at.z) > CORNER_REACH) { follow.left = 0; return null; }
  if (ground == null) { follow.left = Math.max(0, follow.left - stepSec); return null; }
  follow.left = 0;
  return at.y - reach < ground ? spawnTargetY(ground) : null;
}

// The spawn stands at x 0 z 0, the corner where four block columns meet, so the base capsule (radius 0.4 m) stands across
// all four: its ground is the highest of them. One probe at (0.1, 0.1) read only the column x 0 z 0, and a player who had
// dug that column, or the three around it standing higher, was stood with the capsule inside the other three (registry
// REVIEW:fix-invisible-box:respawn-counts-mined; tests/integration/chaos-play-field-origin.test.jsx).
const SPAWN_COLUMNS = [[-1, -1], [0, -1], [-1, 0], [0, 0]];

/** The ground under the spawn corner from `probe(x, z)` (Terrain.jsx getMobGroundLevel, which casts at x + 0.1, z + 0.1):
 *  the highest of the four columns, or null until every one answers above PROBE_MIN_Y (its chunk has streamed in). */
export function spawnCornerGround(probe) {
  let top = -Infinity;
  for (const [x, z] of SPAWN_COLUMNS) {
    const y = probe(x, z);
    if (y == null || Number.isNaN(y) || y <= PROBE_MIN_Y) return null;
    top = Math.max(top, y);
  }
  return top;
}

// A RESUMED save (the context-loss reload) spawns the player where they stood, not on the origin column (review
// 2026-10-27, steady-cool HIGH 2). Its frames wait longer than the origin probe's: the column may be chunks away, and
// streaming has to reach it after the camera moves there. A save that never loads falls back to the origin spawn.
export const RESUME_PROBE_MAX_FAILS = 600;

/** The ground probe at a loaded save's column (Terrain.jsx getMobGroundLevel, which casts at x + 0.1, z + 0.1), or null
 *  until the columns at the four corners of the square the load fit reads (game/formFit.js LOAD_FIT_SPAN round the
 *  saved centre) answer too. A chunk is 16 m wide, so those corners lie in every chunk the square touches: a fit run
 *  while the chunk across a border had not streamed back yet read no ground there and stood the capsule 0.4 m into it
 *  (tests/integration/chaos-play-loads.test.jsx; chaos session origin, 120 Hz, lag 0, seed 5). */
export function resumeColumnProbe(probe, r) {
  for (const dx of [-LOAD_FIT_SPAN, LOAD_FIT_SPAN]) {
    for (const dz of [-LOAD_FIT_SPAN, LOAD_FIT_SPAN]) {
      const y = probe(Math.floor(r.x + dx) + 0.4, Math.floor(r.z + dz) + 0.4);
      if (!Number.isFinite(y)) return null;
    }
  }
  return probe(r.x, r.z);
}

// resume: the saved {x,y,z} (the body's centre when it was saved). physicsY: the ground probe AT THAT COLUMN — used only
// as proof the column's colliders exist, never as the height (the player may have stood under a roof). Any answer is that
// proof: the probe hits only a collider, and over the deep ocean the seabed lies at 6 to 10 (world/oceanProfile.js),
// under the origin spawn's PROBE_MIN_Y, where a save made swimming was held 600 frames and then reset to the origin.
// probeFails: the CURRENT fail count. Returns { place, hold }: hold = keep the body there and wait (the caller counts the
// frame); place = the saved centre, which the caller fits the base capsule near (game/formFit.js fitLoadedSpot);
// neither = give up and use the origin spawn.
export function resolveResumeSpawn(resume, physicsY, probeFails) {
  const usable = !!resume && [resume.x, resume.y, resume.z].every(Number.isFinite) && !isVoidFall(resume.y);
  if (!usable) return { place: null, hold: false };
  const loaded = Number.isFinite(physicsY);
  if (loaded) return { place: { x: resume.x, y: resume.y, z: resume.z }, hold: false };
  if (probeFails + 1 < RESUME_PROBE_MAX_FAILS) return { place: null, hold: true };
  return { place: null, hold: false };
}
