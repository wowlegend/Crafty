import { describe, it, expect, beforeAll } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { BASE_CAPSULE, BEAST_FORMS } from '../../src/game/beasts.js';
import { makeStuckWatch, stuckInRock, STUCK_CHECK_SEC, STUCK_CONFIRM_SEC } from '../../src/game/stuckInRock.js';

// The stuck-in-rock recovery's reading and its spot (game/stuckInRock.js), against real Rapier: a block of rock as the
// mesher makes one, a closed trimesh, with the body put inside it as a clip leaves it. The Player's loop and the real
// world are tests/gates/stuck-in-rock-gates.test.jsx's.

beforeAll(async () => {
  await RAPIER.init();
});

const TOP = 10; // the rock's top face; it runs from y 0, x and z -8 to 8
function scene() {
  const world = new RAPIER.World({ x: 0, y: -30, z: 0 });
  const [x0, x1, y0, y1, z0, z1] = [-8, 8, 0, TOP, -8, 8];
  world.createCollider(RAPIER.ColliderDesc.trimesh(
    new Float32Array([x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]),
    new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5]),
  ));
  return world;
}
function player(world, at, shape = BASE_CAPSULE) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(at.x, at.y, at.z));
  world.createCollider(RAPIER.ColliderDesc.capsule(shape.halfHeight, shape.radius), body);
  world.step();
  return body;
}
/** Terrain.jsx getMobGroundLevel: the topmost face under y 255, at (x + 0.1, z + 0.1). */
const probeOf = (world, body) => (x, z) => {
  const hit = world.castRay(new RAPIER.Ray({ x: x + 0.1, y: 255, z: z + 0.1 }, { x: 0, y: -1, z: 0 }), 300, true, undefined, undefined, undefined, body);
  return hit ? 255 - hit.timeOfImpact : null;
};
/** Frames at `hz` until the recovery answers (at most `max`): the frame it answered on, and its spot. */
function run(world, body, hz, max, between = () => {}) {
  const watch = makeStuckWatch();
  for (let f = 1; f <= max; f++) {
    between(f);
    const spot = stuckInRock(watch, world, RAPIER, body, 1 / hz, probeOf(world, body), []);
    if (spot) return { f, spot };
  }
  return { f: null, spot: null };
}

describe('the stuck-in-rock recovery reads the centre at its rate, and moves a body only after its readings agree', () => {
  it('a body inside the rock is stood on the rock\'s top, over where it is, on the reading that completes the window', () => {
    for (const hz of [60, 120, 144]) {
      const world = scene();
      const body = player(world, { x: 2.3, y: 4.5, z: -1.7 });
      const { f, spot } = run(world, body, hz, 2 * hz);
      // Readings every STUCK_CHECK_SEC; the first solid one opens the window, and the one STUCK_CONFIRM_SEC later moves.
      const expected = Math.ceil((STUCK_CHECK_SEC + STUCK_CONFIRM_SEC) * hz - 1e-6);
      expect(f, `at ${hz} Hz the body was moved on frame ${f}`).toBeGreaterThanOrEqual(expected);
      expect(f, `at ${hz} Hz the body was moved on frame ${f}`).toBeLessThanOrEqual(expected + 2);
      expect(spot.x, 'the spot is not over where the body was').toBeCloseTo(2.3, 6);
      expect(spot.z, 'the spot is not over where the body was').toBeCloseTo(-1.7, 6);
      expect(spot.y, 'the spot does not stand the capsule on the rock\'s top').toBeCloseTo(TOP + BASE_CAPSULE.halfHeight + BASE_CAPSULE.radius + 0.05, 3);
    }
  });

  it('a body inside the rock a metre from its side is stood on the rock\'s top over where it is, not moved out of the side', () => {
    // The capsule clears the side face at x 8 from x 8.41 on, 1.11 m off and inside the fit's wider search (formFit.js
    // fitLoadedSpot), which takes a spot only along open cells; a centre in solid ground starts its move in the rock.
    const world = scene();
    const body = player(world, { x: 7.3, y: 4.5, z: 0.5 });
    const { spot } = run(world, body, 60, 120);
    expect(spot, 'SETUP: the body inside the rock was never moved').not.toBeNull();
    expect([spot.by, +spot.x.toFixed(3), +spot.z.toFixed(3)], `the body was not stood on the rock's top over where it was ${JSON.stringify(spot)}`).toEqual(['column', 7.3, 0.5]);
    expect(spot.y, 'the spot does not stand the capsule on the rock\'s top').toBeCloseTo(TOP + BASE_CAPSULE.halfHeight + BASE_CAPSULE.radius + 0.05, 3);
  });

  it('a reading out of the rock starts the window over', () => {
    const hz = 60;
    const world = scene();
    const body = player(world, { x: 0.5, y: 4.5, z: 0.5 });
    // Out of the rock for the frames round the window's second reading, back in after.
    const second = Math.round(2 * STUCK_CHECK_SEC * hz);
    const { f } = run(world, body, hz, 2 * hz, (n) => {
      body.setTranslation({ x: 0.5, y: n >= second - 1 && n <= second ? TOP + 2 : 4.5, z: 0.5 }, true);
    });
    expect(f, 'the body was moved on a window a reading out of the rock broke').toBeGreaterThan(second + Math.round(STUCK_CONFIRM_SEC * hz));
  });

  it('a body standing on the rock, or in the open beside it, is never moved', () => {
    for (const at of [{ x: 0.5, y: TOP + 0.95, z: 0.5 }, { x: 12, y: 0.95, z: 0 }]) {
      const world = scene();
      const body = player(world, at);
      expect(run(world, body, 60, 120).f, `a body at ${JSON.stringify(at)} was moved`).toBeNull();
    }
  });

  it('the spot stands the body\'s own shape: a beast form clears the rock by its own reach', () => {
    const golem = BEAST_FORMS.arcane;
    expect(golem.halfHeight + golem.radius, 'SETUP: the form is no taller than the base capsule').toBeGreaterThan(BASE_CAPSULE.halfHeight + BASE_CAPSULE.radius);
    const world = scene();
    const body = player(world, { x: -3.5, y: 5, z: 3.5 }, golem);
    const { spot } = run(world, body, 60, 120);
    expect(spot.y, 'the form was stood as if it were the base capsule').toBeCloseTo(TOP + golem.halfHeight + golem.radius + 0.05, 3);
  });
});

/** A closed box of rock from x0 to x1, y0 to y1, z0 to z1, as the mesher closes a chunk: a trimesh, hollow inside. */
function rockBox(world, x0, x1, y0, y1, z0, z1) {
  return world.createCollider(RAPIER.ColliderDesc.trimesh(
    new Float32Array([x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]),
    new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5]),
  ));
}

// ROCK MADE SINCE THE LAST WORLD STEP IS NOT READ AS OPEN. A chunk's trimesh made between steps is not in the broad phase
// until the next step (world/placedCellColliders.js), so the fit's cell reads (formFit.js cellSolid) miss it, and a
// capsule wholly inside it touches none of its faces: a recovery fitted on that frame stood the body inside rock that had
// just landed beside it (the static review of lane L13 part 2's round 2, its N3). A block fills the body's eye cell and
// rock walls it in but for its +x side, where the fit stands it clear; the rock that lands there fills that side.
describe('the stuck-in-rock recovery never stands a body in rock that landed since the last world step', () => {
  for (const hz of [60, 120]) {
    it(`a chunk landing beside the body on the frame of the reading that would move it is read after the step (${hz} Hz)`, () => {
      const boxedIn = () => {
        const world = scene();
        rockBox(world, 0, 1, TOP + 1, TOP + 2, 0, 1);
        rockBox(world, -2, 0, TOP, TOP + 3, -2, 3);
        rockBox(world, 0, 1, TOP, TOP + 3, -2, 0);
        rockBox(world, 0, 1, TOP, TOP + 3, 1, 3);
        return { world, body: player(world, { x: 0.5, y: TOP + 0.95, z: 0.5 }) };
      };
      const LANDS = [1, 4, TOP, TOP + 4, -8, 8];
      const r = BASE_CAPSULE.radius, reach = BASE_CAPSULE.halfHeight + BASE_CAPSULE.radius;
      const inRock = (p) => p.x + r > LANDS[0] + 1e-3 && p.x - r < LANDS[1] && p.y + reach > LANDS[2] + 1e-3 && p.y - reach < LANDS[3] - 1e-3
        && p.z + r > LANDS[4] && p.z - r < LANDS[5];
      // Without the rock: the frame the recovery moves the body, and its spot, where the rock will land.
      const control = (() => { const { world, body } = boxedIn(); return run(world, body, hz, 2 * hz); })();
      expect(control.f, 'SETUP: the body walled in with a block in its eye\'s cell was never moved').not.toBeNull();
      expect(inRock(control.spot), `SETUP: without the rock the body is not stood where it lands ${JSON.stringify(control)}`).toBe(true);
      const rows = [];
      for (const landsOn of [control.f - 2, control.f - 1, control.f]) {
        const { world, body } = boxedIn();
        const watch = makeStuckWatch();
        let moved = null;
        for (let f = 1; f <= 2 * hz && !moved; f++) {
          const unindexed = f === landsOn ? [rockBox(world, ...LANDS)] : [];
          const spot = stuckInRock(watch, world, RAPIER, body, 1 / hz, probeOf(world, body), unindexed);
          if (spot) moved = { f, spot: { x: +spot.x.toFixed(3), y: +spot.y.toFixed(3), z: +spot.z.toFixed(3), by: spot.by } };
          if (f === landsOn) world.step();
        }
        rows.push({ landsOn, ...moved });
      }
      for (const row of rows) {
        expect(row.f, `the body was never moved ${JSON.stringify({ control, rows })}`).toBeDefined();
        expect(inRock(row.spot), `the recovery stood the body in rock that landed on frame ${row.landsOn} ${JSON.stringify({ control, rows })}`).toBe(false);
      }
      expect(rows[2].f, `the reading the rock landed on was not read again on the frame after the step ${JSON.stringify({ control, rows })}`).toBe(control.f + 1);
    });
  }
});
