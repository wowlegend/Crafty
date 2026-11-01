// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

/**
 * EACH BEAST STANDS ON THE FLOOR ITS OWN CAPSULE RESTS ON (registry REVIEW:w2e-follow:beast-feet-per-form).
 *
 * The avatar hangs under the body's centre, and each form's capsule (game/beasts.js BEAST_FORMS) rests that centre at its
 * own height. The REFERENCE is real Rapier (@dimforge/rapier3d-compat 0.19.2, the build the app ships): a floor, a
 * kinematic capsule of the form's shape and a character controller made as the Player's is (game/kinematicMove.js
 * CONTROLLER_OFFSET, snap to ground), dropped onto the floor until it rests; the centre's height over the floor top is
 * read, not computed from the shape. The SUBJECT is the real BeastAvatar mounted through R3F's own reconciler
 * (tests/gates/_r3f.jsx) with the body's centre at the origin, past its entrance: the lowest point of its boxes in world
 * space. Each form's feet must lie within FEET_TOLERANCE_M of the floor its capsule rests on: the row asks for 5 cm, and
 * the gate holds 1 cm because the fix measures under a millimetre, so a dropped controller offset (5 cm) or a box's
 * rotation left out (1.6 cm on the dragon's hind leg) still reads red.
 *
 * BLIND SPOT: the boxes' authored shape (a leg drawn above y 0 would float by design); what the player sees is the roar's
 * reveal (a real roar per form, shot on a real GPU, in the PR).
 */
vi.mock('@react-three/fiber', () => import('@react-three/fiber/dist/react-three-fiber.esm.js'));
const { mountR3F } = await import('./_r3f.jsx');
const { BeastAvatar } = await import('../../src/render/BeastAvatar.jsx');
const { BEAST_FORMS } = await import('../../src/game/beasts.js');
const { CONTROLLER_OFFSET } = await import('../../src/game/kinematicMove.js');
const { useGameStore } = await import('../../src/store/useGameStore');

const FEET_TOLERANCE_M = 0.01;

beforeAll(async () => {
  await RAPIER.init();
});

/** Where real Rapier rests the centre of a capsule of `form`'s shape over a floor whose top is y 0. */
function restHeight(form) {
  const world = new RAPIER.World({ x: 0, y: -30, z: 0 });
  const floor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(20, 0.5, 20), floor);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 3, 0));
  const col = world.createCollider(RAPIER.ColliderDesc.capsule(form.halfHeight, form.radius), body);
  const kcc = world.createCharacterController(CONTROLLER_OFFSET);
  kcc.enableSnapToGround(0.5);
  world.step();
  for (let i = 0; i < 240; i++) {
    kcc.computeColliderMovement(col, { x: 0, y: -0.2, z: 0 });
    const m = kcc.computedMovement(), p = body.translation();
    body.setNextKinematicTranslation({ x: p.x + m.x, y: p.y + m.y, z: p.z + m.z });
    world.step();
  }
  const y = body.translation().y;
  world.free();
  return y;
}

let r = null;
afterEach(async () => {
  if (r) await r.unmount();
  r = null;
  useGameStore.setState({ beastFormActive: false, activeBeastForm: null });
});

/** The lowest point of the mounted avatar's boxes, in world space (the body's centre at the origin), on the entrance's
 *  first frame (half scale) and past it (full scale). */
async function feetOf(el) {
  useGameStore.setState({ beastFormActive: true, activeBeastForm: el });
  r = await mountR3F(<BeastAvatar />);
  const scene = r.three().scene;
  const read = () => {
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3();
    let n = 0, scale = 0;
    scene.traverse((o) => {
      if (!o.isMesh || o.geometry.type !== 'BoxGeometry') return;
      box.expandByObject(o); n++; scale = o.matrixWorld.getMaxScaleOnAxis();
    });
    return { feet: box.min.y, boxes: n, scale };
  };
  await r.step(1);
  const first = read();
  await r.step(90); // past the entrance pop and the burst: full scale
  const settled = read();
  await r.unmount();
  r = null;
  return { ...settled, firstFeet: first.feet, firstScale: first.scale };
}

describe('each beast form\'s feet', () => {
  it('stand within 1 cm of the floor its capsule rests on, as real Rapier rests it, from the entrance\'s first frame', async () => {
    const rows = [];
    for (const [el, form] of Object.entries(BEAST_FORMS)) {
      const rest = restHeight(form);
      expect(rest, `SETUP: ${form.id}: the capsule did not come to rest on the floor`).toBeGreaterThan(form.halfHeight + form.radius);
      expect(rest, `SETUP: ${form.id}: the capsule did not come to rest on the floor`).toBeLessThan(form.halfHeight + form.radius + 0.2);
      const { feet, boxes, scale, firstFeet, firstScale } = await feetOf(el);
      expect(boxes, `SETUP: ${form.id}: no boxes were drawn`).toBeGreaterThan(3);
      expect(scale, `SETUP: ${form.id}: the avatar is not at full scale past its entrance`).toBeCloseTo(1, 6);
      expect(firstScale, `SETUP: ${form.id}: the entrance's first frame is not at about half scale`).toBeLessThan(0.6);
      rows.push({ form: form.id, rest: +rest.toFixed(3), feet: +feet.toFixed(3), gap: +(feet + rest).toFixed(3),
        firstGap: +(firstFeet + rest).toFixed(3) });
    }
    console.log(`beast-feet: ${JSON.stringify(rows)}`);
    expect(rows.length).toBe(4);
    for (const x of rows) {
      expect(Math.abs(x.gap), `${x.form}: its feet stand ${x.gap > 0 ? 'above' : 'below'} the floor by ${Math.abs(x.gap)} m (${JSON.stringify(x)})`)
        .toBeLessThanOrEqual(FEET_TOLERANCE_M);
      expect(Math.abs(x.firstGap), `${x.form}: at half scale on its first frame the form does not grow from the floor (${JSON.stringify(x)})`)
        .toBeLessThanOrEqual(FEET_TOLERANCE_M);
    }
  });
});
