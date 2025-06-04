import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameSounds } from './SoundManager';

// NPC and Mob System
export const NPCSystem = ({ gameState }) => {
  const [entities, setEntities] = useState([]);

  useEffect(() => {
    // Initialize NPCs and mobs
    const initialEntities = [
      {
        id: 'villager_1',
        type: 'villager',
        position: [5, 2, 5],
        health: 100,
        state: 'idle',
        inventory: ['iron', 'gold', 'diamond'],
        dialogue: [
          "Hello, traveler! Welcome to our world!",
          "I have some rare materials to trade.",
          "Would you like to see my wares?"
        ]
      },
      {
        id: 'villager_2',
        type: 'villager',
        position: [-8, 2, 3],
        health: 100,
        state: 'walking',
        inventory: ['wood', 'stone', 'glass'],
        dialogue: [
          "Beautiful day for building, isn't it?",
          "I specialize in construction materials.",
          "Let me know if you need anything!"
        ]
      },
      {
        id: 'pig_1',
        type: 'pig',
        position: [10, 2, -5],
        health: 50,
        state: 'wandering'
      },
      {
        id: 'chicken_1',
        type: 'chicken',
        position: [-3, 2, -8],
        health: 30,
        state: 'wandering'
      }
    ];

    setEntities(initialEntities);
  }, []);

  return (
    <group>
      {entities.map(entity => (
        <Entity 
          key={entity.id} 
          entity={entity} 
          gameState={gameState}
          onInteract={(id) => handleEntityInteraction(id, entities, setEntities)}
        />
      ))}
    </group>
  );
};

const Entity = ({ entity, gameState, onInteract }) => {
  const meshRef = useRef();
  const [currentPos, setCurrentPos] = useState(entity.position);
  const [animationTime, setAnimationTime] = useState(0);

  useFrame((state, delta) => {
    setAnimationTime(prev => prev + delta);

    if (meshRef.current) {
      // AI behavior based on entity type
      if (entity.type === 'villager') {
        // Villagers stay mostly in place but look around
        meshRef.current.rotation.y = Math.sin(animationTime * 0.5) * 0.3;
        meshRef.current.position.y = entity.position[1] + Math.sin(animationTime * 2) * 0.05;
      } else if (entity.type === 'pig' || entity.type === 'chicken') {
        // Animals wander around
        if (entity.state === 'wandering') {
          const wanderRadius = 3;
          const centerX = entity.position[0];
          const centerZ = entity.position[2];
          
          const newX = centerX + Math.sin(animationTime * 0.3) * wanderRadius;
          const newZ = centerZ + Math.cos(animationTime * 0.3) * wanderRadius;
          
          meshRef.current.position.x = newX;
          meshRef.current.position.z = newZ;
          meshRef.current.position.y = entity.position[1] + Math.sin(animationTime * 4) * 0.02;
          
          // Face movement direction
          meshRef.current.lookAt(
            newX + Math.sin(animationTime * 0.3),
            entity.position[1],
            newZ + Math.cos(animationTime * 0.3)
          );
        }
      }
    }
  });

  const handleClick = () => {
    onInteract(entity.id);
  };

  return (
    <mesh 
      ref={meshRef} 
      position={entity.position}
      onClick={handleClick}
      userData={{ isNPC: true, entityType: entity.type }}
    >
      {entity.type === 'villager' && <VillagerModel />}
      {entity.type === 'pig' && <PigModel />}
      {entity.type === 'chicken' && <ChickenModel />}
    </mesh>
  );
};

const VillagerModel = () => {
  return (
    <group>
      {/* Body */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.6, 1.2, 0.3]} />
        <meshBasicMaterial color="#8B4513" />
      </mesh>
      
      {/* Head */}
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshBasicMaterial color="#FDBCB4" />
      </mesh>
      
      {/* Arms */}
      <mesh position={[-0.4, 0.3, 0]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshBasicMaterial color="#8B4513" />
      </mesh>
      <mesh position={[0.4, 0.3, 0]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshBasicMaterial color="#8B4513" />
      </mesh>
      
      {/* Legs */}
      <mesh position={[-0.2, -0.8, 0]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshBasicMaterial color="#654321" />
      </mesh>
      <mesh position={[0.2, -0.8, 0]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshBasicMaterial color="#654321" />
      </mesh>
      
      {/* Hat */}
      <mesh position={[0, 1.3, 0]}>
        <cylinderGeometry args={[0.3, 0.25, 0.1, 8]} />
        <meshBasicMaterial color="#228B22" />
      </mesh>
    </group>
  );
};

const PigModel = () => {
  return (
    <group scale={0.7}>
      {/* Body */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.8, 0.6, 1.2]} />
        <meshBasicMaterial color="#FFC0CB" />
      </mesh>
      
      {/* Head */}
      <mesh position={[0, 0.1, 0.7]}>
        <boxGeometry args={[0.6, 0.5, 0.6]} />
        <meshBasicMaterial color="#FFC0CB" />
      </mesh>
      
      {/* Snout */}
      <mesh position={[0, -0.1, 1.0]}>
        <boxGeometry args={[0.3, 0.2, 0.2]} />
        <meshBasicMaterial color="#FFB6C1" />
      </mesh>
      
      {/* Legs */}
      <mesh position={[-0.3, -0.5, 0.4]}>
        <boxGeometry args={[0.2, 0.4, 0.2]} />
        <meshBasicMaterial color="#FFC0CB" />
      </mesh>
      <mesh position={[0.3, -0.5, 0.4]}>
        <boxGeometry args={[0.2, 0.4, 0.2]} />
        <meshBasicMaterial color="#FFC0CB" />
      </mesh>
      <mesh position={[-0.3, -0.5, -0.4]}>
        <boxGeometry args={[0.2, 0.4, 0.2]} />
        <meshBasicMaterial color="#FFC0CB" />
      </mesh>
      <mesh position={[0.3, -0.5, -0.4]}>
        <boxGeometry args={[0.2, 0.4, 0.2]} />
        <meshBasicMaterial color="#FFC0CB" />
      </mesh>
      
      {/* Tail */}
      <mesh position={[0, 0.2, -0.7]} rotation={[0, 0, Math.PI / 4]}>
        <cylinderGeometry args={[0.05, 0.05, 0.3, 6]} />
        <meshBasicMaterial color="#FFC0CB" />
      </mesh>
    </group>
  );
};

const ChickenModel = () => {
  return (
    <group scale={0.5}>
      {/* Body */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.4, 8, 6]} />
        <meshBasicMaterial color="#FFFFFF" />
      </mesh>
      
      {/* Head */}
      <mesh position={[0, 0.5, 0.3]}>
        <sphereGeometry args={[0.25, 8, 6]} />
        <meshBasicMaterial color="#FFFFFF" />
      </mesh>
      
      {/* Beak */}
      <mesh position={[0, 0.4, 0.5]}>
        <coneGeometry args={[0.1, 0.2, 4]} />
        <meshBasicMaterial color="#FF8C00" />
      </mesh>
      
      {/* Comb */}
      <mesh position={[0, 0.7, 0.3]}>
        <boxGeometry args={[0.1, 0.2, 0.1]} />
        <meshBasicMaterial color="#FF0000" />
      </mesh>
      
      {/* Wings */}
      <mesh position={[-0.3, 0, 0]} rotation={[0, 0, Math.PI / 6]}>
        <boxGeometry args={[0.1, 0.4, 0.6]} />
        <meshBasicMaterial color="#F5F5F5" />
      </mesh>
      <mesh position={[0.3, 0, 0]} rotation={[0, 0, -Math.PI / 6]}>
        <boxGeometry args={[0.1, 0.4, 0.6]} />
        <meshBasicMaterial color="#F5F5F5" />
      </mesh>
      
      {/* Legs */}
      <mesh position={[-0.1, -0.5, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.3, 6]} />
        <meshBasicMaterial color="#FF8C00" />
      </mesh>
      <mesh position={[0.1, -0.5, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.3, 6]} />
        <meshBasicMaterial color="#FF8C00" />
      </mesh>
    </group>
  );
};

// Trading System Component
export const TradingInterface = ({ villager, onClose, gameState }) => {
  const [selectedOffer, setSelectedOffer] = useState(null);

  const tradeOffers = [
    {
      id: 1,
      wants: { item: 'iron', quantity: 5 },
      offers: { item: 'diamond', quantity: 1 },
      stock: 3
    },
    {
      id: 2,
      wants: { item: 'wood', quantity: 10 },
      offers: { item: 'gold', quantity: 2 },
      stock: 5
    },
    {
      id: 3,
      wants: { item: 'stone', quantity: 20 },
      offers: { item: 'glass', quantity: 8 },
      stock: 10
    }
  ];

  const canTrade = (offer) => {
    const playerHas = gameState.inventory.blocks[offer.wants.item] || 0;
    return playerHas >= offer.wants.quantity && offer.stock > 0;
  };

  const executeTrade = (offer) => {
    if (!canTrade(offer)) return;

    // Remove items from player
    gameState.removeFromInventory(offer.wants.item, offer.wants.quantity);
    
    // Add items to player
    gameState.addToInventory(offer.offers.item, offer.offers.quantity);
    
    // Reduce stock
    offer.stock--;
    
    console.log(`Traded ${offer.wants.quantity} ${offer.wants.item} for ${offer.offers.quantity} ${offer.offers.item}`);
  };

  if (!villager) return null;

  return (
    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-40">
      <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-white">Trading Post</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">×</button>
        </div>
        
        <div className="mb-4">
          <p className="text-gray-300 italic">"{villager.dialogue[0]}"</p>
        </div>

        <div className="space-y-3">
          {tradeOffers.map(offer => (
            <div 
              key={offer.id}
              className={`p-3 rounded border-2 cursor-pointer transition-all ${
                canTrade(offer) 
                  ? 'border-green-500 bg-green-900/20 hover:bg-green-900/40' 
                  : 'border-gray-600 bg-gray-900/20 opacity-50'
              }`}
              onClick={() => canTrade(offer) && executeTrade(offer)}
            >
              <div className="flex justify-between items-center">
                <div className="text-white">
                  <span className="text-red-400">{offer.wants.quantity} {offer.wants.item}</span>
                  <span className="mx-2">→</span>
                  <span className="text-green-400">{offer.offers.quantity} {offer.offers.item}</span>
                </div>
                <div className="text-sm text-gray-400">
                  Stock: {offer.stock}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const handleEntityInteraction = (entityId, entities, setEntities) => {
  const entity = entities.find(e => e.id === entityId);
  if (!entity) return;

  if (entity.type === 'villager') {
    // Open trading interface or show dialogue
    console.log(`Interacting with villager: ${entity.dialogue[0]}`);
    // This would open the trading interface
  } else if (entity.type === 'pig' || entity.type === 'chicken') {
    // Animals might drop items or just make sounds
    console.log(`You pet the ${entity.type}!`);
  }
};