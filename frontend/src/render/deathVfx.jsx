// deathVfx.jsx -- the transient mob-DEATH flourish: a t=0 hot-flash billboard + a fading ground-ring
// decal in the mob's (hue-preserved) body colour. Mirrors the LootPopRender pattern (pickupVfx.jsx):
// a pooled transient driven off performance.now(), capture-frozen to a fixed mid-life pose so a
// deterministically-triggered death renders byte-stable (no kills occur under capture, so the visual
// gate never sees a real one; the freeze locks the extraction). Self-completes via onComplete.
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { isCaptureMode } from '../devtest/captureMode';

const DEATH_FX_MS = 420; // ground decal + flash lifetime

// position: [x, y, z] ground anchor; flashY: world Y of the burst centre; color: mob body hue (tint-floored).
export const DeathFxRender = ({ position, flashY, color, id, onComplete }) => {
  const ringRef = useRef();
  const flashRef = useRef();
  const startTime = useRef(null);

  useFrame(() => {
    // Capture-determinism: hold a FIXED mid-life pose (flash past its peak but still present, decal
    // well-expanded) and never self-complete, so a fixture-triggered death is byte-stable run-to-run.
    let t;
    if (isCaptureMode()) {
      t = 0.22;
    } else {
      if (startTime.current === null) startTime.current = performance.now();
      t = Math.min(1, (performance.now() - startTime.current) / DEATH_FX_MS);
    }
    const eased = 1 - (1 - t) * (1 - t); // ease-out

    if (ringRef.current) {
      // expanding additive ground ring that fades over the lifetime
      const scale = 0.4 + eased * 2.6;
      ringRef.current.scale.set(scale, scale, scale);
      ringRef.current.material.opacity = 0.8 * (1 - t);
    }
    if (flashRef.current) {
      // t=0 hot flash: peaks at the start, gone by ~28% of life -- a quick PUNCH that sells the kill
      // moment, not a lingering blob. Expands slightly as it fades so it reads as a release.
      const fp = Math.max(0, 1 - t / 0.28);
      const s = 0.5 + (1 - fp) * 0.7;
      flashRef.current.scale.set(s, s, s);
      flashRef.current.material.opacity = fp;
    }

    if (!isCaptureMode() && t >= 1) onComplete(id);
  });

  return (
    <group>
      {/* fading ground-ring decal on the XZ plane, in the mob's (hue-preserved) colour */}
      <mesh ref={ringRef} position={[position[0], position[1] + 0.06, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.45, 0.7, 28]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      {/* t=0 hot-flash billboard at the burst centre, in the mob's colour (bloom blows it to a halo) */}
      <mesh ref={flashRef} position={[position[0], flashY, position[2]]}>
        <sphereGeometry args={[0.34, 12, 12]} />
        <meshBasicMaterial color={color} transparent opacity={1} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
    </group>
  );
};
