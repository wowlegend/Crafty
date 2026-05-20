import React, { useRef, useEffect, useState, useMemo, useCallback, useLayoutEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { GameMethods } from './GameMethods';
import { motion } from 'framer-motion';
import * as THREE from 'three';
import { SPELL_COLORS } from './GameSystems';
import {
  PickaxeIcon,
  Package,
  Settings,
  Sun,
  Moon,
  Wand2,
  Copy,
  Download,
  Upload,
  Trash2,
  Grid,
  Hammer,
  Sword,
  Star
} from 'lucide-react';

// Import optimized systems
import { useSimpleExperience } from './SimpleExperienceSystem';
import { EnhancedMagicSystem, MagicWand } from './EnhancedMagicSystem';
import { OptimizedGrassSystem } from './OptimizedGrassSystem';
import { RigidBody, CapsuleCollider, useRapier } from '@react-three/rapier';
import { useGameStore } from './store/useGameStore';

// BLOCK TYPES - Immutable configuration
import { BLOCK_TYPES, HOTBAR_BLOCKS } from './world/Blocks';

const MinecraftHotbar = React.memo(({ gameState }) => {
  if (!gameState) return null;
  return (
    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 pointer-events-auto">
      <div className="minecraft-hotbar">
        {HOTBAR_BLOCKS.map((blockType, index) => {
          const blockConfig = BLOCK_TYPES[blockType];
          if (!blockConfig) return null;
          const isSelected = gameState.selectedBlock === blockType;
          const quantity = gameState.inventory?.blocks?.[blockType] || 0;
          return (
            <div
              key={blockType}
              className={`minecraft-hotbar-slot ${isSelected ? 'selected' : ''}`}
              onClick={() => gameState.setSelectedBlock(blockType)}
              title={`${blockConfig.name} (${quantity})`}
            >
              <div className="minecraft-block-icon" style={{ backgroundColor: blockConfig.color || '#567C35' }} />
              {quantity > 1 && <div className="minecraft-quantity">{quantity > 999 ? '999+' : quantity}</div>}
              <div className="minecraft-hotkey">{index + 1}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

const MinecraftHealthHunger = React.memo(() => {
  const hearts = useMemo(() => Array(10).fill(null).map((_, i) => i), []);
  const hunger = useMemo(() => Array(10).fill(null).map((_, i) => i), []);
  return (
    <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 pointer-events-auto">
      <div className="minecraft-status-bars">
        <div className="minecraft-health-bar">
          {hearts.map(i => <div key={`heart-${i}`} className="minecraft-heart"><div className="minecraft-heart-icon">❤</div></div>)}
        </div>
        <div className="minecraft-hunger-bar">
          {hunger.map(i => <div key={`hunger-${i}`} className="minecraft-hunger"><div className="minecraft-hunger-icon">🍖</div></div>)}
        </div>
      </div>
    </div>
  );
});

export const PositionTracker = React.memo(({ onPositionUpdate }) => {
  const { camera } = useThree();
  const lastUpdate = useRef(0);
  useFrame(() => {
    const now = performance.now();
    if (camera && onPositionUpdate && now - lastUpdate.current > 200) {
      lastUpdate.current = now;
      onPositionUpdate({
        x: Math.round(camera.position.x),
        y: Math.round(camera.position.y),
        z: Math.round(camera.position.z)
      });
    }
  });
  return null;
});

export const GameUI = ({ gameState, showStats, setShowStats, playerPosition }) => {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 pointer-events-none z-20">
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-auto">
        <div className="minecraft-info-panel">
          <div className="flex items-center space-x-4 text-white minecraft-text">
            <div>Mode: <span className="text-green-400">{gameState.gameMode}</span></div>
          </div>
        </div>
        <div className="flex space-x-2">
          <button onClick={() => gameState.setShowSettings(true)} className="minecraft-button"><Settings size={20} /></button>
        </div>
      </div>
      <MinecraftHotbar gameState={gameState} />
      <MinecraftHealthHunger />
      <div className="absolute left-4 top-1/2 transform -translate-y-1/2 pointer-events-auto">
        <div className="minecraft-toolbar">
          <button onClick={() => gameState.setShowInventory(true)} className="minecraft-tool-button"><Package size={20} /></button>
          <button onClick={() => gameState.setShowCrafting(true)} className="minecraft-tool-button"><Hammer size={20} /></button>
          <button onClick={() => gameState.setShowMagic(true)} className="minecraft-tool-button"><Wand2 size={20} /></button>
          <button onClick={() => gameState.setShowBuildingTools(true)} className="minecraft-tool-button"><Grid size={20} /></button>
        </div>
      </div>
    </motion.div>
  );
};



export const Player = ({ isWorldBuilt }) => {
  const isWorldBuiltRef = useRef(isWorldBuilt);
  useEffect(() => {
    isWorldBuiltRef.current = isWorldBuilt;
  }, [isWorldBuilt]);

  const gameState = useGameStore();
  const { camera } = useThree();
  const [isAttacking, setIsAttacking] = useState(false);
  const rigidBodyRef = useRef();
  const { rapier, world } = useRapier();

  // FIX #1: Use useRef for keyboard state — prevents 60+ re-renders/sec
  // useState caused stale closures inside useFrame AND triggered full React re-renders on every keypress
  const keysRef = useRef({});
  const spawnPosSet = useRef(false);

  const lastCastTime = useRef(0);
  const CAST_COOLDOWN = 333;
  const jumpRequested = useRef(false);
  const cameraInitialized = useRef(false);

  // Expose camera globally for magic system
  useEffect(() => {
    useGameStore.setState({ gameCamera: camera });
  }, [camera]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      keysRef.current[e.code] = true;

      if (e.code === 'Space') {
        jumpRequested.current = true;
      }

      if (e.code === 'KeyF') {
        setIsAttacking(true);
        setTimeout(() => setIsAttacking(false), 500);

        if (GameMethods.checkMobCollision && GameMethods.damageMob) {
          const direction = new THREE.Vector3();
          camera.getWorldDirection(direction);
          const checkPos = camera.position.clone().add(direction.multiplyScalar(3));
          const mob = GameMethods.checkMobCollision(checkPos, 4);
          if (mob) {
            GameMethods.damageMob(mob.id, 25);
            if (useGameStore.getState().playHitSound) useGameStore.getState().playHitSound();
          }
        }
      }
    };
    const handleKeyUp = (e) => {
      keysRef.current[e.code] = false;
      if (e.code === 'Space') {
        jumpRequested.current = false;
      }
    };
    const handleMouseDown = (e) => {
      if (document.pointerLockElement) {
        setIsAttacking(true);
        setTimeout(() => setIsAttacking(false), 200);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseDown);
    }
  }, [camera]);

  useFrame((state, delta) => {
    if (!rigidBodyRef.current) return;

    // Wake up physics body
    rigidBodyRef.current.wakeUp();

    const speed = 10;
    const currentVel = rigidBodyRef.current.linvel();
    const currentTrans = rigidBodyRef.current.translation();

    // Freeze player in sky until world is built to prevent falling through floor
    if (!isWorldBuiltRef.current) {
      rigidBodyRef.current.setTranslation({ x: 0, y: 120, z: 0 }, true);
      rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      return;
    } else if (!spawnPosSet.current) {
      const store = useGameStore.getState();
      let groundY = 60;

      // 1. Try to use placed blocks (if loading from a save)
      if (store.worldBlocks && store.worldBlocks.size > 0) {
        for (let y = 150; y > 0; y--) {
          if (store.worldBlocks.has(`0,${y},0`)) {
            groundY = y;
            break;
          }
        }
      } 
      // 2. Otherwise use the physics raycast to find the generated terrain mesh height
      else if (store.getMobGroundLevel) {
        let physicsY = store.getMobGroundLevel(0, 0);
        if (isNaN(physicsY)) physicsY = 15; // Fallback if toi is undefined

        // If it returns the default 15 (or lower), the collider might not be added to the physics world yet. Delay spawn.
        if (physicsY <= 15) {
            rigidBodyRef.current.setTranslation({ x: 0, y: 120, z: 0 }, true);
            rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
            return; // Wait for next frame
        }
        groundY = Math.max(physicsY, 60);
      }

      const safeY = groundY + 3; // Spawn 3 units above the highest block
      rigidBodyRef.current.setTranslation({ x: 0, y: safeY, z: 0 }, true);
      rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      spawnPosSet.current = true;
      return;
    }
    if (isNaN(currentVel.x) || isNaN(currentTrans.y)) {
      console.error(`[DEBUG] Physics corrupted! vel:`, currentVel, `trans:`, currentTrans);
    }

    // Read from keysRef instead of stale keys state
    const keys = keysRef.current;
    // Only process movement if pointer is locked
    const isLocked = !!document.pointerLockElement;

    // Anti-stuck: if player is deeply embedded in a block or void
    if (currentTrans.y < -50 || (isLocked && keys.KeyW && Math.abs(currentVel.x) < 0.1 && Math.abs(currentVel.z) < 0.1 && currentVel.y === 0)) {
      // Small upward nudge if pressing W but perfectly stuck
      if (currentTrans.y > -50 && isLocked) {
         rigidBodyRef.current.setTranslation({ x: currentTrans.x, y: currentTrans.y + 0.1, z: currentTrans.z }, true);
      }
    }

    // Void catch — teleport back up if fallen through terrain
    if (currentTrans.y < -50) {
      rigidBodyRef.current.setTranslation({ x: 0, y: 120, z: 0 }, true);
      rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      return;
    }

    // Get camera look direction projected onto ground plane (robust, no Euler issues)
    const cameraDir = new THREE.Vector3();
    camera.getWorldDirection(cameraDir);
    let forwardDir = new THREE.Vector3(cameraDir.x, 0, cameraDir.z);
    if (forwardDir.lengthSq() < 0.001) {
      // Fallback if looking straight down/up
      forwardDir.set(0, 0, -1);
    }
    forwardDir.normalize();
    const sideDir = new THREE.Vector3(-forwardDir.z, 0, forwardDir.x); // perpendicular right

    const moveW = (isLocked && keys.KeyW) ? 1 : 0;
    const moveS = (isLocked && keys.KeyS) ? 1 : 0;
    const moveA = (isLocked && keys.KeyA) ? 1 : 0;
    const moveD = (isLocked && keys.KeyD) ? 1 : 0;

    const direction = new THREE.Vector3()
      .addScaledVector(forwardDir, moveW - moveS)
      .addScaledVector(sideDir, moveD - moveA);

    let nextVelX = currentVel.x;
    let nextVelZ = currentVel.z;

    if (direction.lengthSq() > 0) {
      direction.normalize().multiplyScalar(speed);
      nextVelX = direction.x;
      nextVelZ = direction.z;
    } else {
      // Always decelerate if no input
      nextVelX = currentVel.x * 0.8;
      nextVelZ = currentVel.z * 0.8;
      if (Math.abs(nextVelX) < 0.1) nextVelX = 0;
      if (Math.abs(nextVelZ) < 0.1) nextVelZ = 0;
    }

    let nextVelY = currentVel.y;
    // Downward raycast for precise grounded check
    let isGrounded = false;
    if (world && rigidBodyRef.current) {
      const translation = rigidBodyRef.current.translation();
      const ray = new rapier.Ray(
        { x: translation.x, y: translation.y, z: translation.z },
        { x: 0, y: -1, z: 0 }
      );
      // Capsule height is ~1.8 (halfHeight 0.4 + radius 0.5 = 0.9 from center to bottom).
      // Cast a ray from center downwards with a 0.15 cushion to detect ground contacts cleanly.
      const hit = world.castRay(ray, 1.05, true);
      if (hit) {
        isGrounded = true;
      }
    } else {
      isGrounded = Math.abs(currentVel.y) < 0.2;
    }

    // Jump
    if (isLocked && jumpRequested.current && isGrounded) {
      nextVelY = 12;
      jumpRequested.current = false;
    }

    // Apply combined velocity in a single physics tick
    rigidBodyRef.current.setLinvel({ x: nextVelX, y: nextVelY, z: nextVelZ }, true);

    // Phase 9: Dynamic FOV Momentum & Camera Bobbing
    const horizontalSpeed = Math.sqrt(currentVel.x * currentVel.x + currentVel.z * currentVel.z);
    
    let targetFov = 75;
    if (currentVel.y < -15) targetFov = 85; // falling fast
    else if (horizontalSpeed > 5) targetFov = 75 + (horizontalSpeed - 5) * 1.5; // moving fast

    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 0.1);
    camera.updateProjectionMatrix();

    const time = state.clock.elapsedTime;
    let bobOffset = 0;
    if (isGrounded && horizontalSpeed > 1) {
      bobOffset = Math.sin(time * 15) * 0.06;
    }

    // Phase 9: Camera Shake
    let shakeX = 0;
    let shakeY = 0;
    let shakeZ = 0;
    const store = useGameStore.getState();
    if (store.cameraShakeIntensity > 0.01) {
      const intensity = store.cameraShakeIntensity;
      shakeX = (Math.random() - 0.5) * 0.5 * intensity;
      shakeY = (Math.random() - 0.5) * 0.5 * intensity;
      shakeZ = (Math.random() - 0.5) * 0.5 * intensity;
      store.triggerCameraShake(intensity * 0.85); // Decay
    } else if (store.cameraShakeIntensity > 0) {
      store.triggerCameraShake(0);
    }

    // Sync camera to rigid body — smoothly lerp to eliminate 120Hz/ProMotion physics sync stutter
    const translation = rigidBodyRef.current.translation();
    const targetX = translation.x + shakeX;
    const targetY = translation.y + 1.2 + bobOffset + shakeY;
    const targetZ = translation.z + shakeZ;

    // Use 0.35 lerp factor: coupling lag is 2-3 frames (imperceptible), but absorbs all physics micro-stutters
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.35);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, 0.35);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, 0.35);

    // Force horizontal camera on first frame
    if (!cameraInitialized.current && translation.y > 0) {
      camera.rotation.set(0, 0, 0);
      cameraInitialized.current = true;
    }

    // Continuous spell casting
    if (keys.KeyF) {
      const now = performance.now();
      if (now - lastCastTime.current >= CAST_COOLDOWN) {
        lastCastTime.current = now;

        if (useGameStore.getState().castSpell) {
          const currentSpell = gameState.activeSpell;
          useGameStore.getState().castSpell(currentSpell);
          if (useGameStore.getState().onSpellCast) useGameStore.getState().onSpellCast();
        }

        setIsAttacking(true);
        setTimeout(() => setIsAttacking(false), 150);
      }
    }
  });

  return (
    <group>
      <RigidBody
        ref={rigidBodyRef}
        colliders={false}
        mass={1}
        type="dynamic"
        position={[0, 100, 0]}
        enabledRotations={[false, false, false]}
        ccd={true}
        friction={0}
      >
        <CapsuleCollider args={[0.5, 0.4]} />
      </RigidBody>
      <primitive object={camera}>
        <StableMagicHands selectedBlock={gameState.selectedBlock} isAttacking={isAttacking} />
      </primitive>
    </group>
  );
};

// Magic Hands with effects — locks to camera's local coordinate space for zero-jitter rendering
const StableMagicHands = ({ selectedBlock, isAttacking }) => {
  const activeSpell = useGameStore(state => state.activeSpell) || 'fireball';
  const rightHandRef = useRef();
  const leftHandRef = useRef();
  const wandRef = useRef();
  const magicAuraRef = useRef();

  const currentSpellColor = SPELL_COLORS[activeSpell] || SPELL_COLORS.fireball;

  // Local positions relative to camera center
  const baseRightPos = useMemo(() => new THREE.Vector3(0.6, -0.8, -1.0), []);
  const baseLeftPos = useMemo(() => new THREE.Vector3(-0.4, -0.7, -0.9), []);

  useFrame((state) => {
    if (rightHandRef.current && leftHandRef.current) {
      const time = state.clock.elapsedTime;

      if (isAttacking) {
        const attackTime = time * 6;
        rightHandRef.current.position.set(
          baseRightPos.x,
          baseRightPos.y,
          baseRightPos.z + Math.sin(attackTime) * 0.04
        );
        rightHandRef.current.rotation.set(Math.sin(attackTime) * 0.15, 0, 0);

        leftHandRef.current.position.set(
          baseLeftPos.x,
          baseLeftPos.y,
          baseLeftPos.z
        );
        leftHandRef.current.rotation.set(Math.sin(attackTime + 1) * 0.1, 0, 0);

        if (wandRef.current) {
          wandRef.current.rotation.x = Math.sin(attackTime) * 0.06;
          wandRef.current.position.y = 0.4 + Math.sin(attackTime) * 0.02;
        }
      } else {
        rightHandRef.current.position.copy(baseRightPos);
        rightHandRef.current.rotation.set(0, 0, 0);

        leftHandRef.current.position.copy(baseLeftPos);
        leftHandRef.current.rotation.set(0, 0, 0);

        if (wandRef.current) {
          wandRef.current.rotation.set(0.1, 0, 0);
          wandRef.current.position.y = 0.4;
        }
      }

      if (magicAuraRef.current) {
        const intensity = isAttacking ? 1.08 + Math.sin(time * 2) * 0.03 : 0.98 + Math.sin(time * 0.8) * 0.015;
        magicAuraRef.current.scale.setScalar(intensity);
        magicAuraRef.current.material.opacity = isAttacking ? 0.45 : 0.12;
      }
    }
  });

  return (
    <group>
      <group ref={rightHandRef}>
        <mesh castShadow receiveShadow position={[0, 0.3, 0]}><boxGeometry args={[0.16, 0.7, 0.16]} /><meshStandardMaterial roughness={0.8} metalness={0.1} color="#fdbcb4" /></mesh>
        <mesh castShadow receiveShadow position={[0, -0.05, 0]}><boxGeometry args={[0.2, 0.24, 0.12]} /><meshStandardMaterial roughness={0.8} metalness={0.1} color="#fdbcb4" /></mesh>
        <group ref={wandRef} position={[0.2, 0.4, -0.1]} rotation={[0.1, 0.2, 0.1]}><MagicWand wandType={activeSpell} /></group>
        {isAttacking && (
          <mesh ref={magicAuraRef} position={[0, 0, 0]}>
            <sphereGeometry args={[0.32, 8, 8]} />
            <meshBasicMaterial color={currentSpellColor} transparent opacity={0.4} />
          </mesh>
        )}
        {isAttacking && <SpellHandEffects spellType={activeSpell} />}
      </group>
      <group ref={leftHandRef}>
        <mesh castShadow receiveShadow position={[0, 0.3, 0]}><boxGeometry args={[0.16, 0.7, 0.16]} /><meshStandardMaterial roughness={0.8} metalness={0.1} color="#fdbcb4" /></mesh>
        <mesh castShadow receiveShadow position={[0, -0.05, 0]}><boxGeometry args={[0.2, 0.24, 0.12]} /><meshStandardMaterial roughness={0.8} metalness={0.1} color="#fdbcb4" /></mesh>
        {isAttacking && (
          <group>
            <mesh castShadow receiveShadow position={[0, 0.1, -0.2]}>
              <sphereGeometry args={[0.07, 8, 8]} />
              <meshBasicMaterial color={currentSpellColor} transparent opacity={0.85} />
            </mesh>
            <SpellLeftHandEffects spellType={activeSpell} />
          </group>
        )}
        {!isAttacking && selectedBlock && (
          <group position={[-0.1, 0.2, -0.15]} scale={[0.3, 0.3, 0.3]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial roughness={0.8} metalness={0.1} color={BLOCK_TYPES[selectedBlock]?.color || '#567C35'} />
            </mesh>
          </group>
        )}
      </group>
    </group>
  );
};

const SpellHandEffects = ({ spellType }) => {
  const effectRef = useRef();
  useFrame((state) => {
    if (effectRef.current) {
      const time = state.clock.elapsedTime;
      if (spellType === 'fireball') {
        effectRef.current.rotation.y += 0.04;
        effectRef.current.scale.setScalar(1 + Math.sin(time * 3) * 0.08);
      }
    }
  });
  if (spellType === 'fireball') return <mesh ref={effectRef} position={[0.1, 0.2, 0]}><coneGeometry args={[0.07, 0.22, 6]} /><meshBasicMaterial color="#FF4500" transparent opacity={0.55} /></mesh>;
  return null;
};

const SpellLeftHandEffects = ({ spellType }) => {
  return null;
};
