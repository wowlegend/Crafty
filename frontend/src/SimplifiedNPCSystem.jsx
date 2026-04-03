import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGameStore } from './store/useGameStore';
import * as THREE from 'three';

// MOB TYPES with different stats and colors
const MOB_TYPES = {
  pig: {
    color: '#ffc0cb',
    health: 50,
    speed: 1.5,
    damage: 0,
    xp: 10,
    passive: true,
    bodySize: [1.0, 0.8, 1.4],
    headSize: [0.7, 0.7, 0.7]
  },
  cow: {
    color: '#8B4513',
    health: 80,
    speed: 1.2,
    damage: 0,
    xp: 15,
    passive: true,
    bodySize: [1.2, 1.0, 1.6],
    headSize: [0.8, 0.8, 0.6]
  },
  zombie: {
    color: '#228B22',
    health: 100,
    speed: 2.0,
    damage: 10,
    xp: 25,
    passive: false,
    bodySize: [0.8, 1.6, 0.5],
    headSize: [0.7, 0.7, 0.7]
  },
  skeleton: {
    color: '#F5F5DC',
    health: 80,
    speed: 2.5,
    damage: 15,
    xp: 30,
    passive: false,
    bodySize: [0.6, 1.5, 0.4],
    headSize: [0.6, 0.6, 0.6]
  },
  spider: {
    color: '#2F2F2F',
    health: 60,
    speed: 3.0,
    damage: 8,
    xp: 20,
    passive: false,
    bodySize: [1.2, 0.5, 1.5],
    headSize: [0.6, 0.4, 0.6]
  }
};

// Mob Model Component with variety
const MobModel = ({ type, color, isHit, rotation }) => {
  const mobConfig = MOB_TYPES[type] || MOB_TYPES.pig;
  const materialProps = {
    color: isHit ? '#ff0000' : (color || mobConfig.color),
    emissive: isHit ? '#ff0000' : '#000000',
    emissiveIntensity: isHit ? 0.5 : 0
  };

  const [bodyW, bodyH, bodyD] = mobConfig.bodySize;
  const [headW, headH, headD] = mobConfig.headSize;

  return (
    <group rotation={[0, rotation || 0, 0]}>
      {/* Body */}
      <mesh position={[0, bodyH / 2, 0]}>
        <boxGeometry args={[bodyW, bodyH, bodyD]} />
        <meshLambertMaterial {...materialProps} />
      </mesh>
      {/* Head */}
      <mesh position={[0, bodyH + headH / 2, bodyD / 3]}>
        <boxGeometry args={[headW, headH, headD]} />
        <meshLambertMaterial {...materialProps} />
      </mesh>
      {/* Eyes for hostile mobs */}
      {!mobConfig.passive && (
        <>
          <mesh position={[-0.15, bodyH + headH / 2, bodyD / 3 + headD / 2 + 0.01]}>
            <boxGeometry args={[0.15, 0.1, 0.02]} />
            <meshBasicMaterial color="#ff0000" />
          </mesh>
          <mesh position={[0.15, bodyH + headH / 2, bodyD / 3 + headD / 2 + 0.01]}>
            <boxGeometry args={[0.15, 0.1, 0.02]} />
            <meshBasicMaterial color="#ff0000" />
          </mesh>
        </>
      )}
      {/* Legs */}
      {type !== 'spider' ? (
        <>
          <mesh position={[-bodyW / 3, -0.3, bodyD / 4]}>
            <boxGeometry args={[0.25, 0.6, 0.25]} />
            <meshLambertMaterial {...materialProps} />
          </mesh>
          <mesh position={[bodyW / 3, -0.3, bodyD / 4]}>
            <boxGeometry args={[0.25, 0.6, 0.25]} />
            <meshLambertMaterial {...materialProps} />
          </mesh>
          <mesh position={[-bodyW / 3, -0.3, -bodyD / 4]}>
            <boxGeometry args={[0.25, 0.6, 0.25]} />
            <meshLambertMaterial {...materialProps} />
          </mesh>
          <mesh position={[bodyW / 3, -0.3, -bodyD / 4]}>
            <boxGeometry args={[0.25, 0.6, 0.25]} />
            <meshLambertMaterial {...materialProps} />
          </mesh>
        </>
      ) : (
        // Spider legs
        [...Array(8)].map((_, i) => (
          <mesh key={i} position={[
            Math.cos((i / 8) * Math.PI * 2) * 0.8,
            0,
            Math.sin((i / 8) * Math.PI * 2) * 0.8
          ]} rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[0.1, 0.8, 0.1]} />
            <meshLambertMaterial {...materialProps} />
          </mesh>
        ))
      )}
    </group>
  );
};

// Health Bar Component
const HealthBar = ({ health, maxHealth }) => {
  const healthPercent = health / maxHealth;
  return (
    <group position={[0, 2.2, 0]}>
      {/* Background */}
      <mesh>
        <planeGeometry args={[1.2, 0.15]} />
        <meshBasicMaterial color="#333333" />
      </mesh>
      {/* Health fill */}
      <mesh position={[(healthPercent - 1) * 0.6, 0, 0.01]}>
        <planeGeometry args={[1.2 * healthPercent, 0.12]} />
        <meshBasicMaterial color={healthPercent > 0.5 ? '#00ff00' : healthPercent > 0.25 ? '#ffff00' : '#ff0000'} />
      </mesh>
    </group>
  );
};

// Floating Damage Number Component
const DamageNumber = ({ damage, position, id, onComplete }) => {
  const meshRef = useRef();
  const startTime = useRef(null);

  useFrame(() => {
    if (meshRef.current) {
      if (startTime.current === null) {
        startTime.current = Date.now();
      }
      const elapsed = (Date.now() - startTime.current) / 1000;
      meshRef.current.position.y = position[1] + 2 + elapsed * 2;
      meshRef.current.material.opacity = Math.max(0, 1 - elapsed);

      if (elapsed > 1) {
        onComplete(id);
      }
    }
  });

  return (
    <group position={[position[0], position[1] + 2, position[2]]}>
      <sprite ref={meshRef} scale={[1.5, 0.5, 1]}>
        <spriteMaterial
          color={damage >= 50 ? '#ff0000' : damage >= 25 ? '#ff8800' : '#ffff00'}
          transparent
          opacity={1}
        />
      </sprite>
    </group>
  );
};

// NPC System with movement, variety, and continuous spawning
export const NPCSystem = () => {
  const gameState = useGameStore();
  const [entities, setEntities] = useState([]);
  const [damageNumbers, setDamageNumbers] = useState([]);
  const { camera } = useThree();
  const [terrainReady, setTerrainReady] = useState(false);
  const entitiesRef = useRef([]);
  const nextId = useRef(0);
  const damageId = useRef(0);
  const lastSpawnCheck = useRef(0);
  const spawnedChunks = useRef(new Set());

  // Wait for terrain to be physically ready
  useEffect(() => {
    const checkInterval = setInterval(() => {
      if (window.getMobGroundLevel && window.getGeneratedChunks && window.getGeneratedChunks().size > 0 && window.isSpawnChunkLoaded) {
        setTerrainReady(true);
        clearInterval(checkInterval);
      }
    }, 500);
    return () => clearInterval(checkInterval);
  }, []);

  // Spawn a single mob at position
  const spawnMob = (x, z, forceType = null) => {
    let y = 15;
    if (window.getMobGroundLevel) {
      y = window.getMobGroundLevel(x, z);
      if (isNaN(y)) y = 15;
    }

    // Random mob type selection — favor hostiles at night
    const mobTypeKeys = Object.keys(MOB_TYPES);
    let type;
    if (forceType) {
      type = forceType;
    } else if (window._isNightTime && Math.random() < 0.7) {
      // At night, 70% chance to spawn hostile mob
      const hostileTypes = mobTypeKeys.filter(k => !MOB_TYPES[k].passive);
      type = hostileTypes[Math.floor(Math.random() * hostileTypes.length)];
    } else {
      type = mobTypeKeys[Math.floor(Math.random() * mobTypeKeys.length)];
    }
    const mobConfig = MOB_TYPES[type];

    const mob = {
      id: nextId.current++,
      type,
      position: [x, y + 0.5, z],
      color: mobConfig.color,
      health: mobConfig.health,
      maxHealth: mobConfig.health,
      speed: mobConfig.speed,
      passive: mobConfig.passive,
      // Movement AI state
      targetX: x,
      targetZ: z,
      rotation: Math.random() * Math.PI * 2,
      moveTimer: Math.random() * 3,
      isMoving: false
    };

    return mob;
  };

  // Initial mob spawning
  useEffect(() => {
    if (!terrainReady || !camera) return;

    const mobs = [];
    // Spawn variety of mobs safely outside aggro radius
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const distance = 30 + Math.random() * 20;
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      mobs.push(spawnMob(x, z));
    }

    setEntities(mobs);
    entitiesRef.current = mobs;
  }, [terrainReady, camera]);

  // Continuous spawning as player explores
  useFrame(() => {
    if (!terrainReady || !camera) return;

    const now = performance.now();
    if (now - lastSpawnCheck.current < 2000) return; // Check every 2 seconds
    lastSpawnCheck.current = now;

    const playerX = camera.position.x;
    const playerZ = camera.position.z;
    const chunkX = Math.floor(playerX / 16);
    const chunkZ = Math.floor(playerZ / 16);
    const chunkKey = `${chunkX}_${chunkZ}`;

    // Spawn mobs in new chunks
    if (!spawnedChunks.current.has(chunkKey)) {
      spawnedChunks.current.add(chunkKey);

      // Spawn 2-4 mobs per new chunk
      const count = 2 + Math.floor(Math.random() * 3);
      const newMobs = [];

      for (let i = 0; i < count; i++) {
        const x = chunkX * 16 + Math.random() * 16;
        const z = chunkZ * 16 + Math.random() * 16;
        // Don't spawn too close to player
        const dist = Math.sqrt((x - playerX) ** 2 + (z - playerZ) ** 2);
        if (dist > 25) {
          newMobs.push(spawnMob(x, z));
        }
      }

      if (newMobs.length > 0) {
        setEntities(prev => {
          const updated = [...prev, ...newMobs];
          entitiesRef.current = updated;
          return updated;
        });
      }
    }

    // Despawn mobs too far from player
    const maxDistance = 100;
    setEntities(prev => {
      const filtered = prev.filter(e => {
        const dist = Math.sqrt(
          (e.position[0] - playerX) ** 2 +
          (e.position[2] - playerZ) ** 2
        );
        return dist < maxDistance;
      });
      entitiesRef.current = filtered;
      return filtered;
    });
  });

  // Mob movement AI with HOSTILE CHASE
  useFrame((state, delta) => {
    if (!terrainReady || !camera) return;

    const playerX = camera.position.x;
    const playerY = camera.position.y;
    const playerZ = camera.position.z;
    const AGGRO_RANGE = 16;
    const MELEE_RANGE = 2.5;
    const ATTACK_COOLDOWN = 1000; // ms

    setEntities(prev => {
      const updated = prev.map(entity => {
        const mobConfig = MOB_TYPES[entity.type];
        let newEntity = { ...entity };

        const dx = playerX - entity.position[0];
        const dy = playerY - entity.position[1];
        const dz = playerZ - entity.position[2];
        const distToPlayer2D = Math.sqrt(dx * dx + dz * dz);
        const distToPlayer3D = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // --- HOSTILE MOB CHASE AI ---
        if (!mobConfig.passive && distToPlayer2D < AGGRO_RANGE) {
          newEntity.isAggro = true;
          newEntity.isMoving = true;
          newEntity.targetX = playerX;
          newEntity.targetZ = playerZ;

          // Melee attack requires true 3D proximity
          if (distToPlayer3D < MELEE_RANGE) {
            const now = performance.now();
            const lastAtk = entity.lastAttackTime || 0;
            if (now - lastAtk > ATTACK_COOLDOWN && useGameStore.getState().damagePlayer) {
              useGameStore.getState().damagePlayer(mobConfig.damage, entity.type);
              newEntity.lastAttackTime = now;
            }
          }
        } else {
          newEntity.isAggro = false;
          // Normal wander
          newEntity.moveTimer -= delta;
          if (newEntity.moveTimer <= 0) {
            newEntity.moveTimer = 2 + Math.random() * 4;
            newEntity.isMoving = Math.random() > 0.3;
            if (newEntity.isMoving) {
              const angle = Math.random() * Math.PI * 2;
              const distance = 3 + Math.random() * 5;
              newEntity.targetX = entity.position[0] + Math.cos(angle) * distance;
              newEntity.targetZ = entity.position[2] + Math.sin(angle) * distance;
            }
          }
        }

        // Move towards target
        if (newEntity.isMoving) {
          const tdx = newEntity.targetX - entity.position[0];
          const tdz = newEntity.targetZ - entity.position[2];
          const dist = Math.sqrt(tdx * tdx + tdz * tdz);

          if (dist > 0.5) {
            const speedMult = newEntity.isAggro ? 1.5 : 1.0;
            const speed = mobConfig.speed * speedMult * delta;
            const moveX = (tdx / dist) * speed;
            const moveZ = (tdz / dist) * speed;

            let newX = entity.position[0] + moveX;
            let newZ = entity.position[2] + moveZ;
            let newY = entity.position[1];

            if (window.getMobGroundLevel) {
              newY = window.getMobGroundLevel(newX, newZ) + 0.5;
              if (isNaN(newY)) newY = entity.position[1];
            }

            newEntity.position = [newX, newY, newZ];
            newEntity.rotation = Math.atan2(tdx, tdz);
          } else {
            newEntity.isMoving = false;
          }
        }

        // Knockback decay
        if (newEntity.knockback) {
          newEntity.position = [
            newEntity.position[0] + newEntity.knockback[0] * delta * 4,
            newEntity.position[1],
            newEntity.position[2] + newEntity.knockback[2] * delta * 4
          ];
          newEntity.knockback = null;
        }

        return newEntity;
      });

      entitiesRef.current = updated;
      // Expose for minimap
      window._mobEntities = updated;
      return updated;
    });
  });

  // COMBAT LOGIC with damage numbers
  const damageMob = (id, damage = 25) => {
    let hitMob = null;

    setEntities(prev => {
      const updated = prev.map(e => {
        if (e.id === id) {
          hitMob = e;
          const newHealth = e.health - damage;

          // Create damage number
          setDamageNumbers(nums => [...nums, {
            id: damageId.current++,
            damage,
            position: [...e.position]
          }]);

          // Grant XP if killed
          if (newHealth <= 0 && window.grantXP) {
            const mobConfig = MOB_TYPES[e.type];
            window.grantXP(mobConfig.xp);
            // Notify quest system of kill + generate loot
            if (window.onMobKill) {
              window.onMobKill(e.type, e.position);
            }
          }

          // Knockback away from player
          let knockback = null;
          if (camera) {
            const kx = e.position[0] - camera.position.x;
            const kz = e.position[2] - camera.position.z;
            const kd = Math.sqrt(kx * kx + kz * kz) || 1;
            knockback = [kx / kd * 2, 0, kz / kd * 2];
          }

          return { ...e, health: newHealth, lastHit: performance.now(), knockback };
        }
        return e;
      }).filter(e => e.health > 0);

      entitiesRef.current = updated;
      return updated;
    });

    return hitMob;
  };

  // Remove completed damage numbers
  const removeDamageNumber = (id) => {
    setDamageNumbers(prev => prev.filter(d => d.id !== id));
  };

  // Expose functions globally
  useEffect(() => {
    window.attackEntity = damageMob;
    window.damageMob = damageMob;

    window.checkMobCollision = (pos, range = 3) => {
      return entitiesRef.current.find(e => {
        const dx = e.position[0] - pos.x;
        const dy = e.position[1] - pos.y;
        const dz = e.position[2] - pos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        return dist < range;
      });
    };
  }, []);

  return (
    <group>
      {entities.map(entity => {
        const isRecentlyHit = entity.lastHit && (performance.now() - entity.lastHit < 300);
        return (
          <group key={entity.id} position={entity.position}>
            <MobModel
              type={entity.type}
              color={entity.color}
              isHit={isRecentlyHit}
              rotation={entity.rotation}
            />
            <HealthBar health={entity.health} maxHealth={entity.maxHealth} />
          </group>
        );
      })}

      {/* Damage Numbers */}
      {damageNumbers.map(dmg => (
        <DamageNumber
          key={dmg.id}
          id={dmg.id}
          damage={dmg.damage}
          position={dmg.position}
          onComplete={removeDamageNumber}
        />
      ))}
    </group>
  );
};

export const CombatInstructions = () => (
  <div className="absolute top-4 right-4 text-white bg-black/50 p-2 rounded text-sm">
    <div>🎮 Controls:</div>
    <div>• Click or F - Attack/Cast Spell</div>
    <div>• E - Inventory</div>
    <div>• M - Magic</div>
    <div>• C - Crafting</div>
    <div>• B - Building</div>
    <div>• ESC - Settings</div>
  </div>
);

export const TradingInterface = ({ villager, onClose }) => {
  const gameState = useGameStore();
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      <div className="bg-gray-800 p-6 rounded-lg text-white max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">Trading</h2>
        <p className="text-gray-300 mb-4">Trade with villagers coming soon!</p>
        <button
          className="bg-purple-600 hover:bg-purple-500 px-4 py-2 rounded"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
};
