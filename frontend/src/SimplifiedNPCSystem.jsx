import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGameStore } from './store/useGameStore';
import * as THREE from 'three';
import { World } from 'miniplex';
import { useEntities } from '@miniplex/react';
import { ecs, mobsQuery } from './ecs/world';

// MOB TYPES with different stats and colors
export const MOB_TYPES = {
  pig: { color: '#ffc0cb', health: 50, speed: 1.5, damage: 0, xp: 10, passive: true, bodySize: [1.0, 0.8, 1.4], headSize: [0.7, 0.7, 0.7] },
  cow: { color: '#8B4513', health: 80, speed: 1.2, damage: 0, xp: 15, passive: true, bodySize: [1.2, 1.0, 1.6], headSize: [0.8, 0.8, 0.6] },
  zombie: { color: '#228B22', health: 100, speed: 2.0, damage: 10, xp: 25, passive: false, bodySize: [0.8, 1.6, 0.5], headSize: [0.7, 0.7, 0.7] },
  skeleton: { color: '#F5F5DC', health: 80, speed: 2.5, damage: 15, xp: 30, passive: false, bodySize: [0.6, 1.5, 0.4], headSize: [0.6, 0.6, 0.6] },
  spider: { color: '#2F2F2F', health: 60, speed: 3.0, damage: 8, xp: 20, passive: false, bodySize: [1.2, 0.5, 1.5], headSize: [0.6, 0.4, 0.6] }
};

// Mob Model Component with variety - PURE ECS RENDERER
const MobModel = ({ entity }) => {
  const groupRef = useRef();
  const mobConfig = MOB_TYPES[entity.type] || MOB_TYPES.pig;
  const [bodyW, bodyH, bodyD] = mobConfig.bodySize;
  const [headW, headH, headD] = mobConfig.headSize;

  const baseColor = useMemo(() => new THREE.Color(entity.color), [entity.color]);
  const hitColor = useMemo(() => new THREE.Color('#ff0000'), []);
  const blackColor = useMemo(() => new THREE.Color('#000000'), []);

  useFrame(() => {
    if (!groupRef.current) return;
    
    // 1. Sync position and rotation from ECS entity directly (No React State!)
    groupRef.current.position.copy(entity.position);
    groupRef.current.rotation.y = entity.rotation;

    // 2. Handle hit flash visually
    const isHit = entity.lastHit && (performance.now() - entity.lastHit < 300);
    
    groupRef.current.traverse((child) => {
      if (child.isMesh && child.material && child.material.name !== "eye") {
         child.material.color.copy(isHit ? hitColor : baseColor);
         child.material.emissive.copy(isHit ? hitColor : blackColor);
         child.material.emissiveIntensity = isHit ? 0.5 : 0;
      }
    });
  });

  return (
    <group ref={groupRef} position={[entity.position.x, entity.position.y, entity.position.z]} rotation={[0, entity.rotation, 0]}>
      {/* Body */}
      <mesh position={[0, bodyH / 2, 0]}>
        <boxGeometry args={[bodyW, bodyH, bodyD]} />
        <meshLambertMaterial color={entity.color} />
      </mesh>
      {/* Head */}
      <mesh position={[0, bodyH + headH / 2, bodyD / 3]}>
        <boxGeometry args={[headW, headH, headD]} />
        <meshLambertMaterial color={entity.color} />
      </mesh>
      {/* Eyes for hostile mobs */}
      {!mobConfig.passive && (
        <>
          <mesh position={[-0.15, bodyH + headH / 2, bodyD / 3 + headD / 2 + 0.01]}>
            <boxGeometry args={[0.15, 0.1, 0.02]} />
            <meshBasicMaterial name="eye" color="#ff0000" />
          </mesh>
          <mesh position={[0.15, bodyH + headH / 2, bodyD / 3 + headD / 2 + 0.01]}>
            <boxGeometry args={[0.15, 0.1, 0.02]} />
            <meshBasicMaterial name="eye" color="#ff0000" />
          </mesh>
        </>
      )}
      {/* Legs */}
      {entity.type !== 'spider' ? (
        <>
          <mesh position={[-bodyW / 3, -0.3, bodyD / 4]}><boxGeometry args={[0.25, 0.6, 0.25]} /><meshLambertMaterial color={entity.color} /></mesh>
          <mesh position={[bodyW / 3, -0.3, bodyD / 4]}><boxGeometry args={[0.25, 0.6, 0.25]} /><meshLambertMaterial color={entity.color} /></mesh>
          <mesh position={[-bodyW / 3, -0.3, -bodyD / 4]}><boxGeometry args={[0.25, 0.6, 0.25]} /><meshLambertMaterial color={entity.color} /></mesh>
          <mesh position={[bodyW / 3, -0.3, -bodyD / 4]}><boxGeometry args={[0.25, 0.6, 0.25]} /><meshLambertMaterial color={entity.color} /></mesh>
        </>
      ) : (
        [...Array(8)].map((_, i) => (
          <mesh key={i} position={[
            Math.cos((i / 8) * Math.PI * 2) * 0.8, 0, Math.sin((i / 8) * Math.PI * 2) * 0.8
          ]} rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[0.1, 0.8, 0.1]} />
            <meshLambertMaterial color={entity.color} />
          </mesh>
        ))
      )}
      <HealthBar entity={entity} />
    </group>
  );
};

// Health Bar Component updated for ECS
const HealthBar = ({ entity }) => {
  const fillRef = useRef();
  
  useFrame(() => {
    if (!fillRef.current) return;
    const healthPercent = entity.health / entity.maxHealth;
    fillRef.current.position.x = (healthPercent - 1) * 0.6;
    fillRef.current.scale.x = Math.max(0.001, healthPercent);
    fillRef.current.material.color.set(healthPercent > 0.5 ? '#00ff00' : healthPercent > 0.25 ? '#ffff00' : '#ff0000');
  });

  return (
    <group position={[0, 2.2, 0]}>
      <mesh>
        <planeGeometry args={[1.2, 0.15]} />
        <meshBasicMaterial color="#333333" />
      </mesh>
      <mesh ref={fillRef} position={[0, 0, 0.01]}>
        <planeGeometry args={[1.2, 0.12]} />
        <meshBasicMaterial color="#00ff00" />
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
      if (startTime.current === null) startTime.current = Date.now();
      const elapsed = (Date.now() - startTime.current) / 1000;
      meshRef.current.position.y = position[1] + 2 + elapsed * 2;
      meshRef.current.material.opacity = Math.max(0, 1 - elapsed);

      if (elapsed > 1) onComplete(id);
    }
  });

  return (
    <group position={[position[0], position[1] + 2, position[2]]}>
      <sprite ref={meshRef} scale={[1.5, 0.5, 1]}>
        <spriteMaterial color={damage >= 50 ? '#ff0000' : damage >= 25 ? '#ff8800' : '#ffff00'} transparent opacity={1} />
      </sprite>
    </group>
  );
};

// --- ECS SYSTEMS ---
const ECSSystemsLogic = ({ setDamageNumbers, damageId }) => {
  const { camera } = useThree();
  const lastSpawnCheck = useRef(0);
  const spawnedChunks = useRef(new Set());
  const nextId = useRef(0);

  const spawnMob = (x, z, forceType = null) => {
    let y = 15;
    const store = useGameStore.getState();
    if (store.getMobGroundLevel) {
      y = store.getMobGroundLevel(x, z);
      if (isNaN(y)) y = 15;
    }

    const mobTypeKeys = Object.keys(MOB_TYPES);
    let type = forceType;
    if (!type) {
      if (!store.isDay && Math.random() < 0.7) {
        const hostileTypes = mobTypeKeys.filter(k => !MOB_TYPES[k].passive);
        type = hostileTypes[Math.floor(Math.random() * hostileTypes.length)];
      } else {
        type = mobTypeKeys[Math.floor(Math.random() * mobTypeKeys.length)];
      }
    }
    const mobConfig = MOB_TYPES[type];

    ecs.add({
      isMob: true,
      id: nextId.current++,
      type,
      position: new THREE.Vector3(x, y + 0.5, z),
      color: mobConfig.color,
      health: mobConfig.health,
      maxHealth: mobConfig.health,
      speed: mobConfig.speed,
      passive: mobConfig.passive,
      damage: mobConfig.damage,
      xp: mobConfig.xp,
      targetX: x,
      targetZ: z,
      rotation: Math.random() * Math.PI * 2,
      moveTimer: Math.random() * 3,
      isMoving: false,
      isAggro: false,
      lastAttackTime: 0,
      knockback: null,
      lastHit: 0
    });
  };

  useEffect(() => {
    const checkInterval = setInterval(() => {
      const state = useGameStore.getState();
      if (state.getMobGroundLevel && state.getGeneratedChunks && state.getGeneratedChunks().size > 0 && state.isSpawnChunkLoaded) {
        for (let i = 0; i < 20; i++) {
          const angle = (i / 20) * Math.PI * 2;
          const distance = 30 + Math.random() * 20;
          const x = Math.cos(angle) * distance;
          const z = Math.sin(angle) * distance;
          spawnMob(x, z);
        }
        clearInterval(checkInterval);
      }
    }, 500);
    return () => clearInterval(checkInterval);
  }, []);

  useFrame((state, delta) => {
    if (!camera) return;
    const store = useGameStore.getState();
    const now = performance.now();

    // 1. SPAWNER SYSTEM
    if (now - lastSpawnCheck.current >= 2000) {
      lastSpawnCheck.current = now;
      const playerX = camera.position.x;
      const playerZ = camera.position.z;
      const chunkX = Math.floor(playerX / 16);
      const chunkZ = Math.floor(playerZ / 16);
      const chunkKey = `${chunkX}_${chunkZ}`;

      if (!spawnedChunks.current.has(chunkKey) && store.getGeneratedChunks && store.getGeneratedChunks().size > 0) {
        spawnedChunks.current.add(chunkKey);
        const count = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
          const x = chunkX * 16 + Math.random() * 16;
          const z = chunkZ * 16 + Math.random() * 16;
          const dist = Math.sqrt((x - playerX) ** 2 + (z - playerZ) ** 2);
          if (dist > 25) {
            spawnMob(x, z);
          }
        }
      }

      // Despawn
      const maxDistance = 100;
      for (const entity of [...mobsQuery.entities]) {
        const dist = Math.sqrt((entity.position.x - playerX)**2 + (entity.position.z - playerZ)**2);
        if (dist > maxDistance) {
          ecs.remove(entity);
        }
      }
    }

    // 2. AI & MOVEMENT SYSTEM
    const playerX = camera.position.x;
    const playerY = camera.position.y;
    const playerZ = camera.position.z;
    const AGGRO_RANGE = 16;
    const MELEE_RANGE = 2.5;
    const ATTACK_COOLDOWN = 1000;

    for (const entity of mobsQuery.entities) {
      const dx = playerX - entity.position.x;
      const dy = playerY - entity.position.y;
      const dz = playerZ - entity.position.z;
      const distToPlayer2D = Math.sqrt(dx * dx + dz * dz);
      const distToPlayer3D = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (!entity.passive && distToPlayer3D < AGGRO_RANGE) {
        entity.isAggro = true;
        entity.isMoving = true;
        entity.targetX = playerX;
        entity.targetZ = playerZ;

        if (distToPlayer3D < MELEE_RANGE) {
          if (now - entity.lastAttackTime > ATTACK_COOLDOWN && store.damagePlayer) {
            store.damagePlayer(entity.damage, entity.type);
            entity.lastAttackTime = now;
          }
        }
      } else {
        entity.isAggro = false;
        entity.moveTimer -= delta;
        if (entity.moveTimer <= 0) {
          entity.moveTimer = 2 + Math.random() * 4;
          entity.isMoving = Math.random() > 0.3;
          if (entity.isMoving) {
            const angle = Math.random() * Math.PI * 2;
            const distance = 3 + Math.random() * 5;
            entity.targetX = entity.position.x + Math.cos(angle) * distance;
            entity.targetZ = entity.position.z + Math.sin(angle) * distance;
          }
        }
      }

      if (entity.isMoving) {
        const tdx = entity.targetX - entity.position.x;
        const tdz = entity.targetZ - entity.position.z;
        const dist = Math.sqrt(tdx * tdx + tdz * tdz);

        if (dist > 0.5) {
          const speedMult = entity.isAggro ? 1.5 : 1.0;
          const speed = entity.speed * speedMult * delta;
          const moveX = (tdx / dist) * speed;
          const moveZ = (tdz / dist) * speed;

          entity.position.x += moveX;
          entity.position.z += moveZ;
          
          if (store.getMobGroundLevel) {
            const newY = store.getMobGroundLevel(entity.position.x, entity.position.z) + 0.5;
            if (!isNaN(newY)) entity.position.y = newY;
          }

          entity.rotation = Math.atan2(tdx, tdz);
        } else {
          entity.isMoving = false;
        }
      }

      if (entity.knockback) {
        entity.position.x += entity.knockback[0] * delta * 4;
        entity.position.z += entity.knockback[2] * delta * 4;
        entity.knockback = null;
      }
    }
    
    // 3. STORE SYNC FOR MINIMAP
    // Throttle minimap updates to 4fps (every 250ms) to save CPU
    if (now - (store._lastMinimapUpdate || 0) > 250) {
      store.setMobEntities(mobsQuery.entities.map(e => ({
        id: e.id, type: e.type, passive: e.passive, position: [e.position.x, e.position.y, e.position.z]
      })));
      useGameStore.setState({ _lastMinimapUpdate: now });
    }
  });

  // Expose global methods cleanly
  useEffect(() => {
    const damageMob = (id, damage = 25) => {
      const entity = mobsQuery.entities.find(e => e.id === id);
      if (!entity) return null;

      entity.health -= damage;
      entity.lastHit = performance.now();

      setDamageNumbers(nums => [...nums, {
        id: damageId.current++,
        damage,
        position: [entity.position.x, entity.position.y, entity.position.z]
      }]);

      if (entity.health <= 0) {
        const store = useGameStore.getState();
        if (store.grantXP) store.grantXP(entity.xp);
        if (store.onMobKill) store.onMobKill(entity.type, [entity.position.x, entity.position.y, entity.position.z]);
        ecs.remove(entity);
      } else {
        const camera = useGameStore.getState().gameCamera;
        if (camera) {
          const kx = entity.position.x - camera.position.x;
          const kz = entity.position.z - camera.position.z;
          const kd = Math.sqrt(kx * kx + kz * kz) || 1;
          entity.knockback = [kx / kd * 2, 0, kz / kd * 2];
        }
      }
      return entity;
    };

    useGameStore.setState({ attackEntity: damageMob });
    useGameStore.setState({ damageMob: damageMob });

    useGameStore.setState({ checkMobCollision: (pos, range = 3) => {
      return mobsQuery.entities.find(e => {
        const dx = e.position.x - pos.x;
        const dy = e.position.y - pos.y;
        const dz = e.position.z - pos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        return dist < range;
      });
    }});
  }, [setDamageNumbers]);

  return null;
};

// --- ORCHESTRATOR ---
export const NPCSystem = () => {
  const [damageNumbers, setDamageNumbers] = useState([]);
  const damageId = useRef(0);
  const entities = useEntities(mobsQuery); // Only re-renders when entities array changes (add/remove)

  const removeDamageNumber = (id) => {
    setDamageNumbers(prev => prev.filter(d => d.id !== id));
  };

  return (
    <group>
      <ECSSystemsLogic setDamageNumbers={setDamageNumbers} damageId={damageId} />
      
      {entities.map(entity => (
        <MobModel key={entity.id} entity={entity} />
      ))}

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
  <div className="absolute top-4 right-4 text-white bg-black/50 p-2 rounded text-sm pointer-events-none z-50">
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
