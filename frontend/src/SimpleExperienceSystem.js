import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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

  // Expose functions globally
  useEffect(() => {
    window.addExperience = addExperience;
    window.getPlayerLevel = () => playerLevel;
    window.getPlayerXP = () => ({ current: currentXP, total: totalXP, level: playerLevel });
    
    // Quick access functions
    window.xpMobKill = () => addExperience(25, 'Mob Defeated');
    window.xpBlockPlace = () => addExperience(2, 'Block Placed');
    window.xpBlockBreak = () => addExperience(3, 'Block Broken');
    window.xpExploration = () => addExperience(10, 'New Area');
    window.xpCrafting = () => addExperience(5, 'Item Crafted');
    window.xpMagicCast = () => addExperience(8, 'Spell Cast');
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

// Experience Bar UI Component
export const SimpleExperienceBar = ({ level, currentXP, xpRequired, xpProgress }) => {
  return (
    <div className="absolute bottom-32 left-1/2 transform -translate-x-1/2 pointer-events-auto">
      <div className="bg-black/70 rounded-lg p-3 min-w-80">
        <div className="flex items-center justify-between mb-2">
          <div className="text-white font-bold text-sm">Level {level}</div>
          <div className="text-yellow-400 font-bold text-sm">{currentXP} / {xpRequired} XP</div>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-yellow-400 to-yellow-600 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${xpProgress}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
      </div>
    </div>
  );
};

export default useSimpleExperience;