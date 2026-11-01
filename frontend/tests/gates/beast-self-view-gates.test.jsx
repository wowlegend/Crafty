// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';

/**
 * THE PLAYER'S OWN BEAST, SEEN FROM ITS EYE (render/beastAvatarParts.js SELF_CLEARANCE_M, render/BeastAvatar.jsx).
 *
 * With the eye at the body's centre + EYE_HEIGHT_M (DECISIONS 2026-10-28 item 34), first person in beast form puts the
 * eye inside the hawk's and the golem's heads and a third of a metre from the dragon's wings, and the halo washes the
 * lower view (lookbook frames, docs/superpowers/masterpiece-2026-10/evidence/w2e-follow/). In first person the avatar
 * draws nothing but its shadow (DECISIONS 2026-10-29 item 80). First person is the follow holding the view
 * (render/followView.js, which the Player's loop sets: tests/gates/player-view-hold-gates.test.jsx), or a camera within
 * FIRST_PERSON_M of the steady eye in world space when another branch placed it (the reveal's ends, an eye pose). This
 * checks the box distance against three's own transforms and, mounted through R3F (tests/gates/_r3f.jsx), per form:
 * through the eye's bob, a kick, a crit's shake and a stack of hits nothing draws or writes depth and every box still
 * casts; on the form's first frames (its entrance at half scale, the burst lit) nothing draws in first person, the
 * burst included; along the roar's reveal every drawn part, glow spheres included, is at least the clearance from the
 * camera, read from three's own geometry and world matrices, and at the reveal's hold the whole beast draws and its boxes
 * write depth; away from the eye, a part the camera stands in hides while the rest draw.
 * BLIND SPOT: nothing is drawn here; what the player sees is the lookbook's self set.
 */
vi.mock('@react-three/fiber', () => import('@react-three/fiber/dist/react-three-fiber.esm.js'));
const { mountR3F } = await import('./_r3f.jsx');
const { beastAvatarParts, boxDistance, SELF_CLEARANCE_M, FIRST_PERSON_M, BEAST_AVATAR_ELEMENTS, formLift } = await import('../../src/render/beastAvatarParts.js');
const { BeastAvatar, FEET_OFFSET } = await import('../../src/render/BeastAvatar.jsx');
const { EYE_HEIGHT_M, EYE_BOB_M } = await import('../../src/combat/swingOrigin.js');
const { transformCamPose } = await import('../../src/game/transformCam.js');
const { PointLightPool, PooledLight } = await import('../../src/render/lightPool.jsx');
const { useGameStore } = await import('../../src/store/useGameStore');
const { markFollowView } = await import('../../src/render/followView.js');
const { shakeOffset, traumaFromWeight, SHAKE_WEIGHT_MAX } = await import('../../src/game/trauma.js');
const { KICK_PROFILES } = await import('../../src/game/cameraKick.js');
const { BURST_SEC } = await import('../../src/game/beastMorph.js');

/** The first-person eye in a form's parts frame: the avatar's group sits FEET_OFFSET under the body's centre, and the
 *  form's parts stand formLift(el) up inside it (on the floor its capsule rests on). */
const eyeLocalY = (el) => EYE_HEIGHT_M - FEET_OFFSET - formLift(el);

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
        for (const p of [[0, eyeLocalY(el), 0], [0.3, 1.2, -0.4], [-0.7, 0.5, 0.9], [...box.pos]]) {
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
    // Each form at its own eye: its parts stand on the floor its capsule rests on (formLift), so the eye sits higher in
    // the bull, the hawk and the golem than in the dragon.
    const near = (el) => beastAvatarParts(el).boxes
      .map((b, i) => [i, boxDistance(b, 0, eyeLocalY(el), 0)])
      .filter(([, d]) => d < SELF_CLEARANCE_M).map(([i]) => i);
    expect(boxDistance(beastAvatarParts('lightning').boxes[1], 0, eyeLocalY('lightning'), 0), 'SETUP: the eye is no longer by the hawk\'s head').toBeLessThan(SELF_CLEARANCE_M);
    expect(boxDistance(beastAvatarParts('arcane').boxes[1], 0, eyeLocalY('arcane'), 0), 'SETUP: the eye is no longer by the golem\'s head').toBeLessThan(0.05);
    expect(near('lightning')).toEqual([1]);
    expect(near('arcane')).toEqual([1]); // the head a few centimetres from the eye; the torso is now out of reach
    expect(near('fire')).toEqual([0, 1]); // the dragon's chest and neck
    expect(near('ice'), 'the bull stands its head clear of the eye').toEqual([]);
    expect(SELF_CLEARANCE_M, 'the clearance must cover the near plane, or a clipped part still draws').toBeGreaterThan(0.1);
    expect(SELF_CLEARANCE_M, 'the clearance would hide the beast the player sees beside them').toBeLessThan(0.4);
  });
});

let r = null;
afterEach(async () => {
  if (r) await r.unmount();
  r = null;
  markFollowView(false);
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

/** Mount the avatar in a form, the body at the origin: by default at full scale after its entrance, else on its first
 *  frame (`settle: false`), at half scale with the burst lit. */
async function mountForm(el, { settle = true } = {}) {
  useGameStore.setState({ beastFormActive: true, activeBeastForm: el });
  r = await mountR3F(<BeastAvatar />);
  const cam = r.three().camera;
  cam.rotation.set(0, 0.7, 0, 'YXZ');
  cam.position.set(0, EYE_HEIGHT_M, 0);
  cam.updateMatrixWorld(true);
  await r.step(settle ? 90 : 1); // 90: past the entrance pop and the burst, so the group is at full scale
  return cam;
}

/** The follow's shake at `trauma` (Components.jsx: game/trauma.js shakeOffset at the juice dial's full intensity, biased
 *  along a hit from +x), at the seed of 2000 whose offset sits at quantile `q` of their lengths, the first frame of the
 *  follow's 0.85 lerp from the eye: the camera's offset from the steady eye. */
function shakePose(trauma, q) {
  const all = Array.from({ length: 2000 }, (_, i) => shakeOffset(trauma, i * 0.37, 1, 0, 0.55 * SHAKE_WEIGHT_MAX * SHAKE_WEIGHT_MAX))
    .sort((a, b) => Math.hypot(a.x, a.y, a.z) - Math.hypot(b.x, b.y, b.z));
  const o = all[Math.min(all.length - 1, Math.floor(q * all.length))];
  return [0.85 * o.x, 0.85 * o.y, 0.85 * o.z];
}
const CRIT = traumaFromWeight(1.6); // CombatSystem.jsx: a crit shakes at weight 1.6

const at = async (cam, p) => { cam.position.set(...p); cam.updateMatrixWorld(true); await r.step(1); };

describe('BeastAvatar in first person and in the reveal (mounted through R3F, the body at the origin)', () => {
  it.each(BEAST_AVATAR_ELEMENTS)('%s: in the follow, through its bob, a kick, a crit\'s shake and a stack of hits, nothing of the beast draws but its shadow', async (el) => {
    const cam = await mountForm(el);
    const boxes = beastAvatarParts(el).boxes.length;
    const bob = Array.from({ length: 9 }, (_, i) => -EYE_BOB_M + (i * 2 * EYE_BOB_M) / 8);
    const hurt = KICK_PROFILES.hurt;
    const shaken = [shakePose(CRIT, 0.5), shakePose(CRIT, 0.999), shakePose(1, 0.999).map((v, i) => v + hurt[i])];
    for (const o of shaken) {
      expect(Math.hypot(...o), 'SETUP: a shaken pose must stand outside FIRST_PERSON_M, or the camera\'s distance alone would hide the beast').toBeGreaterThan(FIRST_PERSON_M);
    }
    const poses = [...bob.map((b) => [0, EYE_HEIGHT_M + b, 0]), [0.25, EYE_HEIGHT_M + 0.1, -0.3], ...shaken.map((o) => [o[0], EYE_HEIGHT_M + o[1], o[2]])];
    let checked = 0;
    for (const p of poses) {
      markFollowView(true); // what the Player's follow branch marks on every frame it places the camera
      await at(cam, p);
      const parts = partReadings(r.three().scene, cam);
      expect(parts.length, `SETUP: ${el}: the boxes, the core, its hot spot, the halo and the burst`).toBe(boxes + 4);
      const drawn = parts.filter((x) => x.drawn);
      expect(drawn.map((x) => `${x.type} ${x.d.toFixed(2)} m`), `${el} at [${p.map((v) => v.toFixed(2))}]: drawn in first person`).toEqual([]);
      expect(parts.filter((x) => x.mesh.material.depthWrite).length, `${el} at [${p.map((v) => v.toFixed(2))}]: a hidden part writes depth`).toBe(0);
      const casters = parts.filter((x) => x.caster && x.mesh.visible && x.mesh.material.visible);
      expect(casters.length, `${el}: a hidden box lost its shadow`).toBe(boxes);
      checked += 1;
    }
    expect(checked).toBe(13);
  });

  it.each(BEAST_AVATAR_ELEMENTS)('%s: on the form\'s first frame (half scale, the burst lit) nothing draws in first person, in the follow or at the reveal\'s start', async (el) => {
    const cam = await mountForm(el, { settle: false });
    const fwd = [Math.sin(0.7), 0, Math.cos(0.7)];
    // The follow at the eye, and the reveal's first frames: the camera still within FIRST_PERSON_M of the eye, placed by
    // the reveal, so the follow mark is clear.
    const views = [{ follow: true, p: [0, EYE_HEIGHT_M, 0] }, { follow: false, p: transformCamPose([0, 0, 0], fwd, 0.02).position },
      { follow: false, p: transformCamPose([0, 0, 0], fwd, 0.05).position }];
    let checked = 0;
    for (const v of views) {
      markFollowView(v.follow);
      await at(cam, v.p);
      const group = boxesGroup(r.three().scene);
      expect(group.scale.x, `SETUP: ${el}: the form is past its entrance's first frames`).toBeLessThan(0.7);
      const burst = r.three().scene.getObjectsByProperty('type', 'Mesh').find((m) => m.renderOrder === 4);
      expect(burst?.visible, `SETUP: ${el}: the burst is not lit`).toBe(true);
      const eyeOff = Math.hypot(v.p[0], v.p[1] - EYE_HEIGHT_M, v.p[2]);
      expect(eyeOff, 'SETUP: the camera must be within first person of the eye').toBeLessThanOrEqual(FIRST_PERSON_M);
      const drawn = partReadings(r.three().scene, cam).filter((x) => x.drawn);
      expect(drawn.map((x) => `${x.type} r${x.mesh.renderOrder} ${x.d.toFixed(2)} m`),
        `${el} ${v.follow ? 'in the follow' : `in the reveal ${eyeOff.toFixed(2)} m off the eye`} at scale ${group.scale.x.toFixed(2)}: drawn in first person`).toEqual([]);
      checked += 1;
    }
    expect(checked).toBe(3);
    await r.step(Math.ceil(BURST_SEC * 60) + 1);
    expect(r.three().scene.getObjectsByProperty('type', 'Mesh').find((m) => m.renderOrder === 4).visible, 'SETUP: the burst outlived its window').toBe(false);
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
    expect(hold.filter((x) => x.type === 'BoxGeometry' && !x.mesh.material.depthWrite).length,
      `${el}: at the reveal's hold a drawn box writes no depth, so the beast sorts through itself`).toBe(0);
    expect(hold.filter((x) => x.type === 'SphereGeometry' && x.mesh.material.depthWrite).length, `${el}: a glow sphere writes depth`).toBe(0);
  });

  it('away from the eye, a part the camera stands in is not drawn and the rest are', async () => {
    const cam = await mountForm('fire');
    const wing = beastAvatarParts('fire').boxes[5];
    const group = r.three().scene.getObjectByProperty('type', 'Group');
    // The wing's centre, in world space: the parts stand formLift up in the group that sits FEET_OFFSET under the body
    // and turns with the camera's yaw.
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

  it('on the form\'s first frame, at half scale, the clearance is in metres: a camera 0.2 m off the tail hides it and draws the rest', async () => {
    const cam = await mountForm('fire', { settle: false });
    const avatar = boxesGroup(r.three().scene);
    const tailMesh = avatar.children.filter((o) => o.isMesh && o.geometry.type === 'BoxGeometry')[12]; // the tail's tip
    r.three().scene.updateMatrixWorld(true);
    const s = avatar.matrixWorld.getMaxScaleOnAxis();
    expect(s, 'SETUP: the form is past its entrance\'s first frame').toBeLessThan(0.6);
    // 0.2 m in world space over the tail's top face: its local units are scaled by the entrance.
    const p = tailMesh.localToWorld(new THREE.Vector3(0, tailMesh.geometry.parameters.height / 2 + 0.2 / s, 0));
    expect(Math.hypot(p.x, p.y - EYE_HEIGHT_M, p.z), 'SETUP: the camera must stand outside first person').toBeGreaterThan(FIRST_PERSON_M);
    cam.position.copy(p); // placed without a frame step, so the entrance's scale stays where p was measured
    const parts = partReadings(r.three().scene, cam).filter((x) => x.type === 'BoxGeometry');
    const tail = parts.find((x) => x.mesh === tailMesh);
    expect(tail.d, 'SETUP: the camera is not 0.2 m off the tail').toBeCloseTo(0.2, 2);
    expect(tail.drawn, 'a tail 0.2 m from the camera draws: the clearance was judged in the half-scale avatar\'s units').toBe(false);
    expect(parts.filter((x) => x.d >= SELF_CLEARANCE_M && !x.drawn).length, 'a box clear of the camera is hidden').toBe(0);
    expect(parts.filter((x) => x.drawn).length, 'SETUP: nothing else of the beast draws').toBeGreaterThan(5);
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

  it('the follow takes the view back with a crit\'s shake on it: that frame hides the beast, and a pinned camera at the same place shows it', async () => {
    const cam = await mountForm('fire');
    const fwd = [Math.sin(0.7), 0, Math.cos(0.7)];
    const o = shakePose(CRIT, 0.5);
    await at(cam, transformCamPose([0, 0, 0], fwd, 0.5).position);
    // The Player's loop, after the avatar's frame: the reveal's window ends and the follow places the shaken camera.
    markFollowView(true);
    cam.position.set(o[0], EYE_HEIGHT_M + o[1], o[2]);
    cam.updateMatrixWorld(true);
    expect(partReadings(r.three().scene, cam).filter((x) => x.drawn).length, 'the follow\'s first shaken frame shows the beast').toBe(0);
    // A pinned camera (capture, a hero pose) at the same place: the mark is clear, and the beast is outside first person.
    markFollowView(false);
    expect(partReadings(r.three().scene, cam).filter((x) => x.drawn).length, 'SETUP: off the follow, 1.3 m from the eye, the beast must draw').toBeGreaterThan(5);
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
