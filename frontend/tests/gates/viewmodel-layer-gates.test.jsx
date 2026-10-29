// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';

/**
 * THE VIEWMODEL LAYER AND THE WAND, MOUNTED THROUGH R3F (plan docs/superpowers/plans/2026-10-29-crafty-w2e-hands.md).
 *
 * viewmodel-gates drives mirrorSkyLight and handAnchors as functions. This mounts render/ViewmodelLayer.jsx through
 * R3F's own reconciler (tests/gates/_r3f.jsx) and steps its frame, so the wiring itself is read back from the live
 * objects: its children land in the viewmodel's hands group and not in the world scene, the viewmodel camera takes the
 * main camera's aspect, and the hand rig's key and sky are the sky frame's, turned by the main camera's world rotation.
 * It also mounts the item the right hand holds by default (render/spellVfx.jsx MagicWand): its wood and tip carry the
 * hands' value floor, and the gem is its only unlit part (the translucent aura sphere the task script's goal named is
 * gone).
 * BLIND SPOT: nothing is drawn. The pass's place in GameScene's composer is viewmodel-composer-gates, and that the live
 * composer draws it every frame is tests/e2e/viewmodel.spec.js.
 */
vi.mock('@react-three/fiber', () => import('@react-three/fiber/dist/react-three-fiber.esm.js'));
const { mountR3F } = await import('./_r3f.jsx');
const { ViewmodelLayer } = await import('../../src/render/ViewmodelLayer.jsx');
const { getViewmodel, handNodeCount, HAND_VALUE_FLOOR, ViewmodelCamera } = await import('../../src/render/viewmodel.js');
const { skyFrameRef } = await import('../../src/render/mood.js');
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
