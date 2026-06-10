import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { readSnareState, consumeBindCeremony } from '../game/snareChannel';
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

const CEREMONY_SEC = 0.35; // the bind ring's life (the impact-flash envelope recipe)

export function SnareTetherSystem() {
  const meshRef = useRef();
  const ringRef = useRef();
  const ceremonyRef = useRef({ t: 0 });

  useFrame((_, delta) => {
    // the BIND CEREMONY ring — a one-shot expanding jade halo where a creature joins you
    // (fired on bind + fusion; the Aspect's emotional beat made visible). Transient-only.
    const ring = ringRef.current;
    if (ring) {
      const c = consumeBindCeremony();
      if (c && !isCaptureMode()) {
        ceremonyRef.current.t = CEREMONY_SEC;
        ring.position.set(c.x, c.y + 0.1, c.z);
      }
      const ct = ceremonyRef.current;
      if (ct.t > 0) {
        ct.t -= delta;
        const k = Math.max(ct.t, 0) / CEREMONY_SEC; // 1 -> 0
        ring.visible = ct.t > 0;
        const sc = 0.5 + 1.7 * (1 - k); // expands 0.5 -> 2.2
        ring.scale.set(sc, sc, sc);
        ring.material.opacity = 0.8 * k;
      } else if (ring.visible) {
        ring.visible = false;
      }
    }

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
    <group>
      <mesh ref={meshRef} visible={false}>
        {/* unit-height cylinder: scale.y = the live tether length */}
        <cylinderGeometry args={[0.045, 0.045, 1, 6, 1, true]} />
        <meshBasicMaterial color="#3DFFB0" toneMapped={false} transparent opacity={0}
          blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {/* the bind-ceremony halo (flat ring, lies on the ground plane) */}
      <mesh ref={ringRef} visible={false} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.55, 0.8, 24]} />
        <meshBasicMaterial color="#3DFFB0" toneMapped={false} transparent opacity={0}
          blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
