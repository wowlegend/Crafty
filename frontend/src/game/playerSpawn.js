/**
 * playerSpawn.js — the player RigidBody's DECLARED spawn, shared so it cannot drift.
 *
 * WHY THIS IS A SHARED CONSTANT AND NOT TWO LITERALS. `Components.jsx` declares the player RigidBody at
 * `position={[0, 100, 0]}`, and the beast capture fixture needs the SAME point to frame its reveal camera.
 * Kept as two literals, they would silently disagree the moment either moved — and the failure that
 * motivated this module was exactly a disagreement about where the player is (see below).
 *
 * WHY THE DECLARED POSITION AND NOT `rb.translation()` — the whole point:
 * physics is `paused={isCaptureMode}` (`GameScene.jsx`), so `@react-three/rapier` never syncs the
 * RigidBody's VISUAL transform from the physics body. Under capture the two diverge:
 *
 *     rendered avatar   y ~= 100   (this constant — the group's declared transform)
 *     rb.translation()  y  = 120   (the physics body, which something still moves)
 *
 * The beast reveal camera was framed from `rb.translation()`, so it sat ~20 units ABOVE the beast and
 * every one of the four `beast-*.png` baselines was a picture of a distant mountain with no beast in it —
 * measured 2026-08-08: beast meshes at worldY 100.0-101.6 with `ndc.y ~= -3` (off-screen bottom; the valid
 * range is -1..1), camera at y 121.45. The gate compared one empty mountain against another and passed.
 *
 * So: anything that must line up with what is ON SCREEN during capture uses THIS. `rb.translation()` is
 * correct only while physics is running.
 */

/** The player RigidBody's declared spawn transform, as [x, y, z]. */
export const PLAYER_SPAWN = Object.freeze([0, 100, 0]);

/** Same value as `{x, y, z}`, for call sites that read a translation-shaped object. */
export const playerSpawnVec = () => ({ x: PLAYER_SPAWN[0], y: PLAYER_SPAWN[1], z: PLAYER_SPAWN[2] });
