import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Zap, Crown, Award } from 'lucide-react';

// ============ EXPERIENCE & LEVELING SYSTEM ============
// Safe implementation with proper error handling

export const EXPERIENCE_CONFIG = {
  baseXP: 100,
  xpMultiplier: 1.5,
  maxLevel: 100,
  
  // XP Sources with safe defaults
  sources: {
    killMob: { base: 10, multiplier: 1.2 },
    breakBlock: { base: 1, multiplier: 1.0 },
    placeBlock: { base: 1, multiplier: 1.0 },
    discoverArea: { base: 25, multiplier: 1.1 },
    craftItem: { base: 5, multiplier: 1.1 },
    useMagic: { base: 3, multiplier: 1.0 },
    surviveTime: { base: 1, multiplier: 1.0 }
  },
  
  // Level rewards with error-safe structure
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

// Safe XP calculation functions with error handling
export const getXPForLevel = (level) => {
  try {
    if (level <= 1) return 0;
    return Math.floor(EXPERIENCE_CONFIG.baseXP * Math.pow(EXPERIENCE_CONFIG.xpMultiplier, level - 1));
  } catch (error) {
    console.warn('Error calculating XP for level:', error);
    return 100; // Safe fallback
  }
};

export const getTotalXPForLevel = (level) => {
  try {
    let total = 0;
    for (let i = 1; i < level; i++) {
      total += getXPForLevel(i);
    }
    return total;
  } catch (error) {
    console.warn('Error calculating total XP:', error);
    return 0;
  }
};

export const getLevelFromXP = (totalXP) => {
  try {
    let level = 1;
    let accumulatedXP = 0;
    
    while (level < EXPERIENCE_CONFIG.maxLevel) {
      const xpForNextLevel = getXPForLevel(level + 1);
      if (accumulatedXP + xpForNextLevel > totalXP) break;
      accumulatedXP += xpForNextLevel;
      level++;
    }
    
    return { 
      level, 
      currentLevelXP: totalXP - accumulatedXP, 
      requiredXP: getXPForLevel(level + 1) 
    };
  } catch (error) {
    console.warn('Error calculating level from XP:', error);
    return { level: 1, currentLevelXP: 0, requiredXP: 100 };
  }
};

// Experience Manager Hook with comprehensive error handling
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
  
  // Safe XP addition with comprehensive error handling
  const addExperience = (source, amount = null, context = '') => {
    try {
      const config = EXPERIENCE_CONFIG.sources[source];
      if (!config) {
        console.warn(`Unknown XP source: ${source}`);
        return;
      }
      
      const baseAmount = amount || config.base;
      const finalAmount = Math.floor(baseAmount * config.multiplier * (1 + playerData.level * 0.01));
      
      setPlayerData(prev => {
        try {
          const newTotalXP = prev.totalXP + finalAmount;
          const oldLevelData = getLevelFromXP(prev.totalXP);
          const newLevelData = getLevelFromXP(newTotalXP);
          
          // Update stats safely
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
        } catch (error) {
          console.error('Error updating player data:', error);
          return prev; // Return previous state on error
        }
      });
      
      // Show XP notification
      showXPNotification(finalAmount, source, context);
      
    } catch (error) {
      console.error('Error adding experience:', error);
    }
  };
  
  const handleLevelUp = (newLevel, playerData) => {
    try {
      // Apply level rewards safely
      const reward = EXPERIENCE_CONFIG.rewards[newLevel];
      if (reward) {
        setPlayerData(prev => {
          try {
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
                if (reward.spell && !updated.unlockedSpells.includes(reward.spell)) {
                  updated.unlockedSpells = [...(prev.unlockedSpells || []), reward.spell];
                }
                break;
            }
            
            return updated;
          } catch (error) {
            console.error('Error applying level reward:', error);
            return prev;
          }
        });
      }
      
      // Show level up notification
      setLevelUpNotification({
        level: newLevel,
        reward,
        timestamp: Date.now()
      });
      
      // Play level up sound safely
      try {
        if (window.playLevelUpSound) {
          window.playLevelUpSound();
        }
      } catch (error) {
        console.warn('Could not play level up sound:', error);
      }
      
      // Auto-hide after delay
      setTimeout(() => {
        setLevelUpNotification(null);
      }, 4000);
      
    } catch (error) {
      console.error('Error handling level up:', error);
    }
  };
  
  const showXPNotification = (amount, source, context) => {
    try {
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
    } catch (error) {
      console.error('Error showing XP notification:', error);
    }
  };
  
  return {
    playerData,
    addExperience,
    xpNotifications,
    levelUpNotification,
    getLevelProgress: () => {
      try {
        const levelData = getLevelFromXP(playerData.totalXP);
        return {
          ...levelData,
          progressPercent: levelData.requiredXP > 0 ? 
            (levelData.currentLevelXP / levelData.requiredXP) * 100 : 100
        };
      } catch (error) {
        console.error('Error getting level progress:', error);
        return { level: 1, currentLevelXP: 0, requiredXP: 100, progressPercent: 0 };
      }
    }
  };
};

// XP Notification Component with error boundaries
export const XPNotification = ({ notification, onComplete }) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  
  useEffect(() => {
    try {
      // Random float-up position
      setPosition({
        x: (Math.random() - 0.5) * 100,
        y: -50
      });
      
      // Auto-complete
      const timer = setTimeout(() => {
        if (onComplete) onComplete();
      }, 2500);
      
      return () => clearTimeout(timer);
    } catch (error) {
      console.error('Error in XP notification:', error);
      if (onComplete) onComplete();
    }
  }, [onComplete]);
  
  const getSourceIcon = (source) => {
    try {
      switch (source) {
        case 'killMob': return '⚔️';
        case 'breakBlock': return '⛏️';
        case 'placeBlock': return '🧱';
        case 'discoverArea': return '🗺️';
        case 'craftItem': return '🔨';
        case 'useMagic': return '✨';
        default: return '⭐';
      }
    } catch (error) {
      console.warn('Error getting source icon:', error);
      return '⭐';
    }
  };
  
  if (!notification) return null;
  
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

// Level Up Notification Component with error boundaries
export const LevelUpNotification = ({ notification, onComplete }) => {
  useEffect(() => {
    try {
      const timer = setTimeout(() => {
        if (onComplete) onComplete();
      }, 4000);
      
      return () => clearTimeout(timer);
    } catch (error) {
      console.error('Error in level up notification:', error);
      if (onComplete) onComplete();
    }
  }, [onComplete]);
  
  if (!notification) return null;
  
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

// Experience Bar Component with error handling
export const ExperienceBar = ({ playerData, className = "" }) => {
  if (!playerData) {
    console.warn('ExperienceBar: No player data provided');
    return null;
  }
  
  try {
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
  } catch (error) {
    console.error('Error rendering experience bar:', error);
    return (
      <div className={`bg-gray-800 rounded-lg p-3 ${className}`}>
        <div className="text-white text-sm">Experience system loading...</div>
      </div>
    );
  }
};

// Player Stats Component with error handling
export const PlayerStats = ({ playerData, className = "" }) => {
  if (!playerData || !playerData.stats) {
    return null;
  }
  
  try {
    return (
      <div className={`bg-gray-800 rounded-lg p-4 ${className}`}>
        <h3 className="text-white font-semibold mb-3 flex items-center">
          <Zap className="mr-2 text-blue-400" size={16} />
          Statistics
        </h3>
        
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-gray-300">
            <span>⚔️ Mobs Defeated:</span>
            <span className="text-white font-semibold">{playerData.stats.mobsKilled || 0}</span>
          </div>
          <div className="flex justify-between text-gray-300">
            <span>🧱 Blocks Placed:</span>
            <span className="text-white font-semibold">{playerData.stats.blocksPlaced || 0}</span>
          </div>
          <div className="flex justify-between text-gray-300">
            <span>⛏️ Blocks Broken:</span>
            <span className="text-white font-semibold">{playerData.stats.blocksBroken || 0}</span>
          </div>
          <div className="flex justify-between text-gray-300">
            <span>🗺️ Areas Explored:</span>
            <span className="text-white font-semibold">{playerData.stats.areasDiscovered || 0}</span>
          </div>
          <div className="flex justify-between text-gray-300">
            <span>✨ Spells Cast:</span>
            <span className="text-white font-semibold">{playerData.stats.spellsCast || 0}</span>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error('Error rendering player stats:', error);
    return null;
  }
};