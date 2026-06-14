import { useGameStore } from './store/useGameStore';
import { useShallow } from 'zustand/react/shallow';
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GameMethods } from './GameMethods';
import { xpForLevel } from './game/progression.js';
import { Panel } from './ui/primitives/index.js';

// Simple Experience System - No Runtime Errors
export const useSimpleExperience = () => {
  const { level, currentXP, totalXP } = useGameStore(useShallow((s) => ({
    level: s.level, currentXP: s.currentXP, totalXP: s.totalXP,
  })));
  const [xpGains, setXpGains] = useState([]);
  const [levelUpEffects, setLevelUpEffects] = useState([]);
  const xpGainId = useRef(0);
  const prevTotal = useRef(totalXP);
  const prevLevel = useRef(level);

  // XP-gain floating VFX: fire on any totalXP increase (the store does the math).
  useEffect(() => {
    const delta = totalXP - prevTotal.current;
    prevTotal.current = totalXP;
    if (delta > 0) {
      const gain = { id: xpGainId.current++, amount: delta, reason: 'XP', timestamp: Date.now() };
      setXpGains((prev) => [...prev, gain]);
      setTimeout(() => setXpGains((prev) => prev.filter((g) => g.id !== gain.id)), 3000);
    }
  }, [totalXP]);

  // Level-up VFX + sound.
  useEffect(() => {
    if (level > prevLevel.current) {
      prevLevel.current = level;
      setLevelUpEffects((prev) => [...prev, { id: Date.now(), level, timestamp: Date.now() }]);
      if (window.playLevelUpSound) window.playLevelUpSound();
    } else {
      prevLevel.current = level;
    }
  }, [level]);

  // Legacy bridge: consumers that call GameMethods.grantXP route to the store action.
  useEffect(() => {
    GameMethods.grantXP = (amount, reason) => useGameStore.getState().grantXP(amount, reason);
  }, []);

  const addExperience = (amount, reason = 'Action') => useGameStore.getState().grantXP(amount, reason);

  return {
    playerLevel: level,
    currentXP,
    totalXP,
    xpRequired: xpForLevel(level),
    xpProgress: (currentXP / xpForLevel(level)) * 100,
    xpGains,
    levelUpEffects,
    addExperience,
    setLevelUpEffects,
  };
};

// XP Gain Visual Component
export const SimpleXPGainVisual = ({ xpGains }) => {
  return (
    <div className="absolute inset-0 pointer-events-none z-40">
      <AnimatePresence>
        {xpGains.map(gain => (
          <motion.div
            key={gain.id}
            initial={{
              opacity: 0,
              scale: 0.5,
              y: 20
            }}
            animate={{
              opacity: 1,
              scale: 1,
              y: -50
            }}
            exit={{
              opacity: 0,
              scale: 0.5,
              y: -100
            }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
          >
            <div
              className="px-3 py-1 rounded-md border-chrome border-ink shadow-elev-md text-text-inverse leading-none"
              style={{ background: 'linear-gradient(180deg, rgb(var(--ui-accent-raise)), rgb(var(--ui-accent-deep)))' }}
            >
              <span className="font-display text-base tabular-nums">+{gain.amount}</span>
              <span className="text-[10px] font-bold tracking-widest opacity-85 ml-1">XP</span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

// Level Up Effect Component
export const SimpleLevelUpEffect = ({ levelUpEffects, onEffectComplete }) => {
  return (
    <div className="absolute inset-0 pointer-events-none z-50">
      <AnimatePresence>
        {levelUpEffects.map(effect => (
          <motion.div
            key={effect.id}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.5 }}
            transition={{ duration: 2, ease: "easeOut" }}
            onAnimationComplete={() => onEffectComplete && onEffectComplete(effect.id)}
            className="absolute inset-0 flex items-center justify-center"
          >
            {/* gold radial burst behind the banner (bold-flat accent; bloom-free CSS) */}
            <motion.div
              initial={{ scale: 0, opacity: 0.55 }}
              animate={{ scale: [0, 1.6, 2.2], opacity: [0.55, 0.22, 0] }}
              transition={{ duration: 1.4, ease: 'easeOut' }}
              className="absolute w-80 h-80 rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(var(--ui-accent), 0.5) 0%, transparent 64%)' }}
            />
            <div className="text-center relative">
              {/* LEVEL UP — gold sticker banner in the display face + ink frame (S1-C bold-flat) */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.22, 1] }}
                transition={{ duration: 0.9, times: [0, 0.6, 1], ease: 'easeOut' }}
                className="inline-block font-display text-text-inverse leading-none px-6 py-2 rounded-lg border-chrome border-ink shadow-elev-md tracking-wide"
                style={{ fontSize: '3.25rem', background: 'linear-gradient(180deg, rgb(var(--ui-accent-raise)), rgb(var(--ui-accent-deep)))' }}
              >
                LEVEL UP
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45, duration: 0.7 }}
                className="font-display text-accent-raise mt-3 tabular-nums"
                style={{ fontSize: '1.9rem', textShadow: '2px 2px 0 rgb(var(--ui-ink))' }}
              >
                Level {effect.level}
              </motion.div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

// Experience Bar UI Component — bold-flat: a gold LV badge (level in font-display) +
// a thin gold XP track (4px ink frame, flat accent fill at xpProgress%), mirroring the
// showcase's top-left level+XP treatment. Props + values + clamp logic unchanged.
export const SimpleExperienceBar = ({ level, currentXP, xpRequired, xpProgress }) => {
  return (
    <div className="absolute bottom-32 left-1/2 transform -translate-x-1/2 pointer-events-auto">
      <Panel variant="base" className="flex items-center gap-3 p-3 min-w-80">
        {/* LV badge — gold sticker, ink frame, level number in display face */}
        <div
          className="flex-none w-[44px] h-[44px] grid place-items-center rounded-md border-chrome border-ink shadow-elev-md text-text-inverse leading-none"
          style={{ background: 'linear-gradient(180deg, rgb(var(--ui-accent-raise)), rgb(var(--ui-accent-deep)))' }}
        >
          <span className="font-display text-lg tabular-nums">{level}</span>
          <span className="text-[8px] font-bold tracking-widest opacity-85 mt-0.5">LV</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-text font-bold text-sm">Level {level}</div>
            <div className="text-accent-raise font-bold text-sm tabular-nums">{currentXP} / {xpRequired} XP</div>
          </div>
          {/* Thin gold XP track — inset groove + 4px ink frame; flat accent fill */}
          <div className="w-full h-3 rounded-md bg-track border-chrome border-ink overflow-hidden relative">
            <motion.div
              className="absolute inset-y-0 left-0 bg-accent"
              initial={{ width: 0 }}
              animate={{ width: `${xpProgress}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
        </div>
      </Panel>
    </div>
  );
};

// Compact TOUCH-only level/XP readout. The full SimpleExperienceBar lives bottom-center (over the thumb /
// joystick zone), so it's desktop-only; touch players had no level visibility. This sits top-right (mirrors
// the top-left player-stat column) and is kept small for a phone. Static fill width (no framer animation) so
// the touch capture frame (mobile.png) stays byte-deterministic.
export const SimpleExperienceBarTouch = ({ level, xpProgress }) => {
  return (
    // top-28 (below the centered spell-label band) so it never crowds "Spell: ... (MP)" on a narrow phone.
    <div className="absolute top-28 right-4 z-20 pointer-events-none">
      <Panel variant="base" className="flex items-center gap-2 px-2 py-1">
        <span className="font-display text-sm tabular-nums text-accent-raise leading-none">LV{level}</span>
        <div className="w-20 h-2 rounded-sm bg-track border-chrome border-ink overflow-hidden relative">
          <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${xpProgress}%` }} />
        </div>
      </Panel>
    </div>
  );
};
