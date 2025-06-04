import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// SIMPLIFIED NPC System that spawns properly on terrain
export const NPCSystem = ({ gameState }) => {
  const [entities, setEntities] = useState([]);
  const { camera } = useThree();
  const [terrainReady, setTerrainReady] = useState(false);

  // Wait for terrain to be ready, then spawn NPCs
  useEffect(() => {
    const checkTerrain = () => {
      if (window.getHighestBlockAt) {
        setTerrainReady(true);
        return true;
      }
      return false;
    };

    if (checkTerrain()) {
      return;
    }

    const interval = setInterval(() => {
      if (checkTerrain()) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!terrainReady) return;

    console.log('🎮 Initializing NPCs on terrain...');
    
    const spawnPositions = [
      { x: 15, z: 10 },
      { x: -12, z: 15 },
      { x: 20, z: -8 },
      { x: -18, z: -12 },
      { x: 8, z: 25 }
    ];

    const initialEntities = spawnPositions.map((pos, index) => {
      const groundY = window.getHighestBlockAt(pos.x, pos.z) + 1;
      
      const entityTypes = ['villager', 'pig', 'chicken', 'zombie', 'skeleton'];
      const entityType = entityTypes[index % entityTypes.length];
      
      return {
        id: `entity_${index}`,
        type: entityType,
        position: [pos.x, groundY, pos.z],
        health: entityType === 'villager' ? 100 : entityType === 'zombie' ? 80 : 50,
        maxHealth: entityType === 'villager' ? 100 : entityType === 'zombie' ? 80 : 50,
        hostile: ['zombie', 'skeleton'].includes(entityType),
        initialPosition: [pos.x, groundY, pos.z],
        wanderRadius: entityType === 'villager' ? 3 : 5
      };
    });

    setEntities(initialEntities);
    console.log('✅ NPCs spawned:', initialEntities.length);
  }, [terrainReady]);

  // Attack function
  const attackEntity = (entityId) => {
    setEntities(prev => prev.map(entity => {
      if (entity.id === entityId) {
        const damage = 25;
        const newHealth = Math.max(0, entity.health - damage);
        
        console.log(`⚔️ Attacking ${entity.type}! Health: ${newHealth}/${entity.maxHealth}`);
        
        if (newHealth <= 0) {
          console.log(`💀 ${entity.type} defeated!`);
          return null; // Remove entity
        } else {
          return { ...entity, health: newHealth };
        }
      }
      return entity;
    }).filter(Boolean));
  };

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
          onAttack={attackEntity}
        />
      ))}
    </group>
  );
};

const Entity = ({ entity, gameState, camera, onAttack }) => {
  const meshRef = useRef();
  const [currentPosition, setCurrentPosition] = useState(entity.position);

  // Simple AI movement
  useFrame((state, delta) => {
    if (!meshRef.current) return;

    const time = state.clock.elapsedTime;
    const [initX, initY, initZ] = entity.initialPosition;
    
    if (entity.type === 'villager') {
      // Villagers stay mostly still with minimal movement
      const offsetX = Math.sin(time * 0.1) * 0.5;
      const offsetZ = Math.cos(time * 0.1) * 0.5;
      
      meshRef.current.position.x = initX + offsetX;
      meshRef.current.position.z = initZ + offsetZ;
      meshRef.current.position.y = initY;
      
    } else if (['pig', 'chicken'].includes(entity.type)) {
      // Passive animals wander slowly
      const offsetX = Math.sin(time * 0.2) * entity.wanderRadius;
      const offsetZ = Math.cos(time * 0.15) * entity.wanderRadius;
      
      meshRef.current.position.x = initX + offsetX;
      meshRef.current.position.z = initZ + offsetZ;
      meshRef.current.position.y = initY;
      
    } else if (entity.hostile) {
      // Hostile mobs move toward player slowly
      const playerPos = camera.position;
      const entityPos = new THREE.Vector3(initX, initY, initZ);
      const distance = playerPos.distanceTo(entityPos);
      
      if (distance < 15) {
        const direction = new THREE.Vector3()
          .subVectors(playerPos, entityPos)
          .normalize();
        
        const speed = 0.5;
        meshRef.current.position.x = initX + direction.x * speed * Math.sin(time * 0.5) * 3;
        meshRef.current.position.z = initZ + direction.z * speed * Math.cos(time * 0.5) * 3;
        meshRef.current.position.y = initY;
      } else {
        meshRef.current.position.x = initX;
        meshRef.current.position.z = initZ;
        meshRef.current.position.y = initY;
      }
    }
  });

  const handleClick = (event) => {
    event.stopPropagation();
    
    if (event.shiftKey) {
      console.log(`🗡️ Attacking ${entity.type}!`);
      onAttack(entity.id);
    } else {
      console.log(`👋 Interacting with ${entity.type}!`);
    }
  };

  return (
    <group>
      <mesh 
        ref={meshRef} 
        position={entity.position}
        onClick={handleClick}
      >
        {entity.type === 'villager' && <VillagerModel />}
        {entity.type === 'pig' && <PigModel />}
        {entity.type === 'chicken' && <ChickenModel />}
        {entity.type === 'zombie' && <ZombieModel />}
        {entity.type === 'skeleton' && <SkeletonModel />}
      </mesh>
      
      {/* Health bar */}
      {entity.health < entity.maxHealth && (
        <HealthBar entity={entity} position={[entity.position[0], entity.position[1] + 2, entity.position[2]]} />
      )}
    </group>
  );
};

// Health bar component
const HealthBar = ({ entity, position }) => {
  const healthPercent = entity.health / entity.maxHealth;
  const barColor = healthPercent > 0.5 ? '#00ff00' : healthPercent > 0.25 ? '#ffff00' : '#ff0000';
  
  return (
    <group position={position}>
      <mesh position={[0, 0, 0]}>
        <planeGeometry args={[1.5, 0.2]} />
        <meshBasicMaterial color="#333333" />
      </mesh>
      <mesh position={[-0.75 + (healthPercent * 0.75), 0, 0.01]} scale={[healthPercent, 1, 1]}>
        <planeGeometry args={[1.5, 0.2]} />
        <meshBasicMaterial color={barColor} />
      </mesh>
    </group>
  );
};

// Simple mob models
const VillagerModel = () => {
  return (
    <group>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.6, 1.2, 0.3]} />
        <meshLambertMaterial color="#8B4513" />
      </mesh>
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshLambertMaterial color="#FDBCB4" />
      </mesh>
      <mesh position={[-0.4, 0.3, 0]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshLambertMaterial color="#8B4513" />
      </mesh>
      <mesh position={[0.4, 0.3, 0]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshLambertMaterial color="#8B4513" />
      </mesh>
      <mesh position={[-0.2, -0.8, 0]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshLambertMaterial color="#654321" />
      </mesh>
      <mesh position={[0.2, -0.8, 0]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshLambertMaterial color="#654321" />
      </mesh>
    </group>
  );
};

const PigModel = () => {
  return (
    <group scale={0.8}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1, 0.6, 1.2]} />
        <meshLambertMaterial color="#FFC0CB" />
      </mesh>
      <mesh position={[0, 0.1, 0.7]}>
        <boxGeometry args={[0.6, 0.5, 0.6]} />
        <meshLambertMaterial color="#FFC0CB" />
      </mesh>
      <mesh position={[0, -0.1, 1.0]}>
        <boxGeometry args={[0.3, 0.2, 0.2]} />
        <meshLambertMaterial color="#FFB6C1" />
      </mesh>
      {[-0.3, 0.3].map((x, i) => 
        [0.4, -0.4].map((z, j) => (
          <mesh key={`${i}-${j}`} position={[x, -0.5, z]}>
            <boxGeometry args={[0.2, 0.4, 0.2]} />
            <meshLambertMaterial color="#FFC0CB" />
          </mesh>
        ))
      )}
    </group>
  );
};

const ChickenModel = () => {
  return (
    <group scale={0.6}>
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.4, 8, 6]} />
        <meshLambertMaterial color="#FFFFFF" />
      </mesh>
      <mesh position={[0, 0.5, 0.3]}>
        <sphereGeometry args={[0.25, 8, 6]} />
        <meshLambertMaterial color="#FFFFFF" />
      </mesh>
      <mesh position={[0, 0.4, 0.5]}>
        <coneGeometry args={[0.1, 0.2, 4]} />
        <meshLambertMaterial color="#FF8C00" />
      </mesh>
      <mesh position={[0, 0.7, 0.3]}>
        <boxGeometry args={[0.1, 0.2, 0.1]} />
        <meshLambertMaterial color="#FF0000" />
      </mesh>
      {[-0.1, 0.1].map((x, i) => (
        <mesh key={i} position={[x, -0.5, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.3, 6]} />
          <meshLambertMaterial color="#FF8C00" />
        </mesh>
      ))}
    </group>
  );
};

const ZombieModel = () => {
  return (
    <group scale={1.1}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.6, 1.2, 0.3]} />
        <meshLambertMaterial color="#2F4F2F" />
      </mesh>
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshLambertMaterial color="#90EE90" />
      </mesh>
      <mesh position={[-0.1, 0.95, 0.26]}>
        <boxGeometry args={[0.05, 0.05, 0.05]} />
        <meshLambertMaterial color="#ff0000" />
      </mesh>
      <mesh position={[0.1, 0.95, 0.26]}>
        <boxGeometry args={[0.05, 0.05, 0.05]} />
        <meshLambertMaterial color="#ff0000" />
      </mesh>
      <mesh position={[-0.4, 0.3, 0]} rotation={[0, 0, 0.5]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshLambertMaterial color="#2F4F2F" />
      </mesh>
      <mesh position={[0.4, 0.3, 0]} rotation={[0, 0, -0.5]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshLambertMaterial color="#2F4F2F" />
      </mesh>
      <mesh position={[-0.2, -0.8, 0]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshLambertMaterial color="#654321" />
      </mesh>
      <mesh position={[0.2, -0.8, 0]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshLambertMaterial color="#654321" />
      </mesh>
    </group>
  );
};

const SkeletonModel = () => {
  return (
    <group scale={1.1}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.6, 1.2, 0.3]} />
        <meshLambertMaterial color="#F5F5DC" />
      </mesh>
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshLambertMaterial color="#F5F5DC" />
      </mesh>
      <mesh position={[-0.1, 0.95, 0.26]}>
        <boxGeometry args={[0.08, 0.08, 0.05]} />
        <meshLambertMaterial color="#000000" />
      </mesh>
      <mesh position={[0.1, 0.95, 0.26]}>
        <boxGeometry args={[0.08, 0.08, 0.05]} />
        <meshLambertMaterial color="#000000" />
      </mesh>
      <mesh position={[-0.4, 0.3, 0]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshLambertMaterial color="#F5F5DC" />
      </mesh>
      <mesh position={[0.4, 0.3, 0]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshLambertMaterial color="#F5F5DC" />
      </mesh>
      <mesh position={[0.6, 0.5, 0]}>
        <boxGeometry args={[0.1, 0.6, 0.1]} />
        <meshLambertMaterial color="#8B4513" />
      </mesh>
      <mesh position={[-0.2, -0.8, 0]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshLambertMaterial color="#F5F5DC" />
      </mesh>
      <mesh position={[0.2, -0.8, 0]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshLambertMaterial color="#F5F5DC" />
      </mesh>
    </group>
  );
};

// Combat Instructions Component
export const CombatInstructions = () => {
  return (
    <div className="absolute top-4 right-4 bg-black/80 text-white p-4 rounded-lg text-sm max-w-xs">
      <h3 className="font-bold mb-2 text-red-400">⚔️ Combat Controls:</h3>
      <ul className="space-y-1">
        <li><strong className="text-yellow-400">Shift + Click:</strong> Attack mob</li>
        <li><strong className="text-green-400">Regular Click:</strong> Interact</li>
        <li><strong className="text-red-300">Hostile:</strong> Zombies, Skeletons</li>
        <li><strong className="text-blue-300">Passive:</strong> Pigs, Chickens, Villagers</li>
      </ul>
    </div>
  );
};

// Trading Interface Component
export const TradingInterface = ({ villager, onClose, gameState }) => {
  if (!villager) return null;

  return (
    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-40">
      <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-white">🏪 Trading Post</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">×</button>
        </div>
        
        <div className="mb-4">
          <p className="text-gray-300 italic">"Welcome, traveler!"</p>
        </div>

        <div className="space-y-3">
          <div className="p-3 rounded border-2 border-green-500 bg-green-900/20">
            <div className="flex justify-between items-center">
              <div className="text-white">
                <span className="text-red-400">5 iron</span>
                <span className="mx-2 text-yellow-400">→</span>
                <span className="text-green-400">1 diamond</span>
              </div>
              <div className="text-sm text-gray-400">Stock: 3</div>
            </div>
          </div>
          
          <div className="p-3 rounded border-2 border-green-500 bg-green-900/20">
            <div className="flex justify-between items-center">
              <div className="text-white">
                <span className="text-red-400">10 wood</span>
                <span className="mx-2 text-yellow-400">→</span>
                <span className="text-green-400">2 gold</span>
              </div>
              <div className="text-sm text-gray-400">Stock: 5</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
