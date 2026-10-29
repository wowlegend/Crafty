// Mounts its children (the first-person hands) into the viewmodel scene (render/viewmodel.js), which the composer draws
// right after the world through ViewmodelPass (GameScene.jsx PostFX). Each frame it keeps the viewmodel camera's aspect
// on the main camera's and mirrors the world's light onto the hand rig: transient reads (skyFrameRef, the frame state),
// so nothing here re-renders React per frame.
import { useMemo } from 'react';
import { createPortal, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getViewmodel, mirrorSkyLight } from './viewmodel.js';
import { skyFrameRef } from './mood.js';

export function ViewmodelLayer({ children }) {
  const vm = getViewmodel();
  const q = useMemo(() => new THREE.Quaternion(), []);
  useFrame((state) => {
    const cam = state.camera;
    if (cam.aspect && vm.camera.aspect !== cam.aspect) {
      vm.camera.aspect = cam.aspect;
      vm.camera.updateProjectionMatrix();
    }
    cam.getWorldQuaternion(q);
    mirrorSkyLight(skyFrameRef.current, q, vm.rig);
  });
  return createPortal(children, vm.hands);
}
