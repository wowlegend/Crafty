import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

// Experience and Leveling System
export const useExperienceSystem = () => {
  const [playerLevel, setPlayerLevel] = useState(1);
  const [currentXP, setCurrentXP] = useState(0);
  const [totalXP, setTotalXP] = useState(0);
  const [xpGains, setXpGains] = useState([]);
  const [levelUpEffects, setLevelUpEffects] = useState([]);
  const xpGainId = useRef(0);

  // Calculate XP required for next level (exponential scaling)
  const getXPRequired = (level) => {
    return Math.floor(100 * Math.pow(1.5, level - 1));
  };

  const getCurrentLevelXP = () => getXPRequired(playerLevel);
  const getXPProgress = () => (currentXP / getCurrentLevelXP()) * 100;

  // Add experience with visual feedback
  const addExperience = (amount, reason = 'Action', position = null) => {
    const newXP = currentXP + amount;
    const requiredXP = getCurrentLevelXP();
    
    // Add visual XP gain
    const xpGain = {
      id: xpGainId.current++,
      amount,
      reason,
      position: position || { x: 0, y: 0, z: 0 },
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
      
      // Add visual level up particles
      if (window.createLevelUpParticles) {
        window.createLevelUpParticles(position);
      }
    }
    
    // Auto-remove XP gain after 3 seconds
    setTimeout(() => {
      setXpGains(prev => prev.filter(gain => gain.id !== xpGain.id));
    }, 3000);
  };

  // Experience sources
  const XP_SOURCES = {
    MOB_KILL: { amount: 25, reason: 'Mob Defeated' },
    BLOCK_PLACE: { amount: 2, reason: 'Block Placed' },
    BLOCK_BREAK: { amount: 3, reason: 'Block Broken' },
    EXPLORATION: { amount: 10, reason: 'New Area' },
    CRAFTING: { amount: 5, reason: 'Item Crafted' },
    MAGIC_CAST: { amount: 8, reason: 'Spell Cast' },
    RARE_BLOCK: { amount: 15, reason: 'Rare Material' }
  };

  // Expose functions globally
  useEffect(() => {
    window.addExperience = addExperience;
    window.getPlayerLevel = () => playerLevel;
    window.getPlayerXP = () => ({ current: currentXP, total: totalXP, level: playerLevel });
    
    // Quick access functions for common actions
    window.xpMobKill = (pos) => addExperience(XP_SOURCES.MOB_KILL.amount, XP_SOURCES.MOB_KILL.reason, pos);
    window.xpBlockPlace = (pos) => addExperience(XP_SOURCES.BLOCK_PLACE.amount, XP_SOURCES.BLOCK_PLACE.reason, pos);
    window.xpBlockBreak = (pos) => addExperience(XP_SOURCES.BLOCK_BREAK.amount, XP_SOURCES.BLOCK_BREAK.reason, pos);
    window.xpExploration = (pos) => addExperience(XP_SOURCES.EXPLORATION.amount, XP_SOURCES.EXPLORATION.reason, pos);
    window.xpCrafting = (pos) => addExperience(XP_SOURCES.CRAFTING.amount, XP_SOURCES.CRAFTING.reason, pos);
    window.xpMagicCast = (pos) => addExperience(XP_SOURCES.MAGIC_CAST.amount, XP_SOURCES.MAGIC_CAST.reason, pos);
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
export const XPGainVisual = ({ xpGains }) => {
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
            style={{
              marginLeft: `${(gain.position?.x || 0) * 10}px`,
              marginTop: `${-(gain.position?.y || 0) * 10}px`
            }}
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
export const LevelUpEffect = ({ levelUpEffects, onEffectComplete }) => {
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
            onAnimationComplete={() => onEffectComplete(effect.id)}
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
              <motion.div
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: [0, 1, 0], scale: [0, 1.5, 2] }}
                transition={{ delay: 0.3, duration: 1.5 }}
                className="absolute inset-0 border-4 border-yellow-400 rounded-full"
              />
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

// Experience Bar UI Component
export const ExperienceBar = ({ level, currentXP, xpRequired, xpProgress }) => {
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

// 3D Level Up Particles Effect
export const LevelUpParticles = () => {
  const [particles, setParticles] = useState([]);
  const particleId = useRef(0);

  useEffect(() => {
    window.createLevelUpParticles = (position = { x: 0, y: 0, z: 0 }) => {
      const newParticles = [];
      
      for (let i = 0; i < 20; i++) {
        newParticles.push({
          id: particleId.current++,
          position: new THREE.Vector3(
            position.x + (Math.random() - 0.5) * 4,
            position.y + Math.random() * 3,
            position.z + (Math.random() - 0.5) * 4
          ),
          velocity: new THREE.Vector3(
            (Math.random() - 0.5) * 10,
            Math.random() * 15 + 5,
            (Math.random() - 0.5) * 10
          ),
          age: 0,
          maxAge: 3000,
          size: 0.1 + Math.random() * 0.1
        });
      }
      
      setParticles(prev => [...prev, ...newParticles]);
    };
  }, []);

  useFrame((state, delta) => {
    const deltaMs = delta * 1000;
    
    setParticles(prev => prev.map(particle => ({
      ...particle,
      position: particle.position.clone().add(
        particle.velocity.clone().multiplyScalar(delta)
      ),
      velocity: particle.velocity.clone().add(new THREE.Vector3(0, -20 * delta, 0)), // Gravity
      age: particle.age + deltaMs
    })).filter(particle => particle.age < particle.maxAge));
  });

  return (
    <group>
      {particles.map(particle => {
        const opacity = 1 - (particle.age / particle.maxAge);
        return (
          <mesh key={particle.id} position={particle.position}>
            <sphereGeometry args={[particle.size, 6, 6]} />
            <meshBasicMaterial 
              color="#FFD700"
              transparent
              opacity={opacity}
              emissive="#FFD700"
              emissiveIntensity={0.5}
            />
          </mesh>
        );
      })}
    </group>
  );
};

export default useExperienceSystem;
