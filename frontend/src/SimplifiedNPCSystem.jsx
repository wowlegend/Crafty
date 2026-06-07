import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html, Outlines } from '@react-three/drei';
import { useGameStore } from './store/useGameStore';
import { useGameSounds } from './SoundManager';
import * as THREE from 'three';
import { World } from 'miniplex';
import { ecs, mobsQuery } from './ecs/world';
import { GameMethods } from './GameMethods';
import { isPointInCone } from './combat/cone.js';
import { isCaptureMode } from './devtest/captureMode';
import { siegeParams } from './game/dayNight.js';
import { motion, AnimatePresence } from 'framer-motion';
import { Panel, Button, Icon, Toast } from './ui/primitives/index.js';
import { getItemRarity } from './data/items.js';
import { rarityBeam } from './game/lootJuice.js';
import { emitMobKill } from './game/mobKillBus.js';
import { MobToonMaterial } from './render/MobToonMaterial';
import { flashableMaterial, OUTLINE, RIM } from './render/characterStyle';
import { TIERS } from './render/quality';

const OUTLINE_RIM_STRENGTH = RIM.strength;

const xpOrbsQuery = ecs.with('isXPOrb', 'position', 'amount');
const lootDropsQuery = ecs.with('isLootDrop', 'position', 'item', 'xp');

const spawnLootDrop = (item, xp, pos) => {
  // Capture-determinism: in capture mode the LootSystem physics loop is frozen, so the
  // drop never moves -> a zero velocity keeps the drop pinned exactly at its spawn pos
  // (no reliance on Math.random in the capture path). Gameplay keeps the random pop arc.
  const capture = isCaptureMode();
  const angle = capture ? 0 : Math.random() * Math.PI * 2;
  const speed = capture ? 0 : 1.0 + Math.random() * 2.0;
  const vx = Math.cos(angle) * speed;
  const vy = capture ? 0 : 3 + Math.random() * 3; // vertical pop
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
  const modelRef = useRef();
  
  const mobConfig = MOB_TYPES[entity.type] || MOB_TYPES.pig;
  const [bodyW, bodyH, bodyD] = mobConfig.bodySize;
  const [headW, headH, headD] = mobConfig.headSize;

  const qualityTier = useGameStore(state => state.qualityTier) || 'low';
  const q = TIERS[qualityTier] || TIERS.low;
  const rimStrength = q.charRim ? OUTLINE_RIM_STRENGTH : 0;

  const baseColor = useMemo(() => new THREE.Color(entity.color), [entity.color]);
  const hitColor = useMemo(() => new THREE.Color('#ffffff'), []);
  const blackColor = useMemo(() => new THREE.Color('#000000'), []);

  const [dialogue, setDialogue] = useState(null);

  useEffect(() => {
    if (entity.type !== 'villager') return;

    const greetings = [
      "Greetings traveler! Left-Click attacks, Right-Click casts active magic!",
      "A storm is brewing. Press U to upgrade spells with attribute points!",
      "Unopened chests hold rich loot. Stand close and press G to unlock!",
      "The deep ocean hides many secrets... Sand beaches are safe!",
      "I heard rumors of a Shadow Dragon... Train and prepare!",
      "Keep practicing your dodge-rolls. Snapping up voxel blocks is easy now!"
    ];

    const myGreeting = greetings[Math.floor(Math.random() * greetings.length)];

    const interval = setInterval(() => {
      const playerPos = useGameStore.getState().playerPosition;
      if (!playerPos) return;

      const dx = entity.position.x - playerPos.x;
      const dy = entity.position.y - playerPos.y;
      const dz = entity.position.z - playerPos.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist < 3.5) {
        setDialogue(myGreeting);
      } else {
        setDialogue(null);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [entity.position, entity.type]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    
    // 1. Sync position and rotation from ECS entity directly (No React State!)
    groupRef.current.position.copy(entity.position);
    groupRef.current.rotation.y = entity.rotation;

    // 2. Squash & Tilt Flinch Animation
    if (modelRef.current) {
      const hitElapsed = entity.lastHit ? (performance.now() - entity.lastHit) : Infinity;
      if (hitElapsed < 250) {
        const t = hitElapsed / 250;
        const wave = Math.sin(t * Math.PI); // sine curve 0 -> 1 -> 0
        const scaleY = 1.0 - wave * 0.15; // Y squishes down to 0.85
        const scaleXZ = 1.0 + wave * 0.1; // X/Z swells to 1.10
        modelRef.current.scale.set(scaleXZ, scaleY, scaleXZ);

        // Tilt backward relative to hit direction
        modelRef.current.rotation.x = -0.2 * wave;
        modelRef.current.rotation.z = (entity.id % 2 === 0 ? 1 : -1) * 0.08 * wave;
      } else {
        modelRef.current.scale.set(1, 1, 1);
        modelRef.current.rotation.set(0, 0, 0);
      }
    }

    // 3. Handle hit flash visually
    const isHit = entity.lastHit && (performance.now() - entity.lastHit < 300);
    
    groupRef.current.traverse((child) => {
      // Only flash lit body materials (Standard/Toon). The drei outline mesh
      // (BackSide ShaderMaterial, exposes a `.color` uniform) and the basic-material
      // eyes must NOT be mutated, or the outline color would be clobbered each frame.
      if (child.isMesh && flashableMaterial(child.material) && child.material.name !== "eye") {
         child.material.color.copy(isHit ? hitColor : baseColor);
         child.material.emissive.copy(isHit ? hitColor : blackColor);
         child.material.emissiveIntensity = isHit ? 1.5 : 0;
      }
    });

    // 4. Procedural Mob Animations & IK
    if (!prevPos.current) prevPos.current = { x: entity.position.x, z: entity.position.z };
    const dx = entity.position.x - prevPos.current.x;
    const dz = entity.position.z - prevPos.current.z;
    const velocity = Math.sqrt(dx*dx + dz*dz);
    prevPos.current = { x: entity.position.x, z: entity.position.z };

    // Dev capture-determinism: pin the gait clock so any mob present in a capture
    // frame holds a fixed leg pose (wall-clock performance.now() differs run-to-run).
    // Inert in normal gameplay. (Mob movement is already frozen in capture, so speed
    // is ~0 and the swing is usually 0 anyway — this also covers the close-up fixtures.)
    const time = isCaptureMode() ? 0 : performance.now() * 0.01;
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
          if (groundY !== null && !isNaN(groundY)) {
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
      <group ref={modelRef}>
        {/* Body */}
        <mesh castShadow receiveShadow position={[0, bodyH / 2, 0]}>
          <boxGeometry args={[bodyW, bodyH, bodyD]} />
          <MobToonMaterial color={entity.color} rimStrength={rimStrength} />
          {q.charOutline && <Outlines thickness={OUTLINE.mob.thickness} color={OUTLINE.color} toneMapped={false} />}
        </mesh>
        {/* Head */}
        <mesh castShadow receiveShadow position={[0, bodyH + headH / 2, bodyD / 3]}>
          <boxGeometry args={[headW, headH, headD]} />
          <MobToonMaterial color={entity.color} rimStrength={rimStrength} />
          {q.charOutline && <Outlines thickness={OUTLINE.mob.thickness} color={OUTLINE.color} toneMapped={false} />}
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
              <MobToonMaterial color="#d2b48c" rimStrength={rimStrength} />
              {q.charOutline && <Outlines thickness={OUTLINE.mob.thickness} color={OUTLINE.color} toneMapped={false} />}
            </mesh>
          </>
        )}
        {/* Legs */}
        {entity.type !== 'spider' ? (
          <>
            <mesh castShadow receiveShadow ref={(el) => legRefs.current[0] = el} position={[-bodyW / 3, -0.3, bodyD / 4]}><boxGeometry args={[0.25, 0.6, 0.25]} /><MobToonMaterial color={entity.color} rimStrength={rimStrength} />{q.charOutline && <Outlines thickness={OUTLINE.mob.thickness} color={OUTLINE.color} toneMapped={false} />}</mesh>
            <mesh castShadow receiveShadow ref={(el) => legRefs.current[1] = el} position={[bodyW / 3, -0.3, bodyD / 4]}><boxGeometry args={[0.25, 0.6, 0.25]} /><MobToonMaterial color={entity.color} rimStrength={rimStrength} />{q.charOutline && <Outlines thickness={OUTLINE.mob.thickness} color={OUTLINE.color} toneMapped={false} />}</mesh>
            <mesh castShadow receiveShadow ref={(el) => legRefs.current[2] = el} position={[-bodyW / 3, -0.3, -bodyD / 4]}><boxGeometry args={[0.25, 0.6, 0.25]} /><MobToonMaterial color={entity.color} rimStrength={rimStrength} />{q.charOutline && <Outlines thickness={OUTLINE.mob.thickness} color={OUTLINE.color} toneMapped={false} />}</mesh>
            <mesh castShadow receiveShadow ref={(el) => legRefs.current[3] = el} position={[bodyW / 3, -0.3, -bodyD / 4]}><boxGeometry args={[0.25, 0.6, 0.25]} /><MobToonMaterial color={entity.color} rimStrength={rimStrength} />{q.charOutline && <Outlines thickness={OUTLINE.mob.thickness} color={OUTLINE.color} toneMapped={false} />}</mesh>
          </>
        ) : (
          [...Array(8)].map((_, i) => (
            <mesh castShadow receiveShadow ref={(el) => legRefs.current[i] = el} key={i} position={[
              Math.cos((i / 8) * Math.PI * 2) * 0.8, 0, Math.sin((i / 8) * Math.PI * 2) * 0.8
            ]} rotation={[0, 0, Math.PI / 4]}>
              <boxGeometry args={[0.1, 0.8, 0.1]} />
              <MobToonMaterial color={entity.color} rimStrength={rimStrength} />
              {q.charOutline && <Outlines thickness={OUTLINE.mob.thickness} color={OUTLINE.color} toneMapped={false} />}
            </mesh>
          ))
        )}
        {/* Dynamic cover-seeking shield aura */}
        {entity.isCoverSeeking && (
          <mesh position={[0, bodyH / 2, 0]}>
            <boxGeometry args={[bodyW * 1.5, bodyH * 1.5, bodyD * 1.5]} />
            <meshBasicMaterial color="#06b6d4" transparent opacity={0.35} wireframe />
          </mesh>
        )}
      </group>
      {/* Suppress the floating health bar in capture mode so character-studio
          fixtures (e.g. character-closeup) render a clean silhouette. No-op in gameplay. */}
      {!isCaptureMode() && <HealthBar entity={entity} />}
      {dialogue && (
        <Html position={[0, bodyH + headH + 0.8, 0]} center distanceFactor={8}>
          <Panel
            variant="raise"
            className="px-3 py-1.5 text-text text-xs text-center flex flex-col items-center justify-center pointer-events-none select-none animate-bounce"
            style={{ minWidth: '160px', maxWidth: '240px', whiteSpace: 'normal', wordBreak: 'break-word' }}
          >
            <div className="flex items-center gap-1 text-accent font-display mb-0.5 text-[10px] tracking-wider uppercase">
              <Icon name="rune" size={12} /> Villager
            </div>
            <div className="text-[11px] leading-snug">{dialogue}</div>
          </Panel>
        </Html>
      )}
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
const DamageNumber = ({ damage, position, id, onComplete, isXP, type }) => {
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
    
    const text = isXP ? `+${damage} XP` : (isCrit ? `${damage}!` : `${damage}`);
    
    // Create gradient
    const gradient = ctx.createLinearGradient(0, 30, 0, 98);
    if (isXP) {
      gradient.addColorStop(0, '#a3ffb4');
      gradient.addColorStop(1, '#00ff88');
    } else {
      switch (type) {
        case 'fireball':
          gradient.addColorStop(0, '#ffaa00');
          gradient.addColorStop(1, '#ff3300');
          break;
        case 'iceball':
          gradient.addColorStop(0, '#ffffff');
          gradient.addColorStop(1, '#00d2ff');
          break;
        case 'lightning':
          gradient.addColorStop(0, '#ffffdd');
          gradient.addColorStop(1, '#ffff00');
          break;
        case 'arcane':
          gradient.addColorStop(0, '#e87cff');
          gradient.addColorStop(1, '#8a00ff');
          break;
        case 'physical':
        default:
          if (isCrit) {
            gradient.addColorStop(0, '#ff9999');
            gradient.addColorStop(1, '#ff0000');
          } else {
            gradient.addColorStop(0, '#ffffff');
            gradient.addColorStop(1, '#cccccc');
          }
          break;
      }
    }
    
    // Premium text outline
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(text, 128, 64);
    
    // Text fill
    ctx.fillStyle = gradient;
    ctx.fillText(text, 128, 64);
    
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, [damage, isXP, type]);

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
      const isCrit = !isXP && damage >= 40;

      // Arc formula: y pop and deceleration under gravity, x/z horizontal drift
      let currentY = position[1] + 1.8 + (velocity.y * t - 0.5 * 12.0 * t * t);
      let currentX = position[0] + velocity.x * t;
      let currentZ = position[2] + velocity.z * t;

      if (isCrit) {
        // High frequency vibration/shake on critical hit numbers decaying quickly
        const shake = 0.09 * Math.exp(-elapsed * 3.8);
        currentX += Math.sin(t * 75) * shake;
        currentY += Math.cos(t * 90) * shake;
        
        // Pulsate scale dynamically using a cosine wave
        const pulse = 1.0 + Math.cos(t * 24) * 0.16 * Math.exp(-elapsed * 2.2);
        meshRef.current.scale.set(scale[0] * pulse, scale[1] * pulse, scale[2]);
      }
      
      meshRef.current.position.set(currentX, currentY, currentZ);
      meshRef.current.material.opacity = Math.max(0, 1 - elapsed);

      if (elapsed > 1) {
        texture.dispose(); // clean up texture memory allocation
        onComplete(id);
      }
    }
  });

  const scale = isXP ? [1.8, 0.9, 1] : (damage >= 40 ? [2.8, 1.4, 1] : [2.2, 1.1, 1]); // larger scale for crits!

  return (
    <sprite ref={meshRef} position={[position[0], position[1] + 1.8, position[2]]} scale={scale}>
      <spriteMaterial map={texture} transparent opacity={1} depthWrite={false} />
    </sprite>
  );
};

// Pooled Shockwave Ring Component
const ImpactShockwave = ({ position, id, onComplete, type }) => {
  const meshRef = useRef();
  const startTime = useRef(null);

  const color = useMemo(() => {
    switch (type) {
      case 'fireball': return '#ffaa00';
      case 'iceball': return '#00d2ff';
      case 'lightning': return '#ffff00';
      case 'arcane': return '#d900ff';
      case 'physical':
      default: return '#ffffff';
    }
  }, [type]);

  useFrame((state, delta) => {
    if (meshRef.current) {
      if (startTime.current === null) startTime.current = performance.now();
      const elapsed = performance.now() - startTime.current;
      const duration = 300; // 300ms
      const t = Math.min(1, elapsed / duration);
      
      // Radius scale from 0.2 to 2.5
      const scale = 0.2 + (2.5 - 0.2) * t;
      meshRef.current.scale.set(scale, scale, 1);
      
      // Opacity fade out from 0.8 to 0.0
      meshRef.current.material.opacity = 0.8 * (1 - t);

      if (t >= 1) {
        onComplete(id);
      }
    }
  });

  return (
    <mesh ref={meshRef} position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.9, 1.0, 32]} />
      <meshBasicMaterial color={color} transparent opacity={0.8} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
};

// --- ECS SYSTEMS ---
const SpawnerSystem = () => {
  const { camera } = useThree();
  const lastSpawnCheck = useRef(0);
  const nextId = useRef(0);

  const spawnMob = (x, z, forceType = null, explicitY = null) => {
    const store = useGameStore.getState();
    let y = explicitY;
    if (y === null) {
      if (!store.getMobGroundLevel) return false;
      y = store.getMobGroundLevel(x, z);
      if (y === null || isNaN(y)) {
        return false;
      }
    }

    const mobTypeKeys = Object.keys(MOB_TYPES);
    let type = forceType;
    if (!type) {
      // M3b: at night the hostile-spawn bias ramps with nightCount (siegeParams);
      // day stays the calm baseline (this branch only fires when !store.isDay).
      const nightHostileChance = siegeParams(store.nightCount).hostileChance;
      if (!store.isDay && Math.random() < nightHostileChance) {
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
      // Explicit-Y placement (visual-capture fixtures) faces the mob toward +Z so the
      // camera, posed on the +Z side, sees the front (eyes). Gameplay spawns stay random.
      rotation: explicitY !== null ? 0 : Math.random() * Math.PI * 2,
      moveTimer: Math.random() * 3,
      isMoving: false,
      isAggro: false,
      lastAttackTime: 0,
      knockback: null,
      lastHit: 0
    });
    return true;
  };

  useEffect(() => {
    useGameStore.setState({ spawnMob: spawnMob });
    const checkInterval = setInterval(() => {
      const state = useGameStore.getState();
      // Dev capture mode: suppress mob spawns so frames are byte-stable. No-op in gameplay.
      if (isCaptureMode()) { clearInterval(checkInterval); return; }
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

    if (now - lastSpawnCheck.current >= 1000) {
      lastSpawnCheck.current = now;
      const playerX = camera.position.x;
      const playerZ = camera.position.z;

      // Dynamic spawning based on loaded chunks.
      // Dev capture mode: suppress this per-frame spawner so capture frames are
      // byte-stable (otherwise mobs pop in at random chunk positions during the
      // capture settle window -> run-to-run jitter). Companion to the setInterval
      // spawner gate above. No-op in normal gameplay.
      if (!isCaptureMode() && store.getGeneratedChunks && store.getGeneratedChunks().size > 0) {
        const activeMobs = mobsQuery.entities.filter(e => e.health > 0).length;
        // M3b: the night siege raises the max-mob cap with nightCount (siegeParams);
        // day holds the calm baseline (siegeParams(0).maxMobs === DAY_MAX_MOBS).
        const maxMobs = store.isDay ? siegeParams(0).maxMobs : siegeParams(store.nightCount).maxMobs;
        if (activeMobs < maxMobs) {
          const mobsNeeded = maxMobs - activeMobs;
          const spawnCount = Math.min(mobsNeeded, 3); // Spawn up to 3 per tick to prevent spikes
          const loadedChunkKeys = Array.from(store.getGeneratedChunks());
          
          // Pre-filter chunks whose center distance to the player is in [20, 90]
          let candidateChunks = loadedChunkKeys.filter(key => {
            const [cx, cz] = key.split('_').map(Number);
            const centerX = cx * 16 + 8;
            const centerZ = cz * 16 + 8;
            const chunkDist = Math.sqrt((centerX - playerX) ** 2 + (centerZ - playerZ) ** 2);
            return chunkDist >= 20 && chunkDist <= 90;
          });
          
          if (candidateChunks.length === 0) {
            candidateChunks = loadedChunkKeys;
          }

          let spawnedThisTick = 0;
          let attempts = 0;
          const maxAttempts = 12;
          
          while (spawnedThisTick < spawnCount && attempts < maxAttempts) {
            const randomKey = candidateChunks[Math.floor(Math.random() * candidateChunks.length)];
            const [cx, cz] = randomKey.split('_').map(Number);
            const x = cx * 16 + Math.random() * 16;
            const z = cz * 16 + Math.random() * 16;
            const dist = Math.sqrt((x - playerX) ** 2 + (z - playerZ) ** 2);
            
            // Only spawn if not too close (avoid visible spawning) and not too far
            if (dist >= 28 && dist <= 85) {
              attempts++;
              const success = spawnMob(x, z);
              if (success) {
                spawnedThisTick++;
              }
            }
          }
        }
      }

      const maxDistance = 100;
      for (const entity of [...mobsQuery.entities]) {
        if (entity.health <= 0) continue;
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
          if (entity.health <= 0) continue;
          entityMap.set(entity.id, entity);
        }

        for (const update of updates) {
          const entity = entityMap.get(update.id);
          if (entity && entity.health > 0) {
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
            entity.isCoverSeeking = update.isCoverSeeking;

            if (store.getMobGroundLevel) {
              const groundY = store.getMobGroundLevel(entity.position.x, entity.position.z);
              if (groundY !== null && !isNaN(groundY)) {
                entity.position.y = groundY + 0.5;
              }
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
    if (isCaptureMode()) return; // freeze mob AI/movement so capture frames are byte-stable
    const now = performance.now();

    // Process knockback in main thread
    for (const entity of mobsQuery.entities) {
      if (entity.health <= 0) continue;
      if (entity.knockback) {
        entity.position.x += entity.knockback[0] * delta * 4;
        entity.position.z += entity.knockback[2] * delta * 4;
        entity.knockback = null;
      }
    }

    const store = useGameStore.getState();
    const getMobGroundLevel = store.getMobGroundLevel;
    const mobsData = mobsQuery.entities.filter(e => e && e.health > 0).map(e => {
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
              heightGrid.push((h === null || isNaN(h)) ? e.position.y : h);
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
        health: e.health,
        maxHealth: e.maxHealth,
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
      const activeMobs = mobsQuery.entities.filter(e => e && e.health > 0);
      store.setMobEntities(activeMobs.map(e => ({
        id: e.id, type: e.type, passive: e.passive, position: [e.position.x, e.position.y, e.position.z]
      })));
      const hostileCount = activeMobs.filter(e => !e.passive).length;
      useGameStore.setState({ 
        _lastMinimapUpdate: now,
        activeHostilesCount: hostileCount 
      });
    }
  });
  return null;
};

const CombatSystem = ({ setDamageNumbers, setShockwaves, damageId }) => {
  const { playHit } = useGameSounds();
  useEffect(() => {
    const damageMob = (id, damage = 25, type = 'physical') => {
      const entity = mobsQuery.entities.find(e => e.id === id);
      if (!entity) return null;

      // Phase 9 / S1-D-M1: Visceral Hitstop (micro-freeze for game feel).
      // Was a MAIN-THREAD BUSY-WAIT (a spin loop on the wall clock) that froze
      // the entire tab — rendering, audio, AND input — for 35ms. Replaced with a
      // non-blocking store flag: a `performance.now()` timestamp the player movement
      // loop reads to clamp its motion toward zero for the window. Same felt micro-
      // freeze, zero main-thread stall, and it benefits every damageMob caller
      // (melee AND spells). Shorter window (28ms) since it's now a true motion dip,
      // not a wall-clock stall stacked on top of frame time.
      useGameStore.setState({ hitstopUntil: performance.now() + 28 });

      const store = useGameStore.getState();
      const isCrit = damage >= 40;
      if (store.triggerCameraShake) {
        store.triggerCameraShake(isCrit ? 1.6 : 1.0);
      }
      
      // Phase 11: Spatial Hit Sound
      if (store.playSpatialSound) {
        store.playSpatialSound('hit', [entity.position.x, entity.position.y, entity.position.z]);
      } else {
        playHit();
      }

      // SOTA High-performance fully GPU-driven particle burst triggering
      if (store.triggerGPUSparks) {
        let sparkColor = '#ffffff';
        const count = isCrit ? 60 : 25; // Massive spray on crits!
        
        switch (type) {
          case 'fireball':
            sparkColor = '#ff5500';
            break;
          case 'iceball':
            sparkColor = '#00d2ff';
            break;
          case 'lightning':
            sparkColor = '#ffff00';
            break;
          case 'arcane':
            sparkColor = '#d900ff';
            break;
          case 'physical':
          default:
            sparkColor = isCrit ? '#ffcc00' : '#ff2200'; // Glowing gold for crits, crimson red for normals
            break;
        }

        store.triggerGPUSparks(
          new THREE.Vector3(entity.position.x, entity.position.y + 0.8, entity.position.z), 
          sparkColor, 
          count, 
          type
        );
      }

      entity.health -= damage;
      entity.lastHit = performance.now();

      // Store hit direction for flinch tilt
      const camera = useGameStore.getState().gameCamera;
      if (camera) {
        const kx = entity.position.x - camera.position.x;
        const kz = entity.position.z - camera.position.z;
        const kd = Math.sqrt(kx * kx + kz * kz) || 1;
        entity.knockback = [kx / kd * 2, 0, kz / kd * 2];
        entity.hitDirection = new THREE.Vector3(kx / kd, 0, kz / kd);
      } else {
        entity.hitDirection = new THREE.Vector3(0, 0, -1);
      }

      setDamageNumbers(nums => [...nums, {
        id: damageId.current++,
        damage,
        type,
        position: [entity.position.x, entity.position.y, entity.position.z]
      }]);

      setShockwaves(waves => [...waves, {
        id: damageId.current++,
        type,
        position: [entity.position.x, entity.position.y + 0.1, entity.position.z]
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

        emitMobKill(entity.type, [entity.position.x, entity.position.y, entity.position.z]); // M3.5: fan-out (quests + ferocity + future Aspects)
        ecs.remove(entity);
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
      // Cone geometry extracted to the pure, unit-tested helper `isPointInCone`
      // (src/combat/cone.js) so the SAME front-arc test is reused for the boss
      // (Components.jsx triggerMeleeAttack). Behaviour here is IDENTICAL.
      return mobsQuery.entities.filter(e =>
        isPointInCone(playerPos, lookDir, e.position, range, angleRad)
      );
    };

    useGameStore.setState({ checkMobCollision: checkMobCollision, checkMobsInMeleeCone: checkMobsInMeleeCone });
    GameMethods.checkMobCollision = checkMobCollision;
    GameMethods.checkMobsInMeleeCone = checkMobsInMeleeCone;
  }, [setDamageNumbers, setShockwaves]);

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
          if (groundY !== null && !isNaN(groundY) && entity.position.y < groundY + 0.1) {
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
          if (groundY !== null && !isNaN(groundY)) {
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
// Re-exported for the M3 loot/rarity characterization tests, which import
// getItemRarity from this module. M3-T3 routed rarity through the single registry
// in src/data/items.js (removing the local duplicate with its emoji-fallback
// branches), so this re-export now resolves to the registry — resolving the prior
// cross-file divergence with GamePanels (both re-export the same registry function).
export { getItemRarity };

// --- Loot Physics & Pull System ---
const LootSystem = () => {
  const { camera } = useThree();
  const { playPickup } = useGameSounds();

  useFrame((state, delta) => {
    if (!camera) return;
    // Capture-determinism: FREEZE the loot physics/magnet/collection loop so spawned
    // fixture drops hold their exact spawn position (no gravity arc, no camera-magnet
    // pull, no auto-collect) -> the loot-showcase frame is byte-stable. Mirrors the mob
    // AI freeze (NPCSystem useFrame early-returns in capture). No-op in gameplay.
    if (isCaptureMode()) return;
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
          if (groundY !== null && !isNaN(groundY) && entity.position.y < groundY + 0.1) {
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
          if (groundY !== null && !isNaN(groundY)) {
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
            store.addNotification(`Looted: ${entity.item}`, 'loot');
          }
          playPickup();
          // M3c-T2: rarity-tinted pickup pop at the collect point (same color as
          // the drop's beam). Fires only here -> never in capture (no pickups occur).
          if (GameMethods.spawnLootPop) {
            GameMethods.spawnLootPop(entity.position, rarityBeam(getItemRarity(entity.item)).color);
          }
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

  const rarity = useMemo(() => getItemRarity(entity.item), [entity.item]);

  // M3c-T1: the drop look is derived from the pure rarityBeam helper, keyed off
  // the LOCKED RARITY_FILL palette -> { color, height, intensity } tiered by
  // rarity (common = short/dim, legendary = tall/bright). The gem + beam share
  // the color; the beam's height + additive opacity scale by tier so a legendary
  // drop reads across the map.
  const beam = useMemo(() => rarityBeam(rarity), [rarity]);
  const color = beam.color;

  // M3-T3: the loot-drop glyph sprite painted a leading emoji from the (now
  // emoji-free) item name into a CanvasTexture. With item identity decoupled
  // from emoji, that display is gone; the rarity-colored gem + beam carry the
  // drop. A game-icon billboard for the drop is a T4 emoji-disposition concern
  // (SVG Icon glyphs can't render into a Three.js CanvasTexture without a new
  // texture pipeline — out of T3 scope).

  useFrame((state) => {
    if (!meshRef.current) return;
    meshRef.current.position.copy(entity.position);
    // Capture-determinism (mirrors MobModel): in capture mode the bob/spin must hold
    // a FIXED pose so the loot-showcase frame is byte-stable. rotation.y accumulates
    // per-frame (frame-count differs run-to-run) and rotation.x reads the live clock;
    // both are pinned to a deterministic value (elapsed=0 -> sin(0)=0) under capture.
    const elapsed = isCaptureMode() ? 0 : state.clock.getElapsedTime();
    if (isCaptureMode()) {
      meshRef.current.rotation.y = 0;
    } else {
      meshRef.current.rotation.y += 0.03;
    }
    meshRef.current.rotation.x = Math.sin(elapsed * 2) * 0.2;

    if (beamRef.current) {
      // Anchor the beam base at the drop, rising by its tiered height.
      beamRef.current.position.copy(entity.position);
      beamRef.current.position.y += beam.height / 2;
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
        <cylinderGeometry args={[0.08, 0.25, beam.height, 8, 1, true]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={beam.intensity}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
};

// --- Pickup Pop VFX ---
// M3c-T2: a short rarity-tinted scale-pop ring that fires ONCE at the pickup
// point (driven from the LootSystem collection branch, dist<1.2). Same self-
// removing scale+fade mechanics as ImpactShockwave (one mesh, ~300ms, then it
// unmounts via onComplete) so there is no per-frame React slop. Color is the
// rarityBeam color, matching the drop's beam for a consistent rarity read.
const LootPopRender = ({ position, color, id, onComplete }) => {
  const meshRef = useRef();
  const startTime = useRef(null);

  useFrame(() => {
    if (!meshRef.current) return;
    // Capture-determinism: the pop normally drives off wall-clock performance.now()
    // (differs run-to-run). In capture mode it holds a FIXED mid-pop pose (t pinned)
    // and never self-completes, so a deterministically-triggered pop renders byte-stable.
    // In gameplay the pop fires only on pickup, which cannot occur in capture (LootSystem
    // collection is frozen), so this branch is exercised only by an explicit fixture pop.
    if (isCaptureMode()) {
      const t = 0.45; // a settled, clearly-visible mid-pop ring
      const scale = 0.15 + (1.4 - 0.15) * t;
      meshRef.current.scale.set(scale, scale, 1);
      meshRef.current.material.opacity = 0.85 * (1 - t);
      return;
    }
    if (startTime.current === null) startTime.current = performance.now();
    const elapsed = performance.now() - startTime.current;
    const duration = 280;
    const t = Math.min(1, elapsed / duration);

    const scale = 0.15 + (1.4 - 0.15) * t;
    meshRef.current.scale.set(scale, scale, 1);
    meshRef.current.material.opacity = 0.85 * (1 - t);

    if (t >= 1) onComplete(id);
  });

  return (
    <mesh ref={meshRef} position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.7, 1.0, 24]} />
      <meshBasicMaterial color={color} transparent opacity={0.85} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
    </mesh>
  );
};

export const NPCSystem = React.memo(() => {
  const [damageNumbers, setDamageNumbers] = useState([]);
  const [shockwaves, setShockwaves] = useState([]);
  const [lootPops, setLootPops] = useState([]);
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
    // M3c-T2: rarity-tinted pickup pop, fired from the LootSystem collect branch.
    GameMethods.spawnLootPop = (position, color) => {
      setLootPops(prev => [...prev, {
        id: damageId.current++,
        position: [position.x, position.y + 0.1, position.z],
        color
      }]);
    };
  }, []);

  return (
    <group>
      <SpawnerSystem />
      <AIWorkerSystem />
      <MinimapSyncSystem />
      <CombatSystem setDamageNumbers={setDamageNumbers} setShockwaves={setShockwaves} damageId={damageId} />
      <EnemyProjectileSystem />
      <XPOrbSystem />
      <LootSystem />

      {entities.filter(entity => entity && entity.health > 0).map(entity => (
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
          type={dmg.type}
          position={dmg.position}
          onComplete={removeDamageNumber}
        />
      ))}

      {shockwaves.map(wave => (
        <ImpactShockwave
          key={wave.id}
          id={wave.id}
          position={wave.position}
          type={wave.type}
          onComplete={(id) => setShockwaves(prev => prev.filter(w => w.id !== id))}
        />
      ))}

      {lootPops.map(pop => (
        <LootPopRender
          key={pop.id}
          id={pop.id}
          position={pop.position}
          color={pop.color}
          onComplete={(id) => setLootPops(prev => prev.filter(p => p.id !== id))}
        />
      ))}
    </group>
  );
});

export const CombatInstructions = React.memo(() => (
  <Panel
    variant="base"
    className="absolute top-4 right-4 p-3 text-text text-sm pointer-events-none z-hud"
  >
    <div className="font-display uppercase text-xs tracking-wider text-accent mb-1">Controls</div>
    <div>Click or F - Attack/Cast Spell</div>
    <div>E - Inventory</div>
    <div>M - Magic</div>
    <div>C - Crafting</div>
    <div>B - Building</div>
    <div>ESC - Settings</div>
  </Panel>
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
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-ink/75" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg"
      >
        <Panel variant="raise" className="relative overflow-hidden p-0">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 bg-panel-raise border-b-chrome border-ink">
            <div className="flex items-center gap-3">
              <Icon name="coins" size={22} className="text-accent" />
              <h2 className="font-display text-xl tracking-wide text-accent uppercase">
                Villager Merchant
              </h2>
            </div>
            <Button variant="ghost" size="sm" aria-label="Close" onClick={onClose} className="w-9 h-9 p-0 text-text-muted">
              <Icon name="close" size={18} />
            </Button>
          </div>

          <div className="p-5">
            {/* Resources Panel */}
            <Panel variant="inset" className="p-3 mb-4 grid grid-cols-4 gap-2 text-xs text-center">
              <div>
                <span className="text-text-muted block uppercase tracking-wider">Stone</span>
                <span className="font-display text-text">{blocks.stone || 0}</span>
              </div>
              <div>
                <span className="text-text-muted block uppercase tracking-wider">Coal</span>
                <span className="font-display text-text">{blocks.coal || 0}</span>
              </div>
              <div>
                <span className="text-text-muted block uppercase tracking-wider">Iron</span>
                <span className="font-display text-text">{blocks.iron || 0}</span>
              </div>
              <div>
                <span className="text-text-muted block uppercase tracking-wider">Gold</span>
                <span className="font-display text-text">{blocks.gold || 0}</span>
              </div>
              <div className="col-span-2 border-t-chrome border-ink pt-2 mt-2">
                <span className="text-accent block font-bold uppercase tracking-wider">Crystals</span>
                <span className="font-display text-text text-sm">{magic.crystals || 0}</span>
              </div>
              <div className="col-span-1 border-t-chrome border-ink pt-2 mt-2">
                <span className="text-accent block font-bold uppercase tracking-wider">Scrolls</span>
                <span className="font-display text-text text-sm">{magic.scrolls || 0}</span>
              </div>
              <div className="col-span-1 border-t-chrome border-ink pt-2 mt-2">
                <span className="text-accent block font-bold uppercase tracking-wider">Wands</span>
                <span className="font-display text-text text-sm">{magic.wand || 0}</span>
              </div>
            </Panel>

            {/* Trade Message Feedback */}
            {tradeMessage && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mb-4"
              >
                <Toast
                  status={tradeMessage.includes('Not enough') ? 'danger' : 'success'}
                  className="w-full justify-center text-sm"
                >
                  {tradeMessage}
                </Toast>
              </motion.div>
            )}

            {/* Trades Scroll Area */}
            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {trades.map((t, idx) => {
                const currentStock = t.type === 'block' ? (blocks[t.costItem] || 0) : (magic[t.costItem] || 0);
                const canTrade = currentStock >= t.cost;

                return (
                  <Panel
                    key={idx}
                    variant="inset"
                    className="flex items-center justify-between p-3"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-display tracking-wide text-text uppercase">{t.name}</span>
                      <span className="text-xs text-text-muted mt-0.5">
                        Cost: <span className="font-bold text-text">{t.cost} {t.costItem}</span> (Have: {currentStock})
                      </span>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right flex flex-col">
                        <span className="text-xs text-text-muted uppercase tracking-wider">Receive</span>
                        <span className="text-sm font-display tracking-wide text-accent">+{t.get} {t.getItem}</span>
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={!canTrade}
                        onClick={() => {
                          if (t.type === 'block') {
                            executeBlockTrade(t.costItem, t.cost, t.getItem, t.get);
                          } else {
                            executeCrystalTrade(t.getItem, t.cost, t.get);
                          }
                        }}
                      >
                        Trade
                      </Button>
                    </div>
                  </Panel>
                );
              })}
            </div>
          </div>
        </Panel>
      </motion.div>
    </div>
  );
});
