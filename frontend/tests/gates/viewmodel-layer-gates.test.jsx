// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';

/**
 * THE VIEWMODEL LAYER AND THE WAND, MOUNTED THROUGH R3F (plan docs/superpowers/plans/2026-10-29-crafty-w2e-hands.md).
 *
 * viewmodel-gates drives mirrorSkyLight and handAnchors as functions. This mounts render/ViewmodelLayer.jsx through
 * R3F's own reconciler (tests/gates/_r3f.jsx) and steps its frame, so the wiring itself is read back from the live
 * objects: its children land in the viewmodel's hands group and not in the world scene, the viewmodel camera takes the
 * main camera's aspect, and the hand rig's key and sky are the sky frame's, turned by the main camera's world rotation;
 * the key fades where the physics world blocks a ray from the eye toward the key light (a fake world here, so the ray's
 * origin, direction, reach, filter and cadence are read back), and the storm's flash reaches the hands' sky light.
 * It also mounts the item the right hand holds by default (render/spellVfx.jsx MagicWand): its wood and tip carry the
 * hands' value floor, and the gem is its only unlit part (no translucent aura sphere).
 * BLIND SPOT: nothing is drawn. The pass's place in GameScene's composer is viewmodel-composer-gates, and that the live
 * composer draws it every frame is tests/e2e/viewmodel.spec.js.
 */
vi.mock('@react-three/fiber', () => import('@react-three/fiber/dist/react-three-fiber.esm.js'));
/** The physics world the layer probes: `blocked` decides every ray, and each cast is recorded. */
const physics = vi.hoisted(() => ({ blocked: false, casts: [] }));
vi.mock('@react-three/rapier', () => {
  class Ray { constructor(origin, dir) { this.origin = { ...origin }; this.dir = { ...dir }; } }
  const QueryFilterFlags = { EXCLUDE_FIXED: 1, EXCLUDE_KINEMATIC: 2, EXCLUDE_DYNAMIC: 4, EXCLUDE_SENSORS: 8 };
  const world = {
    castRay(ray, maxToi, solid, flags) {
      physics.casts.push({ origin: { ...ray.origin }, dir: { ...ray.dir }, maxToi, solid, flags });
      return physics.blocked ? { timeOfImpact: 3 } : null;
    },
  };
  return { useRapier: () => ({ rapier: { Ray, QueryFilterFlags }, world }) };
});
const { mountR3F } = await import('./_r3f.jsx');
const { ViewmodelLayer } = await import('../../src/render/ViewmodelLayer.jsx');
const { getViewmodel, handNodeCount, HAND_VALUE_FLOOR, ViewmodelCamera, HAND_SHADE } = await import('../../src/render/viewmodel.js');
const { skyFrameRef, lightningFlashRef } = await import('../../src/render/mood.js');
const { TIERS } = await import('../../src/render/quality.js');
const { CHUNK_SIZE } = await import('../../src/world/chunkLayout.js');
const { MagicWand } = await import('../../src/render/spellVfx.jsx');
const { WAND_CONFIGS } = await import('../../src/game/spellVisualProfiles.js');

let r = null;
afterEach(async () => {
  if (r) await r.unmount();
  r = null;
});

describe('ViewmodelLayer, stepped through R3F', () => {
  it('mounts its children into the viewmodel\'s hands group, not the world scene, and they leave with it', async () => {
    expect(handNodeCount(), 'SETUP: something is mounted in the hands group before the layer').toBe(0);
    r = await mountR3F(<ViewmodelLayer><mesh name="probe-a" /><mesh name="probe-b" /></ViewmodelLayer>);
    expect(handNodeCount()).toBe(2);
    expect(getViewmodel().hands.getObjectByName('probe-a')).toBeTruthy();
    expect(r.three().scene.getObjectByName('probe-a'), 'the hands landed in the world scene').toBeUndefined();
    await r.unmount();
    r = null;
    expect(handNodeCount()).toBe(0);
  });

  it('keeps the viewmodel camera on the main camera\'s aspect, and its projection with it', async () => {
    const vm = getViewmodel();
    vm.camera.aspect = 1;
    vm.camera.updateProjectionMatrix();
    r = await mountR3F(<ViewmodelLayer />, { width: 820, height: 1180 });
    const main = r.three().camera;
    expect(main.aspect, 'SETUP: R3F did not size the main camera to the canvas').toBeCloseTo(820 / 1180, 6);
    await r.step(1);
    expect(vm.camera.aspect).toBeCloseTo(820 / 1180, 6);
    main.aspect = 2.4;
    await r.step(1);
    expect(vm.camera.aspect).toBe(2.4);
    const fresh = new ViewmodelCamera();
    fresh.aspect = 2.4;
    fresh.updateProjectionMatrix();
    expect(vm.camera.projectionMatrix.equals(fresh.projectionMatrix), 'the aspect moved and the projection did not').toBe(true);
  });

  it('lights the hands with the sky frame\'s key and sky, turned by the main camera\'s world rotation', async () => {
    const vm = getViewmodel();
    const f = skyFrameRef.current;
    const saved = [...f.keyDir];
    f.keyDir[0] = 0.6; f.keyDir[1] = 0.8; f.keyDir[2] = 0;
    try {
      r = await mountR3F(<ViewmodelLayer />);
      const cam = r.three().camera;
      cam.rotation.set(-0.4, 1.1, 0, 'YXZ');
      await r.step(1);
      const q = cam.getWorldQuaternion(new THREE.Quaternion());
      const keyInView = vm.rig.key.position.clone().normalize();
      expect(keyInView.distanceTo(new THREE.Vector3(0.6, 0.8, 0)), 'SETUP: this view must move the key, or an unturned key passes')
        .toBeGreaterThan(0.3);
      const keyInWorld = keyInView.clone().applyQuaternion(q);
      expect(keyInWorld.distanceTo(new THREE.Vector3(0.6, 0.8, 0)), 'the key on the hands is not the world key in this view')
        .toBeLessThan(1e-6);
      const skyInWorld = vm.rig.hemi.position.clone().normalize().applyQuaternion(q);
      expect(skyInWorld.y, 'the sky on the hands is not the world\'s up in this view').toBeCloseTo(1, 5);
      expect(vm.rig.key.intensity).toBe(f.keyIntensity);
      expect(vm.rig.ambient.color.equals(f.ambient)).toBe(true);
    } finally {
      f.keyDir[0] = saved[0]; f.keyDir[1] = saved[1]; f.keyDir[2] = saved[2];
    }
  });

  it('fades the key where the world stands between the eye and the key light, and brings it back in the open', async () => {
    const vm = getViewmodel();
    const f = skyFrameRef.current;
    const saved = { dir: [...f.keyDir], intensity: f.keyIntensity };
    f.keyDir[0] = 3; f.keyDir[1] = 4; f.keyDir[2] = 0;
    f.keyIntensity = 1.8;
    try {
      r = await mountR3F(<ViewmodelLayer />);
      const cam = r.three().camera;
      cam.position.set(4, 52, -7);
      cam.updateMatrixWorld(true);
      physics.blocked = true;
      physics.casts.length = 0;
      await r.step(60);
      expect(physics.casts.length, `the probe ran ${physics.casts.length} times in 1 s, not about every ${HAND_SHADE.everyS} s`)
        .toBeGreaterThanOrEqual(9);
      expect(physics.casts.length).toBeLessThanOrEqual(11);
      const last = physics.casts.at(-1);
      expect([last.origin.x, last.origin.y, last.origin.z], 'the probe does not start at the eye').toEqual([4, 52, -7]);
      expect([last.dir.x, last.dir.y, last.dir.z].map((v) => +v.toFixed(9)), 'the probe does not run toward the key').toEqual([0.6, 0.8, 0]);
      expect(last.maxToi).toBe(HAND_SHADE.reachM);
      const corner = (Math.max(...Object.values(TIERS).map((t) => t.renderDistance)) + 0.5) * CHUNK_SIZE * Math.SQRT2;
      expect(last.maxToi, 'the probe stops short of chunk colliders that can stand in the sun\'s way').toBeGreaterThanOrEqual(corner);
      expect(last.flags, 'the probe must test the fixed world only: not the player, a mob or a sensor').toBe(2 | 4 | 8);
      expect(vm.rig.key.intensity, 'in the world\'s shadow the hands still take the full key').toBeLessThan(0.01 * 1.8);
      expect(vm.rig.ambient.intensity, 'SETUP: the rest of the light must still be the sky frame\'s').toBe(f.ambientIntensity);
      physics.blocked = false;
      await r.step(60);
      expect(vm.rig.key.intensity, 'back in the open the key did not return').toBeCloseTo(1.8, 2);
    } finally {
      physics.blocked = false;
      f.keyDir[0] = saved.dir[0]; f.keyDir[1] = saved.dir[1]; f.keyDir[2] = saved.dir[2];
      f.keyIntensity = saved.intensity;
    }
  });

  it('carries the storm\'s lightning onto the hands\' sky light, as the world\'s hemisphere takes it', async () => {
    const vm = getViewmodel();
    const f = skyFrameRef.current;
    try {
      r = await mountR3F(<ViewmodelLayer />);
      lightningFlashRef.current = 0;
      await r.step(1);
      expect(vm.rig.hemi.intensity).toBe(f.hemiIntensity);
      lightningFlashRef.current = 1;
      await r.step(1);
      expect(vm.rig.hemi.intensity, 'a lightning flash lit the world and not the hands').toBeGreaterThan(f.hemiIntensity + 0.5);
    } finally {
      lightningFlashRef.current = 0;
    }
  });
});

describe('the wand the right hand holds by default', () => {
  it('its wood and tip are floored in their own colours; the gem is its one unlit part, and no aura sphere is left', async () => {
    const cfg = WAND_CONFIGS.iceball;
    r = await mountR3F(<MagicWand wandType="iceball" />);
    const meshes = [];
    r.three().scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
    expect(meshes.length, 'SETUP: the wand mounted no mesh').toBeGreaterThan(0);
    const floored = meshes.filter((m) => m.material.userData.valueFloor?.value === HAND_VALUE_FLOOR);
    const hex = (c) => c.getHexString();
    expect(floored.map((m) => hex(m.material.color)).sort(), 'the wood and the tip must carry the hands\' value floor')
      .toEqual([hex(new THREE.Color(cfg.handleColor)), hex(new THREE.Color(cfg.tipColor))].sort());
    const unlit = meshes.filter((m) => !m.material.userData.valueFloor);
    expect(unlit.length, 'a mesh besides the gem: the aura sphere is back, or a part lost its floor').toBe(1);
    expect(unlit[0].material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(unlit[0].material.color.equals(new THREE.Color(cfg.gemColor))).toBe(true);
  });
});
