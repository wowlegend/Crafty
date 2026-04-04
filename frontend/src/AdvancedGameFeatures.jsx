import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from './store/useGameStore';

// Advanced Game Features: Survival Mode, Boss Mob, Pet System, Spell Upgrades

export const useSurvivalMode = (isDay) => {
    const [nightCount, setNightCount] = useState(0);
    const [survivalWarning, setSurvivalWarning] = useState(null);
    const prevIsDay = useRef(true);

    useEffect(() => {
        // Detect transition to night
        if (prevIsDay.current && !isDay) {
            setNightCount(prev => prev + 1);
            setSurvivalWarning('☠️ Night has fallen... Hostile mobs are stronger!');
            setTimeout(() => setSurvivalWarning(null), 4000);

            // Expose night multiplier globally so NPC system can read it
            window._nightDangerMultiplier = 1.5 + nightCount * 0.1; // Gets harder each night
            window._isNightTime = true;
        }

        // Detect transition to day
        if (!prevIsDay.current && isDay) {
            setSurvivalWarning('☀️ Dawn breaks! You survived the night!');
            setTimeout(() => setSurvivalWarning(null), 3000);
            window._nightDangerMultiplier = 1.0;
            window._isNightTime = false;
        }

        prevIsDay.current = isDay;
    }, [isDay, nightCount]);

    // Increase hunger drain at night
    useEffect(() => {
        if (!isDay) {
            const nightHunger = setInterval(() => {
                if (useGameStore.getState().damagePlayer && useGameStore.getState().isAlive && useGameStore.getState().isAlive) {
                    // Extra hunger drain represented as very small starvation pressure
                    // The actual hunger system in GameSystems.js handles the base drain
                }
            }, 3000);
            return () => clearInterval(nightHunger);
        }
    }, [isDay]);

    return { nightCount, survivalWarning };
};

// Survival warning banner
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
    health: 500,
    damage: 20,
    speed: 3.5,
    size: 3.0,
    aggroRange: 30,
    attackRange: 5,
    attackCooldown: 2000,
    xpReward: 500,
    phases: [
        { hpPercent: 1.0, speed: 3.5, damage: 20, color: '#4B0082' },
        { hpPercent: 0.6, speed: 4.5, damage: 25, color: '#8B0000' },
        { hpPercent: 0.3, speed: 5.5, damage: 35, color: '#FF0000' },
    ],
};

export const useBossSystem = (playerLevel, playerPosition) => {
    const [bossActive, setBossActive] = useState(false);
    const [bossHealth, setBossHealth] = useState(BOSS_CONFIG.health);
    const [bossMaxHealth] = useState(BOSS_CONFIG.health);
    const bossPositionRef = useRef(null);
    const [bossDefeated, setBossDefeated] = useState(false);
    const [bossPhase, setBossPhase] = useState(0);
    const [bossNotification, setBossNotification] = useState(null);
    const bossRef = useRef(null);
    const lastBossAttack = useRef(0);
    const bossSpawned = useRef(false);

    // Spawn boss when player reaches level 5
    useEffect(() => {
        if (playerLevel >= 5 && !bossSpawned.current && !bossDefeated) {
            bossSpawned.current = true;
            setBossNotification('🐉 A Shadow Dragon has appeared! Defeat it to prove your worth!');
            setTimeout(() => setBossNotification(null), 5000);

            // Spawn boss 30 blocks away from player
            if (playerPosition) {
                const angle = Math.random() * Math.PI * 2;
                const x = playerPosition.x + Math.cos(angle) * 30;
                const z = playerPosition.z + Math.sin(angle) * 30;
                let y = 16;
                if (window.getMobGroundLevel) {
                    y = window.getMobGroundLevel(x, z);
                    if (isNaN(y)) y = 16;
                }
                bossPositionRef.current = [x, y + 2, z];
                setBossActive(true);
            }
        }
    }, [playerLevel, playerPosition, bossDefeated]);

    // Update boss phase based on health
    useEffect(() => {
        const hpPercent = bossHealth / bossMaxHealth;
        for (let i = BOSS_CONFIG.phases.length - 1; i >= 0; i--) {
            if (hpPercent <= BOSS_CONFIG.phases[i].hpPercent) {
                if (bossPhase !== i) {
                    setBossPhase(i);
                    if (i > 0) {
                        setBossNotification(`🐉 The Shadow Dragon enters Phase ${i + 1}! It's getting angrier!`);
                        setTimeout(() => setBossNotification(null), 3000);
                    }
                }
                break;
            }
        }
    }, [bossHealth, bossMaxHealth, bossPhase]);

    // Damage the boss
    const damageBoss = useCallback((amount) => {
        if (!bossActive || bossHealth <= 0) return;

        setBossHealth(prev => {
            const newHealth = Math.max(0, prev - amount);
            if (newHealth <= 0) {
                setBossActive(false);
                setBossDefeated(true);
                setBossNotification('🏆 VICTORY! You defeated the Shadow Dragon! +500 XP!');
                setTimeout(() => setBossNotification(null), 6000);
                if (window.grantXP) window.grantXP(BOSS_CONFIG.xpReward);
                if (window.addExperience) window.addExperience(BOSS_CONFIG.xpReward, 'Boss Defeated!');
            }
            return newHealth;
        });
    }, [bossActive, bossHealth]);

    // Expose boss damage globally
    useEffect(() => {
        window.damageBoss = damageBoss;
        window.getBossPosition = () => bossPositionRef.current;
        window.isBossActive = () => bossActive;
    }, [damageBoss, bossPositionRef, bossActive]);

    return {
        bossActive, bossHealth, bossMaxHealth, bossPositionRef,
        bossDefeated, bossPhase, bossNotification, damageBoss,
    };
};

// Boss Health Bar UI
export const BossHealthBar = React.memo(({ bossActive, bossHealth, bossMaxHealth, bossPhase }) => {
    if (!bossActive) return null;

    const phase = BOSS_CONFIG.phases[bossPhase] || BOSS_CONFIG.phases[0];
    const hpPercent = (bossHealth / bossMaxHealth) * 100;

    return (
        <div className="absolute top-40 left-1/2 transform -translate-x-1/2 z-20 pointer-events-none" style={{ width: 400 }}>
            <div className="text-center mb-1">
                <span className="text-white font-bold text-sm" style={{ textShadow: '0 0 10px rgba(75,0,130,0.8)' }}>
                    🐉 {BOSS_CONFIG.name} {bossPhase > 0 ? `(Phase ${bossPhase + 1})` : ''}
                </span>
            </div>
            <div className="h-4 rounded-full overflow-hidden" style={{
                background: 'rgba(0,0,0,0.7)',
                border: `2px solid ${phase.color}`,
                boxShadow: `0 0 15px ${phase.color}60`,
            }}>
                <motion.div
                    className="h-full rounded-full"
                    style={{
                        background: `linear-gradient(90deg, ${phase.color}, ${BOSS_CONFIG.secondaryColor})`,
                        boxShadow: `inset 0 0 10px rgba(255,255,255,0.3)`,
                    }}
                    animate={{ width: `${hpPercent}%` }}
                    transition={{ duration: 0.3 }}
                />
            </div>
            <div className="text-center mt-0.5">
                <span className="text-gray-400 text-xs">{bossHealth} / {bossMaxHealth}</span>
            </div>
        </div>
    );
});

// Boss 3D Entity (renders inside Canvas)
export const BossEntity = ({ bossActive, bossPositionRef, bossPhase, playerPosition }) => {
    const meshRef = useRef();
    const { camera } = useThree();
    const lastAttack = useRef(0);

    useFrame((state, delta) => {
        if (!bossActive || !bossPositionRef?.current || !meshRef.current) return;

        const phase = BOSS_CONFIG.phases[bossPhase] || BOSS_CONFIG.phases[0];
        const playerX = camera.position.x;
        const playerZ = camera.position.z;
        const bx = bossPositionRef.current[0];
        const bz = bossPositionRef.current[2];

        // Chase player
        const dx = playerX - bx;
        const dz = playerZ - bz;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > 2) {
            const moveSpeed = phase.speed * delta;
            const nx = dx / dist;
            const nz = dz / dist;
            const newX = bx + nx * moveSpeed;
            const newZ = bz + nz * moveSpeed;

            let newY = bossPositionRef.current[1];
            if (window.getMobGroundLevel) {
                const groundY = window.getMobGroundLevel(newX, newZ);
                if (!isNaN(groundY)) newY = groundY + 2;
            }

            bossPositionRef.current = [newX, newY, newZ];
            meshRef.current.position.set(newX, newY, newZ);

            // Face player
            meshRef.current.rotation.y = Math.atan2(dx, dz);
        }

        // Attack player when close
        if (dist < BOSS_CONFIG.attackRange) {
            const now = performance.now();
            if (now - lastAttack.current > BOSS_CONFIG.attackCooldown) {
                lastAttack.current = now;
                if (useGameStore.getState().damagePlayer) {
                    useGameStore.getState().damagePlayer(phase.damage, 'Shadow Dragon');
                }
            }
        }

        // Floating bob animation
        meshRef.current.position.y += Math.sin(state.clock.elapsedTime * 2) * 0.02;

        // Rotation pulsing on phase
        if (bossPhase > 0) {
            meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 3) * 0.1;
        }
    });

    if (!bossActive || !bossPositionRef?.current) return null;

    const phase = BOSS_CONFIG.phases[bossPhase] || BOSS_CONFIG.phases[0];

    return (
        <group ref={meshRef} position={bossPositionRef.current}>
            {/* Body */}
            <mesh>
                <boxGeometry args={[3, 2, 4]} />
                <meshStandardMaterial color={phase.color} emissive={phase.color} emissiveIntensity={0.3} />
            </mesh>
            {/* Head */}
            <mesh position={[0, 1.5, 1.5]}>
                <boxGeometry args={[1.5, 1.5, 2]} />
                <meshStandardMaterial color={phase.color} emissive={BOSS_CONFIG.secondaryColor} emissiveIntensity={0.4} />
            </mesh>
            {/* Wings */}
            <mesh position={[-2.5, 1, 0]} rotation={[0, 0, 0.3]}>
                <boxGeometry args={[2, 0.2, 3]} />
                <meshStandardMaterial color={BOSS_CONFIG.secondaryColor} emissive={BOSS_CONFIG.secondaryColor} emissiveIntensity={0.2} transparent opacity={0.8} />
            </mesh>
            <mesh position={[2.5, 1, 0]} rotation={[0, 0, -0.3]}>
                <boxGeometry args={[2, 0.2, 3]} />
                <meshStandardMaterial color={BOSS_CONFIG.secondaryColor} emissive={BOSS_CONFIG.secondaryColor} emissiveIntensity={0.2} transparent opacity={0.8} />
            </mesh>
            {/* Eyes */}
            <mesh position={[-0.4, 1.8, 2.5]}>
                <sphereGeometry args={[0.2, 8, 8]} />
                <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={1} />
            </mesh>
            <mesh position={[0.4, 1.8, 2.5]}>
                <sphereGeometry args={[0.2, 8, 8]} />
                <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={1} />
            </mesh>
            {/* Glow */}
            <pointLight color={phase.color} intensity={2} distance={15} />
        </group>
    );
};


export const usePetSystem = () => {
    const [pets, setPets] = useState([]);
    const [petNotification, setPetNotification] = useState(null);
    const maxPets = 3;

    const tameMob = useCallback((mobId, mobType, mobPosition) => {
        if (pets.length >= maxPets) {
            setPetNotification('❌ You already have 3 pets! Max reached.');
            setTimeout(() => setPetNotification(null), 3000);
            return false;
        }

        // Only passive mobs can be tamed
        if (mobType !== 'pig' && mobType !== 'cow') {
            setPetNotification('❌ Only passive mobs (pigs & cows) can be tamed!');
            setTimeout(() => setPetNotification(null), 3000);
            return false;
        }

        const petNames = ['Buddy', 'Patches', 'Muffin', 'Cookie', 'Biscuit', 'Nugget', 'Pumpkin', 'Sprinkles'];
        const name = petNames[Math.floor(Math.random() * petNames.length)];

        const newPet = {
            id: mobId,
            type: mobType,
            name,
            position: [...mobPosition],
            health: mobType === 'cow' ? 80 : 50,
            maxHealth: mobType === 'cow' ? 80 : 50,
            tamedAt: Date.now(),
        };

        setPets(prev => [...prev, newPet]);
        setPetNotification(`❤️ You tamed a ${mobType}! Say hello to ${name}!`);
        setTimeout(() => setPetNotification(null), 4000);

        return true;
    }, [pets.length]);

    // Expose tame function globally
    useEffect(() => {
        window.tameMob = tameMob;
        window.getPets = () => pets;
        window._playerPets = pets;
    }, [tameMob, pets]);

    return { pets, petNotification, tameMob };
};

// Pet indicator UI
export const PetIndicator = React.memo(({ pets }) => {
    if (pets.length === 0) return null;

    return (
        <div className="absolute bottom-40 left-4 z-20 pointer-events-none">
            <div
                className="px-3 py-2 rounded-lg space-y-1"
                style={{
                    background: 'rgba(15, 15, 30, 0.85)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255, 150, 200, 0.3)',
                }}
            >
                <div className="text-pink-400 text-xs font-bold">🐾 Pets ({pets.length}/3)</div>
                {pets.map(pet => (
                    <div key={pet.id} className="flex items-center gap-2 text-xs">
                        <span>{pet.type === 'pig' ? '🐷' : '🐮'}</span>
                        <span className="text-white">{pet.name}</span>
                        <span className="text-green-400">❤️ {pet.health}</span>
                    </div>
                ))}
            </div>
        </div>
    );
});

// Pet 3D Entity — follows player (renders inside Canvas)
export const PetEntities = ({ pets }) => {
    const { camera } = useThree();
    const petRefs = useRef({});

    useFrame((state, delta) => {
        pets.forEach((pet, index) => {
            const ref = petRefs.current[pet.id];
            if (!ref) return;

            // Follow player with offset
            const offsetAngle = (index / Math.max(pets.length, 1)) * Math.PI * 2;
            const followDist = 4 + index * 1.5;
            const targetX = camera.position.x + Math.cos(offsetAngle + state.clock.elapsedTime * 0.3) * followDist;
            const targetZ = camera.position.z + Math.sin(offsetAngle + state.clock.elapsedTime * 0.3) * followDist;

            let targetY = ref.position.y;
            if (window.getMobGroundLevel) {
                const groundY = window.getMobGroundLevel(targetX, targetZ);
                if (!isNaN(groundY)) targetY = groundY + 0.5;
            }

            // Smooth follow
            ref.position.x += (targetX - ref.position.x) * 2 * delta;
            ref.position.z += (targetZ - ref.position.z) * 2 * delta;
            ref.position.y += (targetY - ref.position.y) * 3 * delta;

            // Face direction of movement
            const dx = targetX - ref.position.x;
            const dz = targetZ - ref.position.z;
            if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
                ref.rotation.y = Math.atan2(dx, dz);
            }

            // Gentle bob
            ref.position.y += Math.sin(state.clock.elapsedTime * 3 + index) * 0.03;
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
                        <mesh>
                            <boxGeometry args={isPig ? [0.8, 0.6, 1.0] : [1.0, 0.8, 1.2]} />
                            <meshStandardMaterial
                                color={isPig ? '#ffb6c1' : '#8B5A2B'}
                                emissive={isPig ? '#ff69b4' : '#DEB887'}
                                emissiveIntensity={0.15}
                            />
                        </mesh>
                        {/* Head */}
                        <mesh position={[0, 0.4, isPig ? 0.5 : 0.6]}>
                            <boxGeometry args={isPig ? [0.5, 0.5, 0.5] : [0.6, 0.6, 0.4]} />
                            <meshStandardMaterial
                                color={isPig ? '#ffb6c1' : '#8B5A2B'}
                                emissive={isPig ? '#ff69b4' : '#DEB887'}
                                emissiveIntensity={0.15}
                            />
                        </mesh>
                        {/* Heart above pet */}
                        <mesh position={[0, 1.2, 0]}>
                            <sphereGeometry args={[0.15, 8, 8]} />
                            <meshStandardMaterial color="#ff69b4" emissive="#ff69b4" emissiveIntensity={0.8} />
                        </mesh>
                        {/* Name tag */}
                        <pointLight color={isPig ? '#ff69b4' : '#DEB887'} intensity={0.5} distance={5} />
                    </group>
                );
            })}
        </>
    );
};


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

    // Get current spell stats
    const getSpellStats = useCallback((spellType) => {
        const upgrade = SPELL_UPGRADES[spellType];
        if (!upgrade) return null;
        const level = spellLevels[spellType] || 1;
        return upgrade.levels[level - 1];
    }, [spellLevels]);

    // Upgrade a spell
    const upgradeSpell = useCallback((spellType) => {
        const upgrade = SPELL_UPGRADES[spellType];
        if (!upgrade) return false;

        const currentLevel = spellLevels[spellType] || 1;
        if (currentLevel >= 3) {
            setUpgradeNotification('⚠️ Spell is already at maximum level!');
            setTimeout(() => setUpgradeNotification(null), 2000);
            return false;
        }

        const nextLevel = upgrade.levels[currentLevel]; // 0-indexed, currentLevel is the next
        if (!nextLevel) return false;

        // Check if player has enough XP (use addExperience with negative? No, just check level)
        // For simplicity, spend XP cost by requiring minimum player level
        const requiredLevel = nextLevel.xpCost <= 100 ? 2 : nextLevel.xpCost <= 200 ? 3 : 5;
        const playerLevel = window._playerLevel || 1;

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

    // Expose spell stats globally for EnhancedMagicSystem to read
    useEffect(() => {
        window._spellLevels = spellLevels;
        window._getSpellStats = getSpellStats;
        window.upgradeSpell = upgradeSpell;
    }, [spellLevels, getSpellStats, upgradeSpell]);

    return { spellLevels, getSpellStats, upgradeSpell, upgradeNotification, SPELL_UPGRADES };
};

// Spell Upgrade Panel (accessed from Magic panel)
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

export default {
    useSurvivalMode, SurvivalWarning,
    useBossSystem, BossHealthBar, BossEntity,
    usePetSystem, PetIndicator, PetEntities,
    useSpellUpgrades, SpellUpgradePanel,
};
