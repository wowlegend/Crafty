// pickupVfx.jsx — the XP/loot world-pickup renderers + the pickup pop (extracted from
// SimplifiedNPCSystem S3-M3: same useFrame math, byte-identical). LootDropRender +
// LootPopRender keep their isCaptureMode() freeze (a fixture-injected drop must be byte-stable
// — no real drop occurs in capture, so the visual gate cannot see this; the vfx-extraction gate locks it).
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getItemRarity } from '../data/items.js';
import { rarityBeam } from '../game/lootJuice.js';
import { isCaptureMode } from '../devtest/captureMode';

export const XPOrbRender = React.memo(({ entity }) => {
  const meshRef = useRef();

  useFrame(() => {
    if (!meshRef.current) return;
    meshRef.current.position.copy(entity.position);
    meshRef.current.rotation.x += 0.02;
    meshRef.current.rotation.y += 0.02;
  });

  return (
    <mesh ref={meshRef} position={[entity.position.x, entity.position.y, entity.position.z]} castShadow>
      <icosahedronGeometry args={[0.15, 0]} />
      <meshStandardMaterial color="#00ff44" emissive="#00ff44" emissiveIntensity={0.8} roughness={0.1} metalness={0.9} />
    </mesh>
  );
});

export const LootDropRender = React.memo(({ entity }) => {
  const meshRef = useRef();
  const beamRef = useRef();

  const rarity = useMemo(() => getItemRarity(entity.item), [entity.item]);

  // M3c-T1: the drop look is derived from the pure rarityBeam helper, keyed off
  // the LOCKED RARITY_FILL palette -> { color, height, intensity } tiered by
  // rarity (common = short/dim, legendary = tall/bright). The gem + beam share
  // the color; the beam's height + additive opacity scale by tier so a legendary
  // drop reads across the map.
  const beam = useMemo(() => rarityBeam(rarity), [rarity]);
  const color = beam.color;

  // M3-T3: the loot-drop glyph sprite painted a leading emoji from the (now
  // emoji-free) item name into a CanvasTexture. With item identity decoupled
  // from emoji, that display is gone; the rarity-colored gem + beam carry the
  // drop. A game-icon billboard for the drop is a T4 emoji-disposition concern
  // (SVG Icon glyphs can't render into a Three.js CanvasTexture without a new
  // texture pipeline — out of T3 scope).

  useFrame((state) => {
    if (!meshRef.current) return;
    meshRef.current.position.copy(entity.position);
    // Capture-determinism (mirrors MobModel): in capture mode the bob/spin must hold
    // a FIXED pose so the loot-showcase frame is byte-stable. rotation.y accumulates
    // per-frame (frame-count differs run-to-run) and rotation.x reads the live clock;
    // both are pinned to a deterministic value (elapsed=0 -> sin(0)=0) under capture.
    const elapsed = isCaptureMode() ? 0 : state.clock.getElapsedTime();
    if (isCaptureMode()) {
      meshRef.current.rotation.y = 0;
    } else {
      meshRef.current.rotation.y += 0.03;
    }
    meshRef.current.rotation.x = Math.sin(elapsed * 2) * 0.2;

    if (beamRef.current) {
      // Anchor the beam base at the drop, rising by its tiered height.
      beamRef.current.position.copy(entity.position);
      beamRef.current.position.y += beam.height / 2;
    }
  });

  return (
    <group>
      <mesh ref={meshRef} castShadow>
        <octahedronGeometry args={[0.25, 0]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.6}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>

      <mesh ref={beamRef}>
        <cylinderGeometry args={[0.08, 0.25, beam.height, 8, 1, true]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={beam.intensity}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
});

export const LootPopRender = ({ position, color, id, onComplete }) => {
  const meshRef = useRef();
  const startTime = useRef(null);

  useFrame(() => {
    if (!meshRef.current) return;
    // Capture-determinism: the pop normally drives off wall-clock performance.now()
    // (differs run-to-run). In capture mode it holds a FIXED mid-pop pose (t pinned)
    // and never self-completes, so a deterministically-triggered pop renders byte-stable.
    // In gameplay the pop fires only on pickup, which cannot occur in capture (LootSystem
    // collection is frozen), so this branch is exercised only by an explicit fixture pop.
    if (isCaptureMode()) {
      const t = 0.45; // a settled, clearly-visible mid-pop ring
      const scale = 0.15 + (1.4 - 0.15) * t;
      meshRef.current.scale.set(scale, scale, 1);
      meshRef.current.material.opacity = 0.85 * (1 - t);
      return;
    }
    if (startTime.current === null) startTime.current = performance.now();
    const elapsed = performance.now() - startTime.current;
    const duration = 280;
    const t = Math.min(1, elapsed / duration);

    const scale = 0.15 + (1.4 - 0.15) * t;
    meshRef.current.scale.set(scale, scale, 1);
    meshRef.current.material.opacity = 0.85 * (1 - t);

    if (t >= 1) onComplete(id);
  });

  return (
    <mesh ref={meshRef} position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.7, 1.0, 24]} />
      <meshBasicMaterial color={color} transparent opacity={0.85} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
    </mesh>
  );
};
