import { describe, it, expect, beforeAll } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { supportedGround, MAX_SLOPE_CLIMB_RAD } from './grounding.js';
import { moveKinematic } from './kinematicMove.js';
import { GLUE_VELOCITY, applyGravity } from './locomotion.js';
import { BASE_CAPSULE } from './beasts.js';
import { generateMesh } from '../world/mesher.js';
import { CHUNK_SIZE, CHUNK_VOLUME, voxelIndex } from '../world/chunkLayout.js';

// supportedGround against real Rapier (rapier3d-compat 0.19.2) and the real mesher's trimesh, with the controller made as
// Components.jsx makes it, driven the way the Player drives it (moveKinematic on the 1/60 s step accumulator):
//  - on flat ground a walk loses no ground the controller found: the frames whose sweep met no floor (the snap) are
//    borne by the cast under the capsule;
//  - a fall down a one-column shaft 0.03 m off its middle is never ground, while the controller's own flag reads ground on
//    some of its frames (the defect is present in the run, so its absence below is measured, not assumed);
//  - on the brink of a ledge, borne only by its edge, the capsule is ground while the edge meets it within 45 degrees of
//    up (40) and not past it (50), where the controller's flag still reads ground and the cast under the capsule meets the
//    edge's slanted face (measured 2026-11-01: sweep normal 0.65, cast normal 0.52).
// The Player's use of it (the jump, the glue) is tests/gates/player-wall-ground-gates.test.jsx's.

const DT = 1 / 60;
const TOP = 30;
const SHAFT = { x: 8, z: 3, floor: 2 };
const LEDGE = { z: 14, low: 20 }; // cells z >= 14 stand only to y 20: a ledge's edge along z = 14 at y 30
function gen(x, y, z) {
  if (x === SHAFT.x && z === SHAFT.z && y >= SHAFT.floor && y < TOP) return 0;
  return y < (z >= LEDGE.z ? LEDGE.low : TOP) ? 3 : 0;
}

beforeAll(async () => {
  await RAPIER.init();
});

function makeWorld() {
  const world = new RAPIER.World({ x: 0, y: -30, z: 0 });
  const b = new Uint8Array(CHUNK_VOLUME);
  for (let x = 0; x < CHUNK_SIZE; x++) for (let z = 0; z < CHUNK_SIZE; z++) for (let y = 0; y < 40; y++) b[voxelIndex(x, y, z)] = gen(x, y, z);
  const m = generateMesh(0, 0, b, undefined);
  world.createCollider(RAPIER.ColliderDesc.trimesh(m.positions, m.indices), world.createRigidBody(RAPIER.RigidBodyDesc.fixed()));
  return world;
}
function makePlayer(world, at) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(at.x, at.y, at.z));
  const collider = world.createCollider(RAPIER.ColliderDesc.capsule(BASE_CAPSULE.halfHeight, BASE_CAPSULE.radius), body);
  const kcc = world.createCharacterController(0.05);
  kcc.enableAutostep(1.05, 0.2, true);
  kcc.enableSnapToGround(0.5);
  kcc.setMaxSlopeClimbAngle(MAX_SLOPE_CLIMB_RAD);
  const filter = (c) => { const p = c.parent(); return !p || p.handle !== body.handle; };
  return { body, collider, kcc, filter };
}
/** Play `sec` at `hz`: `move(f)` gives the frame's planar velocity; jump never pressed. Counts what each flag read. */
function play(world, p, hz, sec, move) {
  let acc = 0, vy = 0, grounded = false;
  const n = { frames: 0, kcc: 0, supported: 0, lost: 0 };
  for (let f = 0; f < Math.round(sec * hz); f++) {
    acc += 1 / hz;
    while (acc >= DT - 1e-9) { world.step(); acc -= DT; }
    vy = grounded ? GLUE_VELOCITY : applyGravity(vy, 1, 1 / hz);
    const v = move(f);
    moveKinematic(p.body, p.kcc, p.collider, { x: v.x / hz, y: vy / hz, z: v.z / hz }, 0, p.filter);
    const kcc = p.kcc.computedGrounded();
    grounded = supportedGround(p.kcc, world, p.body, p.collider, p.filter);
    n.frames++;
    if (kcc) n.kcc++;
    if (grounded) n.supported++;
    if (kcc && !grounded) n.lost++;
  }
  return n;
}

describe('supportedGround: the controller\'s ground, kept only where a walkable face bears the capsule', () => {
  for (const hz of [60, 120]) {
    it(`${hz} Hz: a walk on flat ground keeps every ground the controller found`, () => {
      const world = makeWorld();
      const p = makePlayer(world, { x: 2.5, y: TOP + 0.95, z: 12.5 });
      // Back and forth along x at the walk's 14 m/s, turning every 0.6 s: inside the chunk, clear of the shaft.
      const n = play(world, p, hz, 4, (f) => ({ x: Math.floor(f / hz / 0.6) % 2 === 0 ? 14 : -14, z: 0 }));
      expect(n.kcc, `SETUP: the controller did not stand the capsule on the ground ${JSON.stringify(n)}`).toBeGreaterThan(0.95 * n.frames);
      expect(n.lost, `the walk lost ground the controller found ${JSON.stringify(n)}`).toBe(0);
    });

    it(`${hz} Hz: a fall down a one-column shaft 0.03 m off its middle is never ground`, () => {
      const world = makeWorld();
      const p = makePlayer(world, { x: SHAFT.x + 0.47, y: 28, z: SHAFT.z + 0.5 });
      const n = play(world, p, hz, 0.8, () => ({ x: 0, z: 0 }));
      expect(n.kcc, `SETUP: the controller read no ground during the fall, so the defect is absent from this run ${JSON.stringify(n)}`).toBeGreaterThan(0);
      expect(n.supported, `the fall down the shaft read ground ${JSON.stringify(n)}`).toBe(0);
    });
  }

  it('on a ledge\'s brink the edge bears the capsule within 45 degrees of up, and not past it', () => {
    const read = {};
    for (const deg of [40, 50]) {
      const world = makeWorld();
      // The capsule's lower sphere the controller's offset clear of the edge, `deg` from straight above it.
      const a = (deg * Math.PI) / 180, d = BASE_CAPSULE.radius + 0.05;
      const p = makePlayer(world, { x: 4.5, y: TOP + d * Math.cos(a) + BASE_CAPSULE.halfHeight, z: LEDGE.z + d * Math.sin(a) });
      world.step();
      moveKinematic(p.body, p.kcc, p.collider, { x: 0, y: GLUE_VELOCITY / 60, z: 0 }, 0, p.filter);
      read[deg] = { kcc: p.kcc.computedGrounded(), supported: supportedGround(p.kcc, world, p.body, p.collider, p.filter) };
    }
    expect(read[50].kcc, `SETUP: the controller does not call the brink ground, so the case measures nothing ${JSON.stringify(read)}`).toBe(true);
    expect(read[40].supported, `an edge 40 degrees from up does not bear the capsule ${JSON.stringify(read)}`).toBe(true);
    expect(read[50].supported, `an edge 50 degrees from up bears the capsule ${JSON.stringify(read)}`).toBe(false);
  });
});
