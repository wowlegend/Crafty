import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// --- Player Stats, Mana, Combat, Progression ---

const GameSystemsContext = createContext();

export const useGameSystems = () => {
    const context = useContext(GameSystemsContext);
    if (!context) {
        return {
            playerHealth: 100,
            maxHealth: 100,
            mana: 100,
            maxMana: 100,
            hunger: 100,
            isAlive: true,
            damagePlayer: () => { },
            healPlayer: () => { },
            useMana: () => true,
            regenerateMana: () => { },
            consumeHunger: () => { },
            feedPlayer: () => { },
            respawn: () => { },
            getSpellDamageMultiplier: () => 1,
            getMaxHealthBonus: () => 0,
        };
    }
    return context;
};

export const GameSystemsProvider = ({ children, playerLevel = 1 }) => {
    // === PLAYER HEALTH SYSTEM ===
    const [playerHealth, setPlayerHealth] = useState(100);
    const [maxHealth, setMaxHealth] = useState(100);
    const [isAlive, setIsAlive] = useState(true);
    const [lastDamageTime, setLastDamageTime] = useState(0);
    const [damageFlash, setDamageFlash] = useState(false);
    const [screenShake, setScreenShake] = useState(0);

    // === MANA SYSTEM ===
    const [mana, setMana] = useState(100);
    const [maxMana, setMaxMana] = useState(100);
    const manaRegenTimer = useRef(null);

    // === HUNGER SYSTEM ===
    const [hunger, setHunger] = useState(100);
    const hungerTimer = useRef(null);

    // === LEVEL-BASED STAT BONUSES ===
    const getMaxHealthBonus = useCallback(() => {
        return (playerLevel - 1) * 10; // +10 health per level
    }, [playerLevel]);

    const getSpellDamageMultiplier = useCallback(() => {
        return 1 + (playerLevel - 1) * 0.1; // +10% damage per level
    }, [playerLevel]);

    const getManaBonus = useCallback(() => {
        return (playerLevel - 1) * 5; // +5 mana per level
    }, [playerLevel]);

    // Initialize spawn time to prevent instant fall damage when chunks generate
    useEffect(() => {
        window._spawnTime = Date.now();
    }, []);

    // Update max stats based on level
    useEffect(() => {
        const newMaxHealth = 100 + getMaxHealthBonus();
        const newMaxMana = 100 + getManaBonus();
        setMaxHealth(newMaxHealth);
        setMaxMana(newMaxMana);
        // Heal to new max on level up
        setPlayerHealth(prev => Math.min(prev + 20, newMaxHealth));
        setMana(prev => Math.min(prev + 10, newMaxMana));
    }, [playerLevel, getMaxHealthBonus, getManaBonus]);

    // === DAMAGE PLAYER ===
    const damagePlayer = useCallback((amount, source = 'unknown') => {
        if (!isAlive) return;

        const now = Date.now();
        // Give player a 5 second grace period after spawning to avoid lag deaths
        if (now - window._spawnTime < 5000) return;

        // Invincibility frames (500ms)
        if (now - lastDamageTime < 500) return;

        setLastDamageTime(now);
        setDamageFlash(true);
        setScreenShake(amount / 10);

        setTimeout(() => {
            setDamageFlash(false);
            setScreenShake(0);
        }, 200);

        setPlayerHealth(prev => {
            const newHealth = Math.max(0, prev - amount);
            if (newHealth <= 0) {
                setIsAlive(false);
                if (window.playDefeatSound) window.playDefeatSound();
            }
            return newHealth;
        });

        // Play damage sound
        if (window.playHitSound) window.playHitSound();
    }, [isAlive, lastDamageTime]);

    // === HEAL PLAYER ===
    const healPlayer = useCallback((amount) => {
        if (!isAlive) return;
        setPlayerHealth(prev => Math.min(prev + amount, maxHealth));
    }, [isAlive, maxHealth]);

    // === MANA SYSTEM ===
    const useMana = useCallback((cost) => {
        if (mana >= cost) {
            setMana(prev => Math.max(0, prev - cost));
            return true;
        }
        return false;
    }, [mana]);

    // Mana regeneration - FAST REGEN for action combat
    useEffect(() => {
        manaRegenTimer.current = setInterval(() => {
            if (isAlive) {
                setMana(prev => Math.min(prev + 10, maxMana)); // +10 mana per second (up from 2)
            }
        }, 1000);
        return () => clearInterval(manaRegenTimer.current);
    }, [isAlive, maxMana]);

    // === HUNGER SYSTEM ===
    const consumeHunger = useCallback((amount = 0.5) => {
        if (!isAlive) return;
        setHunger(prev => {
            const newHunger = Math.max(0, prev - amount);
            // Starvation damage
            if (newHunger <= 0) {
                damagePlayer(1, 'starvation');
            }
            return newHunger;
        });
    }, [isAlive, damagePlayer]);

    const feedPlayer = useCallback((amount) => {
        setHunger(prev => Math.min(100, prev + amount));
    }, []);

    // Hunger depletes over time
    useEffect(() => {
        hungerTimer.current = setInterval(() => {
            if (isAlive) {
                consumeHunger(0.1); // Slow hunger drain
            }
        }, 5000);
        return () => clearInterval(hungerTimer.current);
    }, [isAlive, consumeHunger]);

    // === RESPAWN ===
    const respawn = useCallback(() => {
        setPlayerHealth(maxHealth);
        setMana(maxMana);
        setHunger(100);
        setIsAlive(true);
        window._spawnTime = Date.now();
    }, [maxHealth, maxMana]);

    // Expose functions globally
    useEffect(() => {
        window.damagePlayer = damagePlayer;
        window.healPlayer = healPlayer;
        window.useMana = useMana;
        window.getSpellDamageMultiplier = getSpellDamageMultiplier;
        window.isPlayerAlive = () => isAlive;
        window.getPlayerHealth = () => playerHealth;
        window.getPlayerMana = () => mana;
    }, [damagePlayer, healPlayer, useMana, getSpellDamageMultiplier, isAlive, playerHealth, mana]);

    const value = {
        playerHealth,
        maxHealth,
        mana,
        maxMana,
        hunger,
        isAlive,
        damageFlash,
        screenShake,
        damagePlayer,
        healPlayer,
        useMana,
        consumeHunger,
        feedPlayer,
        respawn,
        getSpellDamageMultiplier,
        getMaxHealthBonus,
    };

    return (
        <GameSystemsContext.Provider value={value}>
            {children}
        </GameSystemsContext.Provider>
    );
};
// --- Spell Colors (canonical source, import in other files) ---
export const SPELL_COLORS = {
    fireball: '#FF4500',
    iceball: '#00BFFF',
    lightning: '#FFD700',
    arcane: '#9932CC',
};

// --- Spell Mana Costs ---
export const SPELL_MANA_COSTS = {
    fireball: 15,
    iceball: 12,
    lightning: 25,
    arcane: 18,
    shield: 30,
    heal: 40,
};

// --- Spell Secondary Effects ---
export const SPELL_EFFECTS = {
    fireball: {
        burn: { duration: 3, damagePerSecond: 5 },
    },
    iceball: {
        slow: { duration: 4, speedMultiplier: 0.5 },
        freezeChance: 0.15,
    },
    lightning: {
        chain: { maxTargets: 3, damageReduction: 0.3 },
        stun: { duration: 1 },
    },
    arcane: {
        pierce: true,
        lifeSteal: 0.1,
    },
};

// --- UI Components ---

// Health Bar Component
export const PlayerHealthBar = ({ health, maxHealth }) => {
    const hearts = Math.ceil(maxHealth / 10);
    const fullHearts = Math.floor(health / 10);
    const partialHeart = (health % 10) / 10;

    return (
        <div className="flex items-center gap-0.5">
            {Array(hearts).fill(null).map((_, i) => {
                let opacity = 1;
                if (i >= fullHearts) {
                    opacity = i === fullHearts ? partialHeart : 0.2;
                }
                return (
                    <div key={i} className="relative w-5 h-5">
                        <span className="absolute inset-0 flex items-center justify-center text-gray-700 text-lg">❤</span>
                        <span
                            className="absolute inset-0 flex items-center justify-center text-red-500 text-lg transition-opacity"
                            style={{ opacity }}
                        >
                            ❤
                        </span>
                    </div>
                );
            })}
        </div>
    );
};

// Mana Bar Component
export const PlayerManaBar = ({ mana, maxMana }) => {
    const percentage = (mana / maxMana) * 100;

    return (
        <div className="w-48">
            <div className="flex justify-between text-xs text-blue-300 mb-1">
                <span>Mana</span>
                <span>{Math.floor(mana)} / {maxMana}</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2.5 overflow-hidden">
                <motion.div
                    className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 0.3 }}
                />
            </div>
        </div>
    );
};

// Hunger Bar Component  
export const PlayerHungerBar = ({ hunger }) => {
    const drumsticks = 10;
    const fullDrumsticks = Math.floor(hunger / 10);
    const partialDrumstick = (hunger % 10) / 10;

    return (
        <div className="flex items-center gap-0.5">
            {Array(drumsticks).fill(null).map((_, i) => {
                let opacity = 1;
                if (i >= fullDrumsticks) {
                    opacity = i === fullDrumsticks ? partialDrumstick : 0.2;
                }
                return (
                    <div key={i} className="relative w-5 h-5">
                        <span className="absolute inset-0 flex items-center justify-center text-gray-700 text-lg">🍖</span>
                        <span
                            className="absolute inset-0 flex items-center justify-center text-orange-400 text-lg transition-opacity"
                            style={{ opacity }}
                        >
                            🍖
                        </span>
                    </div>
                );
            })}
        </div>
    );
};

// Damage Overlay Component
export const DamageOverlay = ({ active, intensity = 1 }) => {
    if (!active) return null;

    return (
        <motion.div
            initial={{ opacity: 0.6 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 pointer-events-none z-40"
            style={{
                background: `radial-gradient(circle, transparent 40%, rgba(255, 0, 0, ${0.4 * intensity}) 100%)`,
            }}
        />
    );
};

// Death Screen Component
export const DeathScreen = ({ onRespawn }) => {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
        >
            <div className="text-center">
                <motion.h1
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="text-6xl font-bold text-red-500 mb-4"
                    style={{ textShadow: '3px 3px 0 #000' }}
                >
                    YOU DIED
                </motion.h1>
                <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="text-gray-400 mb-8"
                >
                    Better luck next time!
                </motion.p>
                <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1 }}
                    onClick={onRespawn}
                    className="bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-8 rounded-lg text-xl transition-all"
                >
                    Respawn
                </motion.button>
            </div>
        </motion.div>
    );
};

// Active Spell Indicator
export const ActiveSpellIndicator = ({ spell, manaCost, currentMana }) => {
    const canCast = currentMana >= manaCost;

    return (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <div
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{
                    boxShadow: `0 0 20px ${canCast ? SPELL_COLORS[spell] : '#666'}`,
                    opacity: canCast ? 1 : 0.5
                }}
            >
                <div className="w-4 h-0.5 bg-white absolute" />
                <div className="w-0.5 h-4 bg-white absolute" />
            </div>
            <div
                className="text-xs text-center mt-2 font-bold"
                style={{ color: canCast ? SPELL_COLORS[spell] : '#666' }}
            >
                {spell.toUpperCase()} ({manaCost} MP)
            </div>
        </div>
    );
};

export default GameSystemsProvider;
