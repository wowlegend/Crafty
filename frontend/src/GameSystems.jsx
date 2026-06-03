import { useShallow } from 'zustand/react/shallow';
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from './store/useGameStore';
import { StatBar } from './ui/primitives/StatBar.jsx';


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

export const GameSystemsProvider = ({ children }) => {
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
        const level = useGameStore.getState().level;
        return (level - 1) * 10; // +10 health per level
    }, []);

    const getSpellDamageMultiplier = useCallback(() => {
        const level = useGameStore.getState().level;
        return 1 + (level - 1) * 0.1; // +10% damage per level
    }, []);

    // Initialize spawn time to prevent instant fall damage when chunks generate
    useEffect(() => {
        useGameStore.setState({ _spawnTime: Date.now() });
    }, []);

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
export const PlayerHealthBar = ({ health, maxHealth }) => (
    <StatBar kind="health" icon="health" value={health} max={maxHealth} showValue className="w-44" />
);

// Mana Bar Component
export const PlayerManaBar = ({ mana, maxMana }) => (
    <StatBar kind="mana" icon="water" value={mana} max={maxMana} showValue className="w-44" />
);

// Hunger Bar Component
export const PlayerHungerBar = ({ hunger }) => (
    <StatBar kind="hunger" icon="meat" value={hunger} max={100} showValue className="w-44" />
);

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

export { solveMeleeDamage, solveSpellDamage, mitigateDamage } from './utils/combat';
