import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGameStore } from './store/useGameStore';
import * as THREE from 'three';
import { World } from 'miniplex';
import { ecs, mobsQuery } from './ecs/world';
import { GameMethods } from './GameMethods';

// Custom miniplex React hook for compatibility
const useEntities = (query) => {
  const [entities, setEntities] = useState([...query.entities]);
  useEffect(() => {
    const update = () => setEntities([...query.entities]);
    const unsubAdded = query.onEntityAdded.subscribe(update);
    const unsubRemoved = query.onEntityRemoved.subscribe(update);
    return () => {
      unsubAdded();
      unsubRemoved();
    };
  }, [query]);
  return entities;
};

// MOB TYPES with different stats and colors
const MOB_TYPES = {
  pig: { color: '#ffc0cb', health: 50, speed: 1.5, damage: 0, xp: 10, passive: true, bodySize: [1.0, 0.8, 1.4], headSize: [0.7, 0.7, 0.7] },
  cow: { color: '#8B4513', health: 80, speed: 1.2, damage: 0, xp: 15, passive: true, bodySize: [1.2, 1.0, 1.6], headSize: [0.8, 0.8, 0.6] },
  zombie: { color: '#228B22', health: 100, speed: 2.0, damage: 10, xp: 25, passive: false, bodySize: [0.8, 1.6, 0.5], headSize: [0.7, 0.7, 0.7] },
  skeleton: { color: '#F5F5DC', health: 80, speed: 2.5, damage: 15, xp: 30, passive: false, bodySize: [0.6, 1.5, 0.4], headSize: [0.6, 0.6, 0.6] },
  spider: { color: '#2F2F2F', health: 60, speed: 3.0, damage: 8, xp: 20, passive: false, bodySize: [1.2, 0.5, 1.5], headSize: [0.6, 0.4, 0.6] }
};

// Mob Model Component with variety - PURE ECS RENDERER
const MobModel = ({ entity }) => {
  const groupRef = useRef();
  const legRefs = useRef([]);
  const prevPos = useRef(null);
  
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

    // 3. Phase 9: Procedural Mob Animations & IK
    if (!prevPos.current) prevPos.current = { x: entity.position.x, z: entity.position.z };
    const dx = entity.position.x - prevPos.current.x;
    const dz = entity.position.z - prevPos.current.z;
    const velocity = Math.sqrt(dx*dx + dz*dz);
    prevPos.current = { x: entity.position.x, z: entity.position.z };

    const time = performance.now() * 0.01;
    const speed = velocity * 15; 
    const swing = speed > 0.05 ? Math.sin(time) * 0.6 : 0;
    
    if (entity.type !== 'spider') {
      if (legRefs.current[0]) legRefs.current[0].rotation.x = swing;
      if (legRefs.current[1]) legRefs.current[1].rotation.x = -swing;
      if (legRefs.current[2]) legRefs.current[2].rotation.x = -swing;
      if (legRefs.current[3]) legRefs.current[3].rotation.x = swing;

      // IK height snapping
      const store = useGameStore.getState();
      if (store.getMobGroundLevel && speed > 0) {
        const checkIK = (mesh, offsetX, offsetZ) => {
          if (!mesh) return;
          const cosR = Math.cos(entity.rotation);
          const sinR = Math.sin(entity.rotation);
          const worldX = entity.position.x + (offsetX * cosR + offsetZ * sinR);
          const worldZ = entity.position.z + (-offsetX * sinR + offsetZ * cosR);
          const groundY = store.getMobGroundLevel(worldX, worldZ);
          if (!isNaN(groundY)) {
             const targetY = groundY - entity.position.y;
             mesh.position.y += (Math.max(-0.3, targetY + 0.3) - mesh.position.y) * 0.2;
          }
        };
        checkIK(legRefs.current[0], -bodyW / 3, bodyD / 4);
        checkIK(legRefs.current[1], bodyW / 3, bodyD / 4);
        checkIK(legRefs.current[2], -bodyW / 3, -bodyD / 4);
        checkIK(legRefs.current[3], bodyW / 3, -bodyD / 4);
      }
    } else {
      legRefs.current.forEach((leg, i) => {
        if (leg) leg.rotation.x = speed > 0.05 ? Math.sin(time + i) * 0.3 : 0;
      });
    }
  });

  return (
    <group ref={groupRef} position={[entity.position.x, entity.position.y, entity.position.z]} rotation={[0, entity.rotation, 0]}>
      {/* Body */}
      <mesh castShadow receiveShadow position={[0, bodyH / 2, 0]}>
        <boxGeometry args={[bodyW, bodyH, bodyD]} />
        <meshStandardMaterial roughness={0.8} metalness={0.1} color={entity.color} />
      </mesh>
      {/* Head */}
      <mesh castShadow receiveShadow position={[0, bodyH + headH / 2, bodyD / 3]}>
        <boxGeometry args={[headW, headH, headD]} />
        <meshStandardMaterial roughness={0.8} metalness={0.1} color={entity.color} />
      </mesh>
      {/* Eyes for hostile mobs */}
      {!mobConfig.passive && (
        <>
          <mesh castShadow receiveShadow position={[-0.15, bodyH + headH / 2, bodyD / 3 + headD / 2 + 0.01]}>
            <boxGeometry args={[0.15, 0.1, 0.02]} />
            <meshBasicMaterial name="eye" color="#ff0000" />
          </mesh>
          <mesh castShadow receiveShadow position={[0.15, bodyH + headH / 2, bodyD / 3 + headD / 2 + 0.01]}>
            <boxGeometry args={[0.15, 0.1, 0.02]} />
            <meshBasicMaterial name="eye" color="#ff0000" />
          </mesh>
        </>
      )}
      {/* Legs */}
      {entity.type !== 'spider' ? (
        <>
          <mesh castShadow receiveShadow ref={(el) => legRefs.current[0] = el} position={[-bodyW / 3, -0.3, bodyD / 4]}><boxGeometry args={[0.25, 0.6, 0.25]} /><meshStandardMaterial roughness={0.8} metalness={0.1} color={entity.color} /></mesh>
          <mesh castShadow receiveShadow ref={(el) => legRefs.current[1] = el} position={[bodyW / 3, -0.3, bodyD / 4]}><boxGeometry args={[0.25, 0.6, 0.25]} /><meshStandardMaterial roughness={0.8} metalness={0.1} color={entity.color} /></mesh>
          <mesh castShadow receiveShadow ref={(el) => legRefs.current[2] = el} position={[-bodyW / 3, -0.3, -bodyD / 4]}><boxGeometry args={[0.25, 0.6, 0.25]} /><meshStandardMaterial roughness={0.8} metalness={0.1} color={entity.color} /></mesh>
          <mesh castShadow receiveShadow ref={(el) => legRefs.current[3] = el} position={[bodyW / 3, -0.3, -bodyD / 4]}><boxGeometry args={[0.25, 0.6, 0.25]} /><meshStandardMaterial roughness={0.8} metalness={0.1} color={entity.color} /></mesh>
        </>
      ) : (
        [...Array(8)].map((_, i) => (
          <mesh castShadow receiveShadow ref={(el) => legRefs.current[i] = el} key={i} position={[
            Math.cos((i / 8) * Math.PI * 2) * 0.8, 0, Math.sin((i / 8) * Math.PI * 2) * 0.8
          ]} rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[0.1, 0.8, 0.1]} />
            <meshStandardMaterial roughness={0.8} metalness={0.1} color={entity.color} />
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
const SpawnerSystem = () => {
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

      const maxDistance = 100;
      for (const entity of [...mobsQuery.entities]) {
        const dist = Math.sqrt((entity.position.x - playerX)**2 + (entity.position.z - playerZ)**2);
        if (dist > maxDistance) {
          ecs.remove(entity);
        }
      }
    }
  });
  return null;
};

const AIWorkerSystem = () => {
  const { camera } = useThree();
  const workerRef = useRef();

  useEffect(() => {
    workerRef.current = new Worker(new URL('./workers/ai.worker.js', import.meta.url));
    
    workerRef.current.onmessage = (e) => {
      const { type, updates, attacks } = e.data;
      if (type === 'TICK_RESULT') {
        const store = useGameStore.getState();
        
        // Handle attacks
        for (const attack of attacks) {
          if (store.damagePlayer) {
            store.damagePlayer(attack.damage, attack.type);
            
            // Phase 11: Spatial Attack Sound
            if (store.playSpatialSound) {
              store.playSpatialSound('attack', attack.position, 1.1, 15);
            }
          }
        }

        // Apply updates
        const entityMap = new Map();
        for (const entity of mobsQuery.entities) {
          entityMap.set(entity.id, entity);
        }

        for (const update of updates) {
          const entity = entityMap.get(update.id);
          if (entity) {
            entity.position.x = update.x;
            entity.position.z = update.z;
            entity.rotation = update.rotation;
            entity.isAggro = update.isAggro;
            
            // Sync back worker state
            entity.isMoving = update.isMoving;
            entity.targetX = update.targetX;
            entity.targetZ = update.targetZ;
            entity.lastAttackTime = update.lastAttackTime;
            entity.moveTimer = update.moveTimer;

            if (store.getMobGroundLevel) {
              const newY = store.getMobGroundLevel(entity.position.x, entity.position.z) + 0.5;
              if (!isNaN(newY)) entity.position.y = newY;
            }
          }
        }
      }
    };

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  useFrame((state, delta) => {
    if (!camera || !workerRef.current) return;
    const now = performance.now();
    
    // Process knockback in main thread
    for (const entity of mobsQuery.entities) {
      if (entity.knockback) {
        entity.position.x += entity.knockback[0] * delta * 4;
        entity.position.z += entity.knockback[2] * delta * 4;
        entity.knockback = null;
      }
    }

    const mobsData = mobsQuery.entities.map(e => ({
      id: e.id,
      passive: e.passive,
      x: e.position.x,
      y: e.position.y,
      z: e.position.z,
      targetX: e.targetX,
      targetZ: e.targetZ,
      isMoving: e.isMoving,
      isAggro: e.isAggro,
      lastAttackTime: e.lastAttackTime,
      damage: e.damage,
      type: e.type,
      moveTimer: e.moveTimer,
      speed: e.speed,
      rotation: e.rotation
    }));

    workerRef.current.postMessage({
      type: 'TICK',
      playerPos: [camera.position.x, camera.position.y, camera.position.z],
      now,
      delta,
      mobs: mobsData
    });
  });

  return null;
};

const MinimapSyncSystem = () => {
  useFrame(() => {
    const now = performance.now();
    const store = useGameStore.getState();
    if (now - (store._lastMinimapUpdate || 0) > 250) {
      store.setMobEntities(mobsQuery.entities.map(e => ({
        id: e.id, type: e.type, passive: e.passive, position: [e.position.x, e.position.y, e.position.z]
      })));
      useGameStore.setState({ _lastMinimapUpdate: now });
    }
  });
  return null;
};

const CombatSystem = ({ setDamageNumbers, damageId }) => {
  const { playHit } = useGameSounds();
  useEffect(() => {
    const damageMob = (id, damage = 25) => {
      const entity = mobsQuery.entities.find(e => e.id === id);
      if (!entity) return null;

      // Phase 9: Visceral Hitstop (micro-freeze for game feel)
      const hitstopEnd = performance.now() + 35;
      while (performance.now() < hitstopEnd) { /* hitstop busy wait */ }
      
      const store = useGameStore.getState();
      if (store.triggerCameraShake) store.triggerCameraShake(1.0);
      
      // Phase 11: Spatial Hit Sound
      if (store.playSpatialSound) {
        store.playSpatialSound('hit', [entity.position.x, entity.position.y, entity.position.z]);
      } else {
        playHit();
      }

      entity.health -= damage;
      entity.lastHit = performance.now();

      setDamageNumbers(nums => [...nums, {
        id: damageId.current++,
        damage,
        position: [entity.position.x, entity.position.y, entity.position.z]
      }]);

      if (entity.health <= 0) {
        const store = useGameStore.getState();
        if (GameMethods.grantXP) GameMethods.grantXP(entity.xp);
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
    GameMethods.damageMob = damageMob;

    const checkMobCollision = (pos, range = 3) => {
      return mobsQuery.entities.find(e => {
        const dx = e.position.x - pos.x;
        const dy = e.position.y - pos.y;
        const dz = e.position.z - pos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        return dist < range;
      });
    };

    useGameStore.setState({ checkMobCollision: checkMobCollision });
    GameMethods.checkMobCollision = checkMobCollision;
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
      <SpawnerSystem />
      <AIWorkerSystem />
      <MinimapSyncSystem />
      <CombatSystem setDamageNumbers={setDamageNumbers} damageId={damageId} />
      
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
