import { describe, it, expect, beforeAll } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { moveKinematic } from '../../src/game/kinematicMove.js';
import { frameStep, MAX_FRAME_STEP_SEC } from '../../src/game/frameStep.js';
import { BASE_CAPSULE } from '../../src/game/beasts.js';

// THE PLAYER'S KINEMATIC WRITE AGAINST REAL RAPIER (the @dimforge/rapier3d-compat build the app ships).
//
// The app's <Physics> (@react-three/rapier 2.2.0, GameScene.jsx, no timeStep prop) steps the world on a fixed 1/60 s
// accumulator with the frame's delta clamped to 0.5 s; stepLikePhysics below is that loop. A frame that takes no step
// leaves the previous kinematic target unapplied, and a plain write replaced it: the player lost that frame's move.
// The controller's KCC settings are Components.jsx's (offset 0.05, autostep 1.05 / 0.2, snap 0.5, 45 degree slope).

const SPEED = 14; // the travel speed, m/s (game/locomotion.js BASE_MOVE_SPEED)

beforeAll(async () => {
  await RAPIER.init();
});

function makeWorld() {
  const world = new RAPIER.World({ x: 0, y: -30, z: 0 });
  const floor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(500, 0.5, 500), floor);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, BASE_CAPSULE.halfHeight + BASE_CAPSULE.radius + 0.06, 0));
  const collider = world.createCollider(RAPIER.ColliderDesc.capsule(BASE_CAPSULE.halfHeight, BASE_CAPSULE.radius), body);
  const kcc = world.createCharacterController(0.05);
  kcc.enableAutostep(1.05, 0.2, true);
  kcc.enableSnapToGround(0.5);
  kcc.setMaxSlopeClimbAngle(Math.PI / 4);
  world.step();
  return { world, body, collider, kcc, acc: { s: 0 } };
}

function stepLikePhysics(w, dt) {
  w.acc.s += Math.min(Math.max(dt, 0), 0.5);
  while (w.acc.s >= 1 / 60) { w.world.step(); w.acc.s -= 1 / 60; }
}

// The plain write the controller used to make, kept as the control that shows this harness can see the loss.
function plainWrite(w, d) {
  w.kcc.computeColliderMovement(w.collider, d);
  const m = w.kcc.computedMovement(), at = w.body.translation();
  w.body.setNextKinematicTranslation({ x: at.x + m.x, y: at.y + m.y, z: at.z + m.z });
}

// Walk +x at SPEED over `frames` (seconds each, the controller's capped step); the share of the fed distance travelled.
function walk(frames, write) {
  const w = makeWorld();
  const x0 = w.body.translation().x;
  let fed = 0;
  for (const dt of frames) {
    const d = { x: SPEED * frameStep(dt), y: -0.01, z: 0 };
    fed += d.x;
    write(w, d);
    stepLikePhysics(w, dt);
  }
  w.world.step(); // the last target lands
  return (w.body.translation().x - x0) / fed;
}

const carried = (w, d) => moveKinematic(w.body, w.kcc, w.collider, d);
function seeded(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const r = seeded(7);
const PATTERNS = {
  '120 Hz': Array(600).fill(1 / 120),
  '144 Hz': Array(600).fill(1 / 144),
  '60 Hz with +-2 ms jitter': Array.from({ length: 600 }, () => 1 / 60 + (r() - 0.5) * 0.004),
  '227 ms frames (CI software rendering)': Array(30).fill(0.227),
  '60 Hz exact': Array(600).fill(1 / 60),
};

describe('moveKinematic: no frame\'s move is lost to a frame that took no world step (real Rapier)', () => {
  it('the control: a plain write loses the move of every frame that took no step (half of it at 120 Hz)', () => {
    expect(walk(PATTERNS['120 Hz'], plainWrite)).toBeLessThan(0.6);
    expect(walk(PATTERNS['144 Hz'], plainWrite)).toBeLessThan(0.5);
  });

  for (const [name, frames] of Object.entries(PATTERNS)) {
    it(`${name}: the body travels the distance it was fed`, () => {
      expect(walk(frames, carried)).toBeGreaterThanOrEqual(0.99);
      expect(walk(frames, carried)).toBeLessThanOrEqual(1.0001);
    });
  }

  it('a teleport between a write and the next step drops the pending move (setTranslation sets the target too)', () => {
    const w = makeWorld();
    moveKinematic(w.body, w.kcc, w.collider, { x: 0.5, y: -0.01, z: 0 }); // no world step follows
    w.body.setTranslation({ x: 40, y: w.body.translation().y, z: 40 }, true);
    moveKinematic(w.body, w.kcc, w.collider, { x: 0.1, y: -0.01, z: 0 });
    w.world.step();
    expect(w.body.translation().x).toBeCloseTo(40.1, 3);
  });

  it('nextTranslation is where the next frame\'s step starts: the body plus every move not yet stepped', () => {
    const w = makeWorld();
    const at = w.body.translation();
    const m = moveKinematic(w.body, w.kcc, w.collider, { x: 0.2, y: 0, z: 0 });
    const next = w.body.nextTranslation();
    expect(next.x).toBeCloseTo(at.x + m.x, 6);
    w.world.step();
    expect(w.body.nextTranslation().x).toBeCloseTo(w.body.translation().x, 6);
  });
});

describe('a form swap\'s grow lift lands unswept whether or not a world step follows its frame (real Rapier)', () => {
  // A capsule grown by LIFT at each end, standing where the base capsule stood, so its base is LIFT into the floor, and
  // a ceiling CLEAR above its top, inside the lift. The lift is a depenetration: it moves the body without a sweep.
  const LIFT = 0.2, CLEAR = 0.1;
  function grownUnderCeiling() {
    const w = makeWorld();
    w.world.removeCollider(w.collider, false);
    w.collider = w.world.createCollider(RAPIER.ColliderDesc.capsule(BASE_CAPSULE.halfHeight + LIFT, BASE_CAPSULE.radius), w.body);
    const y0 = w.body.translation().y;
    const top = y0 + BASE_CAPSULE.halfHeight + LIFT + BASE_CAPSULE.radius;
    const ceiling = w.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, top + CLEAR + 0.5, 0));
    w.world.createCollider(RAPIER.ColliderDesc.cuboid(50, 0.5, 50), ceiling);
    w.world.step();
    return { w, y0 };
  }
  const still = { x: 0, y: 0, z: 0 };

  it('the swap frame, then a step (60 Hz): the body rises the whole lift', () => {
    const { w, y0 } = grownUnderCeiling();
    moveKinematic(w.body, w.kcc, w.collider, still, LIFT);
    w.world.step();
    moveKinematic(w.body, w.kcc, w.collider, still, 0);
    w.world.step();
    expect(w.body.translation().y - y0).toBeCloseTo(LIFT, 4);
  });

  it('the swap frame takes no step (120 Hz): the next frame does not sweep the lift into the ceiling', () => {
    const { w, y0 } = grownUnderCeiling();
    moveKinematic(w.body, w.kcc, w.collider, still, LIFT);
    moveKinematic(w.body, w.kcc, w.collider, still, 0);
    w.world.step();
    expect(w.body.translation().y - y0, 'the lift was swept and stopped at the ceiling: the capsule stays in the floor').toBeCloseTo(LIFT, 4);
  });

  it('the lift rides with a walk across frames that take no step, and a teleport drops it', () => {
    const { w, y0 } = grownUnderCeiling();
    const x0 = w.body.translation().x;
    moveKinematic(w.body, w.kcc, w.collider, { x: 0.1, y: 0, z: 0 }, LIFT);
    moveKinematic(w.body, w.kcc, w.collider, { x: 0.1, y: 0, z: 0 }, 0);
    moveKinematic(w.body, w.kcc, w.collider, { x: 0.1, y: 0, z: 0 }, 0);
    w.world.step();
    expect(w.body.translation().y - y0, 'the lift was lost or doubled over three frames with no step').toBeCloseTo(LIFT, 3);
    expect(w.body.translation().x - x0, 'a frame\'s walk was lost beside the lift').toBeCloseTo(0.3, 3);
    const t = grownUnderCeiling();
    moveKinematic(t.w.body, t.w.kcc, t.w.collider, still, LIFT);
    t.w.body.setTranslation({ x: 40, y: t.y0, z: 40 }, true);
    moveKinematic(t.w.body, t.w.kcc, t.w.collider, still, 0);
    t.w.world.step();
    expect(t.w.body.translation().y - t.y0, 'a lift dropped by a teleport came back').toBeCloseTo(0, 4);
  });
});

describe('the cut at a collider made since the last step lets a capsule that starts inside it move out (real Rapier)', () => {
  // A cell's stand-in cuboid made since the last world step (world/placedCellColliders.js), its top 0.2 m above the
  // capsule's lowest point, as a block placed round the feet or a chunk rebuilt under a form swap leaves it: the sweep
  // cannot see it, so the cut casts against it. A cast that starts in it must not stop there, or a jump out of it, away
  // from it, is cut to nothing for the frame (rapier3d-compat 0.19.2 castCollider's stopAtPenetration, false here).
  function inCell() {
    const w = makeWorld();
    const feet = w.body.translation().y - BASE_CAPSULE.halfHeight - BASE_CAPSULE.radius;
    const cell = w.world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5).setTranslation(0, feet + 0.2 - 0.5, 0));
    expect(w.collider.intersectsShape(cell.shape, cell.translation(), cell.rotation()), 'SETUP: the capsule does not start inside the cell').toBe(true);
    return { w, cell };
  }
  it('a jump straight up out of the cell keeps its whole move', () => {
    const { w, cell } = inCell();
    const m = moveKinematic(w.body, w.kcc, w.collider, { x: 0, y: 0.3, z: 0 }, 0, undefined, [cell]);
    expect(m.y, 'the move out of the cell was cut').toBeCloseTo(0.3, 3);
  });
  it('the control: a move into the cell from outside it is still cut short of it', () => {
    const w = makeWorld();
    const cell = w.world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5).setTranslation(1.0 + BASE_CAPSULE.radius + 0.5, 1, 0));
    const m = moveKinematic(w.body, w.kcc, w.collider, { x: 2, y: 0, z: 0 }, 0, undefined, [cell]);
    expect(m.x, 'SETUP: the sweep did not move toward the cell').toBeGreaterThan(0.5);
    expect(m.x, 'the cut let the capsule into the cell').toBeLessThanOrEqual(1.0 - 0.04);
  });
});

describe('the frame cap and the wall: the KCC sweep does not tunnel at any step length', () => {
  // Why MAX_FRAME_STEP_SEC need not be lower for the player (game/frameStep.js).
  for (const thick of [1.0, 0.05]) {
    for (const len of [SPEED * MAX_FRAME_STEP_SEC, SPEED]) {
      it(`one ${len} m sweep stops at a ${thick} m wall 1 m ahead`, () => {
        const w = makeWorld();
        const wall = w.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(1.0 + BASE_CAPSULE.radius + thick / 2, 1.5, 0));
        w.world.createCollider(RAPIER.ColliderDesc.cuboid(thick / 2, 1.5, 5), wall);
        w.world.step();
        const m = moveKinematic(w.body, w.kcc, w.collider, { x: len, y: -0.01, z: 0 });
        expect(m.x).toBeGreaterThan(0.9); // it moved up to the wall: the sweep is live, not blocked from the start
        expect(m.x).toBeLessThanOrEqual(1.0);
      });
    }
  }
});
