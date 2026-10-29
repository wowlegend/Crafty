// Mounts its children (the first-person hands) into the viewmodel scene (render/viewmodel.js), which the composer draws
// right after the world through ViewmodelPass (GameScene.jsx PostFX). Each frame it keeps the viewmodel camera's aspect
// on the main camera's and mirrors the world's light onto the hand rig, the key faded where the world's fixed colliders
// stand between the eye and the key light (HAND_SHADE): transient reads (skyFrameRef, lightningFlashRef, the frame
// state), so nothing here re-renders React per frame. It reads the physics world, so it mounts inside <Physics> (the
// Player is its parent).
import { useEffect, useMemo } from 'react';
import { createPortal, useFrame } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import * as THREE from 'three';
import { getViewmodel, mirrorSkyLight, easeKeyVisibility, HAND_SHADE } from './viewmodel.js';
import { skyFrameRef, lightningFlashRef } from './mood.js';
import { registerTestHook } from '../devtest/testBridge.js';

export function ViewmodelLayer({ children }) {
  const vm = getViewmodel();
  const { rapier, world } = useRapier();
  const q = useMemo(() => new THREE.Quaternion(), []);
  const shade = useMemo(() => ({ visibility: 1, open: true, sinceProbe: Infinity, ray: null, eye: new THREE.Vector3() }), []);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // DEV-only (the bridge is tree-shaken in prod): tests/e2e/viewmodel.spec.js reads the live viewmodel in the page.
    registerTestHook('viewmodel', getViewmodel);
  }, []);
  useFrame((state, delta) => {
    const cam = state.camera;
    if (cam.aspect && vm.camera.aspect !== cam.aspect) {
      vm.camera.aspect = cam.aspect;
      vm.camera.updateProjectionMatrix();
    }
    cam.getWorldQuaternion(q);
    const f = skyFrameRef.current;
    shade.sinceProbe += delta;
    if (shade.sinceProbe >= HAND_SHADE.everyS && world && rapier) {
      shade.sinceProbe = 0;
      const d = f.keyDir;
      const len = Math.hypot(d[0], d[1], d[2]) || 1;
      cam.getWorldPosition(shade.eye);
      const ray = (shade.ray ||= new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }));
      ray.origin.x = shade.eye.x; ray.origin.y = shade.eye.y; ray.origin.z = shade.eye.z;
      ray.dir.x = d[0] / len; ray.dir.y = d[1] / len; ray.dir.z = d[2] / len;
      const fixedOnly = rapier.QueryFilterFlags.EXCLUDE_DYNAMIC | rapier.QueryFilterFlags.EXCLUDE_KINEMATIC
        | rapier.QueryFilterFlags.EXCLUDE_SENSORS;
      shade.open = !world.castRay(ray, HAND_SHADE.reachM, true, fixedOnly);
    }
    shade.visibility = easeKeyVisibility(shade.visibility, shade.open, delta);
    mirrorSkyLight(f, q, vm.rig, shade.visibility, lightningFlashRef.current);
  });
  return createPortal(children, vm.hands);
}
