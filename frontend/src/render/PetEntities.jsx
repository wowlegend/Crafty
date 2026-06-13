// PetEntities.jsx — the R3F pet render system (extracted from AdvancedGameFeatures S3-M4 p3;
// useFrame-driven, capture-clean — no pet appears in any baseline). Verbatim.
import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Outlines } from '@react-three/drei';
import { useGameStore } from '../store/useGameStore';
import { OUTLINE } from './characterStyle';
import { TIERS } from './quality';

export const PetEntities = React.memo(({ pets }) => {
    const { camera } = useThree();
    const petRefs = useRef({});

    // Inverted-hull contour outline gate (matches mob pattern). Pets keep their
    // existing standard materials — the outline is purely additive ink.
    const qualityTier = useGameStore(s => s.qualityTier) || 'low';
    const charOutline = (TIERS[qualityTier] || TIERS.low).charOutline;

    useFrame((state, delta) => {
        const store = useGameStore.getState();
        const petOrder = store.petOrder || 'follow';
        const stayCoords = store.stayCoordinates || [0, 0, 0];

        pets.forEach((pet, index) => {
            const ref = petRefs.current[pet.id];
            if (!ref) return;

            let targetX = camera.position.x;
            let targetZ = camera.position.z;

            // --- Step 1: Pet Orders Location Selector ---
            if (petOrder === 'stay') {
                // Keep coordinates to the stay origin spot
                targetX = stayCoords[0] + (index - 1) * 1.5;
                targetZ = stayCoords[2];
            } else if (petOrder === 'attack') {
                // Target the Shadow Dragon first if active, otherwise check standard hostile mob entities
                const bossActive = store.isBossActive && store.isBossActive();
                const bossPos = bossActive ? store.getBossPosition() : null;

                if (bossActive && bossPos) {
                    targetX = bossPos[0];
                    targetZ = bossPos[2];
                } else {
                    const hostiles = store.mobEntities || [];
                    let closest = null;
                    let minDist = Infinity;
                    
                    for (const m of hostiles) {
                        if (m.passive) continue;
                        const dx = m.x - ref.position.x;
                        const dz = m.z - ref.position.z;
                        const distSq = dx * dx + dz * dz;
                        if (distSq < minDist) {
                            minDist = distSq;
                            closest = m;
                        }
                    }
                    if (closest) {
                        targetX = closest.x;
                        targetZ = closest.z;
                    } else {
                        // Default to follow player if no hostiles are near
                        const offsetAngle = (index / Math.max(pets.length, 1)) * Math.PI * 2;
                        targetX = camera.position.x + Math.cos(offsetAngle + state.clock.elapsedTime * 0.3) * 4;
                        targetZ = camera.position.z + Math.sin(offsetAngle + state.clock.elapsedTime * 0.3) * 4;
                    }
                }
            } else {
                // Default: Follow player circling orbitally
                const offsetAngle = (index / Math.max(pets.length, 1)) * Math.PI * 2;
                const followDist = 4.0 + index * 1.2;
                targetX = camera.position.x + Math.cos(offsetAngle + state.clock.elapsedTime * 0.35) * followDist;
                targetZ = camera.position.z + Math.sin(offsetAngle + state.clock.elapsedTime * 0.35) * followDist;
            }

            // Snap Y-axis ground snapping checks
            let targetY = ref.position.y;
            if (store.getMobGroundLevel) {
                const groundY = store.getMobGroundLevel(ref.position.x, ref.position.z);
                if (groundY !== null && !isNaN(groundY)) targetY = groundY + 0.5;
            }

            // Smooth physical translations
            ref.position.x += (targetX - ref.position.x) * 2.2 * delta;
            ref.position.z += (targetZ - ref.position.z) * 2.2 * delta;
            ref.position.y += (targetY - ref.position.y) * 3.5 * delta;

            const dx = targetX - ref.position.x;
            const dz = targetZ - ref.position.z;
            if (Math.abs(dx) > 0.05 || Math.abs(dz) > 0.05) {
                ref.rotation.y = Math.atan2(dx, dz);
            }

            // Walking animations
            ref.position.y += Math.sin(state.clock.elapsedTime * 4.5 + index) * 0.025;
        });
    });

    return (
        <>
            {pets.map(pet => {
                const isPig = pet.type === 'pig';
                return (
                    <group
                        key={pet.id}
                        ref={el => { if (el) petRefs.current[pet.id] = el; }}
                        position={pet.position}
                    >
                        {/* Body */}
                        <mesh castShadow receiveShadow>
                            <boxGeometry args={isPig ? [0.8, 0.6, 1.0] : [1.0, 0.8, 1.2]} />
                            <meshStandardMaterial
                                color={isPig ? '#ffa6c9' : '#8B5A2B'}
                                roughness={0.4}
                                metalness={0.2}
                            />
                            {charOutline && <Outlines thickness={OUTLINE.mob.thickness} color={OUTLINE.color} toneMapped={false} />}
                        </mesh>
                        {/* Head */}
                        <mesh castShadow receiveShadow position={[0, 0.4, isPig ? 0.55 : 0.65]}>
                            <boxGeometry args={isPig ? [0.5, 0.5, 0.5] : [0.6, 0.6, 0.4]} />
                            <meshStandardMaterial
                                color={isPig ? '#ffa6c9' : '#8B5A2B'}
                                roughness={0.4}
                            />
                            {charOutline && <Outlines thickness={OUTLINE.mob.thickness} color={OUTLINE.color} toneMapped={false} />}
                        </mesh>
                        {/* Tamed Collar Badge */}
                        <mesh position={[0, 0.35, isPig ? 0.25 : 0.3]}>
                            <boxGeometry args={[0.85, 0.1, 0.85]} />
                            <meshBasicMaterial color="#a855f7" />
                        </mesh>
                        {/* Floating heart highlight */}
                        <mesh position={[0, 1.15, 0]}>
                            <octahedronGeometry args={[0.13]} />
                            <meshBasicMaterial color="#ec4899" toneMapped={false} />
                        </mesh>
                        <pointLight color="#a855f7" intensity={0.4} distance={4} />
                    </group>
                );
            })}
        </>
    );
});
