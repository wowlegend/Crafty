import { useShallow } from 'zustand/react/shallow';
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from './store/useGameStore';


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
    const gameState = useGameStore(useShallow(state => ({
        playerHealth: state.playerHealth,
        maxHealth: state.maxHealth,
        isAlive: state.isAlive,
        damageFlash: state.damageFlash,
        screenShake: state.screenShake,
        mana: state.mana,
        maxMana: state.maxMana,
        hunger: state.hunger,
        setPlayerHealth: state.setPlayerHealth,
        setMaxHealth: state.setMaxHealth,
        setIsAlive: state.setIsAlive,
        setDamageFlash: state.setDamageFlash,
        setScreenShake: state.setScreenShake,
        setMana: state.setMana,
        setMaxMana: state.setMaxMana,
        setHunger: state.setHunger,
        damagePlayer: state.damagePlayer,
        healPlayer: state.healPlayer,
        useMana: state.useMana,
        consumeHunger: state.consumeHunger,
        feedPlayer: state.feedPlayer,
        respawn: state.respawn,
        attributes: state.attributes,
        equipment: state.equipment,
        getEffectiveAttributes: state.getEffectiveAttributes
    })));
    const { playerHealth, maxHealth, isAlive, damageFlash, screenShake, mana, maxMana, hunger } = gameState;
    const { setPlayerHealth, setMaxHealth, setIsAlive, setDamageFlash, setScreenShake, setMana, setMaxMana, setHunger } = gameState;

    const manaRegenTimer = useRef(null);
    const hungerTimer = useRef(null);

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
        useGameStore.setState({ _spawnTime: Date.now() });
    }, []);

    // Update max stats based on level & attributes
    useEffect(() => {
        const effective = gameState.getEffectiveAttributes ? gameState.getEffectiveAttributes() : { strength: 10, intellect: 10 };
        const newMaxHealth = 100 + getMaxHealthBonus() + (effective.strength * 5);
        const newMaxMana = 100 + getManaBonus() + (effective.intellect * 2);
        
        setMaxHealth(newMaxHealth);
        setMaxMana(newMaxMana);
        
        // Heal to new max on level up
        setPlayerHealth(prev => Math.min(prev + 20, newMaxHealth));
        setMana(prev => Math.min(prev + 10, newMaxMana));
    }, [playerLevel, getMaxHealthBonus, getManaBonus, setMaxHealth, setMaxMana, setPlayerHealth, setMana, gameState.attributes, gameState.equipment, gameState.getEffectiveAttributes]);

    // Mana regeneration - FAST REGEN for action combat
    useEffect(() => {
        manaRegenTimer.current = setInterval(() => {
            const state = useGameStore.getState();
            if (state.isAlive) {
                state.setMana(prev => Math.min(prev + 10, state.maxMana)); 
            }
        }, 1000);
        return () => clearInterval(manaRegenTimer.current);
    }, []);

    // Hunger depletes over time
    useEffect(() => {
        hungerTimer.current = setInterval(() => {
            const state = useGameStore.getState();
            if (state.isAlive) {
                state.consumeHunger(0.1); 
            }
        }, 5000);
        return () => clearInterval(hungerTimer.current);
    }, []);

    const value = {
        playerHealth,
        maxHealth,
        mana,
        maxMana,
        hunger,
        isAlive,
        damageFlash,
        screenShake,
        damagePlayer: gameState.damagePlayer,
        healPlayer: gameState.healPlayer,
        useMana: gameState.useMana,
        consumeHunger: gameState.consumeHunger,
        feedPlayer: gameState.feedPlayer,
        respawn: gameState.respawn,
        getSpellDamageMultiplier,
        getMaxHealthBonus,
    };

    return (
        <GameSystemsContext.Provider value={value}>
            {children}
        </GameSystemsContext.Provider>
    );
};
export const SPELL_COLORS = {
    fireball: '#FF4500',
    iceball: '#00BFFF',
    lightning: '#FFD700',
    arcane: '#9932CC',
};

export const SPELL_MANA_COSTS = {
    fireball: 15,
    iceball: 12,
    lightning: 25,
    arcane: 18,
    shield: 30,
    heal: 40,
};

const SPELL_EFFECTS = {
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
export const DamageOverlay = () => {
    const { active, intensity } = useGameStore(useShallow(state => ({ active: state.damageFlash, intensity: state.screenShake })));
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

export const solveMeleeDamage = (attackerStats, baseWeaponDmg = 5) => {
    const strength = attackerStats.strength || 10;
    const agility = attackerStats.agility || 10;
    const baseDmg = baseWeaponDmg + (strength * 1.5);
    const critChance = Math.min(0.75, 0.05 + (agility * 0.005));
    const isCrit = Math.random() < critChance;
    const multiplier = isCrit ? 2.0 : 1.0;
    
    return {
        damage: Math.round(baseDmg * multiplier),
        isCrit,
        color: isCrit ? '#FF4500' : '#FFFFFF'
    };
};

export const solveSpellDamage = (attackerStats, baseSpellDmg = 20, spellType = 'fireball') => {
    const intellect = attackerStats.intellect || 10;
    const agility = attackerStats.agility || 10;
    const intellectMultiplier = 1.0 + (intellect * 0.02);
    const finalDmg = Math.round(baseSpellDmg * intellectMultiplier);
    const critChance = Math.min(0.50, 0.05 + (agility * 0.003));
    const isCrit = Math.random() < critChance;
    
    let color = '#9932CC'; // arcane
    if (spellType === 'fireball') color = '#FF4500';
    else if (spellType === 'iceball') color = '#00BFFF';
    else if (spellType === 'lightning') color = '#FFD700';

    return {
        damage: Math.round(isCrit ? finalDmg * 1.8 : finalDmg),
        isCrit,
        color
    };
};

export const mitigateDamage = (targetStats, incomingDmg) => {
    const armor = targetStats.armor || 0;
    const dr = armor / (armor + 100);
    const finalDmg = Math.max(1, Math.round(incomingDmg * (1.0 - dr)));
    return finalDmg;
};
