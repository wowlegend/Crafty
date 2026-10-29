import { useGameStore } from './store/useGameStore';
import { useShallow } from 'zustand/react/shallow';
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GameMethods } from './GameMethods';
import { xpForLevel } from './game/progression.js';

// Simple Experience System - No Runtime Errors
export const useSimpleExperience = () => {
  const { level, currentXP, totalXP } = useGameStore(useShallow((s) => ({
    level: s.level, currentXP: s.currentXP, totalXP: s.totalXP,
  })));
  const [xpGains, setXpGains] = useState([]);
  const [levelUpEffects, setLevelUpEffects] = useState([]);
  const xpGainId = useRef(0);
  const levelUpId = useRef(0);
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
      setLevelUpEffects((prev) => [...prev, { id: levelUpId.current++, level, timestamp: Date.now() }]);
      if (window.playLevelUpSound) window.playLevelUpSound();
    } else {
      prevLevel.current = level;
    }
    // B6c: tell the quest system the level, so the two level achievements can unlock. Deliberately OUTSIDE
    // the increase-only branch: a save loaded at level 7 arrives as a 1 -> 7 change and must retroactively
    // unlock 'Rising Star', which an increase-only VFX gate would also catch, but a future refactor of that
    // branch must not silently take the achievement with it. Rare transition, so no Game-Loop-Isolation
    // concern. Optional-call because QuestSystem may not have mounted yet on the very first tick.
    useGameStore.getState().onLevelChanged?.(level);
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
