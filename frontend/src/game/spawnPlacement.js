// Spawn-placement decision (S3-M5 part 2) — extracted from the Player loop: the math and the branch logic,
// characterization-pinned to the old inline behavior, and returnToSpawn, the one way back to the spawn's wait, which is
// handed the Rapier world, the body and the camera. No React or Rapier import.
import { LOAD_FIT_SPAN } from './formFit.js';
import { BASE_CAPSULE } from './beasts.js';
import { placeBody, CONTROLLER_OFFSET } from './kinematicMove.js';
import { resetStance } from './stanceState.js';
import { chunkOf } from '../world/chunkLayout.js';

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
// A wait's frame steps summed in floating point fall a hair short of the seconds they add up to: 360 steps of 1/60 s make
// 5.99999..., and the 6 s fallback came a frame late at 60 Hz, on the 361st (tests/gates/player-placement-gates.test.jsx).
const EPS = 1e-9;

// THE VOID LINE IS THE WORLD'S. Its cells run from y 0 up (world/chunkLayout.js), so no floor lies lower than the top of
// the cells at y 0, at 1: a body standing anywhere in the world, on the deep seabed (world/oceanProfile.js DEEP_FLOOR, 6)
// or at the foot of a shaft dug to the last cell, stands on 1 or above. A body under the world has nothing below it, and
// one standing on the bottom face of those cells, at 0, is out of the world too. The line is the base capsule's centre
// with its lowest point at the middle of that last cell, half a metre from either floor; each beast form's centre,
// standing on either, falls on the same side of it (spawnPlacement.test.js stands every shape on both). A centre under
// y 10 reset a player standing on the seabed (registry AUDIT:desync:void-guard-fires-inside-the-playable-world).
// The line is not a rescue for a body clipped into the ground: inside the hollow rock it falls until the back of a face
// stops it, and over a cave that is the cave's ceiling, above the line (DECISIONS 2026-10-30 item 213). game/stuckInRock.js
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
  if (waitedSec + stepSec < SPAWN_PROBE_MAX_SEC - EPS) return { groundY: null, retry: true, incFails: true };
  return { groundY: SPAWN_FALLBACK_Y, retry: false, incFails: true, blind: true };
}

export function spawnTargetY(groundY) { return groundY + SPAWN_EYE_OFFSET; }

// THE FALLBACK STANDS ON GROUND THAT ANSWERS BEFORE IT DROPS BLIND. A corner whose four columns the player dug out of the
// world answers nothing, as a corner whose chunks have not streamed in does, so the wait ran out, the body dropped blind
// from SPAWN_FALLBACK_Y down the hole, fell out of the world, and the void guard sent it back to wait again: nine resets in
// a minute's idle (registry REVIEW:l4:origin-corner-dug-through-respawn-loop; tests/gates/player-placement-gates.test.jsx).
// So when the wait runs out, the column nearest the corner within FALLBACK_REACH whose ground answers (above PROBE_MIN_Y,
// the spawn's own rule) is stood on, at its middle (a load beside a saved column with nothing in it searches the same way). A column in a chunk that has not streamed in answers nothing either,
// so this stands no player on ground that is not there; with none answering, the blind drop goes ahead and is followed
// (followBlindDrop).
// THE CAPSULE IS THE BODY'S AS IT IS. A beast form outlives the void guard's reset (returnToSpawn ends none), and the
// bull's radius (0.62 m) and the golem's (0.5 m), with the controller's offset, reach past the column's 0.5 m half-width:
// stood on that column's ground alone, the bull went 0.12 m into a column beside it one block higher
// (tests/gates/player-placement-gates.test.jsx). So the ground is the highest of the columns the capsule reaches, the
// way the load fit's column fallback reads them (game/formFit.js fitLoadedSpot); one that answers nothing adds nothing.
// Cost: up to (2 x FALLBACK_REACH)^2 probes, and the up to nine the capsule reaches, once, on the frame the wait runs out.
const FALLBACK_REACH = 8;

/** The middle of the column nearest `at` within FALLBACK_REACH whose ground answers above `min`, its ground and its
 *  distance; or null. */
function nearestAnsweringColumn(probe, at = { x: 0, z: 0 }, min = PROBE_MIN_Y) {
  let best = null;
  for (let x = Math.floor(at.x - FALLBACK_REACH); x <= at.x + FALLBACK_REACH; x++) {
    for (let z = Math.floor(at.z - FALLBACK_REACH); z <= at.z + FALLBACK_REACH; z++) {
      const d = Math.hypot(x + 0.5 - at.x, z + 0.5 - at.z);
      if (d > FALLBACK_REACH || (best && d >= best.d)) continue;
      const y = probe(x, z);
      if (Number.isFinite(y) && y > min) best = { x: x + 0.5, z: z + 0.5, y, d };
    }
  }
  return best;
}

/** The highest ground that answers under a capsule of `shape` centred over (x, z), from `ground`, the column's own: every
 *  column its radius and the controller's offset reach. */
function groundUnder(probe, x, z, ground, shape) {
  const reach = shape.radius + CONTROLLER_OFFSET;
  let top = ground;
  for (let cx = Math.floor(x - reach); cx <= Math.floor(x + reach); cx++) {
    for (let cz = Math.floor(z - reach); cz <= Math.floor(z + reach); cz++) {
      const y = probe(cx, cz);
      if (Number.isFinite(y)) top = Math.max(top, y);
    }
  }
  return top;
}

/**
 * Where the spawn stands the body (Components.jsx's spawn branch): over the corner on resolveSpawnGround's ground, or, once
 * its wait has run out (`blind`), on the nearest column whose ground answers, as high as the highest column the body's
 * capsule reaches there. Returns { x, y, z, blind }: the centre to place the body at, and whether the drop is blind (the
 * caller follows it, followBlindDrop).
 *   spawn  resolveSpawnGround's answer for a frame that spawns (not a retry)
 *   probe  the ground probe (Terrain.jsx getMobGroundLevel), or null when there is none
 *   shape  the body's capsule as it is now ({ halfHeight, radius }: a beast form's, or the base one)
 */
export function spawnSpot(spawn, probe, shape = BASE_CAPSULE) {
  if (spawn.blind && probe) {
    const near = nearestAnsweringColumn(probe);
    if (near) return { x: near.x, y: spawnTargetY(groundUnder(probe, near.x, near.z, near.y, shape)), z: near.z, blind: false };
  }
  return { x: 0, y: spawnTargetY(spawn.groundY), z: 0, blind: !!spawn.blind };
}

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
// 2026-10-27, steady-cool HIGH 2). It waits longer than the origin probe: the column may be chunks away, and streaming has
// to reach it after the camera moves there. A save that never loads falls back to the origin spawn. The wait is time, as
// the origin spawn's is: counted as 600 frames it was 10 s at 60 Hz and 5 s at 120 Hz, under the 6 s the origin spawn
// waits for its own column (tests/gates/player-placement-gates.test.jsx holds it at both rates).
export const RESUME_PROBE_MAX_SEC = 10;

/** The ground probe at a loaded save's column (Terrain.jsx getMobGroundLevel, which casts at x + 0.1, z + 0.1), or null
 *  until every chunk the load fit reads (game/formFit.js LOAD_FIT_SPAN round the saved centre) has answered: a fit run
 *  while the chunk across a border had not streamed back yet read no ground there and stood the capsule 0.4 m into it
 *  (tests/integration/chaos-play-loads.test.jsx; chaos session origin, 120 Hz, lag 0, seed 5).
 *   answered  (cx, cz) => whether that chunk has landed and been stepped (world/placedCellColliders.js answered) */
export function resumeColumnProbe(probe, answered, r) {
  return cornersAnswer(answered, r) ? probe(r.x, r.z) : null;
}

// EVERY CHUNK WITHIN `span` OF THE CENTRE HAS ANSWERED, READ CHUNK BY CHUNK. A chunk is 16 m wide, so the corners of a
// square no wider lie in every chunk it touches. The corners' columns were read once, and a corner column dug through the
// world answers nothing, as one in a chunk not streamed in does: a save in a shaft two wide, or on the ground beside a
// one-wide shaft under a corner, was held its whole RESUME_PROBE_MAX_SEC and sent to the origin (the dynamic review of
// lane L13 part 2, its F1; tests/gates/player-placement-gates.test.jsx).
function cornersAnswer(answered, r, span = LOAD_FIT_SPAN) {
  const sides = [-span, span];
  return sides.every((dx) => sides.every((dz) => answered?.(chunkOf(r.x + dx), chunkOf(r.z + dz))));
}

// A SAVED COLUMN WITH NOTHING IN IT IS NOT A COLUMN STILL STREAMING. A save made in a shaft dug through the world answers
// nothing once its chunks are back, and the hold waited its whole RESUME_PROBE_MAX_SEC for it, then sent the player to
// the origin (registry REVIEW:l6:load-hold-empty-column). Once the chunks the fit reads have answered, a saved column that
// answers nothing has nothing in it, and the load stands on the nearest column within FALLBACK_REACH that answers, at its
// middle, on its ground (nearestAnsweringColumn, the spawn fallback's search), once every chunk nearer the save than that
// column has answered (a nearer column there may be ground still streaming in) and every chunk the fit reads round that
// spot too. A shaft wider than that reach still holds and gives up for the origin. Cost: up to the reach's 200 columns, on
// a frame the hold would otherwise have waited.
/**
 * Where a loaded save stands the base capsule when its column answered nothing in chunks that have answered: the middle
 * of the nearest column that answers, its centre the controller's offset over that column's ground; or null (the saved
 * column answers, a chunk has not, or no column within reach answers).
 *   probe  the ground probe (Terrain.jsx getMobGroundLevel); answered  as resumeColumnProbe's; r  the saved centre
 */
export function resumeBesideEmptyColumn(probe, answered, r) {
  if (!cornersAnswer(answered, r) || Number.isFinite(probe(r.x, r.z))) return null;
  const best = nearestAnsweringColumn(probe, r, -Infinity);
  if (!best || !cornersAnswer(answered, r, best.d) || !cornersAnswer(answered, best)) return null;
  return { x: best.x, y: best.y + BASE_CAPSULE.halfHeight + BASE_CAPSULE.radius + CONTROLLER_OFFSET, z: best.z };
}

// resume: the saved {x,y,z} (the body's centre when it was saved). physicsY: the ground probe AT THAT COLUMN — used only
// as proof the column's colliders exist, never as the height (the player may have stood under a roof). Any answer is that
// proof: the probe hits only a collider, and over the deep ocean the seabed lies at 6 to 10 (world/oceanProfile.js),
// under the origin spawn's PROBE_MIN_Y, where a save made swimming was held 600 frames and then reset to the origin.
// waitedSec: the seconds already held (before this frame); stepSec: this frame's step; beside: resumeBesideEmptyColumn's
// answer (the spot beside a saved column with nothing in it, or null). Returns { place, hold }: hold = keep the body there
// and wait (the caller adds stepSec to its wait); place = the saved centre, or the spot beside it, which the caller fits
// the base capsule near (game/formFit.js fitLoadedSpot); neither = give up and use the origin spawn, on the frame whose
// step reaches RESUME_PROBE_MAX_SEC.
export function resolveResumeSpawn(resume, physicsY, waitedSec, stepSec = 0, beside = null) {
  const usable = !!resume && [resume.x, resume.y, resume.z].every(Number.isFinite) && !isVoidFall(resume.y);
  if (!usable) return { place: null, hold: false };
  const loaded = Number.isFinite(physicsY);
  if (loaded) return { place: { x: resume.x, y: resume.y, z: resume.z }, hold: false };
  if (beside) return { place: beside, hold: false };
  if (waitedSec + stepSec < RESUME_PROBE_MAX_SEC - EPS) return { place: null, hold: true };
  return { place: null, hold: false };
}
