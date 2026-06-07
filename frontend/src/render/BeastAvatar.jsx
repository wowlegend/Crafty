import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore';
import { MobToonMaterial } from './MobToonMaterial';
import { beastAvatarParts } from './beastAvatarParts.js';
import { elementForSpell } from '../game/beasts.js';
import { ANTICIPATION_SEC } from '../game/beastTransform.js';
import { MORPH_SEC, BURST_SEC, morphEntrance, burstFlash, chargeGlow } from '../game/beastMorph.js';
import { isCaptureMode } from '../devtest/captureMode';

/**
 * BeastAvatar — S2-B1-M7b/M7c: the visible voxel beast the transform-cam (M7a) reveals, + the 3-beat
 * morph CHOREOGRAPHY (M7c).
 *
 * Look (③·5): a crisp `MobToonMaterial` DARK-INK body (never blooms — the Hades silhouette) + an
 * element-colored fresnel RIM + a tiny near-white `toneMapped={false}` HOT-CORE the global Bloom blows
 * out (Genshin radiance) + a faint back-halo.
 * Choreography: beat 1 ANTICIPATION = a growing element charge-glow at the player while the hold-roar
 * charge fills; beat 2 BURST = a bright additive flash that MASKS the collider/avatar swap frame; beat 3
 * SETTLE = the avatar pops into being (scale overshoot) + the entry flash eases to steady.
 *
 * Self-gates on beastFormActive/beastCharging (renders NOTHING as plain human -> FPV + the 16 capture
 * states unaffected). Mounted as a RigidBody child (at the player). Capture FREEZES to the SETTLED beast
 * (no entrance, no burst, no charge) -> byte-stable frame. Transient clock refs (Game-Loop-Isolation).
 */
const FEET_OFFSET = -0.9; // the RigidBody origin is the capsule CENTER; drop the feet to the base
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

export function BeastAvatar() {
  const active = useGameStore((s) => s.beastFormActive);
  const charging = useGameStore((s) => s.beastCharging);
  const element = useGameStore((s) => s.activeBeastForm);
  const activeSpell = useGameStore((s) => s.activeSpell);
  const shapeVariant = useGameStore((s) => s.beastShapeVariant); // M7d showcase only (default null)
  const glowMul = useGameStore((s) => s.beastGlowMul); // M7d glow-ladder DIAL — scales the element glow only (default 1)
  const groupRef = useRef();
  const coreRef = useRef();
  const burstRef = useRef();
  const chargeRef = useRef();
  const entryRef = useRef(-1);       // clock time the beast became active (-1 = not yet)
  const chargeStartRef = useRef(-1); // clock time the anticipation charge began
  const { camera } = useThree();

  const parts = active ? beastAvatarParts(element, shapeVariant) : null;
  const chargeEl = charging && !active ? elementForSpell(activeSpell) : null;
  const chargeColor = chargeEl ? beastAvatarParts(chargeEl)?.glowColor : null;

  useFrame((state) => {
    const capture = isCaptureMode();
    const now = state.clock.elapsedTime;

    // beat 1 — anticipation charge core: grows + brightens as the hold-roar charge fills.
    if (chargeRef.current && chargeColor) {
      if (chargeStartRef.current < 0) chargeStartRef.current = now;
      const cp = capture ? 1 : clamp01((now - chargeStartRef.current) / ANTICIPATION_SEC);
      chargeRef.current.scale.setScalar(chargeGlow(cp).scale);
    } else {
      chargeStartRef.current = -1;
    }

    if (!parts || !groupRef.current) { entryRef.current = -1; return; }
    groupRef.current.rotation.y = camera.rotation.y; // face the look dir (cam sees the back-3/4)

    // beats 2+3 — the avatar entrance (scale-pop + flash) + the swap-masking burst. FROZEN to SETTLED
    // in capture (elapsed past the windows) so the regression frame is byte-stable.
    if (entryRef.current < 0) entryRef.current = now;
    const elapsed = capture ? MORPH_SEC + 1 : now - entryRef.current;
    const ent = morphEntrance(elapsed);
    groupRef.current.scale.setScalar(ent.scale);
    if (coreRef.current) {
      const pulse = capture ? 1.08 : 1 + Math.sin(now * 3) * 0.08;
      coreRef.current.scale.setScalar(pulse + ent.flash * 0.9); // entry flash boosts the core
    }
    if (burstRef.current) {
      const bf = burstFlash(capture ? BURST_SEC + 1 : elapsed);
      burstRef.current.visible = bf.active;
      if (bf.active) {
        burstRef.current.scale.setScalar(bf.scale);
        if (burstRef.current.material) burstRef.current.material.opacity = bf.opacity;
      }
    }
  });

  if (!parts && !chargeColor) return null;

  return (
    <group>
      {/* beat 1 — ANTICIPATION charge core at the player chest (element-colored, grows with the charge) */}
      {chargeColor && (
        <mesh ref={chargeRef} position={[0, FEET_OFFSET + 1.0, 0]} renderOrder={3}>
          <sphereGeometry args={[0.22, 14, 14]} />
          <meshBasicMaterial color={chargeColor} toneMapped={false} transparent opacity={0.85}
            blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} />
          <mesh>
            <sphereGeometry args={[0.1, 10, 10]} />
            <meshBasicMaterial color="#FFFFFF" toneMapped={false} transparent opacity={1}
              blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} />
          </mesh>
        </mesh>
      )}

      {parts && (
        <group ref={groupRef} position={[0, FEET_OFFSET, 0]}>
          {/* (1) SILHOUETTE — dark-ink toon body + element rim (toneMapped, crisp) */}
          {parts.boxes.map((b, i) => (
            <mesh key={i} position={b.pos} rotation={b.rot} castShadow>
              <boxGeometry args={b.size} />
              <MobToonMaterial color={parts.bodyColor} rimColor={parts.glowColor} rimStrength={1.15 * glowMul} />
            </mesh>
          ))}

          {/* (2) HOT-CORE — near-white additive heart + nested pure-white hotspot (clips past bloom) */}
          <mesh ref={coreRef} position={parts.core.pos} renderOrder={2}>
            <sphereGeometry args={[parts.core.radius * 0.6, 14, 14]} />
            <meshBasicMaterial color={parts.coreColor} toneMapped={false} transparent opacity={Math.min(1, 0.95 * glowMul)}
              blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} />
            <mesh renderOrder={3}>
              <sphereGeometry args={[parts.core.radius * 0.32, 10, 10]} />
              <meshBasicMaterial color="#FFFFFF" toneMapped={false} transparent opacity={1}
                blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} />
            </mesh>
          </mesh>

          {/* (3) a single faint back-halo (BackSide) — a touch of aura behind the silhouette */}
          <mesh position={parts.core.pos} renderOrder={1}>
            <sphereGeometry args={[parts.core.radius * 1.7 * parts.aura * (0.9 + 0.1 * glowMul), 16, 16]} />
            <meshBasicMaterial color={parts.glowColor} toneMapped={false} transparent opacity={Math.min(0.55, 0.3 * glowMul)}
              blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.BackSide} />
          </mesh>

          {/* beat 2 — the BURST flash at the core: masks the collider/avatar swap, gone when settled */}
          <mesh ref={burstRef} position={parts.core.pos} renderOrder={4} visible={false}>
            <sphereGeometry args={[0.5, 16, 16]} />
            <meshBasicMaterial color={parts.coreColor} toneMapped={false} transparent opacity={1}
              blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} />
          </mesh>

          <pointLight color={parts.glowColor} intensity={3 * glowMul} distance={6} decay={2} position={parts.core.pos} />
        </group>
      )}
    </group>
  );
}
