// Spawn-placement decision (S3-M5 part 2) — extracted PURE from the Player loop. The imperative
// setTranslation/setLinvel stays in Player; this is the math + the branch logic, characterization-
// pinned to the old inline behavior (Components.jsx:803-860). NO React/Rapier.
import { LOAD_FIT_SPAN } from './formFit.js';
import { BASE_CAPSULE } from './beasts.js';

export const SPAWN_FREEZE_Y = 120;      // hold in the sky until the world builds / on void-fall
export const SPAWN_PROBE_MAX_FAILS = 120; // bounded probe wait (frames) before the fallback
export const SPAWN_FALLBACK_Y = 60;      // if the probe never resolves
export const SPAWN_EYE_OFFSET = 1.2;     // player center this far above ground (instant land)
const PROBE_MIN_Y = 15;                  // physicsY <= this is rejected (origin chunks still streaming)

// THE VOID LINE IS THE WORLD'S. Its cells run from y 0 up (world/chunkLayout.js), so no floor lies lower than the top of
// the cells at y 0, at 1: a body standing anywhere in the world, on the deep seabed (world/oceanProfile.js DEEP_FLOOR, 6)
// or at the foot of a shaft dug to the last cell, stands on 1 or above. A body under the world has nothing below it, and
// one that clipped into the ground falls through the hollow trimesh onto the bottom face of those cells, at 0, and stands
// there. The line is the base capsule's centre with its lowest point at the middle of that last cell, half a metre from
// either floor; each beast form's centre, standing on either, falls on the same side of it (spawnPlacement.test.js stands
// every shape on both). A centre under y 10 reset a player standing on the seabed (registry
// AUDIT:desync:void-guard-fires-inside-the-playable-world).
const VOID_LINE_Y = 0.5 + BASE_CAPSULE.halfHeight + BASE_CAPSULE.radius;

/** Has the body, its centre at `y`, fallen out of the bottom of the world. */
export function isVoidFall(y) { return y < VOID_LINE_Y; }

// blockGroundY: highest placed-block y at origin, or null. physicsY: raycast ground, or null.
// probeFails: the CURRENT (pre-attempt) fail count. Returns { groundY, retry, incFails } — the
// caller increments its fail ref when incFails, teleports-to-freeze + returns when retry, else
// spawns at spawnTargetY(groundY). Mirrors the old: increment-then-`< MAX`-check semantics.
// probeAvailable: whether the physics raycast (getMobGroundLevel) exists this frame. If NOT, the
// old code skipped the probe branch entirely -> immediate fallback (no retry, no fail-increment).
export function resolveSpawnGround(blockGroundY, physicsY, probeFails, probeAvailable = true) {
  if (blockGroundY != null) return { groundY: blockGroundY, retry: false, incFails: false };
  if (!probeAvailable) return { groundY: SPAWN_FALLBACK_Y, retry: false, incFails: false };
  const invalid = physicsY == null || Number.isNaN(physicsY) || physicsY <= PROBE_MIN_Y;
  if (!invalid) return { groundY: physicsY, retry: false, incFails: false };
  if (probeFails + 1 < SPAWN_PROBE_MAX_FAILS) return { groundY: null, retry: true, incFails: true };
  return { groundY: SPAWN_FALLBACK_Y, retry: false, incFails: true };
}

export function spawnTargetY(groundY) { return groundY + SPAWN_EYE_OFFSET; }

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
