import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { GameMethods } from './GameMethods';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from './store/useGameStore';

export const useSurvivalMode = (isDay) => {
    const [nightCount, setNightCount] = useState(0);
    const [survivalWarning, setSurvivalWarning] = useState(null);
    const prevIsDay = useRef(true);

    useEffect(() => {
        if (prevIsDay.current && !isDay) {
            setNightCount(prev => prev + 1);
            setSurvivalWarning('☠️ Night has fallen... Hostile mobs are stronger!');
            setTimeout(() => setSurvivalWarning(null), 4000);
        }

        if (!prevIsDay.current && isDay) {
            setSurvivalWarning('☀️ Dawn breaks! You survived the night!');
            setTimeout(() => setSurvivalWarning(null), 3000);
        }

        prevIsDay.current = isDay;
    }, [isDay, nightCount]);

    useEffect(() => {
        if (!isDay) {
            const nightHunger = setInterval(() => {
                if (useGameStore.getState().damagePlayer && useGameStore.getState().isAlive && useGameStore.getState().isAlive) {
                    // Extra hunger drain represented as very small starvation pressure
                }
            }, 3000);
            return () => clearInterval(nightHunger);
        }
    }, [isDay]);

    return { nightCount, survivalWarning };
};

export const SurvivalWarning = React.memo(({ message }) => {
    if (!message) return null;

    const isNight = message.includes('Night') || message.includes('☠️');

    return (
        <motion.div
            initial={{ opacity: 0, y: -30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -30, scale: 0.9 }}
            className="absolute top-32 left-1/2 transform -translate-x-1/2 z-30 pointer-events-none"
        >
            <div
                className="px-6 py-3 rounded-xl text-center font-bold text-lg"
                style={{
                    background: isNight
                        ? 'linear-gradient(135deg, rgba(139, 0, 0, 0.9), rgba(75, 0, 0, 0.9))'
                        : 'linear-gradient(135deg, rgba(255, 200, 50, 0.9), rgba(255, 150, 0, 0.9))',
                    border: `2px solid ${isNight ? '#ff4444' : '#FFD700'}`,
                    boxShadow: `0 0 30px ${isNight ? 'rgba(255,0,0,0.4)' : 'rgba(255,215,0,0.4)'}`,
                    color: 'white',
                    textShadow: '0 2px 4px rgba(0,0,0,0.5)',
                }}
            >
                {message}
            </div>
        </motion.div>
    );
});

const BOSS_CONFIG = {
    name: 'Shadow Dragon',
    emoji: '🐉',
    color: '#4B0082',
    secondaryColor: '#8B00FF',
    health: 700, // Increased health for a more epic multi-phase encounter
    damage: 20,
    speed: 3.5,
    size: 3.2,
    aggroRange: 30,
    attackRange: 5,
    attackCooldown: 2000,
    xpReward: 600,
    phases: [
        { hpPercent: 1.0, speed: 4.0, damage: 20, color: '#4B0082' }, // Phase 1: Aerial Strike
        { hpPercent: 0.6, speed: 5.5, damage: 25, color: '#8B0000' }, // Phase 2: Grounded Rage
        { hpPercent: 0.3, speed: 7.0, damage: 35, color: '#ff3300' }, // Phase 3: Enraged Inferno
    ],
};

export const useBossSystem = (playerLevel) => {
    const [bossActive, setBossActive] = useState(false);
    const [bossHealth, setBossHealth] = useState(BOSS_CONFIG.health);
    const [bossMaxHealth] = useState(BOSS_CONFIG.health);
    const bossPositionRef = useRef(null);
    const [bossDefeated, setBossDefeated] = useState(false);
    const [bossPhase, setBossPhase] = useState(0);
    const [bossNotification, setBossNotification] = useState(null);
    const bossSpawned = useRef(false);

    useEffect(() => {
        if (playerLevel >= 5 && !bossSpawned.current && !bossDefeated) {
            bossSpawned.current = true;
            setBossNotification('🐉 Warning: A Shadow Dragon is descending from the skies! [Level 5 Boss Event]');
            setTimeout(() => setBossNotification(null), 6000);

            const playerPos = useGameStore.getState().playerPosition;
            const x = playerPos ? playerPos.x + 25 : 25;
            const z = playerPos ? playerPos.z + 25 : 25;
            let y = 35; // Spawn high up
            if (useGameStore.getState().getMobGroundLevel) {
                const gy = useGameStore.getState().getMobGroundLevel(x, z);
                if (!isNaN(gy)) y = gy + 15;
            }
            bossPositionRef.current = [x, y, z];
            setBossActive(true);
        }
    }, [playerLevel, bossDefeated]);

    useEffect(() => {
        const hpPercent = bossHealth / bossMaxHealth;
        for (let i = BOSS_CONFIG.phases.length - 1; i >= 0; i--) {
            if (hpPercent <= BOSS_CONFIG.phases[i].hpPercent) {
                if (bossPhase !== i) {
                    setBossPhase(i);
                    let alertMsg = '';
                    if (i === 1) {
                        alertMsg = '🐉 PHASE 2: The Shadow Dragon lands! Pushing you back with ROARS!';
                    } else if (i === 2) {
                        alertMsg = '🔥 PHASE 3: The Shadow Dragon is ENRAGED! Watch out for LAVA ZONES and Skeleton Summons!';
                    }
                    if (alertMsg) {
                        setBossNotification(alertMsg);
                        setTimeout(() => setBossNotification(null), 5000);
                    }
                }
                break;
            }
        }
    }, [bossHealth, bossMaxHealth, bossPhase]);

    const damageBoss = useCallback((amount) => {
        if (!bossActive || bossHealth <= 0) return;

        setBossHealth(prev => {
            const newHealth = Math.max(0, prev - amount);
            if (newHealth <= 0) {
                setBossActive(false);
                setBossDefeated(true);
                setBossNotification('🏆 BOSS DEFEATED! You have slain the Shadow Dragon! +600 XP!');
                setTimeout(() => setBossNotification(null), 6000);
                if (GameMethods.grantXP) {
                    GameMethods.grantXP(BOSS_CONFIG.xpReward, 'Shadow Dragon Defeated!');
                }
                // Reward player with Legendary Crown or material drops
                const store = useGameStore.getState();
                if (store.addToInventory) {
                    store.addToInventory('Crown of the Dragon King', 1, 'Legendary');
                    store.addToInventory('Dragon Scale', 3, 'Epic');
                }
            }
            return newHealth;
        });
    }, [bossActive, bossHealth]);

    useEffect(() => {
        useGameStore.setState({ damageBoss: damageBoss });
        useGameStore.setState({ getBossPosition: () => bossPositionRef.current });
        useGameStore.setState({ isBossActive: () => bossActive });
    }, [damageBoss, bossPositionRef, bossActive]);

    return {
        bossActive, bossHealth, bossMaxHealth, bossPositionRef,
        bossDefeated, bossPhase, bossNotification, damageBoss,
    };
};

export const BossHealthBar = React.memo(({ bossActive, bossHealth, bossMaxHealth, bossPhase }) => {
    if (!bossActive) return null;

    const phase = BOSS_CONFIG.phases[bossPhase] || BOSS_CONFIG.phases[0];
    const hpPercent = (bossHealth / bossMaxHealth) * 100;

    let subText = 'Phase 1: Aerial Barrage ✈️';
    if (bossPhase === 1) subText = 'Phase 2: Grounded Carnage 🦖 [Knockback Roars]';
    if (bossPhase === 2) subText = 'Phase 3: Enraged Inferno 💀 [Lava Circles & Summons]';

    return (
        <div className="absolute top-36 left-1/2 transform -translate-x-1/2 z-20 pointer-events-none" style={{ width: 450 }}>
            <div className="text-center mb-1 flex items-center justify-between px-1">
                <span className="text-purple-300 font-extrabold text-sm tracking-wider uppercase" style={{ textShadow: '0 0 10px rgba(168,85,247,0.7)' }}>
                    🐉 {BOSS_CONFIG.name}
                </span>
                <span className="text-red-400 font-bold text-xs">
                    {subText}
                </span>
            </div>
            <div className="h-4 rounded-full overflow-hidden p-0.5" style={{
                background: 'rgba(5, 5, 10, 0.9)',
                border: `2px solid ${phase.color}`,
                boxShadow: `0 0 20px ${phase.color}80, inset 0 0 10px rgba(0,0,0,0.8)`,
            }}>
                <motion.div
                    className="h-full rounded-full"
                    style={{
                        background: `linear-gradient(90deg, ${phase.color}, #a855f7, #ec4899)`,
                        boxShadow: `0 0 10px #f43f5e, inset 0 1px 2px rgba(255,255,255,0.4)`,
                    }}
                    animate={{ width: `${hpPercent}%` }}
                    transition={{ duration: 0.2 }}
                />
            </div>
            <div className="text-center mt-1 flex justify-between text-[10px] text-gray-400 font-semibold px-2">
                <span>HP {bossHealth} / {bossMaxHealth}</span>
                <span>{Math.round(hpPercent)}% REMAINING</span>
            </div>
        </div>
    );
});

export const BossEntity = React.memo(({ bossActive, bossPositionRef, bossPhase }) => {
    const meshRef = useRef();
    const { camera } = useThree();
    
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
            lastDamageTime: 0
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
            if (!isNaN(gy)) currentGroundY = gy;
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
                    useGameStore.getState().addNotification('🔥 The Shadow Dragon drops a FIREBALL from above!', 'warning');
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
                    useGameStore.getState().addNotification('🔊 Pushed back! Shadow Dragon unleashed a KNOCKBACK ROAR!', 'danger');
                }
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
                    if (!isNaN(pgy)) playerGroundY = pgy;
                }
                
                spawnLavaZone(new THREE.Vector3(playerX, playerGroundY + 0.05, playerZ));
                
                if (useGameStore.getState().addNotification) {
                    useGameStore.getState().addNotification('🔥 The ground is melting! Step out of the LAVA ZONES!', 'danger');
                }
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
                        useGameStore.getState().addNotification('💀 The Shadow Dragon calls upon Skeleton Cohorts!', 'warning');
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
            if (mesh) {
                // Smoothly fade out transparency scale over time
                mesh.material.opacity = 0.5 * Math.max(0, l.life / 6.0);
                mesh.scale.setScalar(1.0 + Math.sin(state.clock.elapsedTime * 4) * 0.05); // Pulsing
            }

            // Lava burning area-of-effect solver
            const pX = camera.position.x;
            const pZ = camera.position.z;
            const dxL = pX - l.position.x;
            const dzL = pZ - l.position.z;
            const distSq = dxL * dxL + dzL * dzL;

            if (distSq < 7.56) { // 2.75 units radius burning threshold
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
    });

    if (!bossActive || !bossPositionRef?.current) return null;

    const phase = BOSS_CONFIG.phases[bossPhase] || BOSS_CONFIG.phases[0];

    return (
        <group>
            {/* --- Dragon Core 3D Mesh Representation --- */}
            <group ref={meshRef} position={bossPositionRef.current}>
                {/* Torso */}
                <mesh castShadow receiveShadow>
                    <boxGeometry args={[3, 2, 4]} />
                    <meshStandardMaterial 
                        roughness={0.5} 
                        metalness={0.5} 
                        color={phase.color} 
                        emissive={phase.color} 
                        emissiveIntensity={bossPhase === 2 ? 0.6 : 0.2} 
                    />
                </mesh>
                {/* Neck & Head */}
                <mesh castShadow receiveShadow position={[0, 1.4, 1.8]}>
                    <boxGeometry args={[1.4, 1.4, 2]} />
                    <meshStandardMaterial 
                        roughness={0.5} 
                        metalness={0.5} 
                        color={phase.color} 
                        emissive={BOSS_CONFIG.secondaryColor} 
                        emissiveIntensity={0.3} 
                    />
                </mesh>
                {/* Wings (Left / Right flapping) */}
                <mesh castShadow receiveShadow position={[-2.6, 0.8, 0]} rotation={[0, 0, 0.2]}>
                    <boxGeometry args={[2.2, 0.15, 3]} />
                    <meshStandardMaterial 
                        roughness={0.3} 
                        metalness={0.8} 
                        color={BOSS_CONFIG.secondaryColor} 
                        transparent 
                        opacity={0.85} 
                    />
                </mesh>
                <mesh castShadow receiveShadow position={[2.6, 0.8, 0]} rotation={[0, 0, -0.2]}>
                    <boxGeometry args={[2.2, 0.15, 3]} />
                    <meshStandardMaterial 
                        roughness={0.3} 
                        metalness={0.8} 
                        color={BOSS_CONFIG.secondaryColor} 
                        transparent 
                        opacity={0.85} 
                    />
                </mesh>
                {/* Glowing Eyes */}
                <mesh castShadow receiveShadow position={[-0.4, 1.7, 2.7]}>
                    <sphereGeometry args={[0.22, 8, 8]} />
                    <meshBasicMaterial color="#ff0000" toneMapped={false} />
                </mesh>
                <mesh castShadow receiveShadow position={[0.4, 1.7, 2.7]}>
                    <sphereGeometry args={[0.22, 8, 8]} />
                    <meshBasicMaterial color="#ff0000" toneMapped={false} />
                </mesh>
                <pointLight color={phase.color} intensity={2.5} distance={15} />
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

export const usePetSystem = () => {
    const [pets, setPets] = useState([]);
    const [petNotification, setPetNotification] = useState(null);
    const [petOrder, setPetOrder] = useState('follow'); // 'follow', 'stay', 'attack'
    const stayCoordinates = useRef([0, 0, 0]);
    const maxPets = 3;

    const tameMob = useCallback((mobId, mobType, mobPosition) => {
        if (pets.length >= maxPets) {
            setPetNotification('❌ You already have 3 pets! Release one first.');
            setTimeout(() => setPetNotification(null), 3000);
            return false;
        }

        if (mobType !== 'pig' && mobType !== 'cow') {
            setPetNotification('❌ Only pigs and cows can be tamed with wheat/apples!');
            setTimeout(() => setPetNotification(null), 3000);
            return false;
        }

        const petNames = ['Buddy', 'Patches', 'Barnaby', 'Coco', 'Fudge', 'Nugget', 'Waffles', 'Cookie'];
        const name = petNames[Math.floor(Math.random() * petNames.length)];

        const newPet = {
            id: mobId,
            type: mobType,
            name,
            position: [...mobPosition],
            health: mobType === 'cow' ? 120 : 70, // Slightly stronger stats
            maxHealth: mobType === 'cow' ? 120 : 70,
            tamedAt: Date.now(),
        };

        setPets(prev => [...prev, newPet]);
        setPetNotification(`❤️ Tamed! Say hello to your new pet ${name}!`);
        setTimeout(() => setPetNotification(null), 4000);

        return true;
    }, [pets.length]);

    // keydown listener for keyboard T key to cycle pet commands
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key.toLowerCase() === 't') {
                setPets(currentPets => {
                    if (currentPets.length === 0) return currentPets;
                    
                    setPetOrder(prev => {
                        let next = 'follow';
                        if (prev === 'follow') next = 'stay';
                        else if (prev === 'stay') next = 'attack';
                        
                        let msg = '';
                        if (next === 'follow') {
                            msg = '🐾 Pets ordered to: FOLLOW player';
                        } else if (next === 'stay') {
                            msg = '🐾 Pets ordered to: STAY at current location';
                            const pPos = useGameStore.getState().playerPosition;
                            if (pPos) {
                                stayCoordinates.current = [pPos.x, pPos.y, pPos.z];
                            }
                        } else if (next === 'attack') {
                            msg = '⚔️ Pets ordered to: ATTACK nearest hostile!';
                        }
                        
                        setPetNotification(msg);
                        setTimeout(() => setPetNotification(null), 3500);
                        return next;
                    });
                    return currentPets;
                });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        useGameStore.setState({ tameMob: tameMob });
        useGameStore.setState({ getPets: () => pets });
        useGameStore.setState({ petOrder: petOrder });
        useGameStore.setState({ stayCoordinates: stayCoordinates.current });
    }, [tameMob, pets, petOrder]);

    return { pets, petNotification, tameMob, petOrder };
};

export const PetIndicator = React.memo(({ pets }) => {
    const petOrder = useGameStore(state => state.petOrder || 'follow');
    if (pets.length === 0) return null;

    let badgeColor = 'rgba(34, 197, 94, 0.4)'; // green
    if (petOrder === 'stay') badgeColor = 'rgba(234, 179, 8, 0.4)'; // yellow
    if (petOrder === 'attack') badgeColor = 'rgba(239, 68, 68, 0.4)'; // red

    return (
        <div className="absolute bottom-40 left-4 z-20 pointer-events-none">
            <div
                className="px-4 py-3 rounded-xl space-y-2 max-w-[200px]"
                style={{
                    background: 'rgba(10, 10, 20, 0.85)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(168, 85, 247, 0.3)',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                }}
            >
                <div className="flex items-center justify-between border-b border-purple-500/20 pb-1">
                    <span className="text-purple-300 font-black text-[10px] uppercase tracking-wider">🐾 Pets ({pets.length}/3)</span>
                </div>
                
                {/* Active Command Overlay Badge */}
                <div 
                    className="text-center py-1 rounded-md text-[9px] font-extrabold uppercase text-white tracking-widest border border-white/10"
                    style={{ background: badgeColor }}
                >
                    Order: {petOrder}
                </div>

                <div className="space-y-1.5 pt-1">
                    {pets.map(pet => (
                        <div key={pet.id} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                                <span className="text-[14px]">{pet.type === 'pig' ? '🐷' : '🐮'}</span>
                                <span className="text-gray-200 font-bold truncate max-w-[80px]">{pet.name}</span>
                            </div>
                            <span className="text-green-400 font-extrabold text-[10px]">HP {pet.health}</span>
                        </div>
                    ))}
                </div>
                <div className="text-[8px] text-gray-500 text-center font-bold uppercase tracking-wider pt-0.5 border-t border-purple-500/10">
                    Press T to cycle order
                </div>
            </div>
        </div>
    );
});

export const PetEntities = React.memo(({ pets }) => {
    const { camera } = useThree();
    const petRefs = useRef({});

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
                if (!isNaN(groundY)) targetY = groundY + 0.5;
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
                        </mesh>
                        {/* Head */}
                        <mesh castShadow receiveShadow position={[0, 0.4, isPig ? 0.55 : 0.65]}>
                            <boxGeometry args={isPig ? [0.5, 0.5, 0.5] : [0.6, 0.6, 0.4]} />
                            <meshStandardMaterial
                                color={isPig ? '#ffa6c9' : '#8B5A2B'}
                                roughness={0.4}
                            />
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


const SPELL_UPGRADES = {
    fireball: {
        name: 'Fireball',
        icon: '🔥',
        levels: [
            { level: 1, damage: 50, manaCost: 15, name: 'Fireball I', xpCost: 0 },
            { level: 2, damage: 80, manaCost: 18, name: 'Fireball II', xpCost: 100 },
            { level: 3, damage: 120, manaCost: 22, name: 'Fireball III', xpCost: 300 },
        ],
    },
    iceball: {
        name: 'Iceball',
        icon: '❄️',
        levels: [
            { level: 1, damage: 40, manaCost: 12, name: 'Iceball I', xpCost: 0 },
            { level: 2, damage: 65, manaCost: 15, name: 'Iceball II', xpCost: 100 },
            { level: 3, damage: 100, manaCost: 19, name: 'Iceball III', xpCost: 300 },
        ],
    },
    lightning: {
        name: 'Lightning',
        icon: '⚡',
        levels: [
            { level: 1, damage: 75, manaCost: 25, name: 'Lightning I', xpCost: 0 },
            { level: 2, damage: 110, manaCost: 30, name: 'Lightning II', xpCost: 150 },
            { level: 3, damage: 160, manaCost: 35, name: 'Lightning III', xpCost: 400 },
        ],
    },
    arcane: {
        name: 'Arcane',
        icon: '💜',
        levels: [
            { level: 1, damage: 60, manaCost: 18, name: 'Arcane I', xpCost: 0 },
            { level: 2, damage: 90, manaCost: 22, name: 'Arcane II', xpCost: 120 },
            { level: 3, damage: 140, manaCost: 28, name: 'Arcane III', xpCost: 350 },
        ],
    },
};

export const useSpellUpgrades = () => {
    const [spellLevels, setSpellLevels] = useState({
        fireball: 1, iceball: 1, lightning: 1, arcane: 1,
    });
    const [upgradeNotification, setUpgradeNotification] = useState(null);

    const getSpellStats = useCallback((spellType) => {
        const upgrade = SPELL_UPGRADES[spellType];
        if (!upgrade) return null;
        const level = spellLevels[spellType] || 1;
        return upgrade.levels[level - 1];
    }, [spellLevels]);

    const upgradeSpell = useCallback((spellType) => {
        const upgrade = SPELL_UPGRADES[spellType];
        if (!upgrade) return false;

        const currentLevel = spellLevels[spellType] || 1;
        if (currentLevel >= 3) {
            setUpgradeNotification('⚠️ Spell is already at maximum level!');
            setTimeout(() => setUpgradeNotification(null), 2000);
            return false;
        }

        const nextLevel = upgrade.levels[currentLevel];
        if (!nextLevel) return false;

        const requiredLevel = nextLevel.xpCost <= 100 ? 2 : nextLevel.xpCost <= 200 ? 3 : 5;
        const playerLevel = useGameStore.getState().getPlayerLevel() || 1;

        if (playerLevel < requiredLevel) {
            setUpgradeNotification(`⚠️ Need Level ${requiredLevel} to upgrade ${upgrade.name}!`);
            setTimeout(() => setUpgradeNotification(null), 3000);
            return false;
        }

        setSpellLevels(prev => ({ ...prev, [spellType]: currentLevel + 1 }));
        setUpgradeNotification(`✨ ${nextLevel.name} unlocked! Damage: ${nextLevel.damage}, Cost: ${nextLevel.manaCost} MP`);
        setTimeout(() => setUpgradeNotification(null), 4000);

        return true;
    }, [spellLevels]);

    useEffect(() => {
        useGameStore.setState({ spellLevels: spellLevels });
        useGameStore.setState({ getSpellStats: getSpellStats });
        useGameStore.setState({ upgradeSpell: upgradeSpell });
    }, [spellLevels, getSpellStats, upgradeSpell]);

    return { spellLevels, getSpellStats, upgradeSpell, upgradeNotification, SPELL_UPGRADES };
};

export const SpellUpgradePanel = React.memo(({ spellLevels, onUpgrade, onClose }) => {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.7)' }}
        >
            <motion.div
                initial={{ scale: 0.8, y: 30 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.8, y: 30 }}
                className="p-6 max-w-md w-full mx-4"
                style={{
                    background: 'linear-gradient(135deg, rgba(15, 15, 35, 0.95), rgba(40, 10, 60, 0.95))',
                    border: '1px solid rgba(147, 51, 234, 0.4)',
                    borderRadius: '16px',
                    boxShadow: '0 0 40px rgba(147, 51, 234, 0.15)',
                }}
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-purple-400 text-xl font-bold">✨ Spell Upgrades</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">✕</button>
                </div>

                <div className="space-y-3">
                    {Object.entries(SPELL_UPGRADES).map(([key, spell]) => {
                        const currentLevel = spellLevels[key] || 1;
                        const currentStats = spell.levels[currentLevel - 1];
                        const nextStats = currentLevel < 3 ? spell.levels[currentLevel] : null;
                        const isMaxed = currentLevel >= 3;

                        return (
                            <div
                                key={key}
                                className="p-3 rounded-xl"
                                style={{
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                }}
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <span className="text-lg mr-2">{spell.icon}</span>
                                        <span className="text-white font-bold text-sm">{currentStats.name}</span>
                                    </div>
                                    <div className="flex gap-1">
                                        {[1, 2, 3].map(l => (
                                            <div
                                                key={l}
                                                className="w-3 h-3 rounded-full"
                                                style={{
                                                    background: l <= currentLevel
                                                        ? 'linear-gradient(135deg, #9333ea, #c084fc)'
                                                        : 'rgba(255,255,255,0.1)',
                                                    boxShadow: l <= currentLevel ? '0 0 5px #9333ea' : 'none',
                                                }}
                                            />
                                        ))}
                                    </div>
                                </div>

                                <div className="mt-2 flex items-center justify-between text-xs">
                                    <div className="text-gray-400">
                                        ⚔️ {currentStats.damage} DMG • 💙 {currentStats.manaCost} MP
                                    </div>
                                    {!isMaxed && nextStats ? (
                                        <button
                                            onClick={() => onUpgrade(key)}
                                            className="px-3 py-1 rounded-lg text-xs font-bold"
                                            style={{
                                                background: 'linear-gradient(135deg, #9333ea, #7c3aed)',
                                                color: 'white',
                                                boxShadow: '0 0 10px rgba(147,51,234,0.3)',
                                            }}
                                        >
                                            → {nextStats.damage} DMG (Lvl {nextStats.xpCost <= 100 ? 2 : nextStats.xpCost <= 200 ? 3 : 5})
                                        </button>
                                    ) : (
                                        <span className="text-yellow-400 text-xs font-bold">MAX ⭐</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </motion.div>
        </motion.div>
    );
});
