// lookbookSeam.js — the ONE production-reachable door the lookbook probe uses (scripts/visual/lookbook.mjs).
//
// WHY A PROD SEAM AT ALL (plan docs/superpowers/plans/2026-10-27-crafty-instruments.md). The masterpiece programme
// judges looks on REAL-GPU, MOTION-ON frames of the SHIPPED bundle. The DEV test bridge and capture mode are compiled
// out of that bundle, and capture is the wrong instrument anyway: it turns weather, mobs, NPCs, particles and spawning
// off and pins the sun at noon. So the probe needs to pose the camera, stand the player and turn their head, set the
// time of day, make input live, clear the hostiles in the player's face, list the mobs a frame could show and read GPU
// time per post pass in the production build — and nothing else.
//
// TWO WAYS TO FRAME A SHOT. pose() pins the camera for an elevated hero shot (below). stand() and look() frame what a
// player sees instead: they move the player's body and turn the camera the way mouse look does (input/pointerLook.js
// writes camera.rotation the same way), so the Player's own rig puts the eye where play puts it, with the hands and
// the HUD on. They refuse while a pose is set, because the Player re-applies a pose every frame and would undo them.
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

import { LOOKBOOK_PASS_NAMES, lookbookEffectNames } from './passesOff.js';

const LOOKBOOK_PARAM = 'lookbook';

let _pose = null;
const _subs = new Set();
let _passTimer = null; // the page-wide handle from render/passTimer.js, once the probe asked for timings
// The post passes a script switched off (render/passesOff.js applies them in the composer; render/Sun.jsx reads 'sun').
// Replaced, never mutated, so a reader that kept the previous set keeps a consistent one.
let _passesOff = new Set();

/** The named passes switched off, for the per-frame readers. Empty unless a lookbook script asked. */
export function lookbookPassesOff() {
  return _passesOff;
}

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

const DEG = Math.PI / 180;
// The Player clamps pitch to just under straight up or down (Components.jsx); a look past it would be clamped away.
const MAX_PITCH_DEG = 85;

/**
 * PURE. The camera yaw (rotation.y, order YXZ) that faces a compass bearing in degrees, in the HUD compass's
 * convention (HUD.jsx): 0 is north (-Z), 90 east (+X), clockwise.
 */
export function yawForHeading(deg) {
  return -deg * DEG;
}

/** PURE. The compass bearing in [0, 360) a camera faces, read from its world matrix as the HUD compass reads it. */
export function headingOf(camera) {
  const e = camera.matrixWorld.elements;
  const deg = Math.atan2(-e[8], e[10]) / DEG;
  return ((deg % 360) + 360) % 360;
}

/** How far around the eye hostiles are counted. */
const HOSTILE_COUNT_M = 8;

/**
 * PURE. The nearest live hostile to `from` ([x, y, z]) and how many stand within 8 m: whether a frame shows the world
 * or a fight in the player's face. Hostile is a mob with health that is neither passive nor a quest NPC, the same split
 * the minimap's hostile count uses. `nearestM` is null when no hostile is alive.
 */
export function hostileReach(entities, from) {
  let nearestM = null;
  let within = 0;
  for (const e of entities || []) {
    if (!isLiveHostile(e)) continue;
    const d = distanceFrom(e, from);
    if (nearestM === null || d < nearestM) nearestM = d;
    if (d <= HOSTILE_COUNT_M) within += 1;
  }
  return { nearestM, within8m: within };
}

function isLiveHostile(e) {
  return !!e && e.health > 0 && !e.passive && !e.isNPC && !!e.position;
}

/**
 * PURE. Every live mob in `entities` (the ECS mob query: hostiles, livestock and the Hearth's named NPCs) as plain
 * data: { type, hostile, npc (the NPC's name, else null), position: [x, y, z] }. Hostile is hostileReach's split. A
 * mob with no health left is not listed, so the list is what a frame can show.
 */
export function mobList(entities) {
  const out = [];
  for (const e of entities || []) {
    if (!e || !(e.health > 0) || !e.position) continue;
    out.push({
      type: e.type ?? null,
      hostile: isLiveHostile(e),
      npc: e.isNPC ? String(e.npcName ?? e.type ?? 'npc') : null,
      position: [e.position.x, e.position.y, e.position.z],
    });
  }
  return out;
}

function distanceFrom(e, from) {
  return Math.hypot(e.position.x - from[0], e.position.y - from[1], e.position.z - from[2]);
}

/** PURE. A unit direction as the HUD compass bearing it lies on (0 north, -Z; clockwise) and its elevation, degrees. */
export function sunBearing(dir) {
  if (!Array.isArray(dir) || dir.length !== 3 || !dir.every(Number.isFinite)) return null;
  const [x, y, z] = dir;
  const deg = Math.atan2(x, -z) / DEG;
  return { heading: ((deg % 360) + 360) % 360, elevationDeg: Math.asin(Math.max(-1, Math.min(1, y / (Math.hypot(x, y, z) || 1)))) / DEG };
}

function finite(v, name) {
  if (!Number.isFinite(v)) throw new TypeError(`lookbook: ${name} must be a finite number, got ${JSON.stringify(v)}`);
  return v;
}

/**
 * Install `win.__craftyLookbook` when the URL carries `?lookbook=1`; otherwise do nothing and return false.
 * Collaborators are injected so a gate can drive the seam against the real store and input gate (index.jsx wires them).
 * @param {{location?: {search?: string}}} win
 * @param {{store: any, setActive: (v: boolean) => void, getActive: () => boolean, cycleOf: (gameTime: number) => number,
 *          glInfo: () => object|null, contextLosses: () => number, hostiles?: () => Iterable<object>,
 *          removeEntity?: (e: object) => void, loadPassTimer?: () => Promise<{installPassTimer: () => object}>,
 *          sunDir?: () => number[], handNodes?: () => number}} deps  `hostiles`: the ECS mob query, every mob (the
 *          seam picks the hostiles out). `sunDir`: the sun's direction this frame (render/mood.js skyFrameRef).
 *          `handNodes`: the objects mounted in the viewmodel's hands group (render/viewmodel.js handNodeCount).
 */
export function installLookbookSeam(win, {
  store, setActive, getActive, cycleOf, glInfo, contextLosses, hostiles, removeEntity, loadPassTimer, sunDir, handNodes,
}) {
  if (!win || !parseLookbookParam(win.location && win.location.search)) return false;
  const unposed = (verb) => {
    if (_pose !== null) throw new Error(`lookbook: ${verb}() while a pose is set; clear() first`);
  };
  const body = () => store.getState().playerRigidBodyRef?.current ?? null;
  const camera = () => store.getState().gameCamera ?? null;
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
    /** Move the player's body to { position: [x, y, z] } and stop it. Returns where the body is now. */
    stand: (p) => {
      unposed('stand');
      const [x, y, z] = finite3(p && p.position, 'position');
      const rb = body();
      if (!rb) throw new Error('lookbook: stand() before the player body exists');
      rb.setTranslation({ x, y, z }, true);
      rb.setLinvel?.({ x: 0, y: 0, z: 0 }, true);
      const t = rb.translation();
      return [t.x, t.y, t.z];
    },
    /** Turn the player's head to { heading (compass degrees), pitch (degrees, up positive) }. Returns the heading
     *  read back from the camera. */
    look: (p) => {
      unposed('look');
      const heading = finite(p && p.heading, 'heading');
      const pitch = finite(p.pitch ?? 0, 'pitch');
      if (Math.abs(pitch) > MAX_PITCH_DEG) throw new RangeError(`lookbook: pitch must be within +-${MAX_PITCH_DEG} degrees, got ${pitch}`);
      const cam = camera();
      if (!cam) throw new Error('lookbook: look() before the game camera exists');
      cam.rotation.order = 'YXZ';
      cam.rotation.set(pitch * DEG, yawForHeading(heading), 0);
      cam.updateMatrixWorld();
      return headingOf(cam);
    },
    /** Remove the live hostiles within `radius` metres of the eye (else the body), the way capture mode clears mobs
     *  (ecs.remove, so no kill, XP or loot is counted), so a frame shows the world rather than a fight in the player's
     *  face. Returns how many it removed. */
    clearHostiles: ({ radius = 12 } = {}) => {
      const r = finite(radius, 'radius');
      if (!hostiles || !removeEntity) throw new Error('lookbook: clearHostiles() needs the mob query');
      const cam = camera();
      const t = body()?.translation();
      if (!cam && !t) throw new Error('lookbook: clearHostiles() before the player exists');
      const from = cam ? cam.position.toArray() : [t.x, t.y, t.z];
      // A copy: removing an entity reorders the query's live array, so iterating it while removing skips entities.
      const doomed = [...hostiles()].filter((e) => isLiveHostile(e) && distanceFrom(e, from) <= r);
      for (const e of doomed) removeEntity(e);
      return doomed.length;
    },
    /** Every live mob, read from the ECS (mobList), or null when the build hands the seam no mob query. Read-only. */
    mobs: () => (hostiles ? mobList(hostiles()) : null),
    /** Timer-query ms per pass since the last reset, per WebGL context (render/passTimer.js); not established as GPU
     *  execution times (scripts/visual/_lookbook.mjs passSummary can only refute them). The first call loads the
     *  timer, so nothing is timed until a script asks. */
    passTimes: async ({ reset = false, mode } = {}) => {
      if (!loadPassTimer) return { installed: false, reason: 'no pass timer in this build' };
      if (!_passTimer) _passTimer = (await loadPassTimer()).installPassTimer();
      // The report covers the window that just closed, in the mode it ran in; `{ mode, reset: true }` then opens the
      // next window in `mode` ('segments', 'frame' or 'count').
      return _passTimer.report({ reset, mode });
    },
    /** Switch the named post passes off (render/passesOff.js LOOKBOOK_PASS_NAMES) and every other one back on, from
     *  the next frame. `[]` restores the chain. Throws on an unknown name, leaving the set as it was. */
    passesOff: (names) => {
      const list = Array.isArray(names) ? names : [];
      const unknown = list.filter((n) => !LOOKBOOK_PASS_NAMES.includes(n));
      if (!Array.isArray(names) || unknown.length) {
        throw new TypeError(`lookbook: passesOff takes names from ${LOOKBOOK_PASS_NAMES.join(', ')}; got ${JSON.stringify(names)}`);
      }
      _passesOff = new Set(list);
      return [..._passesOff].sort();
    },
    /** What the probe records per shot. */
    info: () => {
      const s = store.getState();
      const rb = s.playerRigidBodyRef?.current;
      const cam = s.gameCamera;
      let cameraNodes = 0;
      cam?.traverse?.(() => { cameraNodes += 1; });
      const t = rb?.translation?.();
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
        body: t ? [t.x, t.y, t.z] : null,
        eye: cam ? cam.position.toArray() : null,
        heading: cam?.matrixWorld ? headingOf(cam) : null,
        pitch: cam ? cam.rotation.x / DEG : null,
        // The camera's own subtree (the audio listener). The hands are not on it: they are in the viewmodel scene.
        cameraNodes,
        // The objects mounted as the first-person hands: 0 while they are hidden (a pose), null when the build hands the
        // seam no reader. A build from before the viewmodel reports no field, and its hands counted in cameraNodes.
        handNodes: handNodes ? handNodes() : null,
        // Measured from the eye (the camera), else the body; null when the build hands the seam no mob query.
        hostiles: hostiles && (cam || t) ? hostileReach(hostiles(), cam ? cam.position.toArray() : [t.x, t.y, t.z]) : null,
        // Where the sun is, so a shot can face it (GodRays shows only near it); null when the build hands no reader.
        sun: sunDir ? sunBearing(sunDir()) : null,
        // The passes switched off, and the postprocessing effects that must show skipped in the chain while they are.
        passesOff: { names: [..._passesOff].sort(), effects: lookbookEffectNames(_passesOff) },
      };
    },
  });
  return true;
}

/** Test-only. */
export function _resetLookbookForTest() {
  _pose = null;
  _subs.clear();
  _passTimer = null;
  _passesOff = new Set();
}
