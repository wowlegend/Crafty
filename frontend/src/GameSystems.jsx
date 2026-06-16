import { useShallow } from 'zustand/react/shallow';
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from './store/useGameStore';
import { StatBar } from './ui/primitives/StatBar.jsx';
import { Panel } from './ui/primitives/Panel.jsx';
import { Button } from './ui/primitives/Button.jsx';


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

// M2 #7 S2: a run-summary stat for the death/victory overlays. IB-grade -- tabular-nums value over a
// muted uppercase label, baseline-stacked. Reads the run's level + nights-survived from the store.
const RunStat = ({ label, value }) => (
    <div className="flex flex-col items-center">
        <span className="font-display text-3xl font-bold text-text tabular-nums leading-none">{value}</span>
        <span className="text-xs uppercase tracking-wide text-text-muted mt-1">{label}</span>
    </div>
);

// Death Screen Component -- M2 #7 S2: rebuilt on the Panel + Button primitives + theme tokens (was raw
// Tailwind) with a run summary. Capture-safe (only mounts on player death, never in a fresh-L1 capture).
export const DeathScreen = ({ onRespawn }) => {
    const level = useGameStore.getState().level;
    const nights = useGameStore.getState().nightCount;
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-modal"
        >
            <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                <Panel variant="raise" className="text-center px-10 py-8 max-w-sm">
                    <h1 className="font-display text-5xl font-bold text-danger mb-2" style={{ textShadow: '3px 3px 0 var(--ui-ink)' }}>
                        YOU DIED
                    </h1>
                    <p className="text-text-muted mb-6">The frontier claims another wanderer.</p>
                    <div className="flex justify-center gap-8 mb-7">
                        <RunStat label="Level" value={level} />
                        <RunStat label="Nights survived" value={nights} />
                    </div>
                    <Button variant="primary" size="lg" onClick={onRespawn}>Respawn</Button>
                </Panel>
            </motion.div>
        </motion.div>
    );
};

// S9c: the WIN-STATE beat. Shown once the Blight Heart (Shadow Dragon) is defeated (bossSystem.bossDefeated).
// Mirrors DeathScreen (full-screen bold-flat overlay) but triumphant amber. "Keep exploring" dismisses it ->
// the sandbox continues (post-climax endless handoff: mobs/shrines remain). Only renders post-defeat, which
// can never be true in capture (a fresh level-1 game), so it stays out of the visual baselines.
export const VictoryOverlay = ({ onDismiss }) => {
    // The climax payoff: fire the triumphant victory sting once when the win screen appears (the boss-defeat
    // beat was silent). window.playVictory is bridged from App's useGameSounds; no-op in capture (no ctx).
    useEffect(() => {
        if (window.playVictory) window.playVictory();
    }, []);
    const level = useGameStore.getState().level;
    const nights = useGameStore.getState().nightCount;
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-modal"
        >
            <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                <Panel variant="raise" className="text-center px-10 py-8 max-w-md">
                    <h1 className="font-display text-5xl font-bold text-warn mb-2" style={{ textShadow: '3px 3px 0 var(--ui-ink)' }}>
                        VICTORY
                    </h1>
                    <p className="text-text-muted mb-6 max-w-sm mx-auto">The Blight Heart is shattered. The frontier is yours.</p>
                    <div className="flex justify-center gap-8 mb-7">
                        <RunStat label="Level" value={level} />
                        <RunStat label="Nights survived" value={nights} />
                    </div>
                    <Button variant="primary" size="lg" onClick={onDismiss}>Keep exploring</Button>
                </Panel>
            </motion.div>
        </motion.div>
    );
};

export { solveMeleeDamage, solveSpellDamage, mitigateDamage } from './utils/combat';
