import React, { useRef, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { BLOCK_TYPES } from './Components';
import { MagicWand } from './EnhancedMagicSystem';

// COMPLETELY FIXED Player Component - Proper separation of concerns
export const FixedPlayer = ({ gameState, onPositionUpdate }) => {
  const { camera } = useThree();
  const velocity = useRef(new THREE.Vector3());
  const [keys, setKeys] = useState({});
  const [isOnGround, setIsOnGround] = useState(true);
  const [isAttacking, setIsAttacking] = useState(false);
  const [selectedSpell, setSelectedSpell] = useState('fireball');
  
  // Player position state - SEPARATE from camera
  const playerPosition = useRef(new THREE.Vector3(0, 18, 0));
  const isInitialized = useRef(false);
  
  // Movement configuration
  const moveSpeed = 12; // Increased for more noticeable movement
  const jumpForce = 10;
  const gravity = 25;
  
  // SPELL COOLDOWN SYSTEM
  const lastSpellCast = useRef(0);
  const spellCooldown = 800;

  // Initialize player position
  useEffect(() => {
    if (!isInitialized.current) {
      playerPosition.current.set(0, 18, 0);
      // Set initial camera position but let PointerLockControls handle rotation
      camera.position.copy(playerPosition.current);
      
      window.gameCamera = camera;
      gameState.selectedSpell = selectedSpell;
      isInitialized.current = true;
      console.log('🎮 FIXED Player initialized - Position:', playerPosition.current.x, playerPosition.current.y, playerPosition.current.z);
    }
  }, [camera, gameState, selectedSpell]);

  // Expose global functions
  useEffect(() => {
    window.setPlayerAttacking = setIsAttacking;
    window.getSelectedSpell = () => selectedSpell;
    window.setSelectedSpell = setSelectedSpell;
    window.getPlayerPosition = () => playerPosition.current.clone();
  }, [selectedSpell]);

  // PROPER movement handling - Update player position and camera separately
  useFrame((state, delta) => {
    if (!isInitialized.current) return;
    
    // Calculate movement direction from camera orientation
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    
    const rightVector = new THREE.Vector3();
    rightVector.crossVectors(cameraDirection, new THREE.Vector3(0, 1, 0)).normalize();
    
    const forwardVector = cameraDirection.clone();
    forwardVector.y = 0; // Keep movement horizontal
    forwardVector.normalize();
    
    const moveVector = new THREE.Vector3();
    
    // Apply WASD movement
    if (keys.KeyW) {
      moveVector.add(forwardVector);
      console.log('🏃 Moving forward (W) - Speed:', moveSpeed);
    }
    if (keys.KeyS) {
      moveVector.sub(forwardVector);
      console.log('🏃 Moving backward (S) - Speed:', moveSpeed);
    }
    if (keys.KeyA) {
      moveVector.sub(rightVector);
      console.log('🏃 Moving left (A) - Speed:', moveSpeed);
    }
    if (keys.KeyD) {
      moveVector.add(rightVector);
      console.log('🏃 Moving right (D) - Speed:', moveSpeed);
    }
    
    // Apply horizontal movement with collision detection
    if (moveVector.length() > 0) {
      moveVector.normalize();
      const scaledMovement = moveVector.multiplyScalar(moveSpeed * delta);
      
      // Check collision before moving
      const newX = playerPosition.current.x + scaledMovement.x;
      const newZ = playerPosition.current.z + scaledMovement.z;
      const playerY = playerPosition.current.y;
      
      let canMoveX = true;
      let canMoveZ = true;
      
      if (window.checkCollision) {
        // IMPROVED: Check collision with better tolerance and logging
        const checkX = window.checkCollision(newX, playerY, playerPosition.current.z) ||
                      window.checkCollision(newX, playerY - 0.5, playerPosition.current.z);
        
        const checkZ = window.checkCollision(playerPosition.current.x, playerY, newZ) ||
                      window.checkCollision(playerPosition.current.x, playerY - 0.5, newZ);
        
        if (checkX) {
          canMoveX = false;
          console.log(`🚫 X-movement blocked at (${newX.toFixed(1)}, ${playerY.toFixed(1)}, ${playerPosition.current.z.toFixed(1)})`);
        }
        
        if (checkZ) {
          canMoveZ = false;
          console.log(`🚫 Z-movement blocked at (${playerPosition.current.x.toFixed(1)}, ${playerY.toFixed(1)}, ${newZ.toFixed(1)})`);
        }
      }
      
      // Apply movement with debugging
      if (canMoveX) {
        playerPosition.current.x += scaledMovement.x;
      } else {
        console.log(`❌ Cannot move in X direction: collision detected`);
      }
      
      if (canMoveZ) {
        playerPosition.current.z += scaledMovement.z;
      } else {
        console.log(`❌ Cannot move in Z direction: collision detected`);
      }
      
      console.log(`📍 Player moved to: (${playerPosition.current.x.toFixed(1)}, ${playerPosition.current.y.toFixed(1)}, ${playerPosition.current.z.toFixed(1)})`);
    }
    
    // Apply gravity and ground detection
    velocity.current.y -= gravity * delta;
    
    // Get ground level
    let groundLevel = 15;
    if (window.getHighestBlockAt) {
      try {
        groundLevel = window.getHighestBlockAt(playerPosition.current.x, playerPosition.current.z);
      } catch (error) {
        console.warn('Error getting ground level:', error);
      }
    }
    
    const minY = groundLevel + 1.6; // Player height
    
    // Ground collision
    if (playerPosition.current.y + velocity.current.y * delta <= minY) {
      playerPosition.current.y = minY;
      velocity.current.y = 0;
      setIsOnGround(true);
      
      if (Math.random() < 0.05) {
        console.log(`🌍 On ground: level=${groundLevel.toFixed(1)}, player=${playerPosition.current.y.toFixed(1)}`);
      }
    } else {
      playerPosition.current.y += velocity.current.y * delta;
      setIsOnGround(false);
    }
    
    // UPDATE CAMERA POSITION to follow player (but let PointerLockControls handle rotation)
    camera.position.copy(playerPosition.current);
    
    // Update position tracker
    if (onPositionUpdate) {
      onPositionUpdate({
        x: Math.round(playerPosition.current.x),
        y: Math.round(playerPosition.current.y),
        z: Math.round(playerPosition.current.z)
      });
    }
  });

  // MOVEMENT KEY HANDLERS
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Handle WASD movement keys
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) {
        setKeys(prev => {
          const newKeys = { ...prev, [event.code]: true };
          console.log('🎮 Key pressed:', event.code, 'Keys state:', newKeys);
          return newKeys;
        });
        return;
      }
      
      // Handle jump
      if (event.code === 'Space') {
        event.preventDefault();
        if (isOnGround) {
          velocity.current.y = jumpForce;
          setIsOnGround(false);
          console.log('🦘 Jump! Force:', jumpForce);
        }
        return;
      }
      
      // Handle spell casting
      if (event.code === 'KeyF') {
        event.preventDefault();
        const now = Date.now();
        if (now - lastSpellCast.current < spellCooldown) {
          console.log('🔮 Spell on cooldown!');
          return;
        }
        
        setIsAttacking(true);
        lastSpellCast.current = now;
        
        if (window.castSpell) {
          window.castSpell(selectedSpell);
          console.log(`🔥 Cast ${selectedSpell}! Cooldown: ${spellCooldown}ms`);
        }
        
        setTimeout(() => setIsAttacking(false), 600);
        return;
      }
      
      // Handle spell switching
      if (event.code === 'KeyQ') {
        event.preventDefault();
        const spells = ['fireball', 'iceball', 'lightning', 'arcane'];
        const currentIndex = spells.indexOf(selectedSpell);
        const nextSpell = spells[(currentIndex + 1) % spells.length];
        setSelectedSpell(nextSpell);
        gameState.selectedSpell = nextSpell;
        console.log(`🔮 Selected spell: ${nextSpell}`);
        return;
      }
      
      // Handle day/night toggle
      if (event.code === 'KeyN') {
        event.preventDefault();
        gameState.setIsDay(!gameState.isDay);
        console.log(`🌅 Time changed to: ${gameState.isDay ? 'NIGHT' : 'DAY'}`);
        return;
      }
      
      // Handle block selection
      if (event.code.startsWith('Digit')) {
        const num = parseInt(event.code.replace('Digit', ''));
        const blockTypes = Object.keys(BLOCK_TYPES);
        if (num >= 1 && num <= blockTypes.length) {
          gameState.setSelectedBlock(blockTypes[num - 1]);
        }
        return;
      }
    };
    
    const handleKeyUp = (event) => {
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) {
        setKeys(prev => ({ ...prev, [event.code]: false }));
      }
    };
    
    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp, { passive: false });
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState, selectedSpell, isOnGround]);

  return (
    <group>
      <FixedMagicHands 
        selectedSpell={selectedSpell}
        selectedBlock={gameState.selectedBlock}
        isAttacking={isAttacking}
        camera={camera}
      />
    </group>
  );
};

// FIXED Magic Hands Component
const FixedMagicHands = ({ selectedSpell, selectedBlock, isAttacking, camera }) => {
  const rightHandRef = useRef();
  const leftHandRef = useRef();
  const wandRef = useRef();
  
  const SPELL_COLORS = {
    fireball: '#FF4500',
    iceball: '#00BFFF', 
    lightning: '#FFD700',
    arcane: '#9932CC'
  };
  
  const currentSpellColor = SPELL_COLORS[selectedSpell] || SPELL_COLORS.fireball;

  useFrame((state) => {
    if (rightHandRef.current && leftHandRef.current && camera) {
      const time = state.clock.elapsedTime;
      
      // Position hands relative to camera
      const rightPos = new THREE.Vector3(0.6, -0.8, -1.0);
      rightPos.applyMatrix4(camera.matrixWorld);
      rightHandRef.current.position.copy(rightPos);
      rightHandRef.current.quaternion.copy(camera.quaternion);
      
      const leftPos = new THREE.Vector3(-0.4, -0.7, -0.9);
      leftPos.applyMatrix4(camera.matrixWorld);
      leftHandRef.current.position.copy(leftPos);
      leftHandRef.current.quaternion.copy(camera.quaternion);
      
      // Subtle animations
      if (!isAttacking) {
        rightHandRef.current.position.y += Math.sin(time * 0.8) * 0.01;
        leftHandRef.current.position.y += Math.sin(time * 0.8 + 0.5) * 0.008;
      }
      
      // Attack animations
      if (isAttacking) {
        const attackTime = time * 6;
        rightHandRef.current.rotation.x = Math.sin(attackTime) * 0.15;
        leftHandRef.current.rotation.x = Math.sin(attackTime + 1) * 0.1;
        
        if (wandRef.current) {
          wandRef.current.rotation.x = Math.sin(attackTime) * 0.08;
          wandRef.current.position.y = 0.4 + Math.sin(attackTime) * 0.03;
        }
      } else {
        rightHandRef.current.rotation.x = 0;
        leftHandRef.current.rotation.x = 0;
        if (wandRef.current) {
          wandRef.current.rotation.x = 0.1;
          wandRef.current.position.y = 0.4;
        }
      }
    }
  });

  return (
    <group>
      {/* RIGHT HAND */}
      <group ref={rightHandRef}>        
        {/* Forearm */}
        <mesh position={[0, 0.3, 0]}>
          <boxGeometry args={[0.16, 0.7, 0.16]} />
          <meshLambertMaterial color="#fdbcb4" />
        </mesh>
        
        {/* Main hand */}
        <mesh position={[0, -0.05, 0]}>
          <boxGeometry args={[0.2, 0.24, 0.12]} />
          <meshLambertMaterial color="#fdbcb4" />
        </mesh>
        
        {/* Thumb */}
        <mesh position={[0.12, -0.02, 0]}>
          <boxGeometry args={[0.08, 0.12, 0.08]} />
          <meshLambertMaterial color="#fdbcb4" />
        </mesh>
        
        {/* Fingers */}
        <mesh position={[0, -0.15, -0.08]}>
          <boxGeometry args={[0.16, 0.06, 0.04]} />
          <meshLambertMaterial color="#e6a69a" />
        </mesh>
        
        {/* Magic Wand */}
        <group ref={wandRef} position={[0.2, 0.4, -0.1]} rotation={[0.1, 0.2, 0.1]}>
          <MagicWand wandType={selectedSpell} />
        </group>
        
        {/* Magical aura during casting */}
        {isAttacking && (
          <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[0.35, 8, 8]} />
            <meshBasicMaterial 
              color={currentSpellColor}
              transparent
              opacity={0.4}
            />
          </mesh>
        )}
      </group>
      
      {/* LEFT HAND */}
      <group ref={leftHandRef}>
        {/* Forearm */}
        <mesh position={[0, 0.3, 0]}>
          <boxGeometry args={[0.16, 0.7, 0.16]} />
          <meshLambertMaterial color="#fdbcb4" />
        </mesh>
        
        {/* Main hand */}
        <mesh position={[0, -0.05, 0]}>
          <boxGeometry args={[0.2, 0.24, 0.12]} />
          <meshLambertMaterial color="#fdbcb4" />
        </mesh>
        
        {/* Thumb */}
        <mesh position={[-0.12, -0.02, 0]}>
          <boxGeometry args={[0.08, 0.12, 0.08]} />
          <meshLambertMaterial color="#fdbcb4" />
        </mesh>
        
        {/* Fingers */}
        <mesh position={[0, -0.1, -0.1]} rotation={[0.2, 0, 0]}>
          <boxGeometry args={[0.16, 0.06, 0.04]} />
          <meshLambertMaterial color="#e6a69a" />
        </mesh>
        
        {/* Spell effects */}
        {isAttacking && (
          <group>
            <mesh position={[0, 0.1, -0.2]}>
              <sphereGeometry args={[0.08, 8, 8]} />
              <meshBasicMaterial 
                color={currentSpellColor}
                transparent
                opacity={0.9}
              />
            </mesh>
            
            {/* Magical particles */}
            {[...Array(5)].map((_, i) => (
              <mesh 
                key={i}
                position={[
                  (Math.random() - 0.5) * 0.3,
                  Math.random() * 0.2,
                  -0.1 - Math.random() * 0.2
                ]}
              >
                <sphereGeometry args={[0.015, 4, 4]} />
                <meshBasicMaterial 
                  color={currentSpellColor}
                  transparent
                  opacity={0.7}
                />
              </mesh>
            ))}
          </group>
        )}
        
        {/* Selected block display */}
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