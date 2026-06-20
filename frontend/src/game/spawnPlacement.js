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
