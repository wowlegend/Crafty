import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Zap, Crown, Award } from 'lucide-react';

// ============ EXPERIENCE & LEVELING SYSTEM ============
// Addictive progression system with visual feedback

export const EXPERIENCE_CONFIG = {
  baseXP: 100,
  xpMultiplier: 1.5,
  maxLevel: 100,
  
  // XP Sources
  sources: {
    killMob: { base: 10, multiplier: 1.2 },
    breakBlock: { base: 1, multiplier: 1.0 },
    placeBlock: { base: 1, multiplier: 1.0 },
    discoverArea: { base: 25, multiplier: 1.1 },
    craftItem: { base: 5, multiplier: 1.1 },
    useMagic: { base: 3, multiplier: 1.0 },
    surviveTime: { base: 1, multiplier: 1.0 } // Per minute
  },
  
  // Level rewards
  rewards: {
    1: { type: 'mana', amount: 10, description: 'Mana crystals increased!' },
    5: { type: 'spell', spell: 'iceShard', description: 'Unlocked Ice Shard spell!' },
    10: { type: 'mana', amount: 20, description: 'Major mana boost!' },
    15: { type: 'spell', spell: 'lightningBeam', description: 'Unlocked Lightning Beam!' },
    20: { type: 'inventory', description: 'Inventory slots increased!' },
    25: { type: 'spell', spell: 'arcaneOrb', description: 'Unlocked Arcane Orb!' },
    30: { type: 'prestige', description: 'Legendary status achieved!' }
  }
};

// Calculate XP required for level
export const getXPForLevel = (level) => {
  if (level <= 1) return 0;
  return Math.floor(EXPERIENCE_CONFIG.baseXP * Math.pow(EXPERIENCE_CONFIG.xpMultiplier, level - 1));
};

// Calculate total XP required to reach level
export const getTotalXPForLevel = (level) => {
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += getXPForLevel(i);
  }
  return total;
};

// Get level from total XP
export const getLevelFromXP = (totalXP) => {
  let level = 1;
  let accumulatedXP = 0;
  
  while (level < EXPERIENCE_CONFIG.maxLevel) {
    const xpForNextLevel = getXPForLevel(level + 1);
    if (accumulatedXP + xpForNextLevel > totalXP) break;
    accumulatedXP += xpForNextLevel;
    level++;
  }
  
  return { level, currentLevelXP: totalXP - accumulatedXP, requiredXP: getXPForLevel(level + 1) };
};

// Experience Manager Hook
export const useExperienceSystem = (initialData = {}) => {
  const [playerData, setPlayerData] = useState({
    totalXP: initialData.totalXP || 0,
    level: initialData.level || 1,
    unlockedSpells: initialData.unlockedSpells || ['fireball'],
    stats: initialData.stats || {
      mobsKilled: 0,
      blocksPlaced: 0,
      blocksBroken: 0,
      areasDiscovered: 0,
      itemsCrafted: 0,
      spellsCast: 0,
      timePlayed: 0
    },
    ...initialData
  });
  
  const [xpNotifications, setXpNotifications] = useState([]);
  const [levelUpNotification, setLevelUpNotification] = useState(null);
  
  // Add XP with visual feedback
  const addExperience = (source, amount = null, context = '') => {
    const config = EXPERIENCE_CONFIG.sources[source];
    if (!config) return;
    
    const baseAmount = amount || config.base;
    const finalAmount = Math.floor(baseAmount * config.multiplier * (1 + playerData.level * 0.01));
    
    setPlayerData(prev => {
      const newTotalXP = prev.totalXP + finalAmount;
      const oldLevelData = getLevelFromXP(prev.totalXP);
      const newLevelData = getLevelFromXP(newTotalXP);
      
      // Update stats
      const newStats = { ...prev.stats };
      switch (source) {
        case 'killMob': newStats.mobsKilled++; break;
        case 'breakBlock': newStats.blocksBroken++; break;
        case 'placeBlock': newStats.blocksPlaced++; break;
        case 'discoverArea': newStats.areasDiscovered++; break;
        case 'craftItem': newStats.itemsCrafted++; break;
        case 'useMagic': newStats.spellsCast++; break;
      }
      
      const updatedData = {
        ...prev,
        totalXP: newTotalXP,
        level: newLevelData.level,
        stats: newStats
      };
      
      // Check for level up
      if (newLevelData.level > oldLevelData.level) {
        handleLevelUp(newLevelData.level, updatedData);
      }
      
      return updatedData;
    });
    
    // Show XP notification
    showXPNotification(finalAmount, source, context);
  };
  
  const handleLevelUp = (newLevel, playerData) => {
    // Apply level rewards
    const reward = EXPERIENCE_CONFIG.rewards[newLevel];
    if (reward) {
      setPlayerData(prev => {
        const updated = { ...prev };
        
        switch (reward.type) {
          case 'mana':
            updated.inventory = {
              ...prev.inventory,
              magic: {
                ...prev.inventory?.magic,
                crystals: (prev.inventory?.magic?.crystals || 0) + reward.amount
              }
            };
            break;
          case 'spell':
            updated.unlockedSpells = [...(prev.unlockedSpells || []), reward.spell];
            break;
        }
        
        return updated;
      });
    }
    
    // Show level up notification
    setLevelUpNotification({
      level: newLevel,
      reward,
      timestamp: Date.now()
    });
    
    // Play level up sound
    if (window.playLevelUpSound) {
      window.playLevelUpSound();
    }
    
    // Auto-hide after delay
    setTimeout(() => {
      setLevelUpNotification(null);
    }, 4000);
  };
  
  const showXPNotification = (amount, source, context) => {
    const notification = {
      id: Date.now() + Math.random(),
      amount,
      source,
      context,
      timestamp: Date.now()
    };
    
    setXpNotifications(prev => [...prev, notification]);
    
    // Auto-remove after delay
    setTimeout(() => {
      setXpNotifications(prev => prev.filter(n => n.id !== notification.id));
    }, 3000);
  };
  
  return {
    playerData,
    addExperience,
    xpNotifications,
    levelUpNotification,
    getLevelProgress: () => {
      const levelData = getLevelFromXP(playerData.totalXP);
      return {
        ...levelData,
        progressPercent: levelData.requiredXP > 0 ? 
          (levelData.currentLevelXP / levelData.requiredXP) * 100 : 100
      };
    }
  };
};

// XP Notification Component
export const XPNotification = ({ notification, onComplete }) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  
  useEffect(() => {
    // Random float-up position
    setPosition({
      x: (Math.random() - 0.5) * 100,
      y: -50
    });
    
    // Auto-complete
    const timer = setTimeout(onComplete, 2500);
    return () => clearTimeout(timer);
  }, []);
  
  const getSourceIcon = (source) => {
    switch (source) {
      case 'killMob': return '⚔️';
      case 'breakBlock': return '⛏️';
      case 'placeBlock': return '🧱';
      case 'discoverArea': return '🗺️';
      case 'craftItem': return '🔨';
      case 'useMagic': return '✨';
      default: return '⭐';
    }
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5, x: position.x, y: 0 }}
      animate={{ 
        opacity: 1, 
        scale: 1, 
        x: position.x, 
        y: position.y,
        transition: { duration: 0.3 }
      }}
      exit={{ 
        opacity: 0, 
        scale: 0.8, 
        y: position.y - 30,
        transition: { duration: 0.5 }
      }}
      className="absolute pointer-events-none z-50"
      style={{
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)'
      }}
    >
      <div className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center space-x-2 font-bold">
        <span className="text-lg">{getSourceIcon(notification.source)}</span>
        <span>+{notification.amount} XP</span>
        {notification.context && (
          <span className="text-xs opacity-90">({notification.context})</span>
        )}
      </div>
    </motion.div>
  );
};

// Level Up Notification Component
export const LevelUpNotification = ({ notification, onComplete }) => {
  useEffect(() => {
    const timer = setTimeout(onComplete, 4000);
    return () => clearTimeout(timer);
  }, []);
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.3, y: 100 }}
      animate={{ 
        opacity: 1, 
        scale: 1, 
        y: 0,
        transition: { 
          type: "spring", 
          damping: 15, 
          stiffness: 200,
          duration: 0.8 
        }
      }}
      exit={{ 
        opacity: 0, 
        scale: 1.2, 
        y: -50,
        transition: { duration: 0.5 }
      }}
      className="absolute inset-0 flex items-center justify-center pointer-events-none z-50"
    >
      <div className="bg-gradient-to-br from-purple-600 via-purple-700 to-purple-900 text-white p-8 rounded-xl shadow-2xl text-center max-w-md mx-4 border-4 border-yellow-400">
        {/* Sparkle effects */}
        <div className="absolute -top-2 -left-2">
          <Star className="text-yellow-400 animate-pulse" size={24} />
        </div>
        <div className="absolute -top-2 -right-2">
          <Star className="text-yellow-400 animate-pulse" size={24} />
        </div>
        <div className="absolute -bottom-2 -left-2">
          <Star className="text-yellow-400 animate-pulse" size={24} />
        </div>
        <div className="absolute -bottom-2 -right-2">
          <Star className="text-yellow-400 animate-pulse" size={24} />
        </div>
        
        <motion.div
          animate={{ 
            scale: [1, 1.1, 1],
            rotate: [0, 5, -5, 0]
          }}
          transition={{ 
            duration: 2, 
            repeat: Infinity,
            ease: "easeInOut"
          }}
        >
          <Crown className="mx-auto mb-4 text-yellow-400" size={48} />
        </motion.div>
        
        <h2 className="text-3xl font-bold mb-2 text-yellow-300">
          LEVEL UP!
        </h2>
        
        <div className="text-6xl font-bold text-white mb-4">
          {notification.level}
        </div>
        
        {notification.reward && (
          <div className="bg-purple-800 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-center space-x-2 mb-2">
              <Award className="text-yellow-400" size={20} />
              <span className="font-semibold">Reward Unlocked!</span>
            </div>
            <p className="text-sm text-purple-200">
              {notification.reward.description}
            </p>
          </div>
        )}
        
        <p className="text-lg font-semibold text-purple-200">
          You are growing stronger!
        </p>
      </div>
    </motion.div>
  );
};

// Experience Bar Component
export const ExperienceBar = ({ playerData, className = "" }) => {
  const levelData = getLevelFromXP(playerData.totalXP);
  const progressPercent = levelData.requiredXP > 0 ? 
    (levelData.currentLevelXP / levelData.requiredXP) * 100 : 100;
  
  return (
    <div className={`bg-gray-800 rounded-lg p-3 ${className}`}>
      <div className="flex justify-between items-center mb-2">
        <span className="text-white font-semibold flex items-center">
          <Crown className="mr-1 text-yellow-400" size={16} />
          Level {levelData.level}
        </span>
        <span className="text-gray-300 text-sm">
          {levelData.currentLevelXP} / {levelData.requiredXP} XP
        </span>
      </div>
      
      <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
      
      <div className="mt-2 text-xs text-gray-400">
        Total XP: {playerData.totalXP.toLocaleString()}
      </div>
    </div>
  );
};

// Player Stats Component
export const PlayerStats = ({ playerData, className = "" }) => {
  return (
    <div className={`bg-gray-800 rounded-lg p-4 ${className}`}>
      <h3 className="text-white font-semibold mb-3 flex items-center">
        <Zap className="mr-2 text-blue-400" size={16} />
        Statistics
      </h3>
      
      <div className="space-y-2 text-sm">
        <div className="flex justify-between text-gray-300">
          <span>⚔️ Mobs Defeated:</span>
          <span className="text-white font-semibold">{playerData.stats.mobsKilled}</span>
        </div>
        <div className="flex justify-between text-gray-300">
          <span>🧱 Blocks Placed:</span>
          <span className="text-white font-semibold">{playerData.stats.blocksPlaced}</span>
        </div>
        <div className="flex justify-between text-gray-300">
          <span>⛏️ Blocks Broken:</span>
          <span className="text-white font-semibold">{playerData.stats.blocksBroken}</span>
        </div>
        <div className="flex justify-between text-gray-300">
          <span>🗺️ Areas Explored:</span>
          <span className="text-white font-semibold">{playerData.stats.areasDiscovered}</span>
        </div>
        <div className="flex justify-between text-gray-300">
          <span>✨ Spells Cast:</span>
          <span className="text-white font-semibold">{playerData.stats.spellsCast}</span>
        </div>
      </div>
    </div>
  );
};
