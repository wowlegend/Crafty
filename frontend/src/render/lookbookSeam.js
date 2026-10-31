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
//   1. Nothing is installed unless the page URL carries exactly `?lookbook=1` (parseLookbookParam). This module is not
//      even downloaded without it: index.jsx loads it with a dynamic import() on that page only, and the game's own
//      readers import render/lookbookState.js, never this file.
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
// the body, and ally squads, chunk streaming, the spawner, the boss and a manual save all see the camera; the mobs'
// senses, their arrows and the combat stance read the body (game/mobSenses.js mobSensePoint). The first-person hands
// hide while a hero pose is set (an elevated shot with hands in the corner misleads); an eye pose keeps them.
//
// WHERE THE STATE LIVES. The pose, the hand pose, the passes switched off and the dragon's hold are module state in
// render/lookbookState.js, read every frame by the game (a transient read — Game-Loop Isolation) and written only by the
// functions below, which validate first. They change only when a script asks.

import { LOOKBOOK_PASS_NAMES, lookbookEffectNames } from './passesOff.js';
import {
  parseLookbookParam, lookbookPose, setLookbookPose, setLookbookHandPose, setLookbookPassesOff, setLookbookDragonHold,
  lookbookHandPose, lookbookPassesOff, lookbookDragonHold, _resetLookbookStateForTest,
} from './lookbookState.js';

let _passTimer = null; // the page-wide handle from render/passTimer.js, once the probe asked for timings

/** The poses dragon() can hold the dragon in: at rest, each attack's tell partway through its windup (render/BossEntity.jsx
 *  draws its ground decal and its glow), and staggered. */
export const DRAGON_POSES = Object.freeze(['rest', 'bite', 'fireball', 'roar', 'lava', 'summon', 'staggered']);

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

function finite3(v, name) {
  if (!Array.isArray(v) || v.length !== 3 || !v.every((n) => Number.isFinite(n))) {
    throw new TypeError(`lookbook: ${name} must be [x, y, z] of finite numbers, got ${JSON.stringify(v)}`);
  }
  return [v[0], v[1], v[2]];
}

const copy3 = (v) => (Array.isArray(v) && v.length === 3 ? [v[0], v[1], v[2]] : null);

function setPose(p) {
  if (p === null) {
    setLookbookPose(null);
    return;
  }
  // Validate everything before touching state: a refused pose leaves the previous one (or none) in place.
  const position = finite3(p && p.position, 'position');
  const lookAt = finite3(p && p.lookAt, 'lookAt');
  const fov = Number.isFinite(p.fov) ? p.fov : 75; // the game's own base fov (GameScene camera, capture pin)
  setLookbookPose({ position, lookAt, fov, hands: p.hands === true });
}

/**
 * A copy of a pose, arrays included, or null. pose() and info() hand THIS to callers, never the live held pose:
 * validation runs on the way in (finite3), so a returned live object would be a way round it — one assignment from a
 * NaN camera that PositionTracker would then publish as the player's position. (Review F3.)
 */
function copyPose(p) {
  return p === null ? null : { position: [...p.position], lookAt: [...p.lookAt], fov: p.fov, hands: p.hands };
}

const HAND_POSE_KINDS = Object.freeze(['swing', 'cast', 'charge']);
const SWING_STEPS = Object.freeze([1, 2, 3]);

/** Validate a hand pose: { kind: 'swing', step (1-3, the light string's step), t (0-1) }, { kind: 'cast', t (0-1) } or
 *  { kind: 'charge', level (0-1) }; null clears it. Throws on anything else, leaving the held pose as it was. */
function checkHandPose(p) {
  if (p === null) return null;
  if (!p || !HAND_POSE_KINDS.includes(p.kind)) {
    throw new TypeError(`lookbook: handPose kind must be one of ${HAND_POSE_KINDS.join(', ')}, got ${JSON.stringify(p && p.kind)}`);
  }
  const unit = (v, name) => {
    const n = finite(v, name);
    if (n < 0 || n > 1) throw new RangeError(`lookbook: handPose ${name} must be within 0 and 1, got ${n}`);
    return n;
  };
  if (p.kind === 'charge') return { kind: 'charge', level: unit(p.level, 'level') };
  if (p.kind === 'cast') return { kind: 'cast', t: unit(p.t, 't') };
  if (!SWING_STEPS.includes(p.step)) throw new RangeError(`lookbook: handPose step must be 1, 2 or 3, got ${JSON.stringify(p.step)}`);
  return { kind: 'swing', step: p.step, t: unit(p.t, 't') };
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
 * data: { id, type, hostile, npc (the NPC's name, else null), position: [x, y, z] }. Hostile is hostileReach's split. A
 * mob with no health left is not listed, so the list is what a frame can show.
 */
export function mobList(entities) {
  const out = [];
  for (const e of entities || []) {
    if (!e || !(e.health > 0) || !e.position) continue;
    out.push({
      id: e.id ?? null,
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
 *          sunDir?: () => number[], handNodes?: () => number,
 *          spawnDragon?: (o: {position?: number[]}) => {position: number[], ground: number|null}}} deps  `hostiles`: the
 *          ECS mob query, every mob (the seam picks the hostiles out). `sunDir`: the sun's direction this frame
 *          (render/mood.js skyFrameRef). `handNodes`: the objects mounted in the viewmodel's hands group
 *          (render/viewmodel.js handNodeCount). `spawnDragon`: the boss system's lookbook spawn (world/bossSystem.js).
 */
export function installLookbookSeam(win, {
  store, setActive, getActive, cycleOf, glInfo, contextLosses, hostiles, removeEntity, loadPassTimer, sunDir, handNodes,
  spawnDragon,
}) {
  if (!win || !parseLookbookParam(win.location && win.location.search)) return false;
  const unposed = (verb) => {
    if (lookbookPose() !== null) throw new Error(`lookbook: ${verb}() while a pose is set; clear() first`);
  };
  const body = () => store.getState().playerRigidBodyRef?.current ?? null;
  const camera = () => store.getState().gameCamera ?? null;
  win.__craftyLookbook = Object.freeze({
    /** Pin the camera: { position: [x,y,z], lookAt: [x,y,z], fov? }. Throws on a malformed pose. */
    pose: (p) => { setPose(p); return copyPose(lookbookPose()); },
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
    /** Enter a beast form ('fire', 'ice', 'lightning', 'arcane') or leave it (null) through the store's own actions.
     *  Only under a pose: the Player's beast state machine, which does not run while posed, ends a form it did not
     *  start on its next tick, so an eye pose (`hands: true`) at the body's eye is how a form is shot in first person.
     *  Returns the form the store holds. */
    form: (element) => {
      if (lookbookPose() === null) throw new Error('lookbook: form() needs a pose; the beast state machine ends an unposed form');
      const s = store.getState();
      if (element === null) s.exitBeastForm();
      else if (!s.enterBeastForm(element) && s.activeBeastForm !== element) {
        throw new Error(`lookbook: the store refused the form ${JSON.stringify(element)} (in another form, dead, or unknown)`);
      }
      return store.getState().activeBeastForm ?? null;
    },
    /** Hold the first-person hands in a pose (checkHandPose), or let the clock drive them again (null). */
    handPose: (p) => {
      const held = checkHandPose(p);
      setLookbookHandPose(held);
      return held === null ? null : { ...held };
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
    /** Wake the Shadow Dragon and hold it in `pose` (DRAGON_POSES) at `position` ([x, y, z]; default: over the
     *  Blight Heart lair, which throws until that ground is loaded), or `{ pose: null }` to let a held dragon fight.
     *  An unknown pose throws a TypeError naming it, leaving the hold as it was. Returns where the dragon is. */
    dragon: ({ pose, position } = {}) => {
      if (pose !== null && !DRAGON_POSES.includes(pose)) {
        throw new TypeError(`lookbook: dragon pose must be one of ${DRAGON_POSES.join(', ')} or null, got ${JSON.stringify(pose)}`);
      }
      if (pose === null) { setLookbookDragonHold(null); return null; }
      if (!spawnDragon) throw new Error('lookbook: dragon() needs the boss system\'s spawn');
      const at = position === undefined ? undefined : finite3(position, 'position');
      const woke = spawnDragon({ position: at });
      if (!woke) throw new Error('lookbook: the boss system has not installed its lookbook spawn yet');
      setLookbookDragonHold(pose);
      return woke;
    },
    /** The ground's height at { x, z } (the mobs' ground probe: the top of the column), or null where it is not loaded. A
     *  shot reads it to keep a camera out of a hill. Read-only. */
    groundAt: (p) => {
      const x = finite(p && p.x, 'x');
      const z = finite(p.z, 'z');
      const gy = store.getState().getMobGroundLevel?.(x, z);
      return Number.isFinite(gy) ? gy : null;
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
      const off = new Set(list);
      setLookbookPassesOff(off);
      return [...off].sort();
    },
    /** What the probe records per shot. */
    info: () => {
      const s = store.getState();
      const rb = s.playerRigidBodyRef?.current;
      const cam = s.gameCamera;
      const hand = lookbookHandPose();
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
        pose: copyPose(lookbookPose()),
        form: s.activeBeastForm ?? null,
        handPose: hand === null ? null : { ...hand },
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
        passesOff: { names: [...lookbookPassesOff()].sort(), effects: lookbookEffectNames(lookbookPassesOff()) },
        // The fight a frame shows: whether the dragon is up, the pose the seam holds it in, and where it is.
        dragon: { active: s.bossActive === true, hold: lookbookDragonHold(), position: copy3(s.getBossPosition?.()) },
      };
    },
  });
  return true;
}

/** Test-only. */
/** @internal Test seam: resets module state between cases. */
export function _resetLookbookForTest() {
  _resetLookbookStateForTest();
  _passTimer = null;
}
