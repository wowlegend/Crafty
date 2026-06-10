import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore';
import { isCaptureMode } from '../devtest/captureMode';

/**
 * PhantomBlockSystem — S2-B2-M1: the VOIDHAND held "phantom block". A pooled VISUAL proxy of the grabbed
 * block that orbits the player as a shield + aim-reference. It is NEVER a voxel edit — grabbing it does NOT
 * touch the terrain worker, so a combat grab never re-meshes (the load-bearing no-re-mesh invariant; the
 * static gate `voidhand-noremesh-gates` keeps this file off every voxel/worker seam).
 *
 * M1 = a single held phantom (a 1×1×1 cube) orbiting via a kinematic RENDER write (group.position each
 * frame — NOT a Rapier constraint solve, so ~zero physics cost). The hurl/slam impulse-proxy + the cap-4
 * pool (eviction safety) are later milestones; the final rim/glow LOOK is M7. The MESH self-gates on
 * `voidhandHeld` (absent from every capture baseline). Capture FREEZES the orbit phase -> byte-stable frame.
 *
 * M2 LIGHT-POOL (the #68 carry-forward): the pointLight is ALWAYS mounted, `intensity`-gated on held —
 * a grab/drop must never change the scene's light COUNT, because a light-count change re-links every
 * shader program = a one-frame hitch at the grab EDGE. Intensity 0 emits nothing (baselines unchanged).
 */
const ORBIT_R = 2.2;       // orbit radius (outside the FPV nose-cam frustum so it never clips)
const ORBIT_Y = 0.2;       // height offset relative to the player origin
const ORBIT_SEC = 3;       // one revolution per 3s
const CAPTURE_PHASE = 0.7; // a flattering frozen side-on angle for the deterministic capture frame
const LIGHT_INTENSITY = 1.4;

/** M3: transient world-position of the orbiting phantom (the SLAM aim point — the Components
 *  apply-site reads it on a 'slam' SM action). Module-level mutable (GLI; never React state).
 *  Stale when !held — consumers only read it on slam, which can only fire while HELD. */
export const phantomWorldPos = { x: 0, y: 0, z: 0 };
const _wp = new THREE.Vector3();

export function PhantomBlockSystem() {
  const held = useGameStore((s) => s.voidhandHeld);
  const phantom = useGameStore((s) => s.heldPhantom);
  const groupRef = useRef();
  const spinRef = useRef();

  useFrame((state) => {
    if (!held || !groupRef.current) return;
    const capture = isCaptureMode();
    const theta = capture ? CAPTURE_PHASE : (state.clock.elapsedTime / ORBIT_SEC) * Math.PI * 2;
    groupRef.current.position.set(Math.cos(theta) * ORBIT_R, ORBIT_Y, Math.sin(theta) * ORBIT_R);
    if (spinRef.current) spinRef.current.rotation.set(theta * 0.6, theta, 0); // the block tumbles as it orbits
    groupRef.current.getWorldPosition(_wp);
    phantomWorldPos.x = _wp.x; phantomWorldPos.y = _wp.y; phantomWorldPos.z = _wp.z;
  });

  const active = held && phantom;
  const color = (phantom && phantom.color) || '#A9966E';

  return (
    <group ref={groupRef}>
      {active && (
        <mesh ref={spinRef} castShadow>
          {/* the grabbed block (tint = the looked-at block when known). M7: a faint EMISSIVE lift
              from the block's own tint so the "WHAT am I holding" identity survives night siege
              lighting — far below bloom threshold (the rim stays the only glow; design lock §2). */}
          <boxGeometry args={[0.85, 0.85, 0.85]} />
          <meshStandardMaterial color={color} roughness={0.7} metalness={0.05}
            emissive={color} emissiveIntensity={0.22} />
          {/* the kinetic rim — a faint violet additive shell (the grade-resistant element/identity layer) */}
          <mesh scale={1.12}>
            <boxGeometry args={[0.85, 0.85, 0.85]} />
            <meshBasicMaterial color="#B36BFF" toneMapped={false} transparent opacity={0.28}
              blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.BackSide} />
          </mesh>
        </mesh>
      )}
      {/* LIGHT POOL: always mounted; intensity-gated (NEVER conditionally mounted — see header) */}
      <pointLight color="#B36BFF" intensity={active ? LIGHT_INTENSITY : 0} distance={4} decay={2} />
    </group>
  );
}
