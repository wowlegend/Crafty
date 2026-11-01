import { describe, it, expect, beforeAll } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { BASE_CAPSULE, BEAST_FORMS } from '../../src/game/beasts.js';
import { fitCapsule, formHasRoom, enterFormFitted, restoreBaseFitted, fitLoadedSpot, LOAD_FIT_SPAN } from '../../src/game/formFit.js';

// A form swap places the new capsule where it fits (game/formFit.js), against real Rapier: the bull on open ground keeps
// its feet on the floor instead of 0.17 m in it, pressed against a wall it stands off the wall, the golem in a two-high
// corridor is refused and the shape left as it was, and the base shape coming back while falling under a low roof fits
// lower down. Each case reads the placed capsule against the world with the world's own intersection query.

beforeAll(async () => {
  await RAPIER.init();
});

const IDENTITY = { w: 1, x: 0, y: 0, z: 0 };

/** Floor top at y 0; optional wall face at x = wallX (solid beyond, x < wallX) and ceiling underside at y = roof. */
function scene({ wallX = null, roof = null } = {}) {
  const world = new RAPIER.World({ x: 0, y: -30, z: 0 });
  world.createCollider(RAPIER.ColliderDesc.cuboid(10, 0.5, 10).setTranslation(0, -0.5, 0));
  if (wallX !== null) world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 5, 10).setTranslation(wallX - 0.5, 5, 0));
  if (roof !== null) world.createCollider(RAPIER.ColliderDesc.cuboid(10, 0.5, 10).setTranslation(0, roof + 0.5, 0));
  return world;
}
/** The player as the game makes it, its capsule's lower end `gap` over the floor (the controller keeps 0.05). */
function player(world, { x = 0, shape = BASE_CAPSULE, bottom = 0.05 } = {}) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, bottom + shape.halfHeight + shape.radius, 0));
  world.createCollider(RAPIER.ColliderDesc.capsule(shape.halfHeight, shape.radius), body);
  const kcc = world.createCharacterController(0.05);
  world.step();
  return { body, kcc };
}
/** The live capsule against everything else in the world, where its collider is. */
function overlaps(world, body) {
  const c = body.collider(0);
  return world.intersectionWithShape(c.translation(), IDENTITY, new RAPIER.Capsule(c.halfHeight(), c.radius()), undefined, undefined, undefined, body) !== null;
}
const lowest = (body) => { const c = body.collider(0); return c.translation().y - c.halfHeight() - c.radius(); };

describe('a beast-form swap places the new capsule where it fits (real Rapier)', () => {
  it('the bull on open ground keeps its lower end over the floor', () => {
    const world = scene();
    const { body } = player(world);
    const bull = BEAST_FORMS.ice;
    expect(bull.halfHeight + bull.radius, 'SETUP: the bull is no taller below its centre than the base').toBeGreaterThan(BASE_CAPSULE.halfHeight + BASE_CAPSULE.radius);
    expect(enterFormFitted(world, RAPIER, body, bull, {}), 'the bull was refused on open ground').toBe(true);
    expect(body.collider(0).radius(), 'the shape was not swapped').toBeCloseTo(bull.radius, 5);
    expect(lowest(body), 'the bull\'s lower end is not where the base\'s was').toBeCloseTo(0.05, 3);
    expect(overlaps(world, body), 'the bull overlaps the floor').toBe(false);
  });

  it('pressed against a wall, the wider bull stands off it', () => {
    const world = scene({ wallX: -1 });
    const { body } = player(world, { x: -1 + BASE_CAPSULE.radius + 0.05 });
    expect(enterFormFitted(world, RAPIER, body, BEAST_FORMS.ice, {}), 'the bull was refused beside a wall').toBe(true);
    const x = body.collider(0).translation().x;
    expect(x - (-1), `the bull's side is in the wall (centre ${x.toFixed(3)})`).toBeGreaterThanOrEqual(BEAST_FORMS.ice.radius);
    expect(overlaps(world, body), 'the bull overlaps the wall').toBe(false);
  });

  it('in a two-high corridor the golem is refused, and the base shape is left as it was', () => {
    const world = scene({ roof: 2 });
    const { body } = player(world);
    const golem = BEAST_FORMS.arcane;
    expect(2 * (golem.halfHeight + golem.radius), 'SETUP: the golem fits under a two-metre roof').toBeGreaterThan(2);
    const at = body.translation();
    expect(formHasRoom(world, RAPIER, body, golem, {}), 'the roar commit read room for the golem').toBe(false);
    expect(enterFormFitted(world, RAPIER, body, golem, {}), 'the golem was swapped in under the roof').toBe(false);
    expect([body.collider(0).halfHeight(), body.collider(0).radius()], 'a refused swap changed the shape').toEqual([BASE_CAPSULE.halfHeight, BASE_CAPSULE.radius].map((v) => Math.fround(v)));
    expect(body.translation(), 'a refused swap moved the body').toEqual(at);
    expect(formHasRoom(world, RAPIER, body, BEAST_FORMS.fire, {}), 'the comet, which does fit, read no room').toBe(true);
  });

  it('the base shape back while falling under a low roof fits lower down, and comes back even where nothing fits', () => {
    const comet = BEAST_FORMS.fire;
    // In the air: the comet's top 0.04 m under a roof at 3.0, its lower end 1.56 m up. The base, its lower end kept, would
    // put its head 0.32 m into the roof.
    const world = scene({ roof: 3 });
    const { body, kcc } = player(world, { shape: comet, bottom: 3 - 0.04 - 2 * (comet.halfHeight + comet.radius) });
    expect(overlaps(world, body), 'SETUP: the comet overlaps something').toBe(false);
    expect(fitCapsule(world, RAPIER, body, BASE_CAPSULE, {}), 'no spot near the comet fits the base').not.toBeNull();
    expect(restoreBaseFitted(world, RAPIER, body, kcc, {}), 'the base shape was not restored').toBe(true);
    expect(body.collider(0).radius(), 'the shape is not the base').toBeCloseTo(BASE_CAPSULE.radius, 5);
    expect(overlaps(world, body), 'the base came back inside the roof').toBe(false);
    // Nowhere fits (a roof 1.5 m over the floor, under the base's 1.8 m): restored anyway, the body left where it was.
    const tight = scene({ roof: 1.5 });
    const p = player(tight, { shape: comet });
    const at = p.body.translation();
    expect(restoreBaseFitted(tight, RAPIER, p.body, p.kcc, {}), 'a form outlived its end where the base does not fit').toBe(true);
    expect([p.body.collider(0).radius(), p.body.translation()], 'the unfitted restore moved the body or kept the form').toEqual([Math.fround(BASE_CAPSULE.radius), at]);
  });

  it('block debris (dynamic 0.25 m cubes) neither refuses a form nor moves it: the bull fits where the base stood', () => {
    // A mined block throws 8 debris cubes for 2 s (world/BlockParticleSystem.jsx, dynamic bodies the swap would shove
    // aside): a ring of them on the floor around the player, inside the bull's 0.62 m radius and the fit's reach.
    const world = scene();
    const { body } = player(world);
    for (let k = 0; k < 12; k++) {
      const a = (k * Math.PI) / 6;
      const cube = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(Math.cos(a) * 0.55, 0.13, Math.sin(a) * 0.55));
      world.createCollider(RAPIER.ColliderDesc.cuboid(0.125, 0.125, 0.125), cube);
    }
    world.step();
    const bull = BEAST_FORMS.ice;
    const bare = scene();
    expect(overlaps(bare, player(bare, { shape: bull }).body), 'SETUP: the bull overlaps a bare floor').toBe(false);
    const spot = fitCapsule(world, RAPIER, body, bull, {});
    expect(spot, 'the debris refused the bull').not.toBeNull();
    const kept = 0.05 + bull.halfHeight + bull.radius; // the lower end where the base capsule's is
    expect([spot.x, spot.y, spot.z].map((v) => +v.toFixed(4)), 'the debris moved the bull off where the base stood').toEqual([0, +kept.toFixed(4), 0]);
  });

  it('a collider made since the last step (a placed cell\'s stand-in) counts, though the world\'s query cannot see it yet', () => {
    const world = scene();
    const { body } = player(world);
    // A cuboid where the bull's wider side would go, made after the last step: the broad phase has not indexed it.
    const standIn = world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5).setTranslation(-1.05, 0.5, 0));
    const bull = BEAST_FORMS.ice;
    const unchecked = fitCapsule(world, RAPIER, body, bull, {});
    expect(unchecked && unchecked.x, 'SETUP: the world query already sees the new cuboid, so this shows nothing').toBeCloseTo(0, 5);
    const spot = fitCapsule(world, RAPIER, body, bull, { unindexed: [standIn] });
    expect(spot && spot.x - (-0.55), `the fit put the bull into the unindexed cuboid (centre ${spot && spot.x.toFixed(3)})`).toBeGreaterThanOrEqual(bull.radius);
  });
});

// THE LOAD'S HOLD WAITS FOR EVERY CHUNK THE LOAD FIT READS: every chunk within LOAD_FIT_SPAN of the saved centre on each
// axis (game/spawnPlacement.js cornersAnswer). A span short of the fit's furthest query let a load go with a chunk the
// fit read not back, twice (tests/gates/player-placement-gates.test.jsx). Every query the fit puts to the world is
// recorded here: a shape's centre and radius, a ray's origin, the ground probe's point. A cell's ray (cellSolid) casts up
// the cell's middle and reads that cell, so what must lie within the span is a point of the cell.
function recordFit(world, body, saved) {
  const shapes = [], rays = [], probes = [];
  const recorded = new Proxy(world, {
    get(target, key) {
      if (key === 'intersectionWithShape') return (p, rot, s, ...rest) => { shapes.push({ x: p.x, z: p.z, r: s.radius }); return target.intersectionWithShape(p, rot, s, ...rest); };
      if (key === 'castRay') return (ray, ...rest) => { rays.push({ x: ray.origin.x, z: ray.origin.z }); return target.castRay(ray, ...rest); };
      const v = target[key];
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
  // Terrain.jsx getMobGroundLevel casts at (x + 0.1, z + 0.1).
  const spot = fitLoadedSpot(recorded, RAPIER, body, saved, (x, z) => { probes.push({ x: x + 0.1, z: z + 0.1 }); return null; }, { unindexed: [] });
  const off = (q) => Math.max(Math.abs(q.x - saved.x), Math.abs(q.z - saved.z));
  const cellOutside = (v, c) => Math.floor(v) > c + LOAD_FIT_SPAN || Math.floor(v) + 1 < c - LOAD_FIT_SPAN;
  return {
    spot, counts: [shapes.length, rays.length, probes.length],
    reach: Math.max(...shapes.map((q) => off(q) + q.r)),
    raysOut: rays.filter((q) => cellOutside(q.x, saved.x) || cellOutside(q.z, saved.z)),
    probesOut: probes.filter((q) => off(q) > LOAD_FIT_SPAN),
  };
}
/** A lid of rock a metre over the floor, x0 to x1 and z0 to z1, two metres thick. */
const lid = (world, x0, x1, z0, z1) => world.createCollider(RAPIER.ColliderDesc.cuboid((x1 - x0) / 2, 1, (z1 - z0) / 2).setTranslation((x0 + x1) / 2, 2, (z0 + z1) / 2));

describe('the load fit reads the colliders out to LOAD_FIT_SPAN round the saved centre, and no further', () => {
  it('stood in the one pocket that fits, the wider search\'s furthest spot, its confirming balls read out to the span exactly', () => {
    // A lid a metre over the floor everywhere but a pocket x 1.45 to 2.4, z 0 to 1: the capsule fits only at x 1.9, z 0.5,
    // 1.4 m from the saved centre along x, the wider search's reach, and the balls are asked there once the capsule passes.
    const world = scene();
    lid(world, -5, 1.45, -5, 5); lid(world, 2.4, 6, -5, 5); lid(world, 1.45, 2.4, -5, 0); lid(world, 1.45, 2.4, 1, 5);
    const { body } = player(world);
    const saved = { x: 0.5, y: 0.95, z: 0.5 };
    const r = recordFit(world, body, saved);
    expect([r.spot.by, +r.spot.x.toFixed(3), +r.spot.z.toFixed(3)], `SETUP: the fit did not stand the capsule in the pocket ${JSON.stringify(r.spot)}`).toEqual(['near', 1.9, 0.5]);
    expect(r.reach, `a query reached ${r.reach.toFixed(4)} m on an axis, past the span the hold waits for (${LOAD_FIT_SPAN.toFixed(4)} m)`).toBeLessThanOrEqual(LOAD_FIT_SPAN + 1e-9);
    expect(r.reach, `the furthest query reached ${r.reach.toFixed(4)} m, short of the span (${LOAD_FIT_SPAN.toFixed(4)} m): the span is not the fit's reach`).toBeGreaterThanOrEqual(LOAD_FIT_SPAN - 1e-9);
    expect(r.raysOut, `${r.raysOut.length} cell reads were of a cell wholly past the span`).toEqual([]);
  });

  it('under a roof where nothing fits, every spot is asked, and no query, cell read or ground probe lies past the span', () => {
    const world = scene({ roof: 1 });
    const { body } = player(world);
    const r = recordFit(world, body, { x: 0.3, y: 0.95, z: -0.2 });
    expect(r.spot.by, `SETUP: a spot under the roof fitted, so the fit did not ask every spot ${JSON.stringify(r.spot)}`).toBe('column');
    expect(r.counts, 'SETUP: the fit asked the world nothing of one kind').not.toContain(0);
    expect(r.reach, `SETUP: the wider search's furthest spots were not asked (${r.reach.toFixed(4)} m)`).toBeGreaterThanOrEqual(1.4 + BASE_CAPSULE.radius);
    expect(r.reach, `a query reached ${r.reach.toFixed(4)} m on an axis, past the span the hold waits for (${LOAD_FIT_SPAN.toFixed(4)} m)`).toBeLessThanOrEqual(LOAD_FIT_SPAN + 1e-9);
    expect(r.raysOut, `${r.raysOut.length} cell reads were of a cell wholly past the span`).toEqual([]);
    expect(r.probesOut, `${r.probesOut.length} ground probes read past the span`).toEqual([]);
  });
});
