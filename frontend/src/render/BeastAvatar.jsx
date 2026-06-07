import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore';
import { MobToonMaterial } from './MobToonMaterial';
import { beastAvatarParts } from './beastAvatarParts.js';
import { isCaptureMode } from '../devtest/captureMode';

/**
 * BeastAvatar — S2-B1-M7b: the visible voxel beast the transform-cam (M7a) reveals.
 *
 * The locked ③·5 look = "Hades silhouette + Genshin radiance, fused":
 *  - SILHOUETTE: crisp `MobToonMaterial` box body, kept toneMapped (sub-bloom) so the global Bloom
 *    NEVER touches it — it carries the identity (the Hades ink).
 *  - HOT-CORE: a tiny near-white additive `toneMapped={false}` heart + a nested pure-white hotspot that
 *    clips past the bloom threshold -> the global Bloom blows it out into a glowing point (the proven
 *    SpellProjectileCore recipe, `EnhancedMagicSystem.jsx:708-830`).
 *  - AURA: two element-color additive `BackSide` shells (a brighter tight aura + a soft wide back-aura)
 *    that halo BEHIND the silhouette without washing the crisp front (the Genshin radiance).
 *
 * Self-gates on `beastFormActive` (renders NOTHING as human -> FPV gameplay + the 16 capture states are
 * unaffected). Mounted as a RigidBody child, so it sits at the player. Capture-determinism: the idle
 * pulse is FROZEN at a flattering phase under `isCaptureMode()`. The aura opacities are the M7d dial.
 */
const FEET_OFFSET = -0.9; // the RigidBody origin is the capsule CENTER; drop the feet to the base

export function BeastAvatar() {
  const active = useGameStore((s) => s.beastFormActive);
  const element = useGameStore((s) => s.activeBeastForm);
  const groupRef = useRef();
  const coreRef = useRef();
  const { camera } = useThree();
  const parts = active ? beastAvatarParts(element) : null;

  useFrame((state) => {
    if (!groupRef.current || !parts) return;
    // Face the look direction (the transform-cam holds the captured-forward, so the camera sees the
    // beast's back-3/4). Transient camera read (Game-Loop-Isolation).
    groupRef.current.rotation.y = camera.rotation.y;
    // Gentle core pulse for life; FROZEN at a flattering phase in capture (byte-stable frame).
    const phase = isCaptureMode() ? 0.7 : state.clock.elapsedTime * 3;
    if (coreRef.current) coreRef.current.scale.setScalar(1 + Math.sin(phase) * 0.08);
  });

  if (!parts) return null;

  return (
    <group ref={groupRef} position={[0, FEET_OFFSET, 0]}>
      {/* (1) SILHOUETTE — DARK ink toon body + a bright ELEMENT-colored fresnel rim (both toneMapped,
          sub-bloom -> CRISP). The body carries identity (Hades ink); the rim is the glowing edge. */}
      {parts.boxes.map((b, i) => (
        <mesh key={i} position={b.pos} rotation={b.rot} castShadow>
          <boxGeometry args={b.size} />
          <MobToonMaterial color={parts.bodyColor} rimColor={parts.glowColor} rimStrength={1.15} />
        </mesh>
      ))}

      {/* (2) HOT-CORE — a TINY near-white additive heart + nested pure-white hotspot that the global
          Bloom blows out into a glowing point (the Genshin radiance; the ONLY thing that blooms). */}
      <mesh ref={coreRef} position={parts.core.pos} renderOrder={2}>
        <sphereGeometry args={[parts.core.radius * 0.6, 14, 14]} />
        <meshBasicMaterial color={parts.coreColor} toneMapped={false} transparent opacity={0.95}
          blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} />
        <mesh renderOrder={3}>
          <sphereGeometry args={[parts.core.radius * 0.32, 10, 10]} />
          <meshBasicMaterial color="#FFFFFF" toneMapped={false} transparent opacity={1.0}
            blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} />
        </mesh>
      </mesh>

      {/* (3) a SINGLE faint back-halo (BackSide, low opacity) -- a touch of aura BEHIND the silhouette,
          NOT engulfing it. The big bright engulfing shells were the BLOB; the silhouette must dominate. */}
      <mesh position={parts.core.pos} renderOrder={1}>
        <sphereGeometry args={[parts.core.radius * 1.7 * parts.aura, 16, 16]} />
        <meshBasicMaterial color={parts.glowColor} toneMapped={false} transparent opacity={0.3}
          blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.BackSide} />
      </mesh>

      <pointLight color={parts.glowColor} intensity={3} distance={6} decay={2} position={parts.core.pos} />
    </group>
  );
}
