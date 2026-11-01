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
// The confirming balls' radius over the capsule's (clearTest says why they are there): balls half a radius apart grown by
// the sliver left between neighbours, 3.2 % of the radius.
const BALL_GROWTH = 1.033;

// A loaded save's spot (fitLoadedSpot) is searched wider: the Save button before DECISIONS 2026-10-30 item 153 wrote the
// camera rounded to whole metres, so a save on disk can stand the centre up to 0.5 m sideways into a wall and up to 1.17 m
// above the body (the eye is 0.67 m over the centre). Wider than REACH is safe there only because each spot's own cell
// is asked whether it is solid ground (cellSolid), which the form swap's short reach stands in for.
const LOAD_REACH = 0.6;
// FURTHER OUT, ONLY ALONG OPEN CELLS. Nothing within LOAD_REACH clears the capsule when a block fills the cell over the
// centre (a save from before the invisible-box fix can hold one in the eye's cell, and the stuck-in-rock watch stands
// that body clear): the block is cleared 0.92 m sideways, and the column-top fallback stood the player on the top of the
// column, up through the roof over a tunnel, four metres of rock (tests/gates/player-placement-gates.test.jsx; the static
// review of lane L13 part 2, its F1). So the search goes on to LOAD_WIDE, which reaches that 0.92 m along an axis or
// the diagonal (1.30 m), on a grid of WIDE_STEP, and takes a spot only where the straight move to it touches no solid
// cell (fitLoadedSpot's `open`). A centre in solid ground takes none of these: its move starts in the rock.
const LOAD_WIDE = 1.4;
const WIDE_STEP = 0.2;
/** How far sideways from a loaded save's centre the fit reads the colliders: a confirming ball's radius past the wider
 *  search's reach (LOAD_WIDE), the furthest any query reaches. The resume hold waits until every chunk within it has
 *  answered (game/spawnPlacement.js resumeColumnProbe). Twice it stopped short of a query and a load was fitted against
 *  a chunk not streamed back: by the balls' growth past the near search's reach (2.3 cm), and by the wider search, which
 *  stood the capsule 0.02 m into a wall that streamed in round it (tests/gates/player-placement-gates.test.jsx;
 *  tests/integration/form-fit-rapier.test.js holds it to the fit's furthest query). */
export const LOAD_FIT_SPAN = LOAD_WIDE + BASE_CAPSULE.radius * BALL_GROWTH + MARGIN;
const LOAD_RISE = 0.6;
const LOAD_DROP = 1.2;
const LOAD_FALLBACK_GAP = 0.05; // the drop onto the column's top when nothing near the saved spot is clear

const IDENTITY = { w: 1, x: 0, y: 0, z: 0 };
const _offsets = new Map();

/** Every shift on a grid of `step` within `reach` sideways, `drop` down and `rise` up, nearest first (made once per range). */
function offsets(reach = REACH, drop = DROP, rise = RISE, step = STEP) {
  const key = `${reach}_${drop}_${rise}_${step}`;
  if (_offsets.has(key)) return _offsets.get(key);
  const out = [];
  const n = Math.round(reach / step), up = Math.round(rise / step), down = Math.round(drop / step);
  for (let i = -n; i <= n; i++) for (let k = -n; k <= n; k++) {
    if (Math.hypot(i, k) * step > reach + 1e-9) continue;
    for (let j = -down; j <= up; j++) out.push([i * step, j * step, k * step]);
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
  const ball = new rapier.Ball(shape.radius * BALL_GROWTH + MARGIN);
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
 * nearest such spot within LOAD_REACH sideways, LOAD_DROP down and LOAD_RISE up, else the nearest within LOAD_WIDE
 * sideways that a straight move through open cells reaches, else on the highest of the columns the capsule stands across
 * (`probe`, Terrain.jsx getMobGroundLevel: the topmost face under y 255; `by: 'column'`, the one answer that can cross
 * solid ground, which the caller reports). A save on disk can hold a
 * position no capsule fits at: the Save button before DECISIONS 2026-10-30 item 153 wrote the camera rounded to whole
 * metres, and the frozen pre-cut fixture (tests/fixtures/pre-cut-save.json) stands nine metres under the ground in the
 * chaos harness's world. The stuck-in-rock recovery (game/stuckInRock.js) stands a body found in the rock the same way,
 * from where it is and in its own shape.
 * @param {object} world the Rapier world
 * @param {object} rapier the Rapier module
 * @param {object} body the player's kinematic body (excluded from every query)
 * @param {{x: number, y: number, z: number}} saved the saved centre
 * @param {(x: number, z: number) => ?number} probe the ground probe, which casts at (x + 0.1, z + 0.1)
 * @param {{filter?: (c: object) => boolean, unindexed?: object[], shape?: {halfHeight: number, radius: number}}} [opts]
 *   as fitCapsule's, and the capsule to stand (the base capsule unless given)
 * @returns {{x: number, y: number, z: number, by: 'saved'|'near'|'column'}} the centre, and how it was found
 */
export function fitLoadedSpot(world, rapier, body, saved, probe, opts = {}) {
  const shape = opts.shape || BASE_CAPSULE;
  const clear = clearTest(world, rapier, body, shape, opts);
  const solid = new Map();
  const solidCell = (x, y, z) => {
    const key = `${x}_${y}_${z}`;
    if (!solid.has(key)) solid.set(key, cellSolid(world, rapier, x, y, z));
    return solid.get(key);
  };
  const inGround = (p) => solidCell(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
  // Whether the straight move by (dx, dy, dz) from the saved centre takes the capsule's middle line, its lowest point to
  // its top, through no solid cell but those it stands in now over the centre's own: read every STEP, and between two
  // readings every cell of the box their cells span. Points read along a move see only the cells they land in: a move
  // through the edge two solid cells share is inside neither, and one that cuts a cell's corner can miss it between two
  // points; and the centre's cell alone let the upper half pass through a wall over a hole one cell high. A body boxed in
  // by pillars was moved out past the edge two of them share, and through a holed one
  // (tests/gates/player-placement-gates.test.jsx; the static review of lane L13 part 2's round 2, its N2). The segment
  // between two readings lies in that box; STEP is under a cell, so it is at most two cells across.
  const reach = shape.halfHeight + shape.radius;
  const span = (y) => [Math.floor(y - reach), Math.floor(y + reach)];
  const [ox, oy, oz] = [saved.x, saved.y, saved.z].map(Math.floor);
  const [oLo, oHi] = span(saved.y);
  const standsIn = (x, y, z) => x === ox && z === oz && y !== oy && y >= oLo && y <= oHi;
  const open = (dx, dy, dz) => {
    const n = Math.ceil(Math.hypot(dx, dy, dz) / STEP);
    let was = null;
    for (let i = 0; i <= n; i++) {
      const y = saved.y + (dy * i) / n;
      const c = [Math.floor(saved.x + (dx * i) / n), ...span(y), Math.floor(saved.z + (dz * i) / n)];
      const from = was || c;
      for (let x = Math.min(from[0], c[0]); x <= Math.max(from[0], c[0]); x++) {
        for (let z = Math.min(from[3], c[3]); z <= Math.max(from[3], c[3]); z++) {
          for (let cy = Math.min(from[1], c[1]); cy <= Math.max(from[2], c[2]); cy++) if (!standsIn(x, cy, z) && solidCell(x, cy, z)) return false;
        }
      }
      was = c;
    }
    return true;
  };
  // Within LOAD_REACH, then out to LOAD_WIDE along open cells only: the coarse grid's spots within LOAD_REACH are spots
  // of the fine one, already read.
  for (const grid of [offsets(LOAD_REACH, LOAD_DROP, LOAD_RISE), offsets(LOAD_WIDE, LOAD_DROP, LOAD_RISE, WIDE_STEP)]) {
    for (const [dx, dy, dz] of grid) {
      const p = { x: saved.x + dx, y: saved.y + dy, z: saved.z + dz };
      if (!inGround(p) && (Math.hypot(dx, dz) <= LOAD_REACH || open(dx, dy, dz)) && clear(p)) return { ...p, by: dx || dy || dz ? 'near' : 'saved' };
    }
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
