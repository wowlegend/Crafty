import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Outlines } from '@react-three/drei';
import { GameMethods } from './GameMethods';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from './store/useGameStore';
import { isCaptureMode } from './devtest/captureMode';
import { OUTLINE } from './render/characterStyle';
import { TIERS } from './render/quality';
import { Panel, Button, Slot, StatBar, Icon, Toast } from './ui/primitives/index.js';
import { useT } from './i18n/i18n.js';

export const useSurvivalMode = (isDay) => {
    const [nightCount, setNightCount] = useState(0);
    const [survivalWarning, setSurvivalWarning] = useState(null);
    const prevIsDay = useRef(true);

    useEffect(() => {
        if (prevIsDay.current && !isDay) {
            setNightCount(prev => prev + 1);
            setSurvivalWarning('Night has fallen... Hostile mobs are stronger!');
            setTimeout(() => setSurvivalWarning(null), 4000);
        }

        if (!prevIsDay.current && isDay) {
            setSurvivalWarning('Dawn breaks! You survived the night!');
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

    // Nightfall warnings read as danger; the dawn "you survived" message reads as a warn.
    const isNight = message.includes('Night');

    return (
        <motion.div
            initial={{ opacity: 0, y: -30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -30, scale: 0.9 }}
            className="absolute top-32 left-1/2 transform -translate-x-1/2 z-30 pointer-events-none"
        >
            <Toast status={isNight ? 'danger' : 'warn'} className="flex items-center justify-center gap-2 text-center font-bold text-lg px-6 py-3">
                <Icon name={isNight ? 'skull' : 'sun'} size={20} className="flex-none" />
                {message}
            </Toast>
        </motion.div>
    );
});

const BOSS_CONFIG = {
    name: 'Shadow Dragon',
    icon: 'dragon',
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
            setBossNotification('Warning: A Shadow Dragon is descending from the skies! [Level 5 Boss Event]');
            setTimeout(() => setBossNotification(null), 6000);

            const playerPos = useGameStore.getState().playerPosition;
            const x = playerPos ? playerPos.x + 25 : 25;
            const z = playerPos ? playerPos.z + 25 : 25;
            let y = 35; // Spawn high up
            if (useGameStore.getState().getMobGroundLevel) {
                const gy = useGameStore.getState().getMobGroundLevel(x, z);
                if (gy !== null && !isNaN(gy)) y = gy + 15;
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
                        alertMsg = 'PHASE 2: The Shadow Dragon lands! Pushing you back with ROARS!';
                    } else if (i === 2) {
                        alertMsg = 'PHASE 3: The Shadow Dragon is ENRAGED! Watch out for LAVA ZONES and Skeleton Summons!';
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
                setBossNotification('BOSS DEFEATED! You have slain the Shadow Dragon! +600 XP!');
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
        // Publish boss-active lifecycle to the STORE value (single source of truth).
        // This is the key SoundManager reads (`state.bossActive`) to start/stop the
        // boss battle music, and the store's `isBossActive()` function now returns it
        // too — so both paths stay in lockstep with the real boss lifecycle. Driven
        // here because every transition (level>=5 spawn, death, dev force-spawn) routes
        // through the local `bossActive` useState this effect is keyed on.
        useGameStore.getState().setBossActive(bossActive);
        // Dev-only force-spawn for the boss-closeup visual fixture: drops the dragon at a
        // fixed sky-studio position with no level/HP gate. Tree-shaken from prod builds.
        if (import.meta.env.DEV) {
            useGameStore.setState({ forceBossSpawn: (pos) => {
                bossSpawned.current = true;
                bossPositionRef.current = pos;
                setBossActive(true);
                setBossPhase(0);
            } });
        }
    }, [damageBoss, bossPositionRef, bossActive]);

    // A5 dangerLevel bridge: an ACTIVE Shadow Dragon drives the obsidian danger mood
    // (dangerLevel=2 -> moodTarget=2 -> the obsidian atmosphere/grade), cleared to 0 on
    // defeat/despawn. Without this, nothing in prod ever writes dangerLevel, so the
    // boss-obsidian signature mood never fired in real play (S1-audit A5 gap). Capture
    // fixtures drive mood via dev hooks, so skip there to keep the visual gate stable.
    useEffect(() => {
        if (useGameStore.getState().isCaptureMode) return;
        useGameStore.getState().setDangerLevel(bossActive ? 2 : 0);
    }, [bossActive]);

    return {
        bossActive, bossHealth, bossMaxHealth, bossPositionRef,
        bossDefeated, bossPhase, bossNotification, damageBoss,
    };
};

export const BossHealthBar = React.memo(({ bossActive, bossHealth, bossMaxHealth, bossPhase }) => {
    if (!bossActive) return null;

    const hpPercent = (bossHealth / bossMaxHealth) * 100;

    let subText = 'Phase 1: Aerial Barrage';
    if (bossPhase === 1) subText = 'Phase 2: Grounded Carnage [Knockback Roars]';
    if (bossPhase === 2) subText = 'Phase 3: Enraged Inferno [Lava Circles & Summons]';

    return (
        <div className="absolute top-36 left-1/2 transform -translate-x-1/2 z-20 pointer-events-none" style={{ width: 450 }}>
            <Panel variant="raise" className="px-4 py-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 font-display uppercase tracking-wide text-danger text-base leading-none">
                        <Icon name="dragon" size={18} className="flex-none" /> {BOSS_CONFIG.name}
                    </span>
                    <span className="text-text-muted font-bold text-xs text-right">
                        {subText}
                    </span>
                </div>
                {/* Bold-flat boss bar: inset danger StatBar replaces the emissive gradient. */}
                <StatBar kind="health" value={bossHealth} max={bossMaxHealth} className="w-full" />
                <div className="mt-1.5 flex justify-between text-[10px] text-text-muted font-semibold tabular-nums">
                    <span>HP {bossHealth} / {bossMaxHealth}</span>
                    <span>{Math.round(hpPercent)}% REMAINING</span>
                </div>
            </Panel>
        </div>
    );
});

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
            setPetNotification('You already have 3 pets! Release one first.');
            setTimeout(() => setPetNotification(null), 3000);
            return false;
        }

        if (mobType !== 'pig' && mobType !== 'cow') {
            setPetNotification('Only pigs and cows can be tamed with wheat/apples!');
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
        setPetNotification(`Tamed! Say hello to your new pet ${name}!`);
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
                            msg = 'Pets ordered to: FOLLOW player';
                        } else if (next === 'stay') {
                            msg = 'Pets ordered to: STAY at current location';
                            const pPos = useGameStore.getState().playerPosition;
                            if (pPos) {
                                stayCoordinates.current = [pPos.x, pPos.y, pPos.z];
                            }
                        } else if (next === 'attack') {
                            msg = 'Pets ordered to: ATTACK nearest hostile!';
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

    // Order badge -> flat status fill (follow=success/green, stay=warn/amber, attack=danger/red).
    let orderFill = 'bg-success';
    if (petOrder === 'stay') orderFill = 'bg-warn';
    if (petOrder === 'attack') orderFill = 'bg-danger';

    return (
        <div className="absolute bottom-40 left-4 z-20 pointer-events-none">
            <Panel variant="raise" className="px-4 py-3 space-y-2 max-w-[200px]">
                <div className="flex items-center justify-between border-b-chrome border-ink pb-1">
                    <span className="font-display text-[10px] uppercase tracking-wider text-accent">Pets ({pets.length}/3)</span>
                </div>

                {/* Active Command Overlay Badge — flat status fill */}
                <div className={`text-center py-1 rounded-sm text-[9px] font-display uppercase text-text-inverse tracking-widest border-chrome border-ink ${orderFill}`}>
                    Order: {petOrder}
                </div>

                <div className="space-y-1.5 pt-1">
                    {pets.map(pet => (
                        <div key={pet.id} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                                <Icon name={pet.type === 'pig' ? 'pig' : 'cow'} size={14} className="flex-none text-accent" />
                                <span className="text-text font-bold truncate max-w-[80px]">{pet.name}</span>
                            </div>
                            <span className="text-success font-bold text-[10px] tabular-nums">HP {pet.health}</span>
                        </div>
                    ))}
                </div>
                <div className="text-[8px] text-text-muted text-center font-bold uppercase tracking-wider pt-0.5 border-t-chrome border-ink">
                    Press T to cycle order
                </div>
            </Panel>
        </div>
    );
});

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


const SPELL_UPGRADES = {
    fireball: {
        name: 'Fireball',
        icon: 'fire',
        levels: [
            { level: 1, damage: 50, manaCost: 15, name: 'Fireball I', xpCost: 0 },
            { level: 2, damage: 80, manaCost: 18, name: 'Fireball II', xpCost: 100 },
            { level: 3, damage: 120, manaCost: 22, name: 'Fireball III', xpCost: 300 },
        ],
    },
    iceball: {
        name: 'Iceball',
        icon: 'ice',
        levels: [
            { level: 1, damage: 40, manaCost: 12, name: 'Iceball I', xpCost: 0 },
            { level: 2, damage: 65, manaCost: 15, name: 'Iceball II', xpCost: 100 },
            { level: 3, damage: 100, manaCost: 19, name: 'Iceball III', xpCost: 300 },
        ],
    },
    lightning: {
        name: 'Lightning',
        icon: 'lightning',
        levels: [
            { level: 1, damage: 75, manaCost: 25, name: 'Lightning I', xpCost: 0 },
            { level: 2, damage: 110, manaCost: 30, name: 'Lightning II', xpCost: 150 },
            { level: 3, damage: 160, manaCost: 35, name: 'Lightning III', xpCost: 400 },
        ],
    },
    arcane: {
        name: 'Arcane',
        icon: 'arcane',
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
            setUpgradeNotification('Spell is already at maximum level!');
            setTimeout(() => setUpgradeNotification(null), 2000);
            return false;
        }

        const nextLevel = upgrade.levels[currentLevel];
        if (!nextLevel) return false;

        const requiredLevel = nextLevel.xpCost <= 100 ? 2 : nextLevel.xpCost <= 200 ? 3 : 5;
        const playerLevel = useGameStore.getState().getPlayerLevel() || 1;

        if (playerLevel < requiredLevel) {
            setUpgradeNotification(`Need Level ${requiredLevel} to upgrade ${upgrade.name}!`);
            setTimeout(() => setUpgradeNotification(null), 3000);
            return false;
        }

        setSpellLevels(prev => ({ ...prev, [spellType]: currentLevel + 1 }));
        setUpgradeNotification(`${nextLevel.name} unlocked! Damage: ${nextLevel.damage}, Cost: ${nextLevel.manaCost} MP`);
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

export const SpellUpgradePanel = React.memo(({ onClose }) => {
    const t = useT();
    const talentPoints = useGameStore(state => state.talentPoints || 0);
    const unlockedTalents = useGameStore(state => state.unlockedTalents || {});
    const spendTalentPoint = useGameStore(state => state.spendTalentPoint);
    const getPlayerLevel = useGameStore(state => state.getPlayerLevel);
    const playerLevel = getPlayerLevel ? getPlayerLevel() : 1;

    // Branch accents map to the spell token family (fire / ice / lightning -> shown as
    // arcane purple to match the original indigo column). `accent` drives the header text
    // color + the filled rank pip; `dot` is the filled-pip token class.
    const branches = [
        {
            title: 'Pyromancy & Storm',
            icon: 'fire',
            accent: 'text-spell-fire',
            dot: 'bg-spell-fire',
            nodes: [
                { id: 'ember_core', name: 'Ember Core', desc: 'Unlocks Fireball. Increases Fireball damage +15% per point.', limit: 3, prereq: null },
                { id: 'fire_blast', name: 'Fire Blast', desc: 'Adds +20% critical strike chance to Fireball.', limit: 3, prereq: 'ember_core' },
                { id: 'conflagration', name: 'Conflagration', desc: 'Adds dynamic explosion splash to Fireball impacts.', limit: 1, prereq: 'fire_blast' },
                { id: 'storm_caller', name: 'Storm Caller', desc: 'Unlocks Lightning. Increases Lightning damage +20% per point.', limit: 3, prereq: null },
                { id: 'chain_overload', name: 'Chain Overload', desc: 'Lightning strikes have 30% chance to chain to mobs.', limit: 2, prereq: 'storm_caller' }
            ]
        },
        {
            title: 'Cryomancy & Abjuration',
            icon: 'ice',
            accent: 'text-spell-ice',
            dot: 'bg-spell-ice',
            nodes: [
                { id: 'frost_shield', name: 'Frost Shield', desc: 'Unlocks Iceball. Grants +5 physical armor per point.', limit: 3, prereq: null },
                { id: 'permafrost', name: 'Permafrost', desc: 'Iceball slows mob movement speed by 40% for 3 seconds.', limit: 2, prereq: 'frost_shield' },
                { id: 'glacial_chill', name: 'Glacial Chill', desc: 'Iceball freezes mobs completely for 1.5s on critical hits.', limit: 1, prereq: 'permafrost' }
            ]
        },
        {
            title: 'Arcane & Chronomancy',
            icon: 'arcane',
            accent: 'text-spell-arcane',
            dot: 'bg-spell-arcane',
            nodes: [
                { id: 'mana_flow', name: 'Mana Flow', desc: 'Unlocks Arcane. Increases maximum mana limit by +30 per point.', limit: 3, prereq: null },
                { id: 'time_warp', name: 'Time Warp', desc: 'Reduces dodge roll cooldown by 20% per point.', limit: 2, prereq: 'mana_flow' },
                { id: 'astral_focus', name: 'Astral Focus', desc: 'Regenerates +5 Mana per second passively.', limit: 2, prereq: 'mana_flow' }
            ]
        }
    ];

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto bg-ink/75"
        >
            <motion.div
                initial={{ scale: 0.9, y: 30 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 30 }}
                className="max-w-5xl w-full"
            >
                <Panel variant="raise" className="p-6 flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6 pb-4 border-b-chrome border-ink">
                        <div>
                            <h2 className="flex items-center gap-2 font-display text-3xl uppercase tracking-wide text-accent">
                                <Icon name="sparkles" size={28} className="flex-none" /> Class Skill Talent Tree
                            </h2>
                            <p className="text-text-muted text-xs mt-1">Spend Talent Points earned by leveling up to unlock powerful elemental abilities</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <Panel variant="inset" className="px-4 py-2 bg-slot text-center">
                                <div className="text-xs text-text-muted font-bold uppercase tracking-wider">Talent Points</div>
                                <div className="font-display text-2xl text-accent tabular-nums">{talentPoints}</div>
                            </Panel>
                            <Panel variant="inset" className="px-4 py-2 bg-slot text-center">
                                <div className="text-xs text-text-muted font-bold uppercase tracking-wider">Player Level</div>
                                <div className="font-display text-2xl text-spell-arcane tabular-nums">{playerLevel}</div>
                            </Panel>
                            <Button variant="ghost" size="sm" aria-label={t('ui.close')} onClick={onClose} className="w-10 h-10 p-0 text-text-muted">
                                <Icon name="close" size={18} />
                            </Button>
                        </div>
                    </div>

                    {/* Branches Columns Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {branches.map((branch, index) => (
                            <Panel key={index} variant="inset" className="p-4 bg-panel flex flex-col gap-4">
                                <h3 className={`flex items-center justify-center gap-2 font-display text-lg text-center border-b-chrome border-ink pb-2 ${branch.accent}`}>
                                    {branch.icon && <Icon name={branch.icon} size={18} className="flex-none" />}
                                    <span>{branch.title}</span>
                                </h3>
                                <div className="flex flex-col gap-3.5">
                                    {branch.nodes.map((node) => {
                                        const currentLvl = unlockedTalents[node.id] || 0;
                                        const isPrereqMet = !node.prereq || (unlockedTalents[node.prereq] || 0) > 0;
                                        const isMaxed = currentLvl >= node.limit;
                                        const canUpgrade = talentPoints > 0 && isPrereqMet && !isMaxed;

                                        return (
                                            <Panel
                                                key={node.id}
                                                variant="inset"
                                                className={`p-3 relative ${
                                                    isMaxed
                                                        ? 'bg-slot'
                                                        : !isPrereqMet
                                                        ? 'bg-panel-inset opacity-40'
                                                        : 'bg-slot'
                                                }`}
                                            >
                                                {/* Prerequisite lock overlay */}
                                                {!isPrereqMet && (
                                                    <div className="absolute top-2 right-2 text-xs text-danger flex items-center gap-1 font-bold">
                                                        <Icon name="lock" size={12} className="flex-none" /> Locked
                                                    </div>
                                                )}

                                                <div className="flex items-center justify-between">
                                                    <div className="font-bold text-sm text-text">{node.name}</div>
                                                    <div className="flex gap-0.5">
                                                        {Array.from({ length: node.limit }).map((_, l) => (
                                                            <div
                                                                key={l}
                                                                className={`w-2.5 h-2.5 rounded-sm border-chrome border-ink ${
                                                                    l < currentLvl ? branch.dot : 'bg-track'
                                                                }`}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>

                                                <p className="text-text-muted text-xs mt-1.5 leading-relaxed">{node.desc}</p>

                                                {node.prereq && (
                                                    <div className="text-[10px] text-spell-arcane mt-1 font-bold">
                                                        Prerequisite: {branch.nodes.find(n => n.id === node.prereq)?.name || node.prereq}
                                                    </div>
                                                )}

                                                <div className="mt-3 flex items-center justify-between border-t-chrome border-ink pt-2">
                                                    <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider tabular-nums">
                                                        Rank {currentLvl}/{node.limit}
                                                    </span>
                                                    {isMaxed ? (
                                                        <span className="inline-flex items-center gap-1 text-[10px] text-accent font-display uppercase tracking-wider">Max Rank <Icon name="star" size={12} className="flex-none" /></span>
                                                    ) : isPrereqMet ? (
                                                        <Button
                                                            variant="primary"
                                                            size="sm"
                                                            disabled={!canUpgrade}
                                                            onClick={() => spendTalentPoint(node.id)}
                                                            className="px-3 py-1 text-[10px] tracking-widest"
                                                        >
                                                            Upgrade
                                                        </Button>
                                                    ) : (
                                                        <span className="text-[10px] text-danger font-bold">Requires Parent Node</span>
                                                    )}
                                                </div>
                                            </Panel>
                                        );
                                    })}
                                </div>
                            </Panel>
                        ))}
                    </div>
                </Panel>
            </motion.div>
        </motion.div>
    );
});

export const ChestInventoryPanel = React.memo(({ coords, onClose }) => {
    const t = useT();
    const playerInventory = useGameStore(state => state.inventory?.blocks || {});
    const chestsMap = useGameStore(state => state.chests || new Map());
    const transferItem = useGameStore(state => state.transferItem);

    const chestData = chestsMap.get(coords) || { inventory: {}, name: 'Wooden Chest' };
    const chestInventory = chestData.inventory || {};

    const availableItems = Object.entries(playerInventory).filter(([_, qty]) => qty > 0);
    const chestItems = Object.entries(chestInventory).filter(([_, qty]) => qty > 0);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto bg-ink/75"
        >
            <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="max-w-3xl w-full"
            >
                <Panel variant="raise" className="p-6 flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6 pb-4 border-b-chrome border-ink">
                        <div>
                            <h2 className="font-display text-2xl uppercase tracking-wide text-accent flex items-center gap-2">
                                <Icon name="chest-open" size={24} className="flex-none" /> Storage Container Chest
                            </h2>
                            <p className="text-text-muted text-xs mt-1">Coordinate Grid Position: {coords}</p>
                        </div>
                        <Button variant="ghost" size="sm" aria-label={t('ui.close')} onClick={onClose} className="w-10 h-10 p-0 text-text-muted">
                            <Icon name="close" size={18} />
                        </Button>
                    </div>

                    {/* Double Columns grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Player inventory panel */}
                        <Panel variant="inset" className="p-4 bg-panel flex flex-col gap-3">
                            <h3 className="flex items-center gap-2 font-display text-sm text-text uppercase tracking-widest border-b-chrome border-ink pb-2"><Icon name="backpack" size={16} className="flex-none" /> Player Backpack Inventory</h3>
                            {availableItems.length === 0 ? (
                                <div className="py-8 text-center text-xs text-text-muted">Your backpack is completely empty.</div>
                            ) : (
                                <div className="grid grid-cols-4 gap-2 max-h-60 overflow-y-auto pr-1">
                                    {availableItems.map(([item, qty]) => (
                                        <Slot
                                            key={item}
                                            onClick={() => transferItem(coords, item, 1, 'to_chest')}
                                            className="!aspect-auto p-2 cursor-pointer active:translate-x-[2px] active:translate-y-[2px] transition-transform duration-150 flex flex-col justify-between items-center min-h-16"
                                        >
                                            <div className="text-text text-xs font-bold truncate max-w-full">{item}</div>
                                            <div className="px-2 py-0.5 rounded-sm bg-track text-[10px] text-text-muted font-bold mt-1 tabular-nums">x{qty}</div>
                                        </Slot>
                                    ))}
                                </div>
                            )}
                            <p className="text-[10px] text-text-muted text-center mt-2">Click on items to transfer them to the chest.</p>
                        </Panel>

                        {/* Chest inventory panel */}
                        <Panel variant="inset" className="p-4 bg-panel flex flex-col gap-3">
                            <h3 className="flex items-center gap-2 font-display text-sm text-accent uppercase tracking-widest border-b-chrome border-ink pb-2"><Icon name="chest-open" size={16} className="flex-none" /> Storage Vault Inventory</h3>
                            {chestItems.length === 0 ? (
                                <div className="py-8 text-center text-xs text-text-muted">This chest container is currently empty.</div>
                            ) : (
                                <div className="grid grid-cols-4 gap-2 max-h-60 overflow-y-auto pr-1">
                                    {chestItems.map(([item, qty]) => (
                                        <Slot
                                            key={item}
                                            onClick={() => transferItem(coords, item, 1, 'from_chest')}
                                            className="!aspect-auto p-2 cursor-pointer active:translate-x-[2px] active:translate-y-[2px] transition-transform duration-150 flex flex-col justify-between items-center min-h-16"
                                        >
                                            <div className="text-accent text-xs font-bold truncate max-w-full">{item}</div>
                                            <div className="px-2 py-0.5 rounded-sm bg-track text-[10px] text-text-muted font-bold mt-1 tabular-nums">x{qty}</div>
                                        </Slot>
                                    ))}
                                </div>
                            )}
                            <p className="text-[10px] text-text-muted text-center mt-2">Click on items to retrieve them to your backpack.</p>
                        </Panel>
                    </div>
                </Panel>
            </motion.div>
        </motion.div>
    );
});
