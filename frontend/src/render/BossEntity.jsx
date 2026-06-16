// BossEntity.jsx — the Shadow Dragon R3F render + its destroyVoxelsInRadius terrain-destruction
// helper (extracted from AdvancedGameFeatures S3-M4 p4 T4; byte-exact). The capture-determinism
// freeze (if (isCaptureMode()) { ... } before the bossPositionRef movement) is preserved verbatim.
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Outlines } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore';
import { isCaptureMode } from '../devtest/captureMode';
import { OUTLINE } from './characterStyle';
import { TIERS } from './quality';
import { BOSS_CONFIG } from '../game/bossConfig.js';
import { windupRamp } from '../game/attackTelegraph.js';

// M2 #4 Slice 3: boss lava-AoE telegraph. The lava ring (already a ground decal) now appears + grows as
// a HARMLESS warning for this window before it arms (starts dealing damage), so the player can read it
// and step out -- it used to spawn instantly at the player's feet (undodgeable). Heavier than the mob
// 380ms windup: it's a big AoE you must walk clear of. Tunable -> Kevin FEEL #50.
const LAVA_WINDUP_MS = 750;

const destroyVoxelsInRadius = (centerPos, radius, maxCount) => {
    const store = useGameStore.getState();
    const worker = store.terrainWorker;
    const getGround = store.getMobGroundLevel;
    if (!worker || !getGround) return;

    const blocksToBreak = [];
    const minX = Math.floor(centerPos.x - radius);
    const maxX = Math.ceil(centerPos.x + radius);
    const minZ = Math.floor(centerPos.z - radius);
    const maxZ = Math.ceil(centerPos.z + radius);

    for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
            const dx = x + 0.5 - centerPos.x;
            const dz = z + 0.5 - centerPos.z;
            if (dx * dx + dz * dz <= radius * radius) {
                const groundY = getGround(x, z);
                if (groundY !== null && !isNaN(groundY)) {
                    const blockY = Math.floor(groundY);
                    const dy = blockY + 0.5 - centerPos.y;
                    if (dx * dx + dy * dy + dz * dz <= radius * radius) {
                        if (blockY > 1) {
                            blocksToBreak.push({ x, y: blockY, z });
                            if (blockY - 1 > 1) {
                                const dy2 = blockY - 0.5 - centerPos.y;
                                if (dx * dx + dy2 * dy2 + dz * dz <= radius * radius) {
                                    blocksToBreak.push({ x, y: blockY - 1, z });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (blocksToBreak.length === 0) return;

    const countToBreak = Math.min(blocksToBreak.length, maxCount);
    const chosen = [];
    for (let i = 0; i < countToBreak; i++) {
        const randIdx = Math.floor(Math.random() * blocksToBreak.length);
        chosen.push(blocksToBreak.splice(randIdx, 1)[0]);
    }

    const newBlocks = new Map(store.worldBlocks);
    chosen.forEach(b => {
        const cx = Math.floor(b.x / 16);
        const cz = Math.floor(b.z / 16);
        const lx = b.x - cx * 16;
        const lz = b.z - cz * 16;

        worker.postMessage({
            type: 'update_block',
            payload: { cx, cz, x: lx, y: b.y, z: lz, blockType: 0 }
        });

        newBlocks.set(`${b.x}_${b.y}_${b.z}`, 0);
    });

    store.setWorldBlocks(newBlocks);
};

// Dragon SILHOUETTE features (iter-172, the mob-distinctness treatment for the apex creature): static
// bold-flat boxes in the dragon body-local frame (dragon faces +Z, head/eyes forward). Swept-back horns,
// a tapering down-back tail, and a back-ridge of spine spikes — the cues that push the blocky winged
// torso to read unmistakably as a DRAGON. Rendered with the torso material (flash/phase together) + the
// boss outline. Static (no anim) -> capture-frozen with the boss group, byte-deterministic.
const DRAGON_FEATURES = [
  // swept-back horns off the head top (head box at [0,1.4,1.8]; tilt back = negative rot.x)
  { box: [0.22, 1.0, 0.22], pos: [-0.5, 2.3, 1.4], rot: [-0.5, 0, 0.18] },
  { box: [0.22, 1.0, 0.22], pos: [0.5, 2.3, 1.4], rot: [-0.5, 0, -0.18] },
  // tapering tail behind the torso (-Z), drooping down
  { box: [0.8, 0.8, 1.8], pos: [0, 0.05, -2.7], rot: [0.28, 0, 0] },
  { box: [0.45, 0.45, 1.7], pos: [0, -0.55, -4.05], rot: [0.5, 0, 0] },
  // back-ridge spine spikes along the torso top (y top ~1.0)
  { box: [0.16, 0.5, 0.34], pos: [0, 1.2, 1.2], rot: [0.35, 0, 0] },
  { box: [0.18, 0.62, 0.34], pos: [0, 1.28, 0.4], rot: [0.18, 0, 0] },
  { box: [0.18, 0.62, 0.34], pos: [0, 1.28, -0.4], rot: [0, 0, 0] },
  { box: [0.16, 0.5, 0.34], pos: [0, 1.2, -1.2], rot: [-0.2, 0, 0] },
];

export const BossEntity = React.memo(({ bossActive, bossPositionRef, bossPhase, bossHealth }) => {
    const meshRef = useRef();
    const { camera } = useThree();

    // Inverted-hull contour outline gate (matches mob/prop pattern). The boss keeps its
    // emissive telegraph + standard materials — the outline is purely additive ink.
    const qualityTier = useGameStore(s => s.qualityTier) || 'low';
    const charOutline = (TIERS[qualityTier] || TIERS.low).charOutline;

    // Premium visual animation and hit reaction refs
    const leftWingRef = useRef();
    const rightWingRef = useRef();
    const prevHealth = useRef(bossHealth);
    const flashTime = useRef(0);

    useEffect(() => {
        if (bossHealth < prevHealth.current) {
            flashTime.current = 0.18; // Flash red for 180ms
        }
        prevHealth.current = bossHealth;
    }, [bossHealth]);
    
    // Advanced tactical action cooldown timers
    const lastAttack = useRef(0);
    const lastFireballTime = useRef(0);
    const lastRoarTime = useRef(0);
    const lastLavaTime = useRef(0);
    const lastSummonTime = useRef(0);
    
    // High-performance bullet references to bypass React overhead
    const fireballsRef = useRef([]);
    const lavaZonesRef = useRef([]);
    const fireballMeshes = useRef({});
    const lavaZoneMeshes = useRef({});
    
    // Low-frequency trigger state to spawn/de-spawn bullet groups in the React tree
    const [effects, setEffects] = useState({ fireballs: [], lavaZones: [] });

    // Instanced Spawner callbacks
    const spawnFireball = useCallback((startPos, dir) => {
        const id = Math.random();
        const fireball = {
            id,
            position: startPos.clone(),
            velocity: dir.clone().multiplyScalar(16.0), // Fast flight
            life: 3.5
        };
        fireballsRef.current.push(fireball);
        setEffects(prev => ({ ...prev, fireballs: [...fireballsRef.current] }));
    }, []);

    const spawnLavaZone = useCallback((pos) => {
        const id = Math.random();
        const lava = {
            id,
            position: pos.clone(),
            life: 6.0,
            lastDamageTime: 0,
            telegraphUntil: performance.now() + LAVA_WINDUP_MS // harmless warning window before it arms
        };
        lavaZonesRef.current.push(lava);
        setEffects(prev => ({ ...prev, lavaZones: [...lavaZonesRef.current] }));
    }, []);

    useFrame((state, delta) => {
        if (!bossActive || !bossPositionRef?.current || !meshRef.current) {
            // Clean up any remaining visual effects if boss becomes inactive
            if (fireballsRef.current.length > 0 || lavaZonesRef.current.length > 0) {
                fireballsRef.current = [];
                lavaZonesRef.current = [];
                setEffects({ fireballs: [], lavaZones: [] });
            }
            return;
        }

        // Capture-determinism freeze: pin the dragon to its forced spawn pose and skip
        // ALL movement / attacks / fireballs / wing-flap so the boss-closeup fixture is
        // byte-stable. No-op in gameplay (isCaptureMode() is always false there).
        if (isCaptureMode()) {
            if (leftWingRef.current && rightWingRef.current) {
                leftWingRef.current.rotation.z = 0.2;   // rest pose
                rightWingRef.current.rotation.z = -0.2;
            }
            if (meshRef.current && bossPositionRef.current) {
                meshRef.current.position.set(...bossPositionRef.current);
            }
            return;
        }

        const phase = BOSS_CONFIG.phases[bossPhase] || BOSS_CONFIG.phases[0];
        const playerX = camera.position.x;
        const playerZ = camera.position.z;
        const bx = bossPositionRef.current[0];
        const by = bossPositionRef.current[1];
        const bz = bossPositionRef.current[2];

        const dx = playerX - bx;
        const dz = playerZ - bz;
        const dist = Math.sqrt(dx * dx + dz * dz);

        // --- Step 1: Phase-Specific Tactical Flight & Movement Vector Solvers ---
        let targetX = playerX;
        let targetZ = playerZ;
        let targetY = by;
        
        let currentGroundY = 16;
        if (useGameStore.getState().getMobGroundLevel) {
            const gy = useGameStore.getState().getMobGroundLevel(bx, bz);
            if (gy !== null && !isNaN(gy)) currentGroundY = gy;
        }

        if (bossPhase === 0) {
            // Phase 1 (Aerial Strike Mode): Dragon circles high in the sky and swoops
            const time = state.clock.elapsedTime;
            const orbitRadius = 14;
            const orbitSpeed = 0.6;
            targetX = playerX + Math.cos(time * orbitSpeed) * orbitRadius;
            targetZ = playerZ + Math.sin(time * orbitSpeed) * orbitRadius;
            targetY = currentGroundY + 13.0 + Math.sin(time * 1.5) * 2.0; // Graceful vertical bobbing
        } else {
            // Phase 2 & 3 (Grounded Modes): Charge direct at player on the ground surface
            targetX = playerX;
            targetZ = playerZ;
            targetY = currentGroundY + 0.8;
        }

        // Interpolate 3D position smoothly towards coordinates targets
        const moveSpeed = phase.speed * delta;
        const tdx = targetX - bx;
        const tdz = targetZ - bz;
        const tdy = targetY - by;
        const tdist = Math.sqrt(tdx * tdx + tdz * tdz);

        let nextX = bx;
        let nextZ = bz;
        if (tdist > 0.5) {
            nextX = bx + (tdx / tdist) * Math.min(moveSpeed, tdist);
            nextZ = bz + (tdz / tdist) * Math.min(moveSpeed, tdist);
        }
        const nextY = by + tdy * delta * 2.0; // Smooth vertical interpolation

        bossPositionRef.current = [nextX, nextY, nextZ];
        meshRef.current.position.set(nextX, nextY, nextZ);

        // Rotate facing direction towards target path
        if (tdist > 0.1) {
            meshRef.current.rotation.y = Math.atan2(tdx, tdz);
        }

        // --- Step 2: Phase-Specific Tactical Attack Routines ---
        const now = performance.now();

        // 1. Common Melee Damage Routine
        if (dist < BOSS_CONFIG.attackRange) {
            if (now - lastAttack.current > BOSS_CONFIG.attackCooldown) {
                lastAttack.current = now;
                if (useGameStore.getState().damagePlayer) {
                    useGameStore.getState().damagePlayer(phase.damage, 'Shadow Dragon Bite');
                }
            }
        }

        // 2. Phase 1 Aerial Fireball Rain
        if (bossPhase === 0) {
            if (now - lastFireballTime.current > 2400) {
                lastFireballTime.current = now;
                
                // Spawn fireball starting at mouth and aiming directly at player capsule core
                const headPos = new THREE.Vector3(bx, by + 1.2, bz + 1.5).applyEuler(meshRef.current.rotation);
                const targetPos = new THREE.Vector3(playerX, camera.position.y - 0.5, playerZ);
                const fireballDir = targetPos.clone().sub(headPos).normalize();
                
                spawnFireball(headPos, fireballDir);
                
                if (useGameStore.getState().addNotification) {
                    useGameStore.getState().addNotification('The Shadow Dragon drops a FIREBALL from above!', 'warning');
                }
            }
        }

        // 3. Phase 2 Grounded Knockback Roars
        if (bossPhase === 1) {
            if (now - lastRoarTime.current > 4200) {
                lastRoarTime.current = now;
                
                // Roar causes directional camera shakes
                if (useGameStore.getState().setScreenShake) {
                    useGameStore.getState().setScreenShake(3.5);
                    setTimeout(() => useGameStore.getState().setScreenShake(0), 200);
                }

                // Physical knockback vector computation
                const playerRigidBody = useGameStore.getState().playerRigidBodyRef?.current;
                if (playerRigidBody) {
                    const pushX = dx / (dist || 1);
                    const pushZ = dz / (dist || 1);
                    // Heavy Rapier impulse: pushes player back and up
                    playerRigidBody.applyImpulse({ x: pushX * 36.0, y: 14.0, z: pushZ * 36.0 }, true);
                }

                if (useGameStore.getState().damagePlayer) {
                    useGameStore.getState().damagePlayer(phase.damage * 1.3, 'Shadow Dragon Shockwave');
                }

                if (useGameStore.getState().addNotification) {
                    useGameStore.getState().addNotification('Pushed back! Shadow Dragon unleashed a KNOCKBACK ROAR!', 'danger');
                }

                // Trigger dynamic boss voxel destruction in Phase 2
                destroyVoxelsInRadius(new THREE.Vector3(bx, by, bz), 5.0, Math.floor(Math.random() * 5) + 4);
            }
        }

        // 4. Phase 3 Enraged Inferno (Lava Circles & Minions)
        if (bossPhase === 2) {
            // A. Persistent Lava Zone breath
            if (now - lastLavaTime.current > 5200) {
                lastLavaTime.current = now;
                
                let playerGroundY = camera.position.y - 1.5;
                if (useGameStore.getState().getMobGroundLevel) {
                    const pgy = useGameStore.getState().getMobGroundLevel(playerX, playerZ);
                    if (pgy !== null && !isNaN(pgy)) playerGroundY = pgy;
                }
                
                spawnLavaZone(new THREE.Vector3(playerX, playerGroundY + 0.05, playerZ));
                
                if (useGameStore.getState().addNotification) {
                    useGameStore.getState().addNotification('The ground is melting! Step out of the LAVA ZONES!', 'danger');
                }

                // Trigger dynamic boss voxel destruction in Phase 3
                destroyVoxelsInRadius(new THREE.Vector3(playerX, playerGroundY, playerZ), 5.0, Math.floor(Math.random() * 5) + 4);
            }

            // B. Summon Skeleton Cohort Minions
            if (now - lastSummonTime.current > 8500) {
                lastSummonTime.current = now;
                const spawnMob = useGameStore.getState().spawnMob;
                
                if (spawnMob) {
                    const angle1 = Math.random() * Math.PI * 2;
                    const angle2 = angle1 + Math.PI;
                    spawnMob(bx + Math.cos(angle1) * 7, bz + Math.sin(angle1) * 7, 'skeleton');
                    spawnMob(bx + Math.cos(angle2) * 7, bz + Math.sin(angle2) * 7, 'skeleton');
                    
                    if (useGameStore.getState().addNotification) {
                        useGameStore.getState().addNotification('The Shadow Dragon calls upon Skeleton Cohorts!', 'warning');
                    }
                }
            }
        }

        // --- Step 3: High-Performance Visual Bullets Solver Loops ---
        
        // 1. Move active fireballs in 3D WebGL Canvas
        let hasDeadFireball = false;
        fireballsRef.current.forEach(f => {
            f.position.addScaledVector(f.velocity, delta);
            f.life -= delta;

            // Direct mesh property manipulation to bypass React DOM updates
            const mesh = fireballMeshes.current[f.id];
            if (mesh) {
                mesh.position.copy(f.position);
                mesh.rotation.x += delta * 10;
                mesh.rotation.y += delta * 10;
            }

            // Target collision detector
            const distToPlayer = f.position.distanceTo(camera.position);
            if (distToPlayer < 1.6) {
                f.life = -1; // Flag as dead to explode
                if (useGameStore.getState().damagePlayer) {
                    useGameStore.getState().damagePlayer(18, 'Dragon Fireball impact');
                }
                if (useGameStore.getState().setScreenShake) {
                    useGameStore.getState().setScreenShake(2.0);
                    setTimeout(() => useGameStore.getState().setScreenShake(0), 150);
                }
            }

            if (f.life <= 0) hasDeadFireball = true;
        });

        // 2. Process active lava circles
        let hasDeadLava = false;
        lavaZonesRef.current.forEach(l => {
            l.life -= delta;

            const mesh = lavaZoneMeshes.current[l.id];
            const forming = now < l.telegraphUntil;
            if (mesh) {
                if (forming) {
                    // TELEGRAPH: the ring grows in + blinks fast as a danger warning (no damage yet) so
                    // the player can read where the lava lands and step out before it arms.
                    const wr = windupRamp(now, l.telegraphUntil, LAVA_WINDUP_MS); // 0 -> 1 as it arms
                    mesh.material.opacity = 0.25 + 0.4 * Math.abs(Math.sin(now * 0.012));
                    mesh.scale.setScalar(0.4 + 0.6 * wr);
                } else {
                    // ARMED hot lava: fade out over its life, gentle pulse.
                    mesh.material.opacity = 0.5 * Math.max(0, l.life / 6.0);
                    mesh.scale.setScalar(1.0 + Math.sin(state.clock.elapsedTime * 4) * 0.05);
                }
            }

            // Lava burning area-of-effect solver (only once ARMED -- the telegraph window is harmless)
            const pX = camera.position.x;
            const pZ = camera.position.z;
            const dxL = pX - l.position.x;
            const dzL = pZ - l.position.z;
            const distSq = dxL * dxL + dzL * dzL;

            if (!forming && distSq < 7.56) { // 2.75 units radius burning threshold
                if (now - l.lastDamageTime > 500) {
                    l.lastDamageTime = now;
                    if (useGameStore.getState().damagePlayer) {
                        useGameStore.getState().damagePlayer(6, 'Burning Lava AOE');
                    }
                }
            }

            if (l.life <= 0) hasDeadLava = true;
        });

        // Re-mesh cleanup on bullet destruction (very low frequency compared to frame ticks)
        if (hasDeadFireball) {
            fireballsRef.current = fireballsRef.current.filter(f => f.life > 0);
            setEffects(prev => ({ ...prev, fireballs: [...fireballsRef.current] }));
        }
        if (hasDeadLava) {
            lavaZonesRef.current = lavaZonesRef.current.filter(l => l.life > 0);
            setEffects(prev => ({ ...prev, lavaZones: [...lavaZonesRef.current] }));
        }

        // Animate Boss wings/tail mesh
        meshRef.current.position.y += Math.sin(state.clock.elapsedTime * 2.5) * 0.015;
        if (bossPhase > 0) {
            meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 4) * 0.08;
        }

        // Damage hit visual flash timer decay
        if (flashTime.current > 0) {
            flashTime.current -= delta;
        }

        // Premium wing flapping motion
        if (leftWingRef.current && rightWingRef.current) {
            const flapSpeed = bossPhase === 0 ? 5.5 : 2.5;
            const flapAngle = Math.sin(state.clock.elapsedTime * flapSpeed) * 0.4;
            leftWingRef.current.rotation.z = 0.2 + flapAngle;
            rightWingRef.current.rotation.z = -0.2 - flapAngle;
        }
    });

    if (!bossActive || !bossPositionRef?.current) return null;

    const phase = BOSS_CONFIG.phases[bossPhase] || BOSS_CONFIG.phases[0];
    
    // Satisfying damage indicator color values and majestic obsidian styling
    const isFlashing = flashTime.current > 0;
    const bodyColor = isFlashing ? "#ef4444" : "#111029"; // Hyper-obsidian deep indigo black
    const bodyEmissive = isFlashing ? "#ef4444" : phase.color; // Emissive phase color highlight
    const emissiveIntensityVal = isFlashing ? 3.0 : (bossPhase === 2 ? 2.2 : (bossPhase === 1 ? 1.5 : 0.8));
    const eyeColor = isFlashing ? "#ffffff" : (bossPhase === 2 ? "#f43f5e" : (bossPhase === 1 ? "#fbbf24" : "#c084fc"));

    return (
        <group>
            {/* --- Dragon Core 3D Mesh Representation --- */}
            <group ref={meshRef} position={bossPositionRef.current}>
                {/* Torso */}
                <mesh castShadow receiveShadow>
                    <boxGeometry args={[3, 2, 4]} />
                    <meshStandardMaterial
                        roughness={0.15}
                        metalness={0.9}
                        color={bodyColor}
                        emissive={bodyEmissive}
                        emissiveIntensity={emissiveIntensityVal}
                    />
                    {charOutline && <Outlines thickness={OUTLINE.boss.thickness} color={OUTLINE.color} toneMapped={false} />}
                </mesh>
                {/* Neck & Head */}
                <mesh castShadow receiveShadow position={[0, 1.4, 1.8]}>
                    <boxGeometry args={[1.4, 1.4, 2]} />
                    <meshStandardMaterial
                        roughness={0.15}
                        metalness={0.9}
                        color={bodyColor}
                        emissive={isFlashing ? "#ef4444" : BOSS_CONFIG.secondaryColor}
                        emissiveIntensity={isFlashing ? 3.0 : 0.6}
                    />
                    {charOutline && <Outlines thickness={OUTLINE.boss.thickness} color={OUTLINE.color} toneMapped={false} />}
                </mesh>
                {/* Wings (Left / Right flapping) */}
                <mesh ref={leftWingRef} castShadow receiveShadow position={[-2.6, 0.8, 0]} rotation={[0, 0, 0.2]}>
                    <boxGeometry args={[2.2, 0.15, 3]} />
                    <meshStandardMaterial 
                        roughness={0.1} 
                        metalness={0.95} 
                        color={isFlashing ? "#ef4444" : BOSS_CONFIG.secondaryColor} 
                        emissive={isFlashing ? "#ef4444" : phase.color}
                        emissiveIntensity={isFlashing ? 3.0 : emissiveIntensityVal * 0.4}
                        transparent 
                        opacity={0.85} 
                    />
                </mesh>
                <mesh ref={rightWingRef} castShadow receiveShadow position={[2.6, 0.8, 0]} rotation={[0, 0, -0.2]}>
                    <boxGeometry args={[2.2, 0.15, 3]} />
                    <meshStandardMaterial 
                        roughness={0.1} 
                        metalness={0.95} 
                        color={isFlashing ? "#ef4444" : BOSS_CONFIG.secondaryColor} 
                        emissive={isFlashing ? "#ef4444" : phase.color}
                        emissiveIntensity={isFlashing ? 3.0 : emissiveIntensityVal * 0.4}
                        transparent 
                        opacity={0.85} 
                    />
                </mesh>
                {/* Glowing Eyes */}
                <mesh castShadow receiveShadow position={[-0.4, 1.7, 2.7]}>
                    <sphereGeometry args={[0.22, 8, 8]} />
                    <meshBasicMaterial color={eyeColor} toneMapped={false} />
                </mesh>
                <mesh castShadow receiveShadow position={[0.4, 1.7, 2.7]}>
                    <sphereGeometry args={[0.22, 8, 8]} />
                    <meshBasicMaterial color={eyeColor} toneMapped={false} />
                </mesh>
                <pointLight color={phase.color} intensity={2.5} distance={15} />
                {/* iter-172 dragon silhouette features (horns / tail / back-ridge) — torso material so
                    they flash + phase-color with the body; the boss outline carries the silhouette. */}
                {DRAGON_FEATURES.map((f, i) => (
                    <mesh key={`dragf-${i}`} castShadow receiveShadow position={f.pos} rotation={f.rot}>
                        <boxGeometry args={f.box} />
                        <meshStandardMaterial
                            roughness={0.15}
                            metalness={0.9}
                            color={bodyColor}
                            emissive={bodyEmissive}
                            emissiveIntensity={emissiveIntensityVal}
                        />
                        {charOutline && <Outlines thickness={OUTLINE.boss.thickness} color={OUTLINE.color} toneMapped={false} />}
                    </mesh>
                ))}
            </group>

            {/* --- High Performance Instanced/Mesh Effects Rendering Sheets --- */}
            
            {/* 1. Aerial Fireballs */}
            {effects.fireballs.map(f => (
                <mesh key={f.id} ref={el => { if (el) fireballMeshes.current[f.id] = el; }} position={f.position}>
                    <sphereGeometry args={[0.45, 12, 12]} />
                    <meshBasicMaterial color="#f97316" toneMapped={false} />
                    <pointLight color="#f97316" intensity={2.0} distance={6} />
                </mesh>
            ))}

            {/* 2. Dynamic Burn Lava Zones */}
            {effects.lavaZones.map(l => (
                <mesh 
                    key={l.id} 
                    ref={el => { if (el) lavaZoneMeshes.current[l.id] = el; }} 
                    position={l.position} 
                    rotation={[-Math.PI / 2, 0, 0]} 
                    receiveShadow
                >
                    <ringGeometry args={[0.1, 2.75, 32]} />
                    <meshBasicMaterial color="#ef4444" transparent opacity={0.4} depthWrite={false} />
                </mesh>
            ))}
        </group>
    );
});
