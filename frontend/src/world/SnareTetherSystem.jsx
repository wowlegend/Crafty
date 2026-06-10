import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { readSnareState } from '../game/snareChannel';
import { isCaptureMode } from '../devtest/captureMode';

/**
 * SnareTetherSystem — S2-B3-M4: the soul-ribbon tether drawn while the SNARE channel holds.
 * ONE always-mounted stretched cylinder driven transiently from the snareChannel module
 * (the impact-flash recipe: visible/position/scale/opacity in useFrame, zero setState,
 * zero light-count change). The channel VISIBLY tightens: opacity + a slight thinning
 * track progress. Capture-inert: snare intents never fire in capture AND the mesh
 * hard-hides under isCaptureMode(). NO voxel/worker seams (noremesh-gated).
 */
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();

export function SnareTetherSystem() {
  const meshRef = useRef();

  useFrame(() => {
    const m = meshRef.current;
    if (!m) return;
    const s = readSnareState();
    if (!s.channeling || isCaptureMode()) {
      if (m.visible) m.visible = false;
      return;
    }
    _from.set(s.from.x, s.from.y, s.from.z);
    _to.set(s.to.x, s.to.y, s.to.z);
    const len = _from.distanceTo(_to);
    if (len < 0.05) { m.visible = false; return; }
    _mid.addVectors(_from, _to).multiplyScalar(0.5);
    _dir.subVectors(_to, _from).normalize();
    _quat.setFromUnitVectors(_up, _dir);
    m.visible = true;
    m.position.copy(_mid);
    m.quaternion.copy(_quat);
    // the ribbon TIGHTENS as the bind closes: brighter + slightly thinner
    const r = 0.045 - 0.02 * s.progress;
    m.scale.set(r / 0.045, len, r / 0.045);
    m.material.opacity = 0.25 + 0.55 * s.progress;
  });

  return (
    <mesh ref={meshRef} visible={false}>
      {/* unit-height cylinder: scale.y = the live tether length */}
      <cylinderGeometry args={[0.045, 0.045, 1, 6, 1, true]} />
      <meshBasicMaterial color="#3DFFB0" toneMapped={false} transparent opacity={0}
        blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}
