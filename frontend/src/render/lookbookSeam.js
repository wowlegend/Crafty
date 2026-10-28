// lookbookSeam.js — the ONE production-reachable door the lookbook probe uses (scripts/visual/lookbook.mjs).
//
// WHY A PROD SEAM AT ALL (plan docs/superpowers/plans/2026-10-27-crafty-instruments.md). The masterpiece programme
// judges looks on REAL-GPU, MOTION-ON frames of the SHIPPED bundle. The DEV test bridge and capture mode are compiled
// out of that bundle, and capture is the wrong instrument anyway: it turns weather, mobs, NPCs, particles and spawning
// off and pins the sun at noon. So the probe needs to pose the camera, set the time of day and make input live in the
// production build — and nothing else.
//
// HOW PLAYERS CANNOT TRIP IT. Two locks, both required:
//   1. Nothing is installed unless the page URL carries exactly `?lookbook=1` (parseLookbookParam).
//   2. Even then nothing changes until a script calls `window.__craftyLookbook.pose(...)`. A player who types the
//      parameter sees the ordinary game; there is no UI, no key and no store field behind it.
//
// WHAT KEEPS RUNNING WHILE POSED, AND WHAT STOPS. It does not pause the world: the physics step, mobs, weather,
// particles and the day clock keep running (the clock is live, so the probe re-sets the time just before each shot and
// records where it actually was). But the pose is applied by the Player's useFrame (Components.jsx) right after the
// capture branch, with the same EARLY RETURN, so everything below that return in the Player's controller does not run
// while a pose is set: movement and the kinematic character controller, the death branch, the void-fall guard and the
// beast, voidhand and imbue state machines. And the camera is the game's position source: PositionTracker mirrors
// camera.position into store.playerPosition, so while posed the store's player position is the HERO-SHOT CAMERA, not
// the body, and mobs, ally squads, chunk streaming and a manual save all see the camera. The first-person hands hide
// while a pose is set (an elevated hero shot with hands in the corner misleads).
//
// Module state on purpose: the pose is read every frame by the Player (a transient read — Game-Loop Isolation), and
// it changes only when a script asks.

const LOOKBOOK_PARAM = 'lookbook';

let _pose = null;
const _subs = new Set();

/** PURE. True only for the exact `lookbook=1` parameter. */
export function parseLookbookParam(search) {
  if (typeof search !== 'string') return false;
  return new URLSearchParams(search).get(LOOKBOOK_PARAM) === '1';
}

/**
 * PURE. A DAWN-origin cycle fraction (game/dayPhase.cycleFraction: 0 dawn, 0.25 noon, 0.5 dusk, 0.75 midnight — the
 * convention the programme's four lookbook times are written in) to the MIDNIGHT-origin value the store's
 * `setTimeOfDay` takes (game/dayNight.gameTimeForTimeOfDay: 0.25 dawn, 0.5 noon).
 */
export function timeOfDayForCycle(cycle) {
  const c = Number(cycle);
  const f = Number.isFinite(c) ? c : 0;
  return (((f + 0.25) % 1) + 1) % 1;
}

/** The pose the Player pins the camera to, or null (the ordinary game). Read per frame — keep it a plain read. */
export function lookbookPose() {
  return _pose;
}

/** For useSyncExternalStore: whether a pose is set. */
export function lookbookPinned() {
  return _pose !== null;
}

/** For useSyncExternalStore: notified on every pose and clear. Returns an unsubscribe function. */
export function subscribeLookbook(cb) {
  _subs.add(cb);
  return () => _subs.delete(cb);
}

function finite3(v, name) {
  if (!Array.isArray(v) || v.length !== 3 || !v.every((n) => Number.isFinite(n))) {
    throw new TypeError(`lookbook: ${name} must be [x, y, z] of finite numbers, got ${JSON.stringify(v)}`);
  }
  return [v[0], v[1], v[2]];
}

function setPose(p) {
  if (p === null) {
    _pose = null;
  } else {
    // Validate everything before touching state: a refused pose leaves the previous one (or none) in place.
    const position = finite3(p && p.position, 'position');
    const lookAt = finite3(p && p.lookAt, 'lookAt');
    const fov = Number.isFinite(p.fov) ? p.fov : 75; // the game's own base fov (GameScene camera, capture pin)
    _pose = { position, lookAt, fov };
  }
  for (const cb of _subs) cb();
}

/**
 * A copy of a pose, arrays included, or null. pose() and info() hand THIS to callers, never the live `_pose`:
 * validation runs on the way in (finite3), so a returned live object would be a way round it — one assignment from a
 * NaN camera that PositionTracker would then publish as the player's position. (Review F3.)
 */
function copyPose(p) {
  return p === null ? null : { position: [...p.position], lookAt: [...p.lookAt], fov: p.fov };
}

/** Pin `camera` to `pose`: position, a level up vector, the look target, the fov, and a rebuilt projection. */
export function applyLookbookPose(camera, pose) {
  camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
  camera.up.set(0, 1, 0);
  camera.lookAt(pose.lookAt[0], pose.lookAt[1], pose.lookAt[2]);
  camera.fov = pose.fov;
  camera.updateProjectionMatrix();
}

/**
 * Install `win.__craftyLookbook` when the URL carries `?lookbook=1`; otherwise do nothing and return false.
 * Collaborators are injected so a gate can drive the seam against the real store and input gate (index.jsx wires them).
 * @param {{location?: {search?: string}}} win
 * @param {{store: any, setActive: (v: boolean) => void, getActive: () => boolean, cycleOf: (gameTime: number) => number,
 *          glInfo: () => object|null, contextLosses: () => number}} deps
 */
export function installLookbookSeam(win, { store, setActive, getActive, cycleOf, glInfo, contextLosses }) {
  if (!win || !parseLookbookParam(win.location && win.location.search)) return false;
  win.__craftyLookbook = Object.freeze({
    /** Pin the camera: { position: [x,y,z], lookAt: [x,y,z], fov? }. Throws on a malformed pose. */
    pose: (p) => { setPose(p); return copyPose(_pose); },
    /** Hand the camera back to the player rig. */
    clear: () => { setPose(null); },
    /** Set the time of day as a DAWN-origin cycle fraction; returns the cycle the store actually landed on. A direct
     *  set (setTimeOfDay), never a clock advance, so it cannot count a siege night. */
    setCycle: (cycle) => {
      store.getState().setTimeOfDay(timeOfDayForCycle(cycle));
      return cycleOf(store.getState().gameTime);
    },
    /** Make input live without pointer lock (headless Chromium refuses it), as the DEV forcePlay hook does. */
    play: () => { setActive(true); return getActive(); },
    /** What the probe records per shot. */
    info: () => {
      const s = store.getState();
      return {
        active: getActive(),
        cycle: cycleOf(s.gameTime),
        isDay: s.isDay,
        isAlive: s.isAlive,
        health: s.playerHealth,
        tier: s.qualityTier,
        frameCap: s.frameCap,
        contextLosses: contextLosses(),
        gl: glInfo(),
        pose: copyPose(_pose),
        worldBuilt: s.isSpawnChunkLoaded === true,
      };
    },
  });
  return true;
}

/** Test-only. */
export function _resetLookbookForTest() {
  _pose = null;
  _subs.clear();
}
