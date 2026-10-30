// formFit.js — where the player's capsule can stand when it changes shape (a beast form entered, or the base shape
// restored when a form ends).
//
// The shape is swapped in place (beasts.js setColliderToForm), and the kinematic controller has no depenetration: a
// capsule that comes out of the swap overlapping a block stays in it. Lifting the body by the half-height's growth alone
// left the bull's lower end 0.17 m into the ground on open land (its half-height is shorter, its radius 0.22 m longer), a
// wider form 0.18 m into a wall it was pressed against, the golem's head in a two-high tunnel's ceiling, and ending the
// comet form 0.18 m of the base capsule in the floor (tests/integration/chaos-play-cave-overhang.test.jsx and its two
// sibling files). So the new shape is
// placed where it fits: its lower end where the old one's is, then the nearest spot within a few centimetres that clears
// every collider. Where none does, a form is refused; the base shape is restored regardless (no form outlives its end).

import { BASE_CAPSULE, setColliderToForm, restoreBaseCollider } from './beasts.js';
import { placeBody } from './kinematicMove.js';

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

// A loaded save's spot (fitLoadedSpot) is searched wider: the Save button before DECISIONS 2026-10-30 item 153 wrote the
// camera rounded to whole metres, so a save on disk can stand the centre up to 0.5 m sideways into a wall and up to 1.17 m
// above the body (the eye is 0.67 m over the centre). Wider than REACH is safe there only because each spot's own cell
// is asked whether it is solid ground (cellSolid), which the form swap's short reach stands in for.
const LOAD_REACH = 0.6;
/** How far sideways from a loaded save's centre the fit reads the colliders: the capsule's radius past its reach. The
 *  resume hold waits until every chunk within it has answered (game/spawnPlacement.js resumeColumnProbe). */
export const LOAD_FIT_SPAN = BASE_CAPSULE.radius + LOAD_REACH;
const LOAD_RISE = 0.6;
const LOAD_DROP = 1.2;
const LOAD_FALLBACK_GAP = 0.05; // the drop onto the column's top when nothing near the saved spot is clear

const IDENTITY = { w: 1, x: 0, y: 0, z: 0 };
const _offsets = new Map();

/** Every shift on the grid within `reach` sideways, `drop` down and `rise` up, nearest first (made once per range). */
function offsets(reach = REACH, drop = DROP, rise = RISE) {
  const key = `${reach}_${drop}_${rise}`;
  if (_offsets.has(key)) return _offsets.get(key);
  const out = [];
  const n = Math.round(reach / STEP), up = Math.round(rise / STEP), down = Math.round(drop / STEP);
  for (let i = -n; i <= n; i++) for (let k = -n; k <= n; k++) {
    if (Math.hypot(i, k) * STEP > reach + 1e-9) continue;
    for (let j = -down; j <= up; j++) out.push([i * STEP, j * STEP, k * STEP]);
  }
  out.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  _offsets.set(key, out);
  return out;
}

/** Whether a capsule of `shape` centred at a point would touch any collider but the body's own (and no dynamic body). */
function clearTest(world, rapier, body, shape, { filter, unindexed } = {}) {
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
  return (p) => {
    if (blocked(capsule, p)) return false;
    for (let i = 0; i <= n; i++) {
      if (blocked(ball, { x: p.x, y: p.y - shape.halfHeight + (2 * shape.halfHeight * i) / n, z: p.z })) return false;
    }
    return true;
  };
}

/**
 * Whether the voxel cell (x, y, z) is solid terrain, from the chunk trimeshes alone. The mesher draws a face wherever a
 * solid cell meets air or water, a chunk's own edges included (world/mesher.js), so each chunk's trimesh is closed, and a
 * ray up the middle of a cell's column crosses an odd number of its faces from inside solid ground and an even number
 * from air or water. Only trimeshes are counted: a placed cell's stand-in cuboid, debris and the player are not terrain.
 * (A shape query cannot tell: a trimesh is hollow, so a capsule wholly inside the ground touches no face.)
 */
export function cellSolid(world, rapier, x, y, z) {
  const ray = new rapier.Ray({ x: x + 0.5, y: y + 0.5, z: z + 0.5 }, { x: 0, y: 1, z: 0 });
  const terrain = (c) => c.shapeType() === rapier.ShapeType.TriMesh;
  let crossings = 0;
  for (let i = 0; i < 256; i++) {
    const hit = world.castRay(ray, 512, false, undefined, undefined, undefined, undefined, terrain);
    if (!hit) break;
    crossings++;
    ray.origin = { x: ray.origin.x, y: ray.origin.y + hit.timeOfImpact + 1e-3, z: ray.origin.z };
  }
  return crossings % 2 === 1;
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
export function fitCapsule(world, rapier, body, shape, opts = {}) {
  const c = body.collider(0);
  const at = c.translation();
  const y0 = at.y - c.halfHeight() - c.radius() + shape.halfHeight + shape.radius;
  const clear = clearTest(world, rapier, body, shape, opts);
  for (const [dx, dy, dz] of offsets()) {
    const p = { x: at.x + dx, y: y0 + dy, z: at.z + dz };
    if (clear(p)) return p;
  }
  return null;
}

/**
 * Where a loaded save stands the base capsule (Components.jsx's resume branch, once the saved column's colliders are
 * in): the saved centre where the capsule is clear of every collider and its centre's cell is not solid ground, else the
 * nearest such spot within LOAD_REACH sideways, LOAD_DROP down and LOAD_RISE up, else on the highest of the columns the
 * capsule stands across (`probe`, Terrain.jsx getMobGroundLevel: the topmost face under y 255). A save on disk can hold a
 * position no capsule fits at: the Save button before DECISIONS 2026-10-30 item 153 wrote the camera rounded to whole
 * metres, and the frozen pre-cut fixture (tests/fixtures/pre-cut-save.json) stands nine metres under the ground in the
 * chaos harness's world.
 * @param {object} world the Rapier world
 * @param {object} rapier the Rapier module
 * @param {object} body the player's kinematic body (excluded from every query)
 * @param {{x: number, y: number, z: number}} saved the saved centre
 * @param {(x: number, z: number) => ?number} probe the ground probe, which casts at (x + 0.1, z + 0.1)
 * @param {{filter?: (c: object) => boolean, unindexed?: object[]}} [opts] as fitCapsule's
 * @returns {{x: number, y: number, z: number, by: 'saved'|'near'|'column'}} the centre, and how it was found
 */
export function fitLoadedSpot(world, rapier, body, saved, probe, opts = {}) {
  const shape = BASE_CAPSULE;
  const clear = clearTest(world, rapier, body, shape, opts);
  const solid = new Map();
  const inGround = (p) => {
    const x = Math.floor(p.x), y = Math.floor(p.y), z = Math.floor(p.z);
    const key = `${x}_${y}_${z}`;
    if (!solid.has(key)) solid.set(key, cellSolid(world, rapier, x, y, z));
    return solid.get(key);
  };
  for (const [dx, dy, dz] of offsets(LOAD_REACH, LOAD_DROP, LOAD_RISE)) {
    const p = { x: saved.x + dx, y: saved.y + dy, z: saved.z + dz };
    if (!inGround(p) && clear(p)) return { ...p, by: dx || dy || dz ? 'near' : 'saved' };
  }
  let top = -Infinity;
  for (let x = Math.floor(saved.x - shape.radius); x <= Math.floor(saved.x + shape.radius); x++) {
    for (let z = Math.floor(saved.z - shape.radius); z <= Math.floor(saved.z + shape.radius); z++) {
      const y = probe ? probe(x + 0.4, z + 0.4) : null;
      if (Number.isFinite(y)) top = Math.max(top, y);
    }
  }
  const y = Number.isFinite(top) ? top + shape.halfHeight + shape.radius + LOAD_FALLBACK_GAP : saved.y;
  return { x: saved.x, y, z: saved.z, by: 'column' };
}

/** Whether a form's capsule fits where the body stands (the roar's commit asks before the bar is spent). */
export function formHasRoom(world, rapier, body, form, opts) {
  return !!form && !!body && fitCapsule(world, rapier, body, form, opts) !== null;
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
