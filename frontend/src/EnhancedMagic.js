import React, { useState, useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { motion } from 'framer-motion';
import * as THREE from 'three';
import { useGameSounds } from './SoundManager';
import { 
  Zap, 
  Wand2, 
  Star, 
  Target, 
  Square,
  Move3D,
  Hammer,
  Eye
} from 'lucide-react';

// Enhanced Magic System with Real Effects
export const EnhancedMagicSystem = ({ gameState, onClose }) => {
  const [selectedSpell, setSelectedSpell] = useState(null);
  const [castingAnimation, setCastingAnimation] = useState(false);
  const { playMagic } = useGameSounds();

  const spells = [
    {
      id: 'teleport',
      name: 'Teleport',
      description: 'Instantly move to target location',
      cost: { crystals: 1 },
      icon: Move3D,
      color: '#9333ea',
      effect: 'teleport'
    },
    {
      id: 'mass_break',
      name: 'Mass Break',
      description: 'Break 3x3 area of blocks',
      cost: { crystals: 2 },
      icon: Hammer,
      color: '#dc2626',
      effect: 'mass_break'
    },
    {
      id: 'build_wall',
      name: 'Build Wall',
      description: 'Instantly create a wall of blocks',
      cost: { crystals: 3, scrolls: 1 },
      icon: Square,
      color: '#16a34a',
      effect: 'build_wall'
    },
    {
      id: 'x_ray',
      name: 'X-Ray Vision',
      description: 'See through blocks to find ores',
      cost: { crystals: 2 },
      icon: Eye,
      color: '#0891b2',
      effect: 'x_ray'
    },
    {
      id: 'lightning',
      name: 'Lightning Strike',
      description: 'Strike target area with lightning',
      cost: { crystals: 4 },
      icon: Zap,
      color: '#facc15',
      effect: 'lightning'
    },
    {
      id: 'transmute',
      name: 'Transmute',
      description: 'Change block type to another',
      cost: { crystals: 1, scrolls: 1 },
      icon: Star,
      color: '#f59e0b',
      effect: 'transmute'
    }
  ];

  const canCastSpell = (spell) => {
    return Object.entries(spell.cost).every(([item, needed]) => 
      (gameState.inventory.magic[item] || 0) >= needed
    );
  };

  const castSpell = (spell) => {
    if (!canCastSpell(spell)) return;

    setCastingAnimation(true);
    playMagic();
    
    // Consume magic resources
    Object.entries(spell.cost).forEach(([item, needed]) => {
      gameState.setInventory(prev => ({
        ...prev,
        magic: {
          ...prev.magic,
          [item]: (prev.magic[item] || 0) - needed
        }
      }));
    });

    // Trigger spell effect
    gameState.setActiveSpell(spell);

    setTimeout(() => {
      setCastingAnimation(false);
    }, 1000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="absolute inset-0 bg-black/50 flex items-center justify-center z-30"
      onClick={onClose}
    >
      <div
        className="bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto border-2 border-purple-500"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <Wand2 className="text-purple-400" />
              Enhanced Magic System
            </h2>
            <p className="text-purple-200 text-sm">Cast powerful spells to aid your building</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        {/* Magic Resources Display */}
        <div className="mb-6 p-4 bg-purple-800/50 rounded-lg">
          <h3 className="text-white font-semibold mb-2">Magic Resources</h3>
          <div className="flex space-x-6">
            <div className="flex items-center gap-2">
              <Star className="text-blue-400" size={20} />
              <span className="text-white">Crystals: {gameState.inventory.magic.crystals || 0}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-yellow-400 rounded" />
              <span className="text-white">Scrolls: {gameState.inventory.magic.scrolls || 0}</span>
            </div>
            <div className="flex items-center gap-2">
              <Wand2 className="text-purple-400" size={20} />
              <span className="text-white">Wands: {gameState.inventory.magic.wand || 0}</span>
            </div>
          </div>
        </div>

        {/* Spell Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {spells.map(spell => {
            const IconComponent = spell.icon;
            const available = canCastSpell(spell);
            
            return (
              <motion.div
                key={spell.id}
                className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  available 
                    ? 'bg-purple-800/30 border-purple-500 hover:bg-purple-700/40' 
                    : 'bg-gray-800/30 border-gray-600 opacity-50'
                } ${selectedSpell?.id === spell.id ? 'ring-2 ring-white' : ''}`}
                onClick={() => available && setSelectedSpell(spell)}
                whileHover={available ? { scale: 1.02 } : {}}
                whileTap={available ? { scale: 0.98 } : {}}
              >
                <div className="flex items-start gap-3">
                  <div 
                    className="p-3 rounded-lg"
                    style={{ backgroundColor: `${spell.color}20`, border: `2px solid ${spell.color}` }}
                  >
                    <IconComponent size={24} style={{ color: spell.color }} />
                  </div>
                  
                  <div className="flex-1">
                    <h3 className="text-white font-semibold mb-1">{spell.name}</h3>
                    <p className="text-gray-300 text-sm mb-2">{spell.description}</p>
                    
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-purple-300">
                        Cost: {Object.entries(spell.cost).map(([item, count]) => 
                          `${count} ${item}`
                        ).join(', ')}
                      </div>
                      
                      {available && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            castSpell(spell);
                          }}
                          disabled={castingAnimation}
                          className={`px-3 py-1 rounded text-sm font-medium transition-all ${
                            castingAnimation 
                              ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
                              : 'bg-purple-600 hover:bg-purple-500 text-white'
                          }`}
                        >
                          {castingAnimation ? 'Casting...' : 'Cast'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {castingAnimation && selectedSpell?.id === spell.id && (
                  <motion.div
                    className="absolute inset-0 bg-purple-500/20 rounded-lg flex items-center justify-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <motion.div
                      className="w-8 h-8 border-4 border-purple-400 border-t-transparent rounded-full"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    />
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Spell Instructions */}
        {selectedSpell && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 p-4 bg-indigo-800/50 rounded-lg border border-indigo-500"
          >
            <h4 className="text-white font-semibold mb-2">How to use {selectedSpell.name}:</h4>
            <p className="text-indigo-200 text-sm">
              {getSpellInstructions(selectedSpell.effect)}
            </p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

const getSpellInstructions = (effect) => {
  switch (effect) {
    case 'teleport':
      return 'After casting, click anywhere in the world to instantly teleport to that location.';
    case 'mass_break':
      return 'After casting, click on a block to break a 3x3 area around it.';
    case 'build_wall':
      return 'After casting, click and drag to create a wall of your selected block type.';
    case 'x_ray':
      return 'Temporarily makes stone blocks transparent, revealing ores underneath.';
    case 'lightning':
      return 'After casting, click on a location to strike it with lightning.';
    case 'transmute':
      return 'After casting, click on blocks to change them to your selected block type.';
    default:
      return 'Cast the spell and follow the visual indicators.';
  }
};

// Spell Effect Components for 3D world
export const SpellEffects = ({ activeSpell, gameState }) => {
  if (!activeSpell) return null;

  switch (activeSpell.effect) {
    case 'lightning':
      return <LightningEffect />;
    case 'x_ray':
      return <XRayEffect />;
    default:
      return <MagicAura />;
  }
};

const LightningEffect = () => {
  const lightningRef = useRef();
  const [visible, setVisible] = useState(true);

  useFrame((state) => {
    if (lightningRef.current) {
      lightningRef.current.rotation.y = state.clock.elapsedTime * 2;
      lightningRef.current.material.opacity = Math.abs(Math.sin(state.clock.elapsedTime * 8)) * 0.8 + 0.2;
    }
  });

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <mesh ref={lightningRef} position={[0, 10, 0]}>
      <cylinderGeometry args={[0.1, 0.1, 20, 8]} />
      <meshBasicMaterial color="#ffff00" transparent />
    </mesh>
  );
};

const XRayEffect = () => {
  // This would modify the world rendering to make stone blocks transparent
  // Implementation would be in the main world component
  return null;
};

const MagicAura = () => {
  const auraRef = useRef();

  useFrame((state) => {
    if (auraRef.current) {
      auraRef.current.rotation.y = state.clock.elapsedTime;
      auraRef.current.rotation.x = Math.sin(state.clock.elapsedTime) * 0.1;
      auraRef.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 2) * 0.1);
    }
  });

  return (
    <mesh ref={auraRef} position={[0, 2, 0]}>
      <torusGeometry args={[2, 0.1, 8, 20]} />
      <meshBasicMaterial color="#9333ea" transparent opacity={0.5} />
    </mesh>
  );
};