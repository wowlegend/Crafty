// formFit.js — where the player's capsule can stand when it changes shape (a beast form entered, or the base shape
// restored when a form ends).
//
// The shape is swapped in place (beasts.js setColliderToForm), and the kinematic controller has no depenetration: a
// capsule that comes out of the swap overlapping a block stays in it. Lifting the body by the half-height's growth alone
// left the bull's lower end 0.17 m into the ground on open land (its half-height is shorter, its radius 0.22 m longer), a
// wider form 0.18 m into a wall it was pressed against, the golem's head in a two-high tunnel's ceiling, and ending the
// comet form 0.18 m of the base capsule in the floor (tests/integration/chaos-play-rapier.test.jsx). So the new shape is
// placed where it fits: its lower end where the old one's is, then the nearest spot within a few centimetres that clears
// every collider. Where none does, a form is refused; the base shape is restored regardless (no form outlives its end).

import { BASE_CAPSULE, setColliderToForm, restoreBaseCollider } from './beasts.js';

const STEP = 0.05; // the search grid (m): the base capsule has 0.1 m of play in a one-block gap, so a 0.05 grid finds it
// The furthest sideways shift. Kept under the narrowest capsule's width (the comet's 0.6 m): a trimesh is hollow, so a
// capsule wholly inside solid ground touches no face and would read as clear; a shift this short keeps part of it where
// the old capsule stood, in the open.
const REACH = 0.35;
const RISE = 0.15; // the furthest lift above the kept lower end
// The furthest drop below it: a shape that comes back in the air under a low roof (the comet's 1.44 m ending as the base's
// 1.8 m while falling past a ledge) fits lower down. 0.4 m is the most any swap adds to the height (the comet to the base,
// 0.36 m); a capsule moved down into the ground still crosses its top face, so it is refused, never placed inside.
const DROP = 0.4;
const MARGIN = 0.01; // the clearance the placed capsule keeps from every collider

const IDENTITY = { w: 1, x: 0, y: 0, z: 0 };
let _offsets = null;

/** Every shift on the grid within REACH sideways, DROP down and RISE up, nearest first (made once). */
function offsets() {
  if (_offsets) return _offsets;
  const out = [];
  const n = Math.round(REACH / STEP), up = Math.round(RISE / STEP), down = Math.round(DROP / STEP);
  for (let i = -n; i <= n; i++) for (let k = -n; k <= n; k++) {
    if (Math.hypot(i, k) * STEP > REACH + 1e-9) continue;
    for (let j = -down; j <= up; j++) out.push([i * STEP, j * STEP, k * STEP]);
  }
  out.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  _offsets = out;
  return out;
}

/**
 * Where a capsule of `shape` can stand nearest the body's capsule: its lower end at the current lower end, shifted the
 * least that clears every collider but the body's own.
 * @param {object} world the Rapier world
 * @param {object} rapier the Rapier module (Capsule)
 * @param {object} body the player's kinematic body; its collider(0) is the capsule as it is now
 * @param {{halfHeight: number, radius: number}} shape the capsule to place
 * @param {{filter?: (c: object) => boolean, unindexed?: object[]}} opts the controller's filter, and the colliders made
 *   since the last world step (world/placedCellColliders.js), which the world's queries cannot see yet
 * @returns {{x: number, y: number, z: number}|null} the capsule's centre, or null when nothing near clears
 */
export function fitCapsule(world, rapier, body, shape, { filter, unindexed } = {}) {
  const c = body.collider(0);
  const at = c.translation();
  const y0 = at.y - c.halfHeight() - c.radius() + shape.halfHeight + shape.radius;
  const capsule = new rapier.Capsule(shape.halfHeight, shape.radius + MARGIN);
  // Dynamic bodies are not obstacles: block debris (world/BlockParticleSystem.jsx, 0.25 m cubes thrown for 2 s by every
  // mined block) is shoved aside by the controller, and counted here it refused a form or lifted it off the floor.
  const blocked = (s, p) => !!world.intersectionWithShape(p, IDENTITY, s, rapier.QueryFilterFlags.EXCLUDE_DYNAMIC, undefined, undefined, body, filter)
    || !!(unindexed && unindexed.some((o) => o.isValid() && o.intersectsShape(s, p, IDENTITY)));
  // The capsule query, then balls along the capsule's axis: rapier3d-compat 0.19.2's capsule query read a golem's capsule
  // clear with its top half a radius into a roof, when the core segment's end lay just short of the roof's face
  // (tests/integration/form-fit-rapier.test.js). Balls half a radius apart, each grown by the sliver left between
  // neighbours (3.2 % of the radius), cover the capsule; they are asked only of a spot the capsule query passed.
  const gap = shape.radius / 2;
  const n = Math.max(1, Math.ceil((2 * shape.halfHeight) / gap));
  const ball = new rapier.Ball(shape.radius * 1.033 + MARGIN);
  const ballsClear = (p) => {
    for (let i = 0; i <= n; i++) {
      if (blocked(ball, { x: p.x, y: p.y - shape.halfHeight + (2 * shape.halfHeight * i) / n, z: p.z })) return false;
    }
    return true;
  };
  for (const [dx, dy, dz] of offsets()) {
    const p = { x: at.x + dx, y: y0 + dy, z: at.z + dz };
    if (!blocked(capsule, p) && ballsClear(p)) return p;
  }
  return null;
}

/** Whether a form's capsule fits where the body stands (the roar's commit asks before the bar is spent). */
export function formHasRoom(world, rapier, body, form, opts) {
  return !!form && !!body && fitCapsule(world, rapier, body, form, opts) !== null;
}

/** Put the body (and its collider, at once) at `p`: the controller's next sweep starts from there. A move given on a
 *  frame that took no world step is dropped with it (at most one 120 Hz frame of walking). */
function placeBody(world, body, p) {
  body.setTranslation(p, true);
  world.propagateModifiedBodyPositionsToColliders();
}

/** The swap to a form, where it fits. Returns false (nothing changed) when no spot near the body takes the form's capsule. */
export function enterFormFitted(world, rapier, body, form, opts) {
  const spot = fitCapsule(world, rapier, body, form, opts);
  if (!spot || !setColliderToForm(body.collider(0), rapier, form)) return false;
  placeBody(world, body, spot);
  return true;
}

/** The base shape back, placed where it fits; restored even where nothing near takes it (no form outlives its end), and
 *  then the body stays where it is. */
export function restoreBaseFitted(world, rapier, body, controller, opts) {
  const spot = fitCapsule(world, rapier, body, BASE_CAPSULE, opts);
  const ok = restoreBaseCollider(body.collider(0), rapier, controller);
  if (ok && spot) placeBody(world, body, spot);
  return ok;
}
