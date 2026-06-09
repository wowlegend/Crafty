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
 * pool (eviction safety) are later milestones; the final rim/glow LOOK is M7. Self-gates on `voidhandHeld`
 * (renders NOTHING otherwise -> absent from every capture baseline). Capture FREEZES the orbit phase ->
 * byte-stable frame. Mounted as a RigidBody child (at the player). Transient clock ref (Game-Loop-Isolation).
 */
const ORBIT_R = 2.2;       // orbit radius (outside the FPV nose-cam frustum so it never clips)
const ORBIT_Y = 0.2;       // height offset relative to the player origin
const ORBIT_SEC = 3;       // one revolution per 3s
const CAPTURE_PHASE = 0.7; // a flattering frozen side-on angle for the deterministic capture frame

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
  });

  if (!held || !phantom) return null;
  const color = phantom.color || '#A9966E';

  return (
    <group ref={groupRef}>
      <mesh ref={spinRef} castShadow>
        {/* the grabbed block (M1 placeholder color; M3 reads the looked-at block, M7 polishes the look) */}
        <boxGeometry args={[0.85, 0.85, 0.85]} />
        <meshStandardMaterial color={color} roughness={0.7} metalness={0.05} />
        {/* the kinetic rim — a faint violet additive shell (the grade-resistant element/identity layer) */}
        <mesh scale={1.12}>
          <boxGeometry args={[0.85, 0.85, 0.85]} />
          <meshBasicMaterial color="#B36BFF" toneMapped={false} transparent opacity={0.28}
            blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.BackSide} />
        </mesh>
      </mesh>
      <pointLight color="#B36BFF" intensity={1.4} distance={4} decay={2} />
    </group>
  );
}
