// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';

/**
 * THE PLAYER'S OWN BEAST, SEEN FROM ITS EYE (render/beastAvatarParts.js SELF_CLEARANCE_M, render/BeastAvatar.jsx).
 *
 * With the eye at the body's centre + EYE_HEIGHT_M (DECISIONS 2026-10-28 item 34), first person in beast form puts the
 * eye inside the hawk's and the golem's heads and a third of a metre from the dragon's wings, and the halo washes the
 * lower view (lookbook frames, docs/superpowers/masterpiece-2026-10/evidence/w2e-follow/). In first person the avatar
 * draws nothing but its shadow (DECISIONS 2026-10-29 item 80). This checks the box distance against three's own
 * transforms and, mounted through R3F (tests/gates/_r3f.jsx), per form: through the eye's bob and a kick nothing draws
 * and every box still casts; along the roar's reveal every drawn part, glow spheres included, is at least the clearance
 * from the camera, read from three's own geometry and world matrices, and at the reveal's hold the whole beast draws;
 * away from the eye, a part the camera stands in hides while the rest draw.
 * BLIND SPOT: nothing is drawn here; what the player sees is the lookbook's self set.
 */
vi.mock('@react-three/fiber', () => import('@react-three/fiber/dist/react-three-fiber.esm.js'));
const { mountR3F } = await import('./_r3f.jsx');
const { beastAvatarParts, boxDistance, SELF_CLEARANCE_M, FIRST_PERSON_M, BEAST_AVATAR_ELEMENTS } = await import('../../src/render/beastAvatarParts.js');
const { BeastAvatar, FEET_OFFSET } = await import('../../src/render/BeastAvatar.jsx');
const { EYE_HEIGHT_M, EYE_BOB_M } = await import('../../src/combat/swingOrigin.js');
const { transformCamPose } = await import('../../src/game/transformCam.js');
const { PointLightPool, PooledLight } = await import('../../src/render/lightPool.jsx');
const { useGameStore } = await import('../../src/store/useGameStore');

/** The first-person eye in the avatar's own frame: the group sits FEET_OFFSET under the body's centre. */
const EYE_LOCAL_Y = EYE_HEIGHT_M - FEET_OFFSET;

/** three's answer: the point taken into the box's frame by the inverse of its world matrix, then clamped. */
function threeDistance(box, p) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...box.pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(box.rot || [0, 0, 0]))), new THREE.Vector3(1, 1, 1));
  const local = p.clone().applyMatrix4(m.invert());
  const h = new THREE.Vector3(...box.size).multiplyScalar(0.5);
  return new THREE.Vector3(Math.max(Math.abs(local.x) - h.x, 0), Math.max(Math.abs(local.y) - h.y, 0), Math.max(Math.abs(local.z) - h.z, 0)).length();
}

describe('the distance from the eye to each part of the beast', () => {
  it('agrees with three\'s transforms for every box of every form, rotated about each axis', () => {
    let checked = 0;
    const axes = new Set();
    for (const el of BEAST_AVATAR_ELEMENTS) {
      for (const box of beastAvatarParts(el).boxes) {
        (box.rot || []).forEach((r, i) => { if (r) axes.add(i); });
        for (const p of [[0, EYE_LOCAL_Y, 0], [0.3, 1.2, -0.4], [-0.7, 0.5, 0.9], [...box.pos]]) {
          const v = new THREE.Vector3(...p);
          expect(boxDistance(box, v.x, v.y, v.z), `${el} box at ${box.pos}`).toBeCloseTo(threeDistance(box, v), 9);
          checked += 1;
        }
      }
    }
    expect([...axes].sort(), 'SETUP: the boxes must turn about x, y and z, or a wrong rotation order passes').toEqual([0, 1, 2]);
    expect(checked).toBe(4 * BEAST_AVATAR_ELEMENTS.reduce((n, el) => n + beastAvatarParts(el).boxes.length, 0));
  });

  it('at the first-person eye the hawk\'s and the golem\'s heads are inside the clearance, and nothing far is', () => {
    const near = (el) => beastAvatarParts(el).boxes
      .map((b, i) => [i, boxDistance(b, 0, EYE_LOCAL_Y, 0)])
      .filter(([, d]) => d < SELF_CLEARANCE_M).map(([i]) => i);
    expect(boxDistance(beastAvatarParts('lightning').boxes[1], 0, EYE_LOCAL_Y, 0), 'SETUP: the eye is no longer in the hawk\'s head').toBe(0);
    expect(boxDistance(beastAvatarParts('arcane').boxes[1], 0, EYE_LOCAL_Y, 0), 'SETUP: the eye is no longer in the golem\'s head').toBe(0);
    expect(near('lightning')).toContain(1);
    expect(near('arcane')).toEqual([0, 1]); // the torso a hand's width under the eye, and the head around it
    expect(SELF_CLEARANCE_M, 'the clearance must cover the near plane, or a clipped part still draws').toBeGreaterThan(0.1);
    expect(SELF_CLEARANCE_M, 'the clearance would hide the beast the player sees beside them').toBeLessThan(0.4);
  });
});

let r = null;
afterEach(async () => {
  if (r) await r.unmount();
  r = null;
  useGameStore.setState({ beastFormActive: false, activeBeastForm: null });
});

/**
 * Draw the scene from `cam` as three's renderer does: world matrices brought up to date, then each object that will be
 * drawn handed to its onBeforeRender with the camera that draws it. Nothing is rasterised (the renderer is a stub).
 */
function draw(scene, cam) {
  scene.updateMatrixWorld(true);
  cam.updateMatrixWorld(true);
  const visit = (o) => {
    if (!o.visible) return;
    if (o.isMesh) o.onBeforeRender(null, scene, cam, o.geometry, o.material, null);
    for (const c of o.children) visit(c);
  };
  visit(scene);
}

/** Every mesh of the avatar, and the distance from `cam` to each, from three's own geometry and world matrices, as the
 *  frame drawn from `cam` leaves them. */
function partReadings(scene, cam) {
  draw(scene, cam);
  const eye = cam.getWorldPosition(new THREE.Vector3());
  const out = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    let shown = true;
    for (let p = o; p; p = p.parent) if (!p.visible) shown = false;
    const drawn = shown && o.material.colorWrite !== false;
    const s = o.matrixWorld.getMaxScaleOnAxis();
    let d;
    if (o.geometry.type === 'BoxGeometry') {
      const local = eye.clone().applyMatrix4(o.matrixWorld.clone().invert());
      const g = o.geometry.parameters;
      d = new THREE.Vector3(Math.max(Math.abs(local.x) - g.width / 2, 0), Math.max(Math.abs(local.y) - g.height / 2, 0),
        Math.max(Math.abs(local.z) - g.depth / 2, 0)).length() * s;
    } else {
      d = Math.max(eye.distanceTo(o.getWorldPosition(new THREE.Vector3())) - o.geometry.parameters.radius * s, 0);
    }
    out.push({ type: o.geometry.type, drawn, d, caster: o.castShadow, mesh: o });
  });
  return out;
}

/** Mount the avatar in a form, at full scale after its entrance, the body at the origin. */
async function mountForm(el) {
  useGameStore.setState({ beastFormActive: true, activeBeastForm: el });
  r = await mountR3F(<BeastAvatar />);
  const cam = r.three().camera;
  cam.rotation.set(0, 0.7, 0, 'YXZ');
  cam.position.set(0, EYE_HEIGHT_M, 0);
  cam.updateMatrixWorld(true);
  await r.step(90); // past the entrance pop and the burst, so the group is at full scale
  return cam;
}

const at = async (cam, p) => { cam.position.set(...p); cam.updateMatrixWorld(true); await r.step(1); };

describe('BeastAvatar in first person and in the reveal (mounted through R3F, the body at the origin)', () => {
  it.each(BEAST_AVATAR_ELEMENTS)('%s: at the eye, through its bob and a kick, nothing of the beast draws but its shadow', async (el) => {
    const cam = await mountForm(el);
    const boxes = beastAvatarParts(el).boxes.length;
    const bob = Array.from({ length: 9 }, (_, i) => -EYE_BOB_M + (i * 2 * EYE_BOB_M) / 8);
    const poses = [...bob.map((b) => [0, EYE_HEIGHT_M + b, 0]), [0.25, EYE_HEIGHT_M + 0.1, -0.3]];
    for (const p of poses) {
      await at(cam, p);
      const parts = partReadings(r.three().scene, cam);
      expect(parts.length, `SETUP: ${el}: the boxes, the core, its hot spot, the halo and the burst`).toBe(boxes + 4);
      const drawn = parts.filter((x) => x.drawn);
      expect(drawn.map((x) => `${x.type} ${x.d.toFixed(2)} m`), `${el} at [${p.map((v) => v.toFixed(2))}]: drawn in first person`).toEqual([]);
      const casters = parts.filter((x) => x.caster && x.mesh.visible && x.mesh.material.visible);
      expect(casters.length, `${el}: a hidden box lost its shadow`).toBe(boxes);
    }
  });

  it.each(BEAST_AVATAR_ELEMENTS)('%s: along the reveal every drawn part is clear of the camera, and at its hold the beast draws', async (el) => {
    const cam = await mountForm(el);
    const fwd = [Math.sin(0.7), 0, Math.cos(0.7)];
    let checked = 0;
    let away = 0;
    for (let k = 1; k < 20; k++) {
      const pose = transformCamPose([0, 0, 0], fwd, k / 20);
      await at(cam, pose.position);
      const parts = partReadings(r.three().scene, cam);
      for (const x of parts) {
        if (!x.drawn) continue;
        checked += 1;
        expect(x.d, `${el} at reveal ${k / 20}: a drawn ${x.type} is ${x.d.toFixed(3)} m from the camera`).toBeGreaterThanOrEqual(SELF_CLEARANCE_M);
      }
      if (parts.some((x) => x.drawn)) away += 1;
    }
    expect(away, `SETUP: ${el}: the reveal never showed the beast`).toBeGreaterThan(8);
    expect(checked, `SETUP: ${el}: no drawn part was checked`).toBeGreaterThan(0);
    await at(cam, transformCamPose([0, 0, 0], fwd, 0.5).position);
    const hold = partReadings(r.three().scene, cam).filter((x) => x.drawn);
    const boxes = beastAvatarParts(el).boxes.length;
    expect(hold.filter((x) => x.type === 'BoxGeometry').length, `${el}: the reveal hides a box of the beast`).toBe(boxes);
    expect(hold.filter((x) => x.type === 'SphereGeometry').length, `${el}: the reveal hides the core, its hot spot or the halo`).toBe(3);
  });

  it('away from the eye, a part the camera stands in is not drawn and the rest are', async () => {
    const cam = await mountForm('fire');
    const wing = beastAvatarParts('fire').boxes[5];
    const group = r.three().scene.getObjectByProperty('type', 'Group');
    // The wing's centre, in world space: the group sits FEET_OFFSET under the body and turns with the camera's yaw.
    await at(cam, [0, EYE_HEIGHT_M, 0]);
    const inWing = new THREE.Vector3(...wing.pos);
    r.three().scene.updateMatrixWorld(true);
    const avatar = boxesGroup(r.three().scene);
    avatar.localToWorld(inWing);
    expect(group, 'SETUP: the avatar group').toBeTruthy();
    expect(Math.hypot(inWing.x, inWing.y - EYE_HEIGHT_M, inWing.z), 'SETUP: the wing must stand outside first person').toBeGreaterThan(FIRST_PERSON_M);
    await at(cam, inWing.toArray());
    const parts = partReadings(r.three().scene, cam).filter((x) => x.type === 'BoxGeometry');
    const near = parts.filter((x) => x.d < SELF_CLEARANCE_M);
    expect(near.length, 'SETUP: the camera is in the wing').toBeGreaterThan(0);
    expect(near.filter((x) => x.drawn).length, 'a box the camera stands in is drawn').toBe(0);
    expect(parts.filter((x) => x.d >= SELF_CLEARANCE_M && !x.drawn).length, 'a box clear of the camera is hidden').toBe(0);
  });
});

describe('the parts hidden from the eye are judged from the camera that draws the frame', () => {
  it('the Player loop moves the camera after the avatar\'s frame (the reveal ending at the eye): that frame already hides the beast', async () => {
    const cam = await mountForm('arcane');
    const fwd = [Math.sin(0.7), 0, Math.cos(0.7)];
    await at(cam, transformCamPose([0, 0, 0], fwd, 0.5).position);
    expect(partReadings(r.three().scene, cam).filter((x) => x.drawn).length, 'SETUP: at the reveal\'s hold the beast draws').toBeGreaterThan(5);
    // The avatar's frame has run; the Player's loop, later in the same frame, puts the camera back at the eye.
    cam.position.set(0, EYE_HEIGHT_M, 0);
    cam.updateMatrixWorld(true);
    const drawn = partReadings(r.three().scene, cam).filter((x) => x.drawn);
    expect(drawn.map((x) => `${x.type} ${x.d.toFixed(2)} m`), 'the frame drawn at the eye shows parts judged from the reveal camera').toEqual([]);
  });
});

describe('the beast\'s core light lights the world and not the player\'s own hands', () => {
  it('the pool light carrying the core is marked off the hands, and an ordinary pooled light is not', async () => {
    useGameStore.setState({ beastFormActive: true, activeBeastForm: 'fire', qualityTier: 'high' });
    r = await mountR3F(<><PointLightPool /><BeastAvatar /><PooledLight position={[3, 0, 0]} color="#ffd700" intensity={1.5} distance={6} /></>);
    const cam = r.three().camera;
    cam.position.set(0, EYE_HEIGHT_M, 0);
    cam.updateMatrixWorld(true);
    await r.step(3);
    const lit = [];
    r.three().scene.traverse((o) => { if (o.isPointLight && o.intensity > 0) lit.push(o); });
    expect(lit.length, 'SETUP: the core and the chest beacon each get a pool light').toBe(2);
    const core = lit.find((L) => L.color.getHexString() === beastAvatarParts('fire').glowColor.slice(1).toLowerCase());
    const beacon = lit.find((L) => L.color.getHexString() === 'ffd700');
    expect(core && beacon, 'SETUP: the two lights by colour').toBeTruthy();
    expect(core.userData.lightsHands, 'the beast core would light the player\'s own hands from inside their body').toBe(false);
    expect(beacon.userData.lightsHands, 'an ordinary pooled light was kept off the hands').toBe(true);
  });
});

/** The avatar's own group: the parent of its boxes. */
function boxesGroup(scene) {
  let g = null;
  scene.traverse((o) => { if (!g && o.isMesh && o.geometry.type === 'BoxGeometry') g = o.parent; });
  return g;
}
