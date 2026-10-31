import { useShallow } from 'zustand/react/shallow';
import React, { createContext, useContext, useEffect, useRef } from 'react';
import { m } from 'framer-motion';
import { useGameStore } from './store/useGameStore';
import { StatBar } from './ui/primitives/StatBar.jsx';
import { Panel } from './ui/primitives/Panel.jsx';
import { Button } from './ui/primitives/Button.jsx';
import { MAGIC } from './theme/tokens.js';
import { useT } from './i18n/i18n.js';
import { isWorldFrozenNow } from './game/worldClock.js';
import { EVENTS, emit } from './game/eventBus.js';


const GameSystemsContext = createContext();

export const useGameSystems = () => {
    const context = useContext(GameSystemsContext);
    if (!context) {
        return {
            playerHealth: 100,
            maxHealth: 100,
            mana: 100,
            maxMana: 100,
            isAlive: true,
            damagePlayer: () => { },
            healPlayer: () => { },
            useMana: () => true,
            respawn: () => { },
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
        setPlayerHealth: state.setPlayerHealth,
        setMaxHealth: state.setMaxHealth,
        setIsAlive: state.setIsAlive,
        setDamageFlash: state.setDamageFlash,
        setScreenShake: state.setScreenShake,
        setMana: state.setMana,
        setMaxMana: state.setMaxMana,
        damagePlayer: state.damagePlayer,
        healPlayer: state.healPlayer,
        useMana: state.useMana,
        respawn: state.respawn
    })));
    const { playerHealth, maxHealth, isAlive, damageFlash, screenShake, mana, maxMana } = gameState;

    const manaRegenTimer = useRef(null);

    // getMaxHealthBonus, getSpellDamageMultiplier, attributes, equipment and getEffectiveAttributes are not on this
    // context: nothing reads them (its only consumer forwards the whole object to useInputManager and to <HUD>, and
    // neither names those keys). Level still scales spell damage through the intellect each level adds
    // (game/progression.js levelAttributes), and progression.js carries the (lv-1)*10 health term. eslint and knip cannot
    // see an unread value placed in an object literal, so a key added back needs a reader. Selecting `equipment` or
    // `attributes` here would also re-render the provider on every equip, unequip, attribute spend and level-up (they are
    // replaced immutably, so useShallow's reference compare fails), refresh `value` and re-render <HUD> and the input
    // manager for a value none of them read.
    //
    // The names do appear in src/ui/GamePanels.jsx, which builds its own useGameStore(useShallow(...)) with the same keys
    // and never references GameSystemsContext.

    // Initialize spawn time to prevent instant fall damage when chunks generate
    useEffect(() => {
        useGameStore.setState({ _spawnTime: Date.now() });
    }, []);

    // Mana regeneration - FAST REGEN for action combat. Held with the world, so a pause is not a free refill.
    useEffect(() => {
        manaRegenTimer.current = setInterval(() => {
            if (isWorldFrozenNow()) return;
            const state = useGameStore.getState();
            if (state.isAlive) {
                state.setMana(prev => Math.min(prev + 10, state.maxMana));
            }
        }, 1000);
        return () => clearInterval(manaRegenTimer.current);
    }, []);

    const value = {
        playerHealth,
        maxHealth,
        mana,
        maxMana,
        isAlive,
        damageFlash,
        screenShake,
        damagePlayer: gameState.damagePlayer,
        healPlayer: gameState.healPlayer,
        useMana: gameState.useMana,
        respawn: gameState.respawn,
    };

    return (
        <GameSystemsContext.Provider value={value}>
            {children}
        </GameSystemsContext.Provider>
    );
};
// B2 spell-color unify: the wand/spell indicator hue derives from the canonical MAGIC
// palette (theme/tokens), the one element-color SoT. Was legacy-drifted (#FF4500 etc.).
export const SPELL_COLORS = {
    fireball: MAGIC.fire,
    iceball: MAGIC.ice,
    lightning: MAGIC.lightning,
    arcane: MAGIC.arcane,
};

export const SPELL_MANA_COSTS = {
    fireball: 15,
    iceball: 12,
    lightning: 25,
    arcane: 18,
};

// Health Bar Component
export const PlayerHealthBar = ({ health, maxHealth }) => (
    <StatBar data-testid="stat-health" kind="health" icon="health" value={health} max={maxHealth} showValue slim className="w-full" />
);

// Mana Bar Component
export const PlayerManaBar = ({ mana, maxMana }) => (
    <StatBar data-testid="stat-mana" kind="mana" icon="water" value={mana} max={maxMana} showValue slim className="w-full" />
);

// Damage Overlay Component
export const DamageOverlay = () => {
    const { active, intensity } = useGameStore(useShallow(state => ({ active: state.damageFlash, intensity: state.screenShake })));
    if (!active) return null;

    return (
        <m.div
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
    const t = useT();
    const level = useGameStore.getState().level;
    const nights = useGameStore.getState().nightCount;
    return (
        <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-modal"
            data-testid="death-screen"
        >
            <m.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                <Panel variant="raise" className="text-center px-10 py-8 max-w-sm">
                    <h1 className="font-display text-5xl font-bold text-danger mb-2" style={{ textShadow: '3px 3px 0 var(--ui-ink)' }}>
                        YOU DIED
                    </h1>
                    <p className="text-text-muted mb-6">{t('overlay.deathLine')}</p>
                    <div className="flex justify-center gap-8 mb-7">
                        <RunStat label="Level" value={level} />
                        <RunStat label="Nights survived" value={nights} />
                    </div>
                    <Button variant="primary" size="lg" onClick={onRespawn} data-testid="death-respawn">{t('ui.respawn')}</Button>
                </Panel>
            </m.div>
        </m.div>
    );
};

// S9c: the WIN-STATE beat. Shown once the Blight Heart (Shadow Dragon) is defeated (bossSystem.bossDefeated).
// Mirrors DeathScreen (full-screen bold-flat overlay) but triumphant amber. "Keep exploring" dismisses it ->
// the sandbox continues (post-climax endless handoff: mobs/shrines remain). Only renders post-defeat, which
// can never be true in capture (a fresh level-1 game), so it stays out of the visual baselines.
export const VictoryOverlay = ({ onDismiss }) => {
    const t = useT();
    // The climax payoff: the victory sting, once, when the win screen appears. The sound layer plays it from the bus.
    useEffect(() => {
        emit(EVENTS.victory);
    }, []);
    const level = useGameStore.getState().level;
    const nights = useGameStore.getState().nightCount;
    return (
        <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-modal"
            data-testid="victory-overlay"
        >
            <m.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                <Panel variant="raise" className="text-center px-10 py-8 max-w-md">
                    <h1 className="font-display text-5xl font-bold text-warn mb-2" style={{ textShadow: '3px 3px 0 var(--ui-ink)' }}>
                        VICTORY
                    </h1>
                    <p className="text-text-muted mb-6 max-w-sm mx-auto">{t('overlay.victoryLine')}</p>
                    <div className="flex justify-center gap-8 mb-7">
                        <RunStat label="Level" value={level} />
                        <RunStat label="Nights survived" value={nights} />
                    </div>
                    <Button variant="primary" size="lg" onClick={onDismiss} data-testid="victory-keep-exploring">{t('ui.keepExploring')}</Button>
                </Panel>
            </m.div>
        </m.div>
    );
};

// (A dead re-export of solveMeleeDamage / solveSpellDamage / mitigateDamage from utils/combat lived
// here. Components.jsx and EnhancedMagicSystem.jsx both import them from utils/combat directly, so
// this barrel offered a second path to the same three functions that nothing used.)
