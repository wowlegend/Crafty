import { useGameStore } from './store/useGameStore';
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GameMethods } from './GameMethods';
import { Panel } from './ui/primitives/index.js';

// Simple Experience System - No Runtime Errors
export const useSimpleExperience = () => {
  const [playerLevel, setPlayerLevel] = useState(1);
  const [currentXP, setCurrentXP] = useState(0);
  const [totalXP, setTotalXP] = useState(0);
  const [xpGains, setXpGains] = useState([]);
  const [levelUpEffects, setLevelUpEffects] = useState([]);
  const xpGainId = useRef(0);

  // Calculate XP required for next level
  const getXPRequired = (level) => {
    return Math.floor(100 * Math.pow(1.5, level - 1));
  };

  const getCurrentLevelXP = () => getXPRequired(playerLevel);
  const getXPProgress = () => (currentXP / getCurrentLevelXP()) * 100;

  // Add experience
  const addExperience = (amount, reason = 'Action') => {
    const newXP = currentXP + amount;
    const requiredXP = getCurrentLevelXP();

    // Add visual XP gain
    const xpGain = {
      id: xpGainId.current++,
      amount,
      reason,
      timestamp: Date.now()
    };

    setXpGains(prev => [...prev, xpGain]);
    setCurrentXP(newXP);
    setTotalXP(prev => prev + amount);

    // Check for level up
    if (newXP >= requiredXP) {
      const newLevel = playerLevel + 1;
      setPlayerLevel(newLevel);
      setCurrentXP(newXP - requiredXP);

      // Award 5 Attribute Points
      const store = useGameStore.getState();
      if (store.addAttributePoints) {
        store.addAttributePoints(5);
      }
      if (store.addTalentPoint) {
        store.addTalentPoint(1);
      }

      // Trigger level up effect
      const levelUpEffect = {
        id: Date.now(),
        level: newLevel,
        timestamp: Date.now()
      };

      setLevelUpEffects(prev => [...prev, levelUpEffect]);

      // Play level up sound
      if (window.playLevelUpSound) {
        window.playLevelUpSound();
      }
    }

    // Auto-remove XP gain after 3 seconds
    setTimeout(() => {
      setXpGains(prev => prev.filter(gain => gain.id !== xpGain.id));
    }, 3000);
  };

  useEffect(() => {
    useGameStore.setState({ grantXP: addExperience });
    GameMethods.grantXP = addExperience;
    useGameStore.setState({ getPlayerLevel: () => playerLevel });
    useGameStore.setState({ getPlayerXP: () => ({ current: currentXP, total: totalXP, level: playerLevel }) });
  }, [playerLevel, currentXP, totalXP]);

  return {
    playerLevel,
    currentXP,
    totalXP,
    xpRequired: getCurrentLevelXP(),
    xpProgress: getXPProgress(),
    xpGains,
    levelUpEffects,
    addExperience,
    setLevelUpEffects
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
            <div className="bg-yellow-400 text-black px-3 py-1 rounded-lg font-bold text-sm shadow-lg border-2 border-yellow-600">
              +{gain.amount} XP
              <div className="text-xs text-yellow-800">{gain.reason}</div>
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
            <div className="text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.2, 1] }}
                transition={{ duration: 1, times: [0, 0.6, 1] }}
                className="text-6xl font-bold text-yellow-400 drop-shadow-lg"
                style={{ textShadow: '3px 3px 0px #000, -1px -1px 0px #000, 1px -1px 0px #000, -1px 1px 0px #000' }}
              >
                LEVEL UP!
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.8 }}
                className="text-3xl font-bold text-white mt-2"
                style={{ textShadow: '2px 2px 0px #000' }}
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
