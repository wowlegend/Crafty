// Spawn-placement decision (S3-M5 part 2) — extracted PURE from the Player loop. The imperative
// setTranslation/setLinvel stays in Player; this is the math + the branch logic, characterization-
// pinned to the old inline behavior (Components.jsx:803-860). NO React/Rapier.
export const SPAWN_FREEZE_Y = 120;       // hold in the sky until the world builds / on void-fall
const VOID_RESET_Y = 10;          // y below this = fell through the floor -> reset (module-internal)
export const SPAWN_PROBE_MAX_FAILS = 120; // bounded probe wait (frames) before the fallback
export const SPAWN_FALLBACK_Y = 60;      // if the probe never resolves
export const SPAWN_EYE_OFFSET = 1.2;     // player center this far above ground (instant land)
const PROBE_MIN_Y = 15;                  // physicsY <= this is rejected (origin chunks still streaming)

export function isVoidFall(y) { return y < VOID_RESET_Y; }

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
