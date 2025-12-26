import React, { useRef, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';


// Basic Mob Model Component
const MobModel = ({ type, color, isHit }) => {
  const isAnimal = ['pig', 'cow', 'sheep', 'chicken'].includes(type);
  const isCreeper = type === 'creeper';
  const isSpider = type === 'spider';
  const isSkeleton = type === 'skeleton';
  
  // Pulse effect when hit
  const materialProps = {
    color: isHit ? '#ff0000' : color,
    emissive: isHit ? '#ff0000' : '#000000',
    emissiveIntensity: isHit ? 0.5 : 0
  };

  if (isSpider) {
    // Spider Model
    return (
      <group>
        {/* Head */}
        <mesh position={[0, 0.6, 0.4]}>
          <boxGeometry args={[0.6, 0.5, 0.5]} />
          <meshLambertMaterial {...materialProps} />
        </mesh>
        {/* Body */}
        <mesh position={[0, 0.5, -0.2]}>
          <boxGeometry args={[0.5, 0.4, 0.8]} />
          <meshLambertMaterial {...materialProps} />
        </mesh>
        {/* Legs (8) */}
        {[1, -1].map(side => (
          [0, 1, 2, 3].map(i => (
            <mesh key={`${side}-${i}`} position={[side * 0.5, 0.3, 0.4 - i * 0.3]} rotation={[0, 0, side * 0.5]}>
              <boxGeometry args={[0.6, 0.1, 0.1]} />
              <meshLambertMaterial {...materialProps} />
            </mesh>
          ))
        ))}
      </group>
    );
  }

  if (isCreeper) {
    // Creeper Model
    return (
      <group>
        {/* Head */}
        <mesh position={[0, 1.6, 0]}>
          <boxGeometry args={[0.6, 0.6, 0.6]} />
          <meshLambertMaterial {...materialProps} />
        </mesh>
        {/* Body */}
        <mesh position={[0, 0.8, 0]}>
          <boxGeometry args={[0.5, 1.0, 0.3]} />
          <meshLambertMaterial {...materialProps} />
        </mesh>
        {/* Legs (4) */}
        <mesh position={[-0.2, 0.2, 0.2]}>
          <boxGeometry args={[0.2, 0.4, 0.2]} />
          <meshLambertMaterial {...materialProps} />
        </mesh>
        <mesh position={[0.2, 0.2, 0.2]}>
          <boxGeometry args={[0.2, 0.4, 0.2]} />
          <meshLambertMaterial {...materialProps} />
        </mesh>
        <mesh position={[-0.2, 0.2, -0.2]}>
          <boxGeometry args={[0.2, 0.4, 0.2]} />
          <meshLambertMaterial {...materialProps} />
        </mesh>
        <mesh position={[0.2, 0.2, -0.2]}>
          <boxGeometry args={[0.2, 0.4, 0.2]} />
          <meshLambertMaterial {...materialProps} />
        </mesh>
      </group>
    );
  }

  if (isAnimal) {
    // Quadruped Model (Pig, Cow, etc)
    const isCow = type === 'cow';
    const isPig = type === 'pig';
    
    return (
      <group>
        {/* Body */}
        <mesh position={[0, 0.6, 0]}>
          <boxGeometry args={[0.8, 0.6, 1.2]} />
          <meshLambertMaterial {...materialProps} />
        </mesh>
        {/* Head */}
        <mesh position={[0, 1.1, 0.7]}>
          <boxGeometry args={[0.5, 0.5, 0.5]} />
          <meshLambertMaterial {...materialProps} />
        </mesh>
        {/* Snout for Pig */}
        {isPig && (
          <mesh position={[0, 1.0, 1.0]}>
            <boxGeometry args={[0.2, 0.15, 0.1]} />
            <meshLambertMaterial {...materialProps} color="#ff9999" />
          </mesh>
        )}
        {/* Horns for Cow */}
        {isCow && (
          <>
            <mesh position={[-0.2, 1.4, 0.6]}>
              <boxGeometry args={[0.05, 0.2, 0.05]} />
              <meshLambertMaterial color="#333" />
            </mesh>
            <mesh position={[0.2, 1.4, 0.6]}>
              <boxGeometry args={[0.05, 0.2, 0.05]} />
              <meshLambertMaterial color="#333" />
            </mesh>
          </>
        )}
        {/* Legs */}
        <mesh position={[-0.25, 0.3, 0.4]}>
          <boxGeometry args={[0.2, 0.6, 0.2]} />
          <meshLambertMaterial {...materialProps} />
        </mesh>
        <mesh position={[0.25, 0.3, 0.4]}>
          <boxGeometry args={[0.2, 0.6, 0.2]} />
          <meshLambertMaterial {...materialProps} />
        </mesh>
        <mesh position={[-0.25, 0.3, -0.4]}>
          <boxGeometry args={[0.2, 0.6, 0.2]} />
          <meshLambertMaterial {...materialProps} />
        </mesh>
        <mesh position={[0.25, 0.3, -0.4]}>
          <boxGeometry args={[0.2, 0.6, 0.2]} />
          <meshLambertMaterial {...materialProps} />
        </mesh>
      </group>
    );
  }

  // Humanoid Model (Zombie, Skeleton, Player-like)
  const limbThickness = isSkeleton ? 0.15 : 0.25;
  const legColor = isSkeleton ? '#F5F5DC' : (isAnimal ? color : '#1a1a1a');

  return (
    <group>
      {/* Head */}
      <mesh position={[0, 1.4, 0]}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshLambertMaterial {...materialProps} />
      </mesh>
      {/* Body */}
      <mesh position={[0, 0.75, 0]}>
        <boxGeometry args={[isSkeleton ? 0.4 : 0.6, 0.8, 0.3]} />
        <meshLambertMaterial {...materialProps} />
      </mesh>
      {/* Arms */}
      <mesh position={[-0.4, 1.1, 0]} rotation={[type === 'zombie' ? -Math.PI/2 : 0, 0, 0]}>
        <boxGeometry args={[limbThickness, 0.8, limbThickness]} />
        <meshLambertMaterial {...materialProps} />
      </mesh>
      <mesh position={[0.4, 1.1, 0]} rotation={[type === 'zombie' ? -Math.PI/2 : 0, 0, 0]}>
        <boxGeometry args={[limbThickness, 0.8, limbThickness]} />
        <meshLambertMaterial {...materialProps} />
      </mesh>
      {/* Legs */}
      <mesh position={[-0.15, 0.15, 0]}>
        <boxGeometry args={[limbThickness, 0.8, limbThickness]} />
        <meshLambertMaterial {...materialProps} color={legColor} />
      </mesh>
      <mesh position={[0.15, 0.15, 0]}>
        <boxGeometry args={[limbThickness, 0.8, limbThickness]} />
        <meshLambertMaterial {...materialProps} color={legColor} />
      </mesh>
    </group>
  );
};

// COMPLETELY REWRITTEN NPC System with proper terrain verification
export const NPCSystem = ({ gameState }) => {
  const [entities, setEntities] = useState([]);
  const { camera } = useThree();
  const [terrainReady, setTerrainReady] = useState(false);
  const entitiesRef = useRef([]);

  // Wait for terrain to be ready
  useEffect(() => {
    const checkInterval = setInterval(() => {
      if (window.getMobGroundLevel && window.getGeneratedChunks) {
        console.log('✅ TERRAIN SYSTEM READY - Mob spawning enabled');
        setTerrainReady(true);
        clearInterval(checkInterval);
      }
    }, 500);

    // Timeout after 5 seconds
    const timeout = setTimeout(() => {
      console.log('⚠️ Terrain check timeout - enabling mob spawning anyway');
      setTerrainReady(true);
      clearInterval(checkInterval);
    }, 5000);

    return () => {
      clearInterval(checkInterval);
      clearTimeout(timeout);
    };
  }, []);

  // Mob configuration
  const getMobConfig = (type) => {
    const configs = {
      // Peaceful mobs
      pig: { health: 60, hostile: false, speed: 0.7, drops: ['pork'], color: '#FFC0CB' },
      cow: { health: 70, hostile: false, speed: 0.6, drops: ['beef', 'leather'], color: '#8B4513' },
      chicken: { health: 40, hostile: false, speed: 0.8, drops: ['feather', 'chicken'], color: '#FFFFFF' },
      sheep: { health: 50, hostile: false, speed: 0.7, drops: ['wool', 'mutton'], color: '#F5F5F5' },
      villager: { health: 120, hostile: false, speed: 0.6, drops: ['emerald'], color: '#654321' },
      
      // Hostile mobs
      zombie: { health: 80, hostile: true, speed: 0.8, drops: ['flesh', 'iron'], color: '#228B22' },
      skeleton: { health: 70, hostile: true, speed: 0.9, drops: ['bone', 'arrow'], color: '#F5F5DC' },
      creeper: { health: 100, hostile: true, speed: 0.7, drops: ['gunpowder'], color: '#32CD32' },
      spider: { health: 60, hostile: true, speed: 1.0, drops: ['string'], color: '#8B0000' },
    };
    return configs[type] || configs.pig;
  };

  // Get mob types based on day/night
  const getMobTypes = (isDay) => {
    if (isDay) {
      return ['pig', 'cow', 'chicken', 'sheep', 'villager', 'pig', 'cow', 'chicken'];
    } else {
      return ['zombie', 'skeleton', 'creeper', 'spider', 'zombie', 'skeleton'];
    }
  };

  // Try to find a valid spawn position on generated terrain
  const findValidSpawnPosition = (playerPos) => {
    const maxAttempts = 20;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Spawn within 1-2 chunks of player (16-48 blocks)
      const angle = Math.random() * Math.PI * 2;
      const distance = 16 + Math.random() * 32; // 16-48 blocks away
      
      const spawnX = Math.floor(playerPos.x + Math.cos(angle) * distance);
      const spawnZ = Math.floor(playerPos.z + Math.sin(angle) * distance);
      
      // Check if chunk exists
      if (window.getGeneratedChunks) {
        const chunkX = Math.floor(spawnX / 16);
        const chunkZ = Math.floor(spawnZ / 16);
        const chunkKey = `${chunkX}_${chunkZ}`;
        const generatedChunks = window.getGeneratedChunks();
        
        if (!generatedChunks.has(chunkKey)) {
          continue; // Chunk not generated, try again
        }
      }
      
      // Get ground level
      if (window.getMobGroundLevel) {
        try {
          const groundY = window.getMobGroundLevel(spawnX, spawnZ);
          
          if (groundY && groundY > 10 && groundY < 25) {
            // CRITICAL FIX: Verify ground is solid using collision check
            // This prevents spawning on "mathematical" ground that isn't visually generated yet
            if (window.checkCollision) {
               // Check slightly below the feet to ensure there is a block
               if (!window.checkCollision(spawnX, groundY - 0.5, spawnZ)) {
                 // console.log('👻 Ghost ground detected - skipping spawn');
                 continue;
               }
            }

            return {
              x: spawnX,
              y: groundY + 1.5, // Spawn above ground
              z: spawnZ,
              valid: true
            };
          }
        } catch (error) {
          console.warn(`Spawn position calculation error:`, error);
        }
      }
    }
    
    return { valid: false };
  };

  // Initial mob spawning when terrain is ready
  useEffect(() => {
    if (!terrainReady || !camera) return;

    console.log('🌍 Spawning initial mob population...');
    
    const playerPos = camera.position;
    const mobTypes = getMobTypes(gameState.isDay || true);
    const initialMobs = [];
    
    // Spawn 30-40 initial mobs
    for (let i = 0; i < 35; i++) {
      const spawnPos = findValidSpawnPosition(playerPos);
      
      if (spawnPos.valid) {
        const mobType = mobTypes[Math.floor(Math.random() * mobTypes.length)];
        const config = getMobConfig(mobType);
        
        initialMobs.push({
          id: `mob_${Date.now()}_${i}`,
          type: mobType,
          position: [spawnPos.x, spawnPos.y, spawnPos.z],
          health: config.health,
          maxHealth: config.health,
          hostile: config.hostile,
          speed: config.speed,
          drops: config.drops,
          color: config.color,
          wanderRadius: config.hostile ? 12 : 8,
          initialPosition: [spawnPos.x, spawnPos.y, spawnPos.z],
          spawnTime: Date.now()
        });
      }
    }
    
    console.log(`🎉 Initial spawn complete: ${initialMobs.length} mobs`);
    setEntities(initialMobs);
    entitiesRef.current = initialMobs;
  }, [terrainReady, camera, gameState.isDay]);

  // Dynamic spawning - add more mobs as player explores
  useEffect(() => {
    if (!terrainReady) return;

    const spawnInterval = setInterval(() => {
      const currentEntities = entitiesRef.current;
      const playerPos = camera?.position;
      
      if (!playerPos || currentEntities.length >= 60) return; // Max 60 mobs

      // Clean up distant mobs
      const nearbyMobs = currentEntities.filter(mob => {
        const distance = Math.sqrt(
          Math.pow(mob.position[0] - playerPos.x, 2) +
          Math.pow(mob.position[2] - playerPos.z, 2)
        );
        return distance < 150; // Keep mobs within 150 blocks
      });

      // Spawn new mobs if needed
      const mobsNeeded = Math.min(5, 60 - nearbyMobs.length);
      const newMobs = [];
      
      if (mobsNeeded > 0) {
        const mobTypes = getMobTypes(gameState.isDay || true);
        
        for (let i = 0; i < mobsNeeded; i++) {
          const spawnPos = findValidSpawnPosition(playerPos);
          
          if (spawnPos.valid) {
            const mobType = mobTypes[Math.floor(Math.random() * mobTypes.length)];
            const config = getMobConfig(mobType);
            
            newMobs.push({
              id: `mob_dynamic_${Date.now()}_${i}`,
              type: mobType,
              position: [spawnPos.x, spawnPos.y, spawnPos.z],
              health: config.health,
              maxHealth: config.health,
              hostile: config.hostile,
              speed: config.speed,
              drops: config.drops,
              color: config.color,
              wanderRadius: config.hostile ? 12 : 8,
              initialPosition: [spawnPos.x, spawnPos.y, spawnPos.z],
              spawnTime: Date.now()
            });
          }
        }
        
        if (newMobs.length > 0) {
          const updatedMobs = [...nearbyMobs, ...newMobs];
          setEntities(updatedMobs);
          entitiesRef.current = updatedMobs;
        }
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(spawnInterval);
  }, [terrainReady, camera, gameState.isDay]);

  // Attack entity function
  const attackEntity = (entityId) => {
    if (window.playAttackSounds) {
      window.playAttackSounds();
    }

    if (window.setPlayerAttacking) {
      window.setPlayerAttacking(true);
      setTimeout(() => window.setPlayerAttacking(false), 600);
    }

    setEntities(currentEntities => {
      const updated = currentEntities.map(entity => {
        if (entity.id === entityId) {
          const newHealth = Math.max(0, entity.health - 20);
          
          if (newHealth <= 0) {
            console.log(`💀 ${entity.type} defeated!`);
            
            if (window.addExperience) {
              window.addExperience(10, `Defeated ${entity.type}`);
            }
            
            return null; // Remove entity
          }
          
          return { ...entity, health: newHealth, lastHitTime: Date.now() };
        }
        return entity;
      }).filter(Boolean);
      
      entitiesRef.current = updated;
      return updated;
    });
  };

  // Expose attack function
  useEffect(() => {
    window.attackEntity = attackEntity;
    window.damageMob = attackEntity;
    
    // Check if mob at position
    window.checkMobCollision = (position, radius = 3) => {
      // Find the first mob within radius
      return entitiesRef.current.find(entity => {
        const distance = Math.sqrt(
          Math.pow(entity.position[0] - position.x, 2) +
          Math.pow(entity.position[1] - position.y, 2) +
          Math.pow(entity.position[2] - position.z, 2)
        );
        return distance < radius;
      });
    };
  }, []);

  // Update mob positions (wandering AI)
  useFrame((state, delta) => {
    if (!terrainReady || entities.length === 0) return;

    const time = state.clock.elapsedTime;
    
    setEntities(currentEntities => {
      return currentEntities.map(entity => {
        // Simple wandering AI
        const timeSinceSpawn = (Date.now() - entity.spawnTime) / 1000;
        const wanderSpeed = entity.speed * 0.3;
        
        // Wander around initial position
        const newX = entity.initialPosition[0] + Math.sin(time * wanderSpeed + entity.id.length) * entity.wanderRadius;
        const newZ = entity.initialPosition[2] + Math.cos(time * wanderSpeed + entity.id.length) * entity.wanderRadius;
        
        // Get ground level at new position
        let newY = entity.position[1];
        if (window.getMobGroundLevel) {
          try {
            const groundY = window.getMobGroundLevel(newX, newZ);
            if (groundY && groundY > 10 && groundY < 25) {
              newY = groundY + 1.5;
            }
          } catch (error) {
            // Keep current Y if ground detection fails
          }
        }
        
        return {
          ...entity,
          position: [newX, newY, newZ]
        };
      });
    });
  });

  // Render mobs
  return (
    <group>
      {entities.map(entity => {
        const config = getMobConfig(entity.type);
        const isRecentlyHit = entity.lastHitTime && (Date.now() - entity.lastHitTime) < 500;
        
        return (
          <group key={entity.id} position={entity.position}>
            {/* Mob Model */}
            <group 
              onClick={(e) => {
                e.stopPropagation();
                attackEntity(entity.id);
              }}
              userData={{ mobId: entity.id }}
            >
              <MobModel 
                type={entity.type} 
                color={config.color} 
                isHit={isRecentlyHit}
              />
            </group>
            
            {/* Health bar */}
            {entity.health < entity.maxHealth && (
              <mesh position={[0, 1.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[0.8, 0.1]} />
                <meshBasicMaterial color="#FF0000" />
              </mesh>
            )}
            
            {entity.health < entity.maxHealth && (
              <mesh position={[0, 1.5, 0.01]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[0.8 * (entity.health / entity.maxHealth), 0.1]} />
                <meshBasicMaterial color="#00FF00" />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
};

export default NPCSystem;
export const CombatInstructions = () => {
  return (
    <div className="absolute top-4 right-4 bg-black/90 text-white p-4 rounded-lg text-sm max-w-xs">
      <h3 className="font-bold mb-2 text-red-400">⚔️ Combat Controls:</h3>
      <ul className="space-y-1 text-xs">
        <li><strong className="text-yellow-400">Shift + Click:</strong> Attack mob (shows weapon!)</li>
        <li><strong className="text-green-400">Regular Click:</strong> Interact/Trade</li>
        <li><strong className="text-red-300">Hostile:</strong> Zombies, Skeletons, Creepers, Spiders, Endermen, Witches</li>
        <li><strong className="text-blue-300">Passive:</strong> Pigs, Chickens, Cows, Sheep, Wolves, Villagers</li>
        <li><span className="text-orange-300">💰 Mobs drop items when defeated!</span></li>
      </ul>
    </div>
  );
};

// Trading Interface
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
          <p className="text-gray-300 italic">"Welcome, brave adventurer!"</p>
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
          
          <div className="p-3 rounded border-2 border-green-500 bg-green-900/20">
            <div className="flex justify-between items-center">
              <div className="text-white">
                <span className="text-red-400">3 string</span>
                <span className="mx-2 text-yellow-400">→</span>
                <span className="text-green-400">1 bow</span>
              </div>
              <div className="text-sm text-gray-400">Stock: 2</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
