// shadowSchedule — when the sun's shadow map re-renders (plan docs/superpowers/plans/2026-10-27-crafty-steady-cool.md,
// item h; refute F2).
//
// The directional light's shadow map (2048^2 at high) re-rendered EVERY frame: every terrain chunk and every caster drawn
// into it again, 60 or 120 times a second, standing still or not. three r172 skips a light whose
// `shadow.autoUpdate === false && shadow.needsUpdate === false` (renderers/webgl/WebGLShadowMap.js), so render/Atmosphere
// turns autoUpdate off and asks this schedule each frame. A render is due:
//   - IMMEDIATELY when the world's meshes changed (a chunk mounted, remeshed or left: a placed block must cast within two
//     frames). A tier change forces its own render (render/shadowReset.js).
//   - otherwise when the sun has turned SUN_STEP_DEG since the LAST RENDER, the snapped frustum centre moved, or a dynamic
//     caster is present — and never more often than SHADOW_MAX_HZ.
//
// F2, with the real arc: the sun turns 0.64-1.59 deg/s (mood.js sunArcDirection over a 300 s cycle), so 0.5 deg steps
// alone are ~2.4 renders a second (723 a cycle, 3.2 Hz at the fastest point). HONESTLY: the player's own hands, the
// loaded square's mobs and villagers make a dynamic caster present almost all the time in play, so the real saving is
// the 30 Hz cap — half the shadow renders at 60 fps. The static path pays off only when nothing moves. A moving caster's
// shadow updates at 30 Hz; a long shadow can step by up to 0.5 deg between sun steps.

export const SHADOW_MAX_HZ = 30;
export const SUN_STEP_DEG = 0.5;
const COS_STEP = Math.cos((SUN_STEP_DEG * Math.PI) / 180);
// Half a millisecond of slack so a 60 fps frame landing a hair before the 33.3 ms mark is not pushed to the next one.
const MIN_INTERVAL_MS = 1000 / SHADOW_MAX_HZ - 0.5;

let worldEpoch = 0;
/** A chunk's mesh mounted, changed or left (world/Terrain.jsx). */
export function markShadowWorldChanged() {
  worldEpoch += 1;
}
export function shadowWorldEpoch() {
  return worldEpoch;
}

/** One schedule per shadowed light. */
export function createShadowSchedule() {
  return { lastAt: -Infinity, sun: null, cx: NaN, cz: NaN, world: -1, renders: 0 };
}

/**
 * Whether the shadow should render this frame. Records the render when it returns true.
 * @param {{lastAt:number, sun:number[]|null, cx:number, cz:number, world:number, renders:number}} s  mutated
 * @param {{ now:number, sunDir:number[], centre:{x:number,z:number}, worldEpoch:number, dynamic:boolean }} f
 *   sunDir is a unit vector; centre is the snapped frustum centre.
 */
export function shadowDue(s, f) {
  const worldChanged = f.worldEpoch !== s.world;
  const sunTurned = !s.sun || s.sun[0] * f.sunDir[0] + s.sun[1] * f.sunDir[1] + s.sun[2] * f.sunDir[2] <= COS_STEP;
  const centreMoved = f.centre.x !== s.cx || f.centre.z !== s.cz;
  if (!worldChanged && !sunTurned && !centreMoved && !f.dynamic) return false;
  if (!worldChanged && f.now - s.lastAt < MIN_INTERVAL_MS) return false;
  s.lastAt = f.now;
  s.sun = [f.sunDir[0], f.sunDir[1], f.sunDir[2]];
  s.cx = f.centre.x;
  s.cz = f.centre.z;
  s.world = f.worldEpoch;
  s.renders += 1;
  return true;
}
