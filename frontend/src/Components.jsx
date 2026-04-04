import React, { useRef, useEffect, useState, useMemo, useCallback, useLayoutEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
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
import { RigidBody, CapsuleCollider } from '@react-three/rapier';
import { useGameStore } from './store/useGameStore';

// BLOCK TYPES - Immutable configuration
import { BLOCK_TYPES, HOTBAR_BLOCKS } from './world/Blocks';

export const MinecraftHotbar = React.memo(({ gameState }) => {
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

export const MinecraftHealthHunger = React.memo(() => {
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

export const MinecraftSky = React.memo(({ isDay = true }) => {
  const { camera } = useThree();
  const skyRef = useRef();
  const sunRef = useRef();
  const moonRef = useRef();

  useFrame(() => {
    if (skyRef.current && camera) skyRef.current.position.copy(camera.position);
    if (sunRef.current && camera) {
      sunRef.current.position.set(camera.position.x + (isDay ? 0 : -200), camera.position.y + 50, camera.position.z - 80);
      sunRef.current.visible = isDay;
    }
    if (moonRef.current && camera) {
      moonRef.current.position.set(camera.position.x + (isDay ? 200 : 0), camera.position.y + 50, camera.position.z - 80);
      moonRef.current.visible = !isDay;
    }
  });

  return (
    <group>
      <mesh ref={skyRef} scale={[200, 200, 200]}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial color={isDay ? '#87CEEB' : '#2F2F52'} side={THREE.BackSide} />
      </mesh>
      <mesh ref={sunRef}><sphereGeometry args={[3, 8, 8]} /><meshBasicMaterial color="#FFD700" /></mesh>
      <mesh ref={moonRef}><sphereGeometry args={[2.5, 8, 8]} /><meshBasicMaterial color="#F5F5DC" /></mesh>
    </group>
  );
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

  // FIX #1: Use useRef for keyboard state — prevents 60+ re-renders/sec
  // useState caused stale closures inside useFrame AND triggered full React re-renders on every keypress
  const keysRef = useRef({});

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

        if (useGameStore.getState().checkMobCollision && useGameStore.getState().damageMob) {
          const direction = new THREE.Vector3();
          camera.getWorldDirection(direction);
          const checkPos = camera.position.clone().add(direction.multiplyScalar(3));
          const mob = useGameStore.getState().checkMobCollision(checkPos, 4);
          if (mob) {
            useGameStore.getState().damageMob(mob.id, 25);
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
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    }
  }, [camera]);

  useFrame((state, delta) => {
    if (!rigidBodyRef.current) return;

    // Wake up physics body
    rigidBodyRef.current.wakeUp();

    const speed = 10;
    const currentVel = rigidBodyRef.current.linvel();
    const currentTrans = rigidBodyRef.current.translation();

    // Void catch — teleport back up if fallen through terrain
    if (currentTrans.y < -10) {
      rigidBodyRef.current.setTranslation({ x: 0, y: 40, z: 0 }, true);
      rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      return;
    }

    // Get camera look direction projected onto ground plane (robust, no Euler issues)
    const cameraDir = new THREE.Vector3();
    camera.getWorldDirection(cameraDir);
    const forwardDir = new THREE.Vector3(cameraDir.x, 0, cameraDir.z).normalize();
    const sideDir = new THREE.Vector3(-forwardDir.z, 0, forwardDir.x); // perpendicular right

    // Read from keysRef instead of stale keys state
    const keys = keysRef.current;
    const moveW = keys.KeyW ? 1 : 0;
    const moveS = keys.KeyS ? 1 : 0;
    const moveA = keys.KeyA ? 1 : 0;
    const moveD = keys.KeyD ? 1 : 0;

    const direction = new THREE.Vector3()
      .addScaledVector(forwardDir, moveW - moveS)
      .addScaledVector(sideDir, moveD - moveA);

    if (direction.lengthSq() > 0) {
      direction.normalize().multiplyScalar(speed);
      rigidBodyRef.current.setLinvel({ x: direction.x, y: currentVel.y, z: direction.z }, true);
    } else if (Math.abs(currentVel.x) > 0.1 || Math.abs(currentVel.z) > 0.1) {
      rigidBodyRef.current.setLinvel({ x: currentVel.x * 0.8, y: currentVel.y, z: currentVel.z * 0.8 }, true);
    }

    // Jump
    const isGrounded = Math.abs(currentVel.y) < 0.2;
    if (jumpRequested.current && isGrounded) {
      rigidBodyRef.current.setLinvel({ x: currentVel.x, y: 12, z: currentVel.z }, true);
      jumpRequested.current = false;
    }

    // Sync camera to rigid body — direct snap for responsive FPS feel
    const translation = rigidBodyRef.current.translation();
    camera.position.set(translation.x, translation.y + 1.2, translation.z);

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
        position={[0, 40, 0]}
        enabledRotations={[false, false, false]}
        ccd={true}
        friction={0}
      >
        <CapsuleCollider args={[0.5, 0.4]} />
      </RigidBody>
      <StableMagicHands selectedBlock={gameState.selectedBlock} isAttacking={isAttacking} />
    </group>
  );
};

// Magic Hands with effects — uses smoothed camera matrix for zero-jitter rendering
const StableMagicHands = ({ selectedBlock, isAttacking }) => {
  const { camera } = useThree();
  const activeSpell = useGameStore(state => state.activeSpell) || 'fireball';
  const rightHandRef = useRef();
  const leftHandRef = useRef();
  const wandRef = useRef();
  const magicAuraRef = useRef();
  // Smoothed camera position — decouples hand rendering from physics micro-bounce
  const smoothCamPos = useRef(new THREE.Vector3(0, 40, 0));
  const smoothMatrix = useRef(new THREE.Matrix4());

  const currentSpellColor = SPELL_COLORS[activeSpell] || SPELL_COLORS.fireball;

  useFrame((state) => {
    if (rightHandRef.current && leftHandRef.current && camera) {
      const time = state.clock.elapsedTime;

      // Build a smoothed camera matrix — eliminates ALL physics jitter but tracks fast enough
      smoothCamPos.current.lerp(camera.position, 0.4);
      smoothMatrix.current.compose(
        smoothCamPos.current,
        camera.quaternion,
        new THREE.Vector3(1, 1, 1)
      );

      // Position hands using the smoothed matrix
      const rightTarget = new THREE.Vector3(0.6, -0.8, -1.0);
      rightTarget.applyMatrix4(smoothMatrix.current);
      rightHandRef.current.position.copy(rightTarget);
      rightHandRef.current.quaternion.copy(camera.quaternion);

      const leftTarget = new THREE.Vector3(-0.4, -0.7, -0.9);
      leftTarget.applyMatrix4(smoothMatrix.current);
      leftHandRef.current.position.copy(leftTarget);
      leftHandRef.current.quaternion.copy(camera.quaternion);

      if (isAttacking) {
        const attackTime = time * 6;
        rightHandRef.current.rotation.x = Math.sin(attackTime) * 0.12;
        rightHandRef.current.position.z += Math.sin(attackTime) * 0.02;
        leftHandRef.current.rotation.x = Math.sin(attackTime + 1) * 0.08;
        if (wandRef.current) {
          wandRef.current.rotation.x = Math.sin(attackTime) * 0.06;
          wandRef.current.position.y = 0.4 + Math.sin(attackTime) * 0.02;
        }
      } else {
        rightHandRef.current.rotation.x = 0;
        leftHandRef.current.rotation.x = 0;
        if (wandRef.current) {
          wandRef.current.rotation.x = 0.1;
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
        <mesh position={[0, 0.3, 0]}><boxGeometry args={[0.16, 0.7, 0.16]} /><meshLambertMaterial color="#fdbcb4" /></mesh>
        <mesh position={[0, -0.05, 0]}><boxGeometry args={[0.2, 0.24, 0.12]} /><meshLambertMaterial color="#fdbcb4" /></mesh>
        <group ref={wandRef} position={[0.2, 0.4, -0.1]} rotation={[0.1, 0.2, 0.1]}><MagicWand wandType={selectedSpell} /></group>
        {isAttacking && (
          <mesh ref={magicAuraRef} position={[0, 0, 0]}>
            <sphereGeometry args={[0.32, 8, 8]} />
            <meshBasicMaterial color={currentSpellColor} transparent opacity={0.4} />
          </mesh>
        )}
        {isAttacking && <SpellHandEffects spellType={activeSpell} />}
      </group>
      <group ref={leftHandRef}>
        <mesh position={[0, 0.3, 0]}><boxGeometry args={[0.16, 0.7, 0.16]} /><meshLambertMaterial color="#fdbcb4" /></mesh>
        <mesh position={[0, -0.05, 0]}><boxGeometry args={[0.2, 0.24, 0.12]} /><meshLambertMaterial color="#fdbcb4" /></mesh>
        {isAttacking && (
          <group>
            <mesh position={[0, 0.1, -0.2]}>
              <sphereGeometry args={[0.07, 8, 8]} />
              <meshBasicMaterial color={currentSpellColor} transparent opacity={0.85} />
            </mesh>
            <SpellLeftHandEffects spellType={activeSpell} />
          </group>
        )}
        {!isAttacking && selectedBlock && (
          <group position={[-0.1, 0.2, -0.15]} scale={[0.3, 0.3, 0.3]}>
            <mesh>
              <boxGeometry args={[1, 1, 1]} />
              <meshLambertMaterial color={BLOCK_TYPES[selectedBlock]?.color || '#567C35'} />
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
;
