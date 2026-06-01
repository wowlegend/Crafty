import React, { useRef, useEffect, useState, useMemo, useCallback, useLayoutEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { GameMethods } from './GameMethods';
import { motion } from 'framer-motion';
import * as THREE from 'three';
import { SPELL_COLORS } from './GameSystems';
import { solveMeleeDamage } from './utils/combat';
import {
  PickaxeIcon,
  Package,
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
import { isCaptureMode, getCaptureOpts } from './devtest/captureMode';

// Bold-flat UI primitives (S1C-M2a chrome migration)
import { Panel, Slot, Button, Icon } from './ui/primitives/index.js';

// BLOCK TYPES - Immutable configuration
import { BLOCK_TYPES, HOTBAR_BLOCKS } from './world/Blocks';

// Bottom-center block hotbar — bold-flat Panel wrapping a row of Slots (mirrors the
// PrimitivesShowcase hotbar). Each block: a Slot (selected when chosen) holding the
// block-color swatch (blockConfig.color is gameplay data, kept inline), a hotkey badge
// (index+1) and a quantity badge when >1. All gameplay behavior preserved.
const MinecraftHotbar = React.memo(({ gameState }) => {
  if (!gameState) return null;
  return (
    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 pointer-events-auto">
      <Panel variant="base" className="flex gap-2 p-2.5">
        {HOTBAR_BLOCKS.map((blockType, index) => {
          const blockConfig = BLOCK_TYPES[blockType];
          if (!blockConfig) return null;
          const isSelected = gameState.selectedBlock === blockType;
          const quantity = gameState.inventory?.blocks?.[blockType] || 0;
          return (
            <Slot
              key={blockType}
              selected={isSelected}
              className="w-[62px] cursor-pointer"
              onClick={() => gameState.setSelectedBlock(blockType)}
              title={`${blockConfig.name} (${quantity})`}
            >
              {/* block-color swatch — gameplay data (inline color allowed) */}
              <div
                className="w-9 h-9 rounded-sm border-chrome border-ink"
                style={{ backgroundColor: blockConfig.color || '#567C35' }}
              />
              <span className="absolute top-1 left-1.5 text-[11px] font-bold text-text-muted tabular-nums">{index + 1}</span>
              {quantity > 1 && (
                <span
                  className="absolute bottom-1 right-1.5 text-[13px] font-bold text-text tabular-nums"
                  style={{ textShadow: '0 1px 2px #000' }}
                >
                  {quantity > 999 ? '999+' : quantity}
                </span>
              )}
            </Slot>
          );
        })}
      </Panel>
    </div>
  );
});

export const PositionTracker = React.memo(() => {
  const { camera } = useThree();
  const lastUpdate = useRef(0);
  useFrame(() => {
    const now = performance.now();
    if (camera && now - lastUpdate.current > 200) {
      lastUpdate.current = now;
      useGameStore.getState().setPlayerPosition({
        x: Math.round(camera.position.x),
        y: Math.round(camera.position.y),
        z: Math.round(camera.position.z)
      });
    }
  });
  return null;
});

export const GameUI = ({ gameState, showStats, setShowStats }) => {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 pointer-events-none z-20">
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-auto">
        <Panel variant="base" className="flex items-center gap-2 px-3 py-2 text-text">
          <span className="text-sm text-text-muted">Mode:</span>
          <span className="text-sm font-bold text-success">{gameState.gameMode}</span>
        </Panel>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" aria-label="Settings" className="w-[42px] h-[42px] p-0 text-text-muted" onClick={() => gameState.setShowSettings(true)}>
            <Icon name="settings" size={20} />
          </Button>
        </div>
      </div>
      <MinecraftHotbar gameState={gameState} />
      <div className="absolute left-4 top-1/2 transform -translate-y-1/2 pointer-events-auto">
        <Panel variant="base" className="flex flex-col gap-2 p-2">
          <Button variant="ghost" size="sm" aria-label="Inventory" className="w-[42px] h-[42px] p-0 text-text" onClick={() => gameState.setShowInventory(true)}><Package size={20} /></Button>
          <Button variant="ghost" size="sm" aria-label="Crafting" className="w-[42px] h-[42px] p-0 text-text" onClick={() => gameState.setShowCrafting(true)}><Hammer size={20} /></Button>
          <Button variant="ghost" size="sm" aria-label="Magic" className="w-[42px] h-[42px] p-0 text-text" onClick={() => gameState.setShowMagic(true)}><Wand2 size={20} /></Button>
          <Button variant="ghost" size="sm" aria-label="Building tools" className="w-[42px] h-[42px] p-0 text-text" onClick={() => gameState.setShowBuildingTools(true)}><Grid size={20} /></Button>
        </Panel>
      </div>
    </motion.div>
  );
};



export const Player = ({ isWorldBuilt }) => {
  const isWorldBuiltRef = useRef(isWorldBuilt);
  useEffect(() => {
    isWorldBuiltRef.current = isWorldBuilt;
  }, [isWorldBuilt]);

  const activeSpell = useGameStore(state => state.activeSpell);
  const selectedBlock = useGameStore(state => state.selectedBlock);
  const { camera } = useThree();
  const [attackType, setAttackType] = useState(null); // 'melee' | 'spell' | null
  const attackStartTime = useRef(0);
  const rigidBodyRef = useRef();
  const { rapier, world } = useRapier();

  const velocityY = useRef(0);
  const controllerRef = useRef(null);
  const knockbackVelocity = useRef(new THREE.Vector3(0, 0, 0));

  // Initialize Rapier Kinematic Character Controller
  useEffect(() => {
    if (world) {
      const offset = 0.05; // Gap offset between character capsule and environment
      const c = world.createCharacterController(offset);
      c.enableAutostep(1.05, 0.2, true); // Step-up height of 1.05m
      c.enableSnapToGround(0.5); // snap to ground when descending slopes
      c.setMaxSlopeClimbAngle(Math.PI / 4); // 45 degrees
      controllerRef.current = c;
      return () => {
        world.removeCharacterController(c);
        controllerRef.current = null;
      };
    }
  }, [world]);

  // FIX #1: Use useRef for keyboard state — prevents 60+ re-renders/sec
  // useState caused stale closures inside useFrame AND triggered full React re-renders on every keypress
  const keysRef = useRef({});
  const spawnPosSet = useRef(false);

  const lastCastTime = useRef(0);
  const CAST_COOLDOWN = 333;
  const jumpRequested = useRef(false);
  const cameraInitialized = useRef(false);
  
  const dodgeRequested = useRef(false);
  const dodgeStateRef = useRef({
    isActive: false,
    duration: 0.4,       // total dodge duration (seconds)
    iframeDuration: 0.2, // invincibility window (~12 frames at 60fps)
    timeElapsed: 0,
    direction: new THREE.Vector3(),
    cooldown: 0.8,       // dodge cooldown (seconds)
    lastDodgeTime: 0
  });

  const lastAttackTime = useRef(0);
  const lastAttackTypeRef = useRef(null);
  const MELEE_COOLDOWN = 300; // milliseconds

  // Expose camera globally for magic system
  useEffect(() => {
    useGameStore.setState({ gameCamera: camera });
  }, [camera]);

  // Expose player rigid body globally for raycast filtering
  useEffect(() => {
    if (rigidBodyRef.current) {
      rigidBodyRef.current.applyImpulse = (impulse) => {
        knockbackVelocity.current.x += impulse.x;
        velocityY.current += impulse.y;
        knockbackVelocity.current.z += impulse.z;
      };
    }
    useGameStore.setState({ playerRigidBodyRef: rigidBodyRef });
    return () => {
      useGameStore.setState({ playerRigidBodyRef: null });
    };
  }, []);

  // Safe-respawn coordinator: when player isAlive transitions from false to true, teleport player back to safe spawn coordinates
  const isAlive = useGameStore(state => state.isAlive);
  const lastAliveRef = useRef(true);
  useEffect(() => {
    if (isAlive && !lastAliveRef.current) {
      spawnPosSet.current = false;
      if (rigidBodyRef.current) {
        rigidBodyRef.current.setTranslation({ x: 0, y: 120, z: 0 }, true);
        rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
    }
    lastAliveRef.current = isAlive;
  }, [isAlive]);

  const triggerMeleeAttack = useCallback(() => {
    const now = performance.now();
    if (now - lastAttackTime.current < MELEE_COOLDOWN) return;
    lastAttackTime.current = now;

    setAttackType('melee');
    setTimeout(() => setAttackType(null), 200);

    const store = useGameStore.getState();
    const effectiveStats = store.getEffectiveAttributes ? store.getEffectiveAttributes() : { strength: 10, agility: 10 };
    
    // Solve weapon base damage based on equipped weapon
    const equippedWeapon = store.equipment?.weapon;
    let baseWeaponDmg = 5;
    if (equippedWeapon === 'Stone Sword') baseWeaponDmg = 12;
    else if (equippedWeapon === 'Iron Sword') baseWeaponDmg = 20;
    else if (equippedWeapon === 'Diamond Sword') baseWeaponDmg = 35;
    else if (equippedWeapon === 'pickaxe') baseWeaponDmg = 8;
    else if (equippedWeapon === 'sword') baseWeaponDmg = 10;
    
    const { damage, isCrit } = solveMeleeDamage(effectiveStats, baseWeaponDmg);

    if (GameMethods.checkMobsInMeleeCone && GameMethods.damageMob) {
      const lookDir = new THREE.Vector3();
      camera.getWorldDirection(lookDir);
      
      lookDir.y = 0;
      lookDir.normalize();

      const playerPos = camera.position.clone();
      playerPos.y -= 0.8; // shift down to chest/feet level

      const range = 4.5;
      const angleRad = Math.PI / 2; // 90-degree front arc sweep

      const hitMobs = GameMethods.checkMobsInMeleeCone(playerPos, lookDir, range, angleRad);
      
      if (hitMobs && hitMobs.length > 0) {
        hitMobs.forEach(mob => {
          GameMethods.damageMob(mob.id, damage, 'physical');
        });
        
        if (isCrit && store.triggerCameraShake) {
          store.triggerCameraShake(1.6); // Visceral Crit camera shake
        }
      } else {
        // Play miss sound
        if (store.playSpatialSound) {
          store.playSpatialSound('swing', [camera.position.x, camera.position.y, camera.position.z], 0.7, 10);
        }
      }
    }
  }, [camera]);

  const triggerSpellCast = useCallback(() => {
    const now = performance.now();
    if (now - lastCastTime.current < CAST_COOLDOWN) return;
    lastCastTime.current = now;

    const store = useGameStore.getState();
    if (store.castSpell) {
      const currentSpell = store.activeSpell || 'fireball';
      store.castSpell(currentSpell);
      if (store.onSpellCast) store.onSpellCast();
    }

    setAttackType('spell');
    setTimeout(() => setAttackType(null), 150);
  }, [activeSpell]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      keysRef.current[e.code] = true;

      if (e.code === 'Space') {
        jumpRequested.current = true;
      }

      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        dodgeRequested.current = true;
      }

      if (e.code === 'KeyF') {
        triggerMeleeAttack();
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
        if (e.button === 0) {
          triggerMeleeAttack();
        } else if (e.button === 2) {
          triggerSpellCast();
        }
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
  }, [camera, triggerMeleeAttack, triggerSpellCast]);

  useFrame((state, delta) => {
    if (!rigidBodyRef.current) return;

    // Dev capture mode: pin the follow-cam to a fixed pose so frames are byte-stable.
    // Physics is paused in this mode, so we bypass all rigidbody-driven camera logic
    // (lerp/bob/shake/FOV) and hard-set a known camera. No-op in normal gameplay.
    if (isCaptureMode()) {
      const { position, lookAt } = getCaptureOpts().camera;
      const { camera } = state;
      camera.position.set(position[0], position[1], position[2]);
      camera.up.set(0, 1, 0);
      camera.lookAt(lookAt[0], lookAt[1], lookAt[2]);
      camera.fov = 75;
      camera.updateProjectionMatrix();
      return;
    }

    // Wake up physics body
    rigidBodyRef.current.wakeUp();

    // Phase 29: Freeze physics body on death to prevent void-falling loops and camera jitter
    const isPlayerAlive = useGameStore.getState().isAlive;
    if (!isPlayerAlive) {
      rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      const translation = rigidBodyRef.current.translation();
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, translation.x, 0.85);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, translation.y + 1.2, 0.85);
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, translation.z, 0.85);
      return;
    }

    const speed = 10;
    const currentVel = rigidBodyRef.current.linvel();
    const currentTrans = rigidBodyRef.current.translation();

    // Void Skyfall Guard: if player clips/falls through floor into the void (< 10), reset
    if (spawnPosSet.current && currentTrans.y < 10) {
      console.warn("[DEBUG] Player fell into void! Teleporting to safety.");
      rigidBodyRef.current.setTranslation({ x: 0, y: 120, z: 0 }, true);
      rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      spawnPosSet.current = false;
      return;
    }

    // Freeze player in sky until world is built to prevent falling through floor
    if (!isWorldBuiltRef.current) {
      rigidBodyRef.current.setTranslation({ x: 0, y: 120, z: 0 }, true);
      rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      return;
    } else if (!spawnPosSet.current) {
      const store = useGameStore.getState();
      let groundY = null;

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
      if (groundY === null && store.getMobGroundLevel) {
        let physicsY = store.getMobGroundLevel(0, 0);
        if (physicsY === null || isNaN(physicsY) || physicsY <= 15 || physicsY > 90) {
            rigidBodyRef.current.setTranslation({ x: 0, y: 120, z: 0 }, true);
            rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
            return; // Wait for next frame
        }
        groundY = physicsY;
      }

      if (groundY === null) {
        groundY = 60; // Fallback
      }

      const safeY = groundY + 1.2; // Spawns the player center exactly 1.2 units above ground level (instantly lands)
      rigidBodyRef.current.setTranslation({ x: 0, y: safeY, z: 0 }, true);
      rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      
      // Cancel skyfall lerp transition: set camera position instantly
      camera.position.set(0, safeY + 1.2, 0);

      spawnPosSet.current = true;
      return;
    }
    if (isNaN(velocityY.current) || isNaN(currentTrans.y)) {
      console.error(`[DEBUG] Physics corrupted! vel:`, velocityY.current, `trans:`, currentTrans);
    }

    // Ensure applyImpulse is bound on the rigid body for boss compatibility
    if (rigidBodyRef.current && !rigidBodyRef.current.applyImpulse) {
      rigidBodyRef.current.applyImpulse = (impulse) => {
        knockbackVelocity.current.x += impulse.x;
        velocityY.current += impulse.y;
        knockbackVelocity.current.z += impulse.z;
      };
    }

    // Read from keysRef instead of stale keys state
    const keys = keysRef.current;
    // Only process movement if pointer is locked
    const isLocked = !!document.pointerLockElement;

    // Handle dodge roll state machine
    const dodge = dodgeStateRef.current;
    const nowTime = state.clock.getElapsedTime();

    if (isLocked && dodgeRequested.current) {
      dodgeRequested.current = false;
      
      // Check cooldown
      if (!dodge.isActive && nowTime - dodge.lastDodgeTime >= dodge.cooldown) {
        const moveW = (isLocked && keys.KeyW) ? 1 : 0;
        const moveS = (isLocked && keys.KeyS) ? 1 : 0;
        const moveA = (isLocked && keys.KeyA) ? 1 : 0;
        const moveD = (isLocked && keys.KeyD) ? 1 : 0;

        const cameraDir = new THREE.Vector3();
        camera.getWorldDirection(cameraDir);
        let forwardDir = new THREE.Vector3(cameraDir.x, 0, cameraDir.z).normalize();
        if (forwardDir.lengthSq() < 0.001) forwardDir.set(0, 0, -1);
        const sideDir = new THREE.Vector3(-forwardDir.z, 0, forwardDir.x);

        let dodgeDir = new THREE.Vector3()
          .addScaledVector(forwardDir, moveW - moveS)
          .addScaledVector(sideDir, moveD - moveA);

        if (dodgeDir.lengthSq() < 0.001) {
          dodgeDir.copy(forwardDir);
        } else {
          dodgeDir.normalize();
        }

        // Initialize dodge
        dodge.isActive = true;
        dodge.timeElapsed = 0;
        dodge.direction.copy(dodgeDir);
        dodge.lastDodgeTime = nowTime;

        // Set invincible callback in store
        useGameStore.setState({
          isPlayerInvincible: () => {
            return dodge.isActive && dodge.timeElapsed <= dodge.iframeDuration;
          }
        });

        // Trigger spatial audio
        if (useGameStore.getState().playSpatialSound) {
          useGameStore.getState().playSpatialSound('swing', currentTrans, 1.4, 15);
        }

        // Trigger camera shake
        if (useGameStore.getState().triggerCameraShake) {
          useGameStore.getState().triggerCameraShake(0.5);
        }
      }
    }

    // Set up robust player physics exclusions to prevent self-collision
    const playerHandle = rigidBodyRef.current.handle;
    const filterPredicate = (collider) => {
      const parent = collider.parent();
      return !parent || parent.handle !== playerHandle;
    };

    // Kinematic ground check from Rapier character controller
    const isGrounded = controllerRef.current ? controllerRef.current.computedGrounded() : false;

    // Phase 23: Ledge Parkour Climb/Vault System
    if (!isGrounded && isLocked && keys.KeyW && velocityY.current <= 2.0 && controllerRef.current) {
      const cameraDir = new THREE.Vector3();
      camera.getWorldDirection(cameraDir);
      const lookDir = new THREE.Vector3(cameraDir.x, 0, cameraDir.z).normalize();
      
      const chestRayStart = { x: currentTrans.x, y: currentTrans.y - 0.2, z: currentTrans.z };
      const rayDirection = { x: lookDir.x, y: 0, z: lookDir.z };
      
      const chestRay = new rapier.Ray(chestRayStart, rayDirection);
      const chestHit = world.castRay(
        chestRay,
        0.8,
        true,
        undefined,
        undefined,
        undefined,
        rigidBodyRef.current,
        filterPredicate
      );

      if (chestHit) {
        const headRayStart = { x: currentTrans.x, y: currentTrans.y + 0.8, z: currentTrans.z };
        const headRay = new rapier.Ray(headRayStart, rayDirection);
        const headHit = world.castRay(
          headRay,
          1.0,
          true,
          undefined,
          undefined,
          undefined,
          rigidBodyRef.current,
          filterPredicate
        );

        if (!headHit) {
          // Ledge detected! Perform vault boost
          velocityY.current = 8.5;
          
          // Apply a gentle forward push to land on top
          knockbackVelocity.current.x = lookDir.x * 3.5;
          knockbackVelocity.current.z = lookDir.z * 3.5;
          
          // Play a premium vault audio sound
          const store = useGameStore.getState();
          if (store.playSpatialSound) {
            store.playSpatialSound('swing', currentTrans, 1.2, 10);
          }
        }
      }
    }

    // Handle jumping & gravity
    if (isGrounded) {
      if (isLocked && jumpRequested.current && !dodge.isActive) {
        velocityY.current = 12.0;
        jumpRequested.current = false;
      } else {
        // Small downward force to stay glued to slopes and stairs
        velocityY.current = -0.5;
      }
    } else {
      // Apply gravity over time
      velocityY.current += -32.0 * delta;
      // Cap at terminal velocity
      if (velocityY.current < -50.0) velocityY.current = -50.0;
    }

    // Decay knockback velocity using exponential spring dampening
    knockbackVelocity.current.x *= Math.exp(-delta * 8.0);
    knockbackVelocity.current.z *= Math.exp(-delta * 8.0);
    if (Math.abs(knockbackVelocity.current.x) < 0.05) knockbackVelocity.current.x = 0;
    if (Math.abs(knockbackVelocity.current.z) < 0.05) knockbackVelocity.current.z = 0;

    let desiredVelX = 0;
    let desiredVelZ = 0;

    if (dodge.isActive) {
      // Progressively update dodge elapsed time
      dodge.timeElapsed += delta;
      
      if (dodge.timeElapsed >= dodge.duration) {
        dodge.isActive = false;
        useGameStore.setState({ isPlayerInvincible: null });
      } else {
        // Juicy dodge speed curve
        const progress = dodge.timeElapsed / dodge.duration;
        const dodgeSpeed = THREE.MathUtils.lerp(28, 10, progress);
        desiredVelX = dodge.direction.x * dodgeSpeed;
        desiredVelZ = dodge.direction.z * dodgeSpeed;
      }
    } else if (isLocked) {
      // Normal WASD movement input direction
      const cameraDir = new THREE.Vector3();
      camera.getWorldDirection(cameraDir);
      let forwardDir = new THREE.Vector3(cameraDir.x, 0, cameraDir.z);
      if (forwardDir.lengthSq() < 0.001) {
        forwardDir.set(0, 0, -1);
      }
      forwardDir.normalize();
      const sideDir = new THREE.Vector3(-forwardDir.z, 0, forwardDir.x);

      const moveW = keys.KeyW ? 1 : 0;
      const moveS = keys.KeyS ? 1 : 0;
      const moveA = keys.KeyA ? 1 : 0;
      const moveD = keys.KeyD ? 1 : 0;

      const direction = new THREE.Vector3()
        .addScaledVector(forwardDir, moveW - moveS)
        .addScaledVector(sideDir, moveD - moveA);

      if (direction.lengthSq() > 0) {
        direction.normalize().multiplyScalar(speed);
        desiredVelX = direction.x;
        desiredVelZ = direction.z;
      }
    }

    // Combine keyboard input velocity and knockback
    const nextVelX = desiredVelX + knockbackVelocity.current.x;
    const nextVelZ = desiredVelZ + knockbackVelocity.current.z;

    // Calculate displacement vector
    const displacement = new THREE.Vector3(nextVelX * delta, velocityY.current * delta, nextVelZ * delta);

    // Call Rapier WASM Kinematic collision sweeps
    const collider = rigidBodyRef.current.collider(0);
    if (collider && controllerRef.current) {
      controllerRef.current.computeColliderMovement(
        collider,
        displacement,
        undefined,
        undefined,
        filterPredicate
      );

      // Get corrected movements
      const corrected = controllerRef.current.computedMovement();

      // Set next kinematic translation coordinates
      const currentPos = rigidBodyRef.current.translation();
      rigidBodyRef.current.setNextKinematicTranslation({
        x: currentPos.x + corrected.x,
        y: currentPos.y + corrected.y,
        z: currentPos.z + corrected.z
      });
    }

    // Phase 9: Dynamic FOV Momentum & Camera Bobbing
    const horizontalSpeed = Math.sqrt(nextVelX * nextVelX + nextVelZ * nextVelZ);
    
    let targetFov = 75;
    if (velocityY.current < -15) targetFov = 85; // falling fast
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

    // Use 0.85 lerp factor: eliminates camera coupling latency entirely while absorbing micro-stutter
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.85);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, 0.85);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, 0.85);

    // Defensive camera pitch clamp to prevent gimbal lock or out-of-bounds rotation
    camera.rotation.order = 'YXZ';
    const maxPitch = Math.PI / 2 - 0.05;
    camera.rotation.x = Math.max(-maxPitch, Math.min(maxPitch, camera.rotation.x));

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
          const currentSpell = activeSpell;
          useGameStore.getState().castSpell(currentSpell);
          if (useGameStore.getState().onSpellCast) useGameStore.getState().onSpellCast();
        }

        setAttackType('spell');
        setTimeout(() => setAttackType(null), 150);
      }
    }

    // Sync attackStartTime at-action-time in game loop
    if (attackType !== lastAttackTypeRef.current) {
      if (attackType !== null) {
        attackStartTime.current = state.clock.getElapsedTime();
      }
      lastAttackTypeRef.current = attackType;
    }
  });

  // Hide the camera-attached first-person hands + held FX during capture so the
  // visual-regression fixture is a clean world vista (the render recipe operates on
  // terrain/sky/AO; the character render language is validated separately in S1-B M2).
  const inCapture = useGameStore((s) => s.isCaptureMode);

  return (
    <group>
      <RigidBody
        ref={rigidBodyRef}
        colliders={false}
        type="kinematicPosition"
        position={[0, 100, 0]}
        enabledRotations={[false, false, false]}
      >
        <CapsuleCollider args={[0.5, 0.4]} />
      </RigidBody>
      <primitive object={camera}>
        {!inCapture && (
          <StableMagicHands selectedBlock={selectedBlock} attackType={attackType} attackStartTime={attackStartTime} />
        )}
      </primitive>
    </group>
  );
};

// SOTA Procedural 3D Weapon Meshes (Stone, Iron, Diamond Swords & Pickaxe)
export const ProceduralWeapon = React.memo(({ type = 'Iron Sword', position = [0, 0, 0], rotation = [0, 0, 0] }) => {
  const bladeColor = useMemo(() => {
    switch (type) {
      case 'Stone Sword': return '#555555';
      case 'Iron Sword': return '#dcdcdc';
      case 'Diamond Sword': return '#00ffff';
      case 'pickaxe': return '#b0c4de';
      case 'sword':
      default: return '#cccccc';
    }
  }, [type]);

  const bladeEmissive = useMemo(() => {
    if (type === 'Diamond Sword') return '#00faff';
    if (type === 'Iron Sword') return '#204060';
    return '#000000';
  }, [type]);

  const hiltColor = useMemo(() => {
    switch (type) {
      case 'Diamond Sword': return '#3c1053';
      case 'Iron Sword': return '#4e2f1d';
      case 'Stone Sword': return '#7c4d28';
      default: return '#7c3f00';
    }
  }, [type]);

  const guardColor = useMemo(() => {
    switch (type) {
      case 'Diamond Sword': return '#ffca00';
      case 'Iron Sword': return '#697a8a';
      case 'Stone Sword': return '#3a3a3a';
      default: return '#b0b0b0';
    }
  }, [type]);

  const metalness = type === 'Stone Sword' ? 0.05 : 0.95;
  const roughness = type === 'Stone Sword' ? 0.88 : 0.08;

  if (type === 'pickaxe') {
    return (
      <group position={position} rotation={rotation}>
        {/* Handle */}
        <mesh castShadow receiveShadow position={[0, 0, 0]}>
          <cylinderGeometry args={[0.024, 0.028, 1.05, 8]} />
          <meshStandardMaterial color={hiltColor} roughness={0.8} metalness={0.1} />
        </mesh>
        {/* Pickaxe Curved Cross Head */}
        <mesh castShadow receiveShadow position={[0, 0.44, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.038, 0.038, 0.76, 4, 1, true, 0, Math.PI]} />
          <meshStandardMaterial color={bladeColor} roughness={0.2} metalness={0.9} />
        </mesh>
        {/* Tips */}
        <mesh castShadow position={[0.36, 0.41, 0]} rotation={[0, 0, -Math.PI / 6]}>
          <boxGeometry args={[0.046, 0.11, 0.046]} />
          <meshStandardMaterial color={bladeColor} roughness={0.2} metalness={0.9} />
        </mesh>
        <mesh castShadow position={[-0.36, 0.41, 0]} rotation={[0, 0, Math.PI / 6]}>
          <boxGeometry args={[0.046, 0.11, 0.046]} />
          <meshStandardMaterial color={bladeColor} roughness={0.2} metalness={0.9} />
        </mesh>
      </group>
    );
  }

  return (
    <group position={position} rotation={rotation}>
      {/* Blade Core */}
      <mesh castShadow receiveShadow position={[0, 0.72, 0]}>
        <boxGeometry args={[0.07, 1.25, 0.02]} />
        <meshStandardMaterial 
          color={bladeColor} 
          metalness={metalness} 
          roughness={roughness} 
          emissive={bladeEmissive}
          emissiveIntensity={type === 'Diamond Sword' ? 0.38 : type === 'Iron Sword' ? 0.15 : 0}
        />
      </mesh>
      {/* Beveled edges */}
      <mesh position={[0.04, 0.72, 0]} rotation={[0, 0, -0.04]}>
        <boxGeometry args={[0.013, 1.23, 0.007]} />
        <meshStandardMaterial color={bladeColor} metalness={metalness} roughness={roughness} />
      </mesh>
      <mesh position={[-0.04, 0.72, 0]} rotation={[0, 0, 0.04]}>
        <boxGeometry args={[0.013, 1.23, 0.007]} />
        <meshStandardMaterial color={bladeColor} metalness={metalness} roughness={roughness} />
      </mesh>
      {/* Diamond Pointed Tip */}
      <mesh position={[0, 1.365, 0]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.058, 0.058, 0.018]} />
        <meshStandardMaterial 
          color={bladeColor} 
          metalness={metalness} 
          roughness={roughness}
          emissive={bladeEmissive}
          emissiveIntensity={type === 'Diamond Sword' ? 0.38 : 0}
        />
      </mesh>
      {/* Guard */}
      <mesh castShadow position={[0, 0.12, 0]}>
        <boxGeometry args={[0.28, 0.05, 0.065]} />
        <meshStandardMaterial color={guardColor} roughness={0.35} metalness={0.8} />
      </mesh>
      <mesh position={[0.13, 0.15, 0]} rotation={[0, 0, 0.45]}>
        <boxGeometry args={[0.05, 0.07, 0.05]} />
        <meshStandardMaterial color={guardColor} roughness={0.35} metalness={0.8} />
      </mesh>
      <mesh position={[-0.13, 0.15, 0]} rotation={[0, 0, -0.45]}>
        <boxGeometry args={[0.05, 0.07, 0.05]} />
        <meshStandardMaterial color={guardColor} roughness={0.35} metalness={0.8} />
      </mesh>
      {/* Leather/Wood wrapped Hilt */}
      <mesh castShadow position={[0, -0.09, 0]}>
        <cylinderGeometry args={[0.03, 0.034, 0.32, 8]} />
        <meshStandardMaterial color={hiltColor} roughness={0.88} metalness={0.1} />
      </mesh>
      {/* Pommel */}
      <mesh position={[0, -0.27, 0]}>
        <sphereGeometry args={[0.052, 8, 8]} />
        <meshStandardMaterial color={guardColor} roughness={0.35} metalness={0.8} />
      </mesh>
    </group>
  );
});

// Dynamic Camera-Local Sword Ribbon Trail Component
export const ProceduralRibbonTrail = ({ rightHandRef, isSwinging, weaponType }) => {
  const meshRef = useRef(null);
  const geomRef = useRef(null);
  const trailPoints = useRef([]); // point history: { tip, base, time }

  const uColor = useMemo(() => {
    switch (weaponType) {
      case 'Diamond Sword': return new THREE.Color('#00ffff');
      case 'Iron Sword': return new THREE.Color('#80d0ff');
      case 'Stone Sword': return new THREE.Color('#909090');
      default: return new THREE.Color('#ffffff');
    }
  }, [weaponType]);

  const uniforms = useMemo(() => ({
    uColor: { value: uColor }
  }), [uColor]);

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          // Linear trail length fade (U axis)
          float alpha = vUv.x * 0.45;
          // Soft feathered edges along width (V axis) via sine curve
          alpha *= sin(vUv.y * 3.14159265);
          // Glowing hot core center highlight
          vec3 finalColor = mix(vec3(1.0), uColor, 1.0 - sin(vUv.y * 3.14159265));
          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
  }, [uniforms]);

  useFrame((state) => {
    if (!rightHandRef.current || !meshRef.current || !geomRef.current) return;

    const time = state.clock.getElapsedTime();

    if (isSwinging) {
      // Capture sword tip and hilt base in local coordinates relative to the rightHandRef group
      const swordTipLocal = new THREE.Vector3(0.12, 1.3, -0.15);
      const swordBaseLocal = new THREE.Vector3(0.08, 0.22, -0.05);

      const tip = swordTipLocal.clone().applyMatrix4(rightHandRef.current.matrix);
      const base = swordBaseLocal.clone().applyMatrix4(rightHandRef.current.matrix);

      trailPoints.current.push({ tip, base, time });
    }

    // Evict point pairs older than 0.14 seconds to enforce a sharp trailing effect
    trailPoints.current = trailPoints.current.filter(p => time - p.time < 0.14);

    const N = trailPoints.current.length;

    if (N >= 2) {
      const positions = new Float32Array(N * 2 * 3);
      const uvs = new Float32Array(N * 2 * 2);
      const indices = new Uint16Array((N - 1) * 6);

      for (let i = 0; i < N; i++) {
        const p = trailPoints.current[i];
        
        // Base vertex
        positions[i * 6 + 0] = p.base.x;
        positions[i * 6 + 1] = p.base.y;
        positions[i * 6 + 2] = p.base.z;

        // Tip vertex
        positions[i * 6 + 3] = p.tip.x;
        positions[i * 6 + 4] = p.tip.y;
        positions[i * 6 + 5] = p.tip.z;

        // UV coordinates
        const u = i / (N - 1);
        uvs[i * 4 + 0] = u;
        uvs[i * 4 + 1] = 0;

        uvs[i * 4 + 2] = u;
        uvs[i * 4 + 3] = 1;
      }

      for (let i = 0; i < N - 1; i++) {
        indices[i * 6 + 0] = 2 * i;
        indices[i * 6 + 1] = 2 * i + 1;
        indices[i * 6 + 2] = 2 * i + 2;

        indices[i * 6 + 3] = 2 * i + 1;
        indices[i * 6 + 4] = 2 * i + 3;
        indices[i * 6 + 2] = 2 * i + 2;
      }

      geomRef.current.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geomRef.current.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geomRef.current.setIndex(new THREE.BufferAttribute(indices, 1));
      
      geomRef.current.attributes.position.needsUpdate = true;
      geomRef.current.attributes.uv.needsUpdate = true;
      if (geomRef.current.index) geomRef.current.index.needsUpdate = true;

      geomRef.current.computeBoundingSphere();
      geomRef.current.computeBoundingBox();

      meshRef.current.visible = true;
    } else {
      meshRef.current.visible = false;
    }
  });

  return (
    <mesh ref={meshRef} material={material} visible={false}>
      <bufferGeometry ref={geomRef} />
    </mesh>
  );
};

// Magic Hands with effects — locks to camera's local coordinate space for zero-jitter rendering
const StableMagicHands = ({ selectedBlock, attackType, attackStartTime }) => {
  const activeSpell = useGameStore(state => state.activeSpell) || 'fireball';
  const equippedWeapon = useGameStore(state => state.equipment?.weapon);

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
      const swingElapsed = attackStartTime.current > 0 ? (state.clock.getElapsedTime() - attackStartTime.current) : 0;

      const isSwingingMelee = attackType === 'melee' && swingElapsed < 0.2;
      const isCastingSpell = attackType === 'spell' && swingElapsed < 0.15;

      // Subtle high-frequency channeling vibrations on attack or cast
      const noiseX = (isSwingingMelee || isCastingSpell) ? (Math.sin(time * 65) + Math.cos(time * 87)) * 0.005 : 0;
      const noiseY = (isSwingingMelee || isCastingSpell) ? (Math.sin(time * 73) + Math.cos(time * 59)) * 0.005 : 0;
      const noiseZ = (isSwingingMelee || isCastingSpell) ? (Math.sin(time * 81) + Math.cos(time * 95)) * 0.005 : 0;

      if (isSwingingMelee) {
        // Dynamic Bezier slash arc animation
        const t = Math.min(1.0, swingElapsed / 0.2);
        const ease = Math.sin(t * Math.PI * 0.5);

        // Diagonal slash sweep from right to left across camera frame
        const x = baseRightPos.x + Math.sin(t * Math.PI) * 0.16 - ease * 0.72;
        const y = baseRightPos.y + Math.sin(t * Math.PI) * 0.42;
        const z = baseRightPos.z - Math.sin(t * Math.PI) * 0.42;

        rightHandRef.current.position.set(x + noiseX, y + noiseY, z + noiseZ);
        
        // Slash angular rotation sweep (Roll & Yaw rotation)
        rightHandRef.current.rotation.set(
          -0.45 + Math.sin(t * Math.PI) * 1.45,
          -Math.sin(t * Math.PI) * 0.9,
          Math.sin(t * Math.PI) * 1.15 - t * 2.15
        );

        // Left hand raises slightly to balance
        leftHandRef.current.position.set(
          baseLeftPos.x + noiseX,
          baseLeftPos.y + 0.12 * Math.sin(t * Math.PI) + noiseY,
          baseLeftPos.z + noiseZ
        );
        leftHandRef.current.rotation.set(0.12 * Math.sin(t * Math.PI), 0, 0);

        if (wandRef.current) {
          wandRef.current.rotation.set(0, 0, 0);
        }
      } else if (isCastingSpell) {
        const attackTime = time * 6;
        rightHandRef.current.position.set(
          baseRightPos.x + noiseX,
          baseRightPos.y + noiseY,
          baseRightPos.z + Math.sin(attackTime) * 0.04 + noiseZ
        );
        rightHandRef.current.rotation.set(Math.sin(attackTime) * 0.15, 0, 0);

        leftHandRef.current.position.set(
          baseLeftPos.x + noiseX,
          baseLeftPos.y + noiseY,
          baseLeftPos.z + noiseZ
        );
        leftHandRef.current.rotation.set(Math.sin(attackTime + 1) * 0.1, 0, 0);

        if (wandRef.current) {
          wandRef.current.rotation.x = Math.sin(attackTime) * 0.06;
          wandRef.current.position.y = 0.4 + Math.sin(attackTime) * 0.02;
        }
      } else {
        // Stable Idle
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
        const isAttacking = isSwingingMelee || isCastingSpell;
        const auraSpeed = isAttacking ? 12 : 3;
        const scaleBase = isAttacking ? 1.3 : 0.8;
        const scalePulse = Math.sin(time * auraSpeed) * (isAttacking ? 0.08 : 0.02);
        const finalScale = scaleBase + scalePulse;
        magicAuraRef.current.scale.set(finalScale, finalScale, finalScale);
        
        const opacityBase = isAttacking ? 0.5 : 0.12;
        const opacityPulse = Math.cos(time * auraSpeed) * (isAttacking ? 0.08 : 0.015);
        magicAuraRef.current.material.opacity = opacityBase + opacityPulse;
      }
    }
  });

  const isWeaponEquipped = ['Stone Sword', 'Iron Sword', 'Diamond Sword', 'sword', 'pickaxe'].includes(equippedWeapon);
  const isSwingingMelee = attackType === 'melee' && (attackStartTime.current > 0) && (state => state.clock.getElapsedTime() - attackStartTime.current < 0.2);

  return (
    <group>
      {/* Dynamic sweeping ribbon trail inside camera local viewport space */}
      {isWeaponEquipped && (
        <ProceduralRibbonTrail 
          rightHandRef={rightHandRef} 
          isSwinging={attackType === 'melee'} 
          weaponType={equippedWeapon} 
        />
      )}

      <group ref={rightHandRef}>
        <mesh castShadow receiveShadow position={[0, 0.3, 0]}><boxGeometry args={[0.16, 0.7, 0.16]} /><meshStandardMaterial roughness={0.8} metalness={0.1} color="#fdbcb4" /></mesh>
        <mesh castShadow receiveShadow position={[0, -0.05, 0]}><boxGeometry args={[0.2, 0.24, 0.12]} /><meshStandardMaterial roughness={0.8} metalness={0.1} color="#fdbcb4" /></mesh>
        
        {/* Branch weapon model rendering: procedurally modeled 3D sword vs. magic wand */}
        {isWeaponEquipped ? (
          <group ref={wandRef} position={[0.15, 0.32, -0.16]} rotation={[0.0, 0.0, 0.0]}>
            <ProceduralWeapon type={equippedWeapon} />
          </group>
        ) : (
          <group ref={wandRef} position={[0.2, 0.4, -0.1]} rotation={[0.1, 0.2, 0.1]}>
            <MagicWand wandType={activeSpell} />
          </group>
        )}

        <mesh ref={magicAuraRef} position={[0, 0, 0]}>
          <sphereGeometry args={[0.32, 16, 16]} />
          <meshBasicMaterial color={currentSpellColor} transparent opacity={0.15} depthWrite={false} />
        </mesh>
        {attackType === 'spell' && <SpellHandEffects spellType={activeSpell} />}
      </group>
      <group ref={leftHandRef}>
        <mesh castShadow receiveShadow position={[0, 0.3, 0]}><boxGeometry args={[0.16, 0.7, 0.16]} /><meshStandardMaterial roughness={0.8} metalness={0.1} color="#fdbcb4" /></mesh>
        <mesh castShadow receiveShadow position={[0, -0.05, 0]}><boxGeometry args={[0.2, 0.24, 0.12]} /><meshStandardMaterial roughness={0.8} metalness={0.1} color="#fdbcb4" /></mesh>
        {attackType === 'spell' && (
          <group>
            <mesh castShadow receiveShadow position={[0, 0.1, -0.2]}>
              <sphereGeometry args={[0.07, 8, 8]} />
              <meshBasicMaterial color={currentSpellColor} transparent opacity={0.85} />
            </mesh>
            <pointLight position={[0, 0.1, -0.2]} distance={8} intensity={2.5} color={currentSpellColor} castShadow />
            <SpellLeftHandEffects spellType={activeSpell} />
          </group>
        )}
        {attackType !== 'spell' && selectedBlock && (
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
