import { describe, it, expect, beforeAll } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { BASE_CAPSULE, BEAST_FORMS } from '../../src/game/beasts.js';
import { fitCapsule, formHasRoom, enterFormFitted, restoreBaseFitted } from '../../src/game/formFit.js';

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
