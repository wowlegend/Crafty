import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGameStore } from './store/useGameStore';
import { useGameSounds } from './SoundManager';
import * as THREE from 'three';
import { World } from 'miniplex';
import { ecs, mobsQuery } from './ecs/world';
import { GameMethods } from './GameMethods';
import { motion, AnimatePresence } from 'framer-motion';

const xpOrbsQuery = ecs.with('isXPOrb', 'position', 'amount');
const lootDropsQuery = ecs.with('isLootDrop', 'position', 'item', 'xp');

const spawnLootDrop = (item, xp, pos) => {
  const angle = Math.random() * Math.PI * 2;
  const speed = 1.0 + Math.random() * 2.0;
  const vx = Math.cos(angle) * speed;
  const vy = 3 + Math.random() * 3; // vertical pop
  const vz = Math.sin(angle) * speed;
  
  const spawnPos = pos 
    ? new THREE.Vector3(pos[0], pos[1] + 0.3, pos[2]) 
    : new THREE.Vector3(0, 15, 0);

  ecs.add({
    isLootDrop: true,
    item,
    xp: xp || 0,
    position: spawnPos,
    velocity: new THREE.Vector3(vx, vy, vz),
    spawnTime: performance.now(),
    age: 0
  });
};
GameMethods.spawnLootDrop = spawnLootDrop;

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
  spider: { color: '#2F2F2F', health: 60, speed: 3.0, damage: 8, xp: 20, passive: false, bodySize: [1.2, 0.5, 1.5], headSize: [0.6, 0.4, 0.6] },
  villager: { color: '#8b5a2b', health: 120, speed: 1.2, damage: 0, xp: 0, passive: true, bodySize: [0.8, 1.5, 0.6], headSize: [0.7, 0.8, 0.7] }
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
  const hitColor = useMemo(() => new THREE.Color('#ffffff'), []);
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
         if (child.material.color) child.material.color.copy(isHit ? hitColor : baseColor);
         if (child.material.emissive) child.material.emissive.copy(isHit ? hitColor : blackColor);
         if (child.material.emissiveIntensity !== undefined) child.material.emissiveIntensity = isHit ? 1.5 : 0;
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
      {!mobConfig.passive && entity.type !== 'villager' && (
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
      {/* Custom villager details: green eyes + protruding nose */}
      {entity.type === 'villager' && (
        <>
          {/* Green eyes */}
          <mesh castShadow receiveShadow position={[-0.15, bodyH + headH / 2 + 0.05, bodyD / 3 + headD / 2 + 0.01]}>
            <boxGeometry args={[0.1, 0.08, 0.02]} />
            <meshBasicMaterial name="eye" color="#00aa44" />
          </mesh>
          <mesh castShadow receiveShadow position={[0.15, bodyH + headH / 2 + 0.05, bodyD / 3 + headD / 2 + 0.01]}>
            <boxGeometry args={[0.1, 0.08, 0.02]} />
            <meshBasicMaterial name="eye" color="#00aa44" />
          </mesh>
          {/* Protruding nose */}
          <mesh castShadow receiveShadow position={[0, bodyH + headH / 2 - 0.1, bodyD / 3 + headD / 2 + 0.06]}>
            <boxGeometry args={[0.12, 0.25, 0.15]} />
            <meshStandardMaterial roughness={0.8} metalness={0.1} color="#d2b48c" />
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

// Floating Damage/XP Notification Component
const DamageNumber = ({ damage, position, id, onComplete, isXP }) => {
  const meshRef = useRef();
  const startTime = useRef(null);

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    // Clear background
    ctx.clearRect(0, 0, 256, 128);
    
    const isCrit = !isXP && damage >= 40;
    const fontSize = isCrit ? 'bold 64px Outfit, Inter, Impact' : 'bold 50px Outfit, Inter, Impact';
    ctx.font = fontSize;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const text = isXP ? `+${damage} XP` : (isCrit ? `💥 ${damage}!` : `${damage}`);
    
    // Text styling color selection
    const fillStyle = isXP 
      ? '#00ff88' 
      : (isCrit ? '#ff3300' : (damage >= 25 ? '#ffa500' : '#ffff00'));
    
    // Premium text outline
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(text, 128, 64);
    
    // Text fill
    ctx.fillStyle = fillStyle;
    ctx.fillText(text, 128, 64);
    
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, [damage, isXP]);

  // Premium physically simulated arc bounce trajectory
  const velocity = useMemo(() => {
    const angle = (Math.random() - 0.5) * 2.0; // wider drift angle
    const speed = 1.0 + Math.random() * 2.0;
    return {
      x: Math.sin(angle) * speed,
      y: 4.5 + Math.random() * 2.0, // initial vertical pop
      z: Math.cos(angle) * speed
    };
  }, []);

  useFrame((state, delta) => {
    if (meshRef.current) {
      if (startTime.current === null) startTime.current = Date.now();
      const elapsed = (Date.now() - startTime.current) / 1000;
      
      const t = elapsed;
      // Arc formula: y pop and deceleration under gravity, x/z horizontal drift
      const currentY = position[1] + 1.8 + (velocity.y * t - 0.5 * 12.0 * t * t);
      const currentX = position[0] + velocity.x * t;
      const currentZ = position[2] + velocity.z * t;
      
      meshRef.current.position.set(currentX, currentY, currentZ);
      meshRef.current.material.opacity = Math.max(0, 1 - elapsed);

      if (elapsed > 1) {
        texture.dispose(); // clean up texture memory allocation
        onComplete(id);
      }
    }
  });

  const scale = isXP ? [1.8, 0.9, 1] : [2.2, 1.1, 1];

  return (
    <sprite ref={meshRef} position={[position[0], position[1] + 1.8, position[2]]} scale={scale}>
      <spriteMaterial map={texture} transparent opacity={1} depthWrite={false} />
    </sprite>
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
    useGameStore.setState({ spawnMob: spawnMob });
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
    return () => {
      clearInterval(checkInterval);
      useGameStore.setState({ spawnMob: null });
    };
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
          if (attack.type === 'projectile') {
            // Phase 12: Archer System - Spawn Arrow
            if (store.spawnEnemyProjectile) {
              store.spawnEnemyProjectile(attack.position, [camera.position.x, camera.position.y, camera.position.z]);
            }
          } else if (attack.type === 'leap') {
            // Phase 12: Leap System - Physics Impulse
            const entity = mobsQuery.entities.find(ent => ent.id === attack.id);
            if (entity) {
                const dir = [
                    camera.position.x - entity.position.x,
                    8, // Vertical boost
                    camera.position.z - entity.position.z
                ];
                const mag = Math.sqrt(dir[0]*dir[0] + dir[2]*dir[2]);
                entity.knockback = [dir[0]/mag * 15, dir[1], dir[2]/mag * 15]; // Reuse knockback for leap
            }
          } else if (store.damagePlayer) {
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

    const getMobGroundLevel = store.getMobGroundLevel;
    const mobsData = mobsQuery.entities.map(e => {
      let heightGrid = null;
      if (!e.passive && e.isAggro) {
        heightGrid = [];
        const startX = Math.round(e.position.x) - 4;
        const startZ = Math.round(e.position.z) - 4;
        if (getMobGroundLevel) {
          for (let gz = 0; gz < 9; gz++) {
            for (let gx = 0; gx < 9; gx++) {
              const worldX = startX + gx;
              const worldZ = startZ + gz;
              const h = getMobGroundLevel(worldX, worldZ);
              heightGrid.push(isNaN(h) ? e.position.y : h);
            }
          }
        }
      }
      return {
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
        rotation: e.rotation,
        heightGrid: heightGrid
      };
    });

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
        
        // Spawn glowing physical green XP orbs scattered explosively
        const orbValue = 5;
        const totalXP = entity.xp || 10;
        const count = Math.max(1, Math.floor(totalXP / orbValue));
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 1.5 + Math.random() * 2.5;
          const vx = Math.cos(angle) * speed;
          const vy = 4 + Math.random() * 4; // Upward impulse
          const vz = Math.sin(angle) * speed;

          ecs.add({
            isXPOrb: true,
            position: new THREE.Vector3(entity.position.x, entity.position.y + 0.2, entity.position.z),
            velocity: new THREE.Vector3(vx, vy, vz),
            amount: orbValue,
            spawnTime: performance.now(),
            age: 0
          });
        }

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

    const checkMobsInMeleeCone = (playerPos, lookDir, range = 4.5, angleRad = Math.PI / 2) => {
      const forward2D = new THREE.Vector2(lookDir.x, lookDir.z).normalize();
      const minDot = Math.cos(angleRad / 2);
      
      return mobsQuery.entities.filter(e => {
        const dx = e.position.x - playerPos.x;
        const dy = e.position.y - playerPos.y;
        const dz = e.position.z - playerPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        if (dist > range) return false;
        if (Math.abs(dy) > 2.2) return false; // horizontal plane vertical cutoff
        
        const toMob2D = new THREE.Vector2(dx, dz).normalize();
        const dot = forward2D.dot(toMob2D);
        return dot >= minDot;
      });
    };

    useGameStore.setState({ checkMobCollision: checkMobCollision, checkMobsInMeleeCone: checkMobsInMeleeCone });
    GameMethods.checkMobCollision = checkMobCollision;
    GameMethods.checkMobsInMeleeCone = checkMobsInMeleeCone;
  }, [setDamageNumbers]);

  return null;
};

// --- ORCHESTRATOR ---
const EnemyProjectileSystem = () => {
  const [projectiles, setProjectiles] = useState([]);
  const projectileId = useRef(0);
  const { camera } = useThree();

  useEffect(() => {
    useGameStore.setState({ spawnEnemyProjectile: (pos, target) => {
        const dir = new THREE.Vector3(target[0] - pos[0], target[1] - pos[1], target[2] - pos[2]).normalize();
        setProjectiles(prev => [...prev, {
            id: projectileId.current++,
            position: new THREE.Vector3(...pos).add(dir.clone().multiplyScalar(1)),
            velocity: dir.multiplyScalar(0.4),
            age: 0
        }]);
    }});
  }, []);

  useFrame((state, delta) => {
    setProjectiles(prev => {
        const next = [];
        const store = useGameStore.getState();
        const playerPos = camera.position;

        for (const p of prev) {
            p.position.add(p.velocity.clone().multiplyScalar(delta * 60));
            p.age += delta;

            const distToPlayer = p.position.distanceTo(playerPos);
            if (distToPlayer < 1.5) {
                if (store.damagePlayer) store.damagePlayer(15, 'projectile');
                continue;
            }

            if (p.age < 3) next.push(p);
        }
        return next;
    });
  });

  return (
    <group>
        {projectiles.map(p => (
            <mesh key={p.id} position={p.position}>
                <boxGeometry args={[0.2, 0.2, 0.5]} />
                <meshStandardMaterial color="#F5F5DC" emissive="#ffffff" emissiveIntensity={0.5} />
            </mesh>
        ))}
    </group>
  );
};

// --- XP Orb Physics & Pull System ---
const XPOrbSystem = () => {
  const { camera } = useThree();
  const { playPickup } = useGameSounds();

  useFrame((state, delta) => {
    if (!camera) return;
    const store = useGameStore.getState();
    const playerPos = camera.position;

    for (const entity of [...xpOrbsQuery.entities]) {
      entity.age += delta;

      // 0.8s physical upward explosion phase with gravity
      if (entity.age < 0.8) {
        entity.velocity.y -= 12 * delta; // Gravity
        entity.position.addScaledVector(entity.velocity, delta);

        // Simple ground collision
        if (store.getMobGroundLevel) {
          const groundY = store.getMobGroundLevel(entity.position.x, entity.position.z);
          if (!isNaN(groundY) && entity.position.y < groundY + 0.1) {
            entity.position.y = groundY + 0.1;
            entity.velocity.y = -entity.velocity.y * 0.4; // Bounce damping
            entity.velocity.x *= 0.7; // Friction
            entity.velocity.z *= 0.7;
          }
        }
      } else {
        // Magnetic pull phase when within 12 units of player
        const dx = playerPos.x - entity.position.x;
        const dy = (playerPos.y - 0.5) - entity.position.y; // Pull towards player core
        const dz = playerPos.z - entity.position.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < 12) {
          const dir = new THREE.Vector3(dx, dy, dz).normalize();
          // Quadratic magnetic pull: speed increases rapidly as distance decreases
          const pullSpeed = Math.max(4, 80 / (dist + 0.2));
          entity.position.addScaledVector(dir, pullSpeed * delta);
        } else if (store.getMobGroundLevel) {
          const groundY = store.getMobGroundLevel(entity.position.x, entity.position.z);
          if (!isNaN(groundY)) {
            entity.position.y = groundY + 0.1;
          }
        }

        // Collection distance check
        if (dist < 1.2) {
          if (GameMethods.grantXP) {
            GameMethods.grantXP(entity.amount);
          }
          if (GameMethods.spawnXPText) {
            GameMethods.spawnXPText(entity.amount, entity.position);
          }
          playPickup();
          ecs.remove(entity);
        }
      }
    }
  });

  return null;
};

// --- XP Orb Render Component ---
const XPOrbRender = ({ entity }) => {
  const meshRef = useRef();

  useFrame(() => {
    if (!meshRef.current) return;
    meshRef.current.position.copy(entity.position);
    meshRef.current.rotation.x += 0.02;
    meshRef.current.rotation.y += 0.02;
  });

  return (
    <mesh ref={meshRef} position={[entity.position.x, entity.position.y, entity.position.z]} castShadow>
      <icosahedronGeometry args={[0.15, 0]} />
      <meshStandardMaterial color="#00ff44" emissive="#00ff44" emissiveIntensity={0.8} roughness={0.1} metalness={0.9} />
    </mesh>
  );
};

// --- Physical Loot Helpers ---
const getItemRarity = (itemName) => {
  if (!itemName) return 'common';
  if (itemName.includes('Diamond') || itemName === 'Golden Crown' || itemName === 'Star Fragment' || itemName.includes('💎')) return 'legendary';
  if (itemName.includes('Iron') || itemName === 'Mana Potion' || itemName.includes('🗡️') || itemName.includes('🛡️') || itemName.includes('💧')) return 'epic';
  if (itemName.includes('Stone') || itemName.includes('Leather') || itemName === 'Health Potion' || itemName === 'Cooked Porkchop' || itemName === 'Cooked Beef' || itemName.includes('❤️') || itemName.includes('🍖')) return 'rare';
  return 'common';
};

const getEmoji = (itemName) => {
  if (!itemName) return '📦';
  const match = itemName.match(/^([\uD800-\uDBFF][\uDC00-\uDFFF]|\p{Emoji})/u);
  if (match) return match[1];

  if (itemName === 'Golden Crown') return '👑';
  if (itemName.includes('Helmet')) return '🪖';
  if (itemName.includes('Chestplate')) return '👕';
  if (itemName.includes('Boots')) return '🥾';
  if (itemName.includes('Shield')) return '🛡️';
  if (itemName.includes('Sword') || itemName === 'sword') return '🗡️';
  if (itemName === 'pickaxe') return '⛏️';
  if (itemName === 'Health Potion') return '❤️';
  if (itemName === 'Mana Potion') return '💧';
  return '📦';
};

// --- Loot Physics & Pull System ---
const LootSystem = () => {
  const { camera } = useThree();
  const { playPickup } = useGameSounds();

  useFrame((state, delta) => {
    if (!camera) return;
    const store = useGameStore.getState();
    const playerPos = camera.position;

    for (const entity of [...lootDropsQuery.entities]) {
      entity.age += delta;

      // 0.8s physical upward explosion phase with gravity
      if (entity.age < 0.8) {
        entity.velocity.y -= 12 * delta; // Gravity
        entity.position.addScaledVector(entity.velocity, delta);

        // Ground collision
        if (store.getMobGroundLevel) {
          const groundY = store.getMobGroundLevel(entity.position.x, entity.position.z);
          if (!isNaN(groundY) && entity.position.y < groundY + 0.1) {
            entity.position.y = groundY + 0.1;
            entity.velocity.y = -entity.velocity.y * 0.4; // Bounce damping
            entity.velocity.x *= 0.7; // Friction
            entity.velocity.z *= 0.7;
          }
        }
      } else {
        // Magnetic pull phase when within 7 units of player
        const dx = playerPos.x - entity.position.x;
        const dy = (playerPos.y - 0.5) - entity.position.y; // Pull towards player core
        const dz = playerPos.z - entity.position.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < 7) {
          const dir = new THREE.Vector3(dx, dy, dz).normalize();
          const pullSpeed = Math.max(3, 40 / (dist + 0.2));
          entity.position.addScaledVector(dir, pullSpeed * delta);
        } else if (store.getMobGroundLevel) {
          const groundY = store.getMobGroundLevel(entity.position.x, entity.position.z);
          if (!isNaN(groundY)) {
            entity.position.y = groundY + 0.1;
          }
        }

        // Collection distance check
        if (dist < 1.2) {
          if (store.addToInventory) {
            store.addToInventory(entity.item, 1);
          }
          if (entity.xp > 0 && GameMethods.grantXP) {
            GameMethods.grantXP(entity.xp, entity.item);
          }
          if (entity.xp > 0 && GameMethods.spawnXPText) {
            GameMethods.spawnXPText(entity.xp, entity.position);
          }
          if (store.addNotification) {
            store.addNotification(`🎒 Looted: ${entity.item}`, 'loot');
          }
          playPickup();
          ecs.remove(entity);
        }
      }
    }
  });

  return null;
};

// --- Loot Render Component ---
const LootDropRender = ({ entity }) => {
  const meshRef = useRef();
  const beamRef = useRef();
  const spriteRef = useRef();
  
  const rarity = useMemo(() => getItemRarity(entity.item), [entity.item]);
  
  const color = useMemo(() => {
    switch (rarity) {
      case 'legendary': return '#f97316';
      case 'epic': return '#a855f7';
      case 'rare': return '#3b82f6';
      case 'common':
      default: return '#9ca3af';
    }
  }, [rarity]);

  const emoji = useMemo(() => getEmoji(entity.item), [entity.item]);

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    ctx.font = '72px Outfit, Inter, Impact';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 8;
    ctx.fillText(emoji, 64, 64);
    
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, [emoji]);

  useFrame((state) => {
    if (!meshRef.current) return;
    meshRef.current.position.copy(entity.position);
    meshRef.current.rotation.y += 0.03;
    meshRef.current.rotation.x = Math.sin(state.clock.getElapsedTime() * 2) * 0.2;
    
    if (beamRef.current) {
      beamRef.current.position.copy(entity.position);
      beamRef.current.position.y += 1.5;
    }
    
    if (spriteRef.current) {
      spriteRef.current.position.copy(entity.position);
      spriteRef.current.position.y += 0.8 + Math.sin(state.clock.getElapsedTime() * 4) * 0.08;
    }
  });

  return (
    <group>
      <mesh ref={meshRef} castShadow>
        <octahedronGeometry args={[0.25, 0]} />
        <meshStandardMaterial 
          color={color} 
          emissive={color} 
          emissiveIntensity={0.6} 
          roughness={0.2} 
          metalness={0.8} 
        />
      </mesh>
      
      <mesh ref={beamRef}>
        <cylinderGeometry args={[0.08, 0.25, 3.0, 8, 1, true]} />
        <meshBasicMaterial 
          color={color} 
          transparent 
          opacity={0.15} 
          depthWrite={false} 
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <sprite ref={spriteRef} scale={[0.8, 0.8, 1]}>
        <spriteMaterial map={texture} transparent depthWrite={false} />
      </sprite>
    </group>
  );
};

export const NPCSystem = React.memo(() => {
  const [damageNumbers, setDamageNumbers] = useState([]);
  const damageId = useRef(0);
  const entities = useEntities(mobsQuery);
  const xpOrbs = useEntities(xpOrbsQuery);
  const lootDrops = useEntities(lootDropsQuery);

  const removeDamageNumber = (id) => {
    setDamageNumbers(prev => prev.filter(d => d.id !== id));
  };

  useEffect(() => {
    GameMethods.spawnXPText = (amount, position) => {
      setDamageNumbers(prev => [...prev, {
        id: damageId.current++,
        isXP: true,
        damage: amount,
        position: [position.x, position.y, position.z]
      }]);
    };
  }, []);

  return (
    <group>
      <SpawnerSystem />
      <AIWorkerSystem />
      <MinimapSyncSystem />
      <CombatSystem setDamageNumbers={setDamageNumbers} damageId={damageId} />
      <EnemyProjectileSystem />
      <XPOrbSystem />
      <LootSystem />

      {entities.map(entity => (
        <MobModel key={entity.id} entity={entity} />
      ))}

      {xpOrbs.map(orb => (
        <XPOrbRender key={orb.id} entity={orb} />
      ))}

      {lootDrops.map(loot => (
        <LootDropRender key={loot.id} entity={loot} />
      ))}

      {damageNumbers.map(dmg => (
        <DamageNumber
          key={dmg.id}
          id={dmg.id}
          damage={dmg.damage}
          isXP={dmg.isXP}
          position={dmg.position}
          onComplete={removeDamageNumber}
        />
      ))}
    </group>
  );
});

export const CombatInstructions = React.memo(() => (
  <div className="absolute top-4 right-4 text-white bg-black/50 p-2 rounded text-sm pointer-events-none z-50">
    <div>🎮 Controls:</div>
    <div>• Click or F - Attack/Cast Spell</div>
    <div>• E - Inventory</div>
    <div>• M - Magic</div>
    <div>• C - Crafting</div>
    <div>• B - Building</div>
    <div>• ESC - Settings</div>
  </div>
));

export const TradingInterface = React.memo(({ villager, onClose }) => {
  const gameState = useGameStore();
  const { playPickup, playLevelUpSound } = useGameSounds();
  const [tradeMessage, setTradeMessage] = useState('');

  const blocks = gameState.inventory?.blocks || {};
  const magic = gameState.inventory?.magic || {};

  const executeBlockTrade = (blockType, required, resultItem, resultCount = 1) => {
    const currentCount = blocks[blockType] || 0;
    if (currentCount < required) {
      setTradeMessage(`Not enough ${blockType}! Need ${required}.`);
      return;
    }

    gameState.setInventory(prev => ({
      ...prev,
      blocks: {
        ...prev.blocks,
        [blockType]: currentCount - required
      },
      magic: {
        ...prev.magic,
        [resultItem]: (prev.magic[resultItem] || 0) + resultCount
      }
    }));
    playPickup();
    setTradeMessage(`Traded ${required} ${blockType} for ${resultCount} ${resultItem}!`);
  };

  const executeCrystalTrade = (magicItem, requiredCrystals, resultCount = 1) => {
    const currentCrystals = magic.crystals || 0;
    if (currentCrystals < requiredCrystals) {
      setTradeMessage(`Not enough Crystals! Need ${requiredCrystals}.`);
      return;
    }

    gameState.setInventory(prev => ({
      ...prev,
      magic: {
        ...prev.magic,
        crystals: currentCrystals - requiredCrystals,
        [magicItem]: (prev.magic[magicItem] || 0) + resultCount
      }
    }));
    if (magicItem === 'wand') {
      playLevelUpSound();
    } else {
      playPickup();
    }
    setTradeMessage(`Traded ${requiredCrystals} Crystals for ${resultCount} ${magicItem}!`);
  };

  const trades = [
    { type: 'block', name: 'Stone to Crystal', cost: 16, costItem: 'stone', get: 1, getItem: 'crystals', costColor: 'text-gray-400', getColor: 'text-cyan-400' },
    { type: 'block', name: 'Coal to Crystal', cost: 8, costItem: 'coal', get: 1, getItem: 'crystals', costColor: 'text-slate-500', getColor: 'text-cyan-400' },
    { type: 'block', name: 'Iron to Crystal', cost: 4, costItem: 'iron', get: 1, getItem: 'crystals', costColor: 'text-orange-300', getColor: 'text-cyan-400' },
    { type: 'block', name: 'Gold to Crystal', cost: 2, costItem: 'gold', get: 1, getItem: 'crystals', costColor: 'text-yellow-400', getColor: 'text-cyan-400' },
    { type: 'crystal', name: 'Crystals to Scroll', cost: 5, costItem: 'crystals', get: 1, getItem: 'scrolls', costColor: 'text-cyan-400', getColor: 'text-purple-400' },
    { type: 'crystal', name: 'Crystals to Wand', cost: 15, costItem: 'crystals', get: 1, getItem: 'wand', costColor: 'text-cyan-400', getColor: 'text-red-400' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-lg overflow-hidden border border-white/10 shadow-2xl bg-slate-900/80 backdrop-blur-md rounded-2xl p-6 text-white"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
            <h2 className="text-2xl font-bold tracking-wide bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              Villager Merchant
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-lg"
          >
            ✕
          </button>
        </div>

        {/* Resources Panel */}
        <div className="bg-white/5 border border-white/5 rounded-xl p-3 mb-4 grid grid-cols-4 gap-2 text-xs text-center">
          <div>
            <span className="text-gray-400 block">Stone</span>
            <span className="font-semibold text-gray-300">{blocks.stone || 0}</span>
          </div>
          <div>
            <span className="text-gray-400 block">Coal</span>
            <span className="font-semibold text-slate-400">{blocks.coal || 0}</span>
          </div>
          <div>
            <span className="text-gray-400 block">Iron</span>
            <span className="font-semibold text-orange-300">{blocks.iron || 0}</span>
          </div>
          <div>
            <span className="text-gray-400 block">Gold</span>
            <span className="font-semibold text-yellow-400">{blocks.gold || 0}</span>
          </div>
          <div className="col-span-2 border-t border-white/5 pt-2 mt-2">
            <span className="text-cyan-400 block font-medium">Crystals</span>
            <span className="font-bold text-cyan-300 text-sm">{magic.crystals || 0}</span>
          </div>
          <div className="col-span-1 border-t border-white/5 pt-2 mt-2">
            <span className="text-purple-400 block font-medium">Scrolls</span>
            <span className="font-bold text-purple-300 text-sm">{magic.scrolls || 0}</span>
          </div>
          <div className="col-span-1 border-t border-white/5 pt-2 mt-2">
            <span className="text-red-400 block font-medium">Wands</span>
            <span className="font-bold text-red-300 text-sm">{magic.wand || 0}</span>
          </div>
        </div>

        {/* Trade Message Feedback */}
        {tradeMessage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`text-center py-2 px-3 mb-4 rounded-lg text-sm font-medium border ${
              tradeMessage.includes('Not enough')
                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            }`}
          >
            {tradeMessage}
          </motion.div>
        )}

        {/* Trades Scroll Area */}
        <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
          {trades.map((t, idx) => {
            const currentStock = t.type === 'block' ? (blocks[t.costItem] || 0) : (magic[t.costItem] || 0);
            const canTrade = currentStock >= t.cost;

            return (
              <motion.div
                key={idx}
                whileHover={{ scale: 1.01 }}
                className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-semibold tracking-wide text-gray-200">{t.name}</span>
                  <span className="text-xs text-gray-400 mt-0.5">
                    Cost: <span className={`font-semibold ${t.costColor}`}>{t.cost} {t.costItem}</span> (Have: {currentStock})
                  </span>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="text-right flex flex-col">
                    <span className="text-xs text-gray-400">Receive</span>
                    <span className={`text-sm font-bold tracking-wide ${t.getColor}`}>+{t.get} {t.getItem}</span>
                  </div>
                  <button
                    disabled={!canTrade}
                    onClick={() => {
                      if (t.type === 'block') {
                        executeBlockTrade(t.costItem, t.cost, t.getItem, t.get);
                      } else {
                        executeCrystalTrade(t.getItem, t.cost, t.get);
                      }
                    }}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-all shadow-md ${
                      canTrade
                        ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white cursor-pointer active:scale-95'
                        : 'bg-white/5 border border-white/5 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    Trade
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
});
