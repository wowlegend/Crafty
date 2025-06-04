import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameSounds } from './SoundManager';

// Enhanced NPC and Mob System with Combat
export const NPCSystem = ({ gameState }) => {
  const [entities, setEntities] = useState([]);
  const { camera } = useThree();

  useEffect(() => {
    // Initialize entities positioned ON SOLID GROUND
    const initialEntities = [
      // Friendly NPCs
      {
        id: 'villager_1',
        type: 'villager',
        position: [8, 7, 12], // Higher Y position to ensure on ground
        health: 100,
        maxHealth: 100,
        state: 'idle',
        hostile: false,
        inventory: ['iron', 'gold', 'diamond'],
        dialogue: [
          "Hello, traveler! Welcome to our world!",
          "I have some rare materials to trade.",
          "Would you like to see my wares?"
        ]
      },
      
      // Passive Animals
      {
        id: 'pig_1',
        type: 'pig',
        position: [15, 7, -8], // Higher Y position
        health: 50,
        maxHealth: 50,
        state: 'wandering',
        hostile: false,
        drops: ['meat']
      },
      {
        id: 'chicken_1',
        type: 'chicken',
        position: [-8, 7, -12], // Higher Y position
        health: 30,
        maxHealth: 30,
        state: 'wandering',
        hostile: false,
        drops: ['feather']
      },
      
      // Hostile Mobs (spawn on ground)
      {
        id: 'zombie_1',
        type: 'zombie',
        position: [-20, 7, -20], // Higher Y position
        health: 100,
        maxHealth: 100,
        state: 'hostile',
        hostile: true,
        damage: 15,
        drops: ['flesh']
      },
      {
        id: 'skeleton_1',
        type: 'skeleton',
        position: [-25, 7, 10], // Higher Y position
        health: 80,
        maxHealth: 80,
        state: 'hostile',
        hostile: true,
        damage: 20,
        drops: ['bone', 'arrow']
      }
    ];

    setEntities(initialEntities);
    console.log('🎮 NPCs initialized on solid ground:', initialEntities.length);
  }, []);

  // WORKING combat system with visual feedback
  const attackEntity = (entityId) => {
    setEntities(prev => prev.map(entity => {
      if (entity.id === entityId) {
        const damage = 25;
        const newHealth = Math.max(0, entity.health - damage);
        
        // Add simple visual feedback
        console.log(`⚔️ ATTACKING ${entity.type}! Damage: ${damage}`);
        
        if (newHealth <= 0) {
          // Entity dies - drop items
          if (entity.drops) {
            entity.drops.forEach(drop => {
              gameState.addToInventory?.(drop, 1);
            });
          }
          console.log(`💀 ${entity.type} DEFEATED! Dropped: ${entity.drops?.join(', ') || 'nothing'}`);
          
          // Add a simple death indicator
          if (typeof window !== 'undefined' && window.alert) {
            setTimeout(() => {
              console.log(`🎉 Victory! You defeated the ${entity.type}!`);
            }, 100);
          }
          
          return null; // Remove entity
        } else {
          console.log(`💥 ${entity.type} health: ${newHealth}/${entity.maxHealth}`);
          return { ...entity, health: newHealth };
        }
      }
      return entity;
    }).filter(Boolean));
  };

  // Expose attack function globally
  useEffect(() => {
    window.attackEntity = attackEntity;
  }, []);

  return (
    <group>
      {entities.map(entity => (
        <Entity 
          key={entity.id} 
          entity={entity} 
          gameState={gameState}
          camera={camera}
          onInteract={(id) => handleEntityInteraction(id, entities, setEntities)}
          onAttack={attackEntity}
        />
      ))}
    </group>
  );
};

const Entity = ({ entity, gameState, camera, onInteract, onAttack }) => {
  const meshRef = useRef();
  const [currentPos, setCurrentPos] = useState(entity.position);

  useFrame((state, delta) => {
    if (meshRef.current && camera) {
      const playerPos = camera.position;
      const entityPos = new THREE.Vector3(...entity.position);
      const distance = playerPos.distanceTo(entityPos);

      // SIMPLE AI behavior - minimal animation to prevent shaking
      if (entity.type === 'villager') {
        // Villagers stay completely still
        meshRef.current.position.set(...entity.position);
        
      } else if (entity.hostile) {
        // Hostile mobs - simple chase behavior
        if (distance < 15) {
          const direction = new THREE.Vector3()
            .subVectors(playerPos, entityPos)
            .normalize();
          
          const speed = 1;
          meshRef.current.position.x += direction.x * speed * delta;
          meshRef.current.position.z += direction.z * speed * delta;
          
          // Keep Y position stable
          meshRef.current.position.y = entity.position[1];
        }
        
      } else {
        // Passive animals - minimal wandering
        const wanderRadius = 2;
        const centerX = entity.position[0];
        const centerZ = entity.position[2];
        
        const time = state.clock.elapsedTime * 0.1; // Very slow movement
        const newX = centerX + Math.sin(time) * wanderRadius;
        const newZ = centerZ + Math.cos(time) * wanderRadius;
        
        meshRef.current.position.x = newX;
        meshRef.current.position.z = newZ;
        meshRef.current.position.y = entity.position[1]; // Fixed Y
      }
    }
  });

  const handleClick = (event) => {
    event.stopPropagation();
    
    if (event.shiftKey) {
      // Shift+click to attack
      onAttack(entity.id);
    } else {
      // Regular click to interact
      onInteract(entity.id);
    }
  };

  return (
    <group>
      <mesh 
        ref={meshRef} 
        position={entity.position}
        onClick={handleClick}
        userData={{ isNPC: true, entityType: entity.type, entityId: entity.id }}
      >
        {entity.type === 'villager' && <VillagerModel />}
        {entity.type === 'pig' && <PigModel />}
        {entity.type === 'chicken' && <ChickenModel />}
        {entity.type === 'cow' && <CowModel />}
        {entity.type === 'zombie' && <ZombieModel />}
        {entity.type === 'skeleton' && <SkeletonModel />}
        {entity.type === 'creeper' && <CreeperModel />}
      </mesh>
      
      {/* Simple health bar */}
      {entity.health < entity.maxHealth && (
        <HealthBar entity={entity} position={[entity.position[0], entity.position[1] + 2, entity.position[2]]} />
      )}
    </group>
  );
};

// Health bar component
const HealthBar = ({ entity, position }) => {
  if (entity.health >= entity.maxHealth) return null;
  
  const healthPercent = entity.health / entity.maxHealth;
  const barColor = healthPercent > 0.5 ? '#00ff00' : healthPercent > 0.25 ? '#ffff00' : '#ff0000';
  
  return (
    <group position={position}>
      {/* Background bar */}
      <mesh position={[0, 0, 0]}>
        <planeGeometry args={[1, 0.1]} />
        <meshBasicMaterial color="#333333" />
      </mesh>
      {/* Health bar */}
      <mesh position={[-0.5 + (healthPercent * 0.5), 0, 0.01]} scale={[healthPercent, 1, 1]}>
        <planeGeometry args={[1, 0.1]} />
        <meshBasicMaterial color={barColor} />
      </mesh>
    </group>
  );
};

// NEW MOB MODELS

const CowModel = () => {
  return (
    <group scale={1.2}>
      {/* Body */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.2, 0.8, 2]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
      
      {/* White spots */}
      <mesh position={[0.1, 0.1, 0.2]}>
        <boxGeometry args={[0.3, 0.3, 0.3]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[-0.2, 0, -0.3]}>
        <boxGeometry args={[0.4, 0.4, 0.4]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      
      {/* Head */}
      <mesh position={[0, 0.2, 1.2]}>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
      
      {/* Legs */}
      {[-0.4, 0.4].map((x, i) => 
        [0.7, -0.7].map((z, j) => (
          <mesh key={`${i}-${j}`} position={[x, -0.7, z]}>
            <boxGeometry args={[0.3, 0.6, 0.3]} />
            <meshBasicMaterial color="#000000" />
          </mesh>
        ))
      )}
    </group>
  );
};

const ZombieModel = () => {
  return (
    <group scale={1.1}>
      {/* Body */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.6, 1.2, 0.3]} />
        <meshBasicMaterial color="#2F4F2F" />
      </mesh>
      
      {/* Head */}
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshBasicMaterial color="#90EE90" />
      </mesh>
      
      {/* Eyes (red) */}
      <mesh position={[-0.1, 0.95, 0.26]}>
        <boxGeometry args={[0.05, 0.05, 0.05]} />
        <meshBasicMaterial color="#ff0000" />
      </mesh>
      <mesh position={[0.1, 0.95, 0.26]}>
        <boxGeometry args={[0.05, 0.05, 0.05]} />
        <meshBasicMaterial color="#ff0000" />
      </mesh>
      
      {/* Arms */}
      <mesh position={[-0.4, 0.3, 0]} rotation={[0, 0, 0.5]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshBasicMaterial color="#2F4F2F" />
      </mesh>
      <mesh position={[0.4, 0.3, 0]} rotation={[0, 0, -0.5]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshBasicMaterial color="#2F4F2F" />
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
    </group>
  );
};

const SkeletonModel = () => {
  return (
    <group scale={1.1}>
      {/* Body */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.6, 1.2, 0.3]} />
        <meshBasicMaterial color="#F5F5DC" />
      </mesh>
      
      {/* Head */}
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshBasicMaterial color="#F5F5DC" />
      </mesh>
      
      {/* Dark eye sockets */}
      <mesh position={[-0.1, 0.95, 0.26]}>
        <boxGeometry args={[0.08, 0.08, 0.05]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
      <mesh position={[0.1, 0.95, 0.26]}>
        <boxGeometry args={[0.08, 0.08, 0.05]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
      
      {/* Arms */}
      <mesh position={[-0.4, 0.3, 0]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshBasicMaterial color="#F5F5DC" />
      </mesh>
      <mesh position={[0.4, 0.3, 0]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshBasicMaterial color="#F5F5DC" />
      </mesh>
      
      {/* Bow */}
      <mesh position={[0.6, 0.5, 0]}>
        <boxGeometry args={[0.1, 0.6, 0.1]} />
        <meshBasicMaterial color="#8B4513" />
      </mesh>
      
      {/* Legs */}
      <mesh position={[-0.2, -0.8, 0]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshBasicMaterial color="#F5F5DC" />
      </mesh>
      <mesh position={[0.2, -0.8, 0]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshBasicMaterial color="#F5F5DC" />
      </mesh>
    </group>
  );
};

const CreeperModel = () => {
  return (
    <group scale={1.1}>
      {/* Body */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.6, 1.2, 0.6]} />
        <meshBasicMaterial color="#0F5132" />
      </mesh>
      
      {/* Head */}
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshBasicMaterial color="#0F5132" />
      </mesh>
      
      {/* Face pattern (dark green pixels) */}
      <mesh position={[-0.1, 0.95, 0.26]}>
        <boxGeometry args={[0.05, 0.15, 0.05]} />
        <meshBasicMaterial color="#064420" />
      </mesh>
      <mesh position={[0.1, 0.95, 0.26]}>
        <boxGeometry args={[0.05, 0.15, 0.05]} />
        <meshBasicMaterial color="#064420" />
      </mesh>
      <mesh position={[0, 0.85, 0.26]}>
        <boxGeometry args={[0.08, 0.05, 0.05]} />
        <meshBasicMaterial color="#064420" />
      </mesh>
      
      {/* Legs */}
      <mesh position={[-0.15, -0.8, -0.15]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshBasicMaterial color="#0F5132" />
      </mesh>
      <mesh position={[0.15, -0.8, -0.15]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshBasicMaterial color="#0F5132" />
      </mesh>
      <mesh position={[-0.15, -0.8, 0.15]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshBasicMaterial color="#0F5132" />
      </mesh>
      <mesh position={[0.15, -0.8, 0.15]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshBasicMaterial color="#0F5132" />
      </mesh>
    </group>
  );
};

// Keep existing models (VillagerModel, PigModel, ChickenModel)
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
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.8, 0.6, 1.2]} />
        <meshBasicMaterial color="#FFC0CB" />
      </mesh>
      <mesh position={[0, 0.1, 0.7]}>
        <boxGeometry args={[0.6, 0.5, 0.6]} />
        <meshBasicMaterial color="#FFC0CB" />
      </mesh>
      <mesh position={[0, -0.1, 1.0]}>
        <boxGeometry args={[0.3, 0.2, 0.2]} />
        <meshBasicMaterial color="#FFB6C1" />
      </mesh>
      {[-0.3, 0.3].map((x, i) => 
        [0.4, -0.4].map((z, j) => (
          <mesh key={`${i}-${j}`} position={[x, -0.5, z]}>
            <boxGeometry args={[0.2, 0.4, 0.2]} />
            <meshBasicMaterial color="#FFC0CB" />
          </mesh>
        ))
      )}
    </group>
  );
};

const ChickenModel = () => {
  return (
    <group scale={0.5}>
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.4, 8, 6]} />
        <meshBasicMaterial color="#FFFFFF" />
      </mesh>
      <mesh position={[0, 0.5, 0.3]}>
        <sphereGeometry args={[0.25, 8, 6]} />
        <meshBasicMaterial color="#FFFFFF" />
      </mesh>
      <mesh position={[0, 0.4, 0.5]}>
        <coneGeometry args={[0.1, 0.2, 4]} />
        <meshBasicMaterial color="#FF8C00" />
      </mesh>
      <mesh position={[0, 0.7, 0.3]}>
        <boxGeometry args={[0.1, 0.2, 0.1]} />
        <meshBasicMaterial color="#FF0000" />
      </mesh>
      {[-0.3, 0.3].map((x, i) => (
        <mesh key={i} position={[x, 0, 0]} rotation={[0, 0, i === 0 ? Math.PI / 6 : -Math.PI / 6]}>
          <boxGeometry args={[0.1, 0.4, 0.6]} />
          <meshBasicMaterial color="#F5F5F5" />
        </mesh>
      ))}
      {[-0.1, 0.1].map((x, i) => (
        <mesh key={i} position={[x, -0.5, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.3, 6]} />
          <meshBasicMaterial color="#FF8C00" />
        </mesh>
      ))}
    </group>
  );
};

// Combat Instructions Component
export const CombatInstructions = () => {
  return (
    <div className="absolute top-4 right-4 bg-black/70 text-white p-3 rounded-lg text-sm max-w-xs">
      <h3 className="font-bold mb-2">Combat Controls:</h3>
      <ul className="space-y-1">
        <li><strong>Shift + Click:</strong> Attack mob</li>
        <li><strong>Regular Click:</strong> Interact/Trade</li>
        <li><strong>Hostile Mobs:</strong> Zombies, Skeletons, Creepers</li>
        <li><strong>Passive Mobs:</strong> Pigs, Chickens, Cows</li>
      </ul>
    </div>
  );
};

// Trading System Component (keep existing)
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
  } else if (entity.hostile) {
    console.log(`This ${entity.type} is hostile! Use Shift+Click to attack!`);
  } else {
    // Peaceful animals
    console.log(`You pet the ${entity.type}!`);
  }
};