import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MagicWand } from './EnhancedMagicSystem';

// OPTIMIZED Player Component with Enhanced Magic System
export const OptimizedPlayer = ({ gameState }) => {
  const { camera } = useThree();
  const velocity = useRef(new THREE.Vector3());
  const [keys, setKeys] = useState({});
  const [isOnGround, setIsOnGround] = useState(false);
  const [isAttacking, setIsAttacking] = useState(false);
  const [selectedSpell, setSelectedSpell] = useState('fireball');
  
  // Performance optimization: cached vectors
  const forwardVector = useRef(new THREE.Vector3());
  const rightVector = useRef(new THREE.Vector3());
  const upVector = useRef(new THREE.Vector3(0, 1, 0));
  
  // Movement optimization
  const lastGroundCheck = useRef(0);
  const groundLevelCache = useRef(new Map());
  const lastCameraUpdate = useRef(0);
  
  // Set initial camera position
  useEffect(() => {
    camera.position.set(0, 20, 0);
    camera.lookAt(0, 18, 0);
    camera.updateProjectionMatrix();
    
    // Expose camera globally for magic system
    window.gameCamera = camera;
    
    // Set initial spell
    gameState.selectedSpell = selectedSpell;
    
    setTimeout(() => {
      const groundLevel = getOptimizedGroundLevel(0, 0);
      const safeHeight = Math.max(groundLevel + 2, 16);
      camera.position.y = safeHeight;
      console.log(`🧙‍♂️ Mage positioned at safe height: ${safeHeight}`);
    }, 1000);
    
    console.log('🧙‍♂️ Enhanced Player with Optimized Magic System initialized');
  }, [camera, gameState, selectedSpell]);

  // Expose attack state and spell casting globally
  useEffect(() => {
    window.setPlayerAttacking = setIsAttacking;
    window.getSelectedSpell = () => selectedSpell;
    window.setSelectedSpell = setSelectedSpell;
  }, [selectedSpell]);

  // OPTIMIZED frame logic with magic integration
  useFrame((state, delta) => {
    const now = performance.now();
    
    const shouldUpdateCamera = now - lastCameraUpdate.current > 16; // 60fps
    const shouldCheckGround = now - lastGroundCheck.current > 50; // 20fps for ground check
    
    const speed = 12;
    const moveVector = new THREE.Vector3();
    
    if (shouldUpdateCamera) {
      camera.getWorldDirection(forwardVector.current);
      rightVector.current.crossVectors(forwardVector.current, upVector.current).normalize();
      lastCameraUpdate.current = now;
    }
    
    // Apply movement
    if (keys.KeyW) moveVector.add(forwardVector.current);
    if (keys.KeyS) moveVector.sub(forwardVector.current);
    if (keys.KeyA) moveVector.sub(rightVector.current);
    if (keys.KeyD) moveVector.add(rightVector.current);
    
    // Enhanced movement with exploration XP
    if (moveVector.length() > 0) {
      moveVector.normalize();
      moveVector.y = 0;
      
      const scaledMovement = moveVector.multiplyScalar(speed * delta);
      const oldChunk = Math.floor(camera.position.x / 64) + ',' + Math.floor(camera.position.z / 64);
      
      camera.position.x += scaledMovement.x;
      camera.position.z += scaledMovement.z;
      
      const newChunk = Math.floor(camera.position.x / 64) + ',' + Math.floor(camera.position.z / 64);
      
      // Award exploration XP for new areas
      if (oldChunk !== newChunk && window.xpExploration) {
        window.xpExploration();
      }
    }
    
    // Enhanced gravity and ground collision
    velocity.current.y -= 25 * delta;
    
    if (shouldCheckGround) {
      const newY = camera.position.y + velocity.current.y * delta;
      const groundLevel = getOptimizedGroundLevel(camera.position.x, camera.position.z);
      const playerHeight = 1.8;
      const minAllowedY = groundLevel + playerHeight;
      
      if (newY <= minAllowedY) {
        camera.position.y = minAllowedY;
        velocity.current.y = 0;
        setIsOnGround(true);
      } else {
        camera.position.y = newY;
        setIsOnGround(false);
      }
      
      if (camera.position.y < groundLevel + playerHeight) {
        camera.position.y = groundLevel + playerHeight;
      }
      
      lastGroundCheck.current = now;
    } else {
      camera.position.y += velocity.current.y * delta;
    }
  });

  // Enhanced ground level detection with caching
  const getOptimizedGroundLevel = useCallback((x, z) => {
    const cacheKey = `${Math.floor(x/4)}_${Math.floor(z/4)}`;
    
    if (groundLevelCache.current.has(cacheKey)) {
      return groundLevelCache.current.get(cacheKey);
    }
    
    let groundLevel = 15;
    try {
      if (window.getHighestBlockAt) {
        const calculatedLevel = window.getHighestBlockAt(x, z);
        if (typeof calculatedLevel === 'number' && !isNaN(calculatedLevel)) {
          groundLevel = calculatedLevel + 1;
        }
      }
    } catch (error) {
      console.warn('Error calculating ground level:', error);
    }
    
    groundLevel = Math.max(groundLevel, 12);
    groundLevel = Math.min(groundLevel, 25);
    
    groundLevelCache.current.set(cacheKey, groundLevel);
    
    // Limit cache size
    if (groundLevelCache.current.size > 50) {
      const entries = Array.from(groundLevelCache.current.entries());
      groundLevelCache.current.clear();
      entries.slice(-25).forEach(([key, value]) => {
        groundLevelCache.current.set(key, value);
      });
    }
    
    return groundLevel;
  }, []);

  // Enhanced event handlers with magic system
  useEffect(() => {
    const handleKeyDown = (event) => {
      setKeys(prev => {
        if (prev[event.code]) return prev;
        return { ...prev, [event.code]: true };
      });
      
      if (event.code === 'Space') {
        event.preventDefault();
        if (isOnGround) {
          velocity.current.y = 12;
          setIsOnGround(false);
        }
      }
      
      // Enhanced magic casting with F key
      if (event.code === 'KeyF') {
        event.preventDefault();
        setIsAttacking(true);
        
        // Cast spell with enhanced visual and audio effects
        if (window.castSpell) {
          window.castSpell(selectedSpell);
          
          // Award XP for spell casting
          if (window.xpMagicCast) {
            window.xpMagicCast();
          }
        }
        
        setTimeout(() => setIsAttacking(false), 600); // Longer for better visual effect
      }
      
      // Spell selection with Q key (cycle through spells)
      if (event.code === 'KeyQ') {
        event.preventDefault();
        const spells = ['fireball', 'iceball', 'lightning', 'arcane'];
        const currentIndex = spells.indexOf(selectedSpell);
        const nextSpell = spells[(currentIndex + 1) % spells.length];
        setSelectedSpell(nextSpell);
        gameState.selectedSpell = nextSpell;
        console.log(`🔮 Selected spell: ${nextSpell}`);
      }
      
      // Block selection (keeping for building mode)
      if (event.code.startsWith('Digit')) {
        const num = parseInt(event.code.replace('Digit', ''));
        const blockTypes = ['grass', 'dirt', 'stone', 'wood', 'glass', 'water', 'lava', 'diamond', 'gold'];
        if (num >= 1 && num <= blockTypes.length) {
          gameState.setSelectedBlock(blockTypes[num - 1]);
        }
      }
    };
    
    const handleKeyUp = (event) => {
      setKeys(prev => {
        if (!prev[event.code]) return prev;
        return { ...prev, [event.code]: false };
      });
    };
    
    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp, { passive: true });
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState, isOnGround, selectedSpell]);

  return (
    <group>
      {/* Enhanced Magic Hands with Authentic Effects */}
      <OptimizedMagicHands 
        selectedSpell={selectedSpell}
        selectedBlock={gameState.selectedBlock}
        isAttacking={isAttacking}
      />
    </group>
  );
};

// ENHANCED Magic Hands Component with Authentic Visual Effects
const OptimizedMagicHands = ({ selectedSpell, selectedBlock, isAttacking }) => {
  const { camera } = useThree();
  const rightHandRef = useRef();
  const leftHandRef = useRef();
  const wandRef = useRef();
  const magicAuraRef = useRef();
  
  const SPELL_COLORS = {
    fireball: '#FF4500',
    iceball: '#00BFFF', 
    lightning: '#FFD700',
    arcane: '#9932CC'
  };
  
  const currentSpellColor = SPELL_COLORS[selectedSpell] || SPELL_COLORS.fireball;

  // Enhanced frame-by-frame positioning with authentic magic effects
  useFrame((state) => {
    if (rightHandRef.current && leftHandRef.current) {
      const time = state.clock.elapsedTime;
      
      // Right hand positioning - holding enhanced magic wand
      const rightPos = new THREE.Vector3(0.7, -0.7, -1.2);
      rightPos.applyMatrix4(camera.matrixWorld);
      rightHandRef.current.position.copy(rightPos);
      rightHandRef.current.quaternion.copy(camera.quaternion);
      
      // Enhanced magical idle animation
      rightHandRef.current.position.y += Math.sin(time * 2) * 0.03;
      rightHandRef.current.rotation.z = Math.sin(time * 1.5) * 0.08;
      
      // Left hand positioning - enhanced gesture casting
      const leftPos = new THREE.Vector3(-0.5, -0.6, -1.1);
      leftPos.applyMatrix4(camera.matrixWorld);
      leftHandRef.current.position.copy(leftPos);
      leftHandRef.current.quaternion.copy(camera.quaternion);
      leftHandRef.current.position.y += Math.sin(time * 2 + 1) * 0.02;
      leftHandRef.current.rotation.z = Math.sin(time * 1.5 + 1) * 0.06;
      
      // Enhanced spell casting animation with authentic effects
      if (isAttacking) {
        const attackTime = time * 20;
        rightHandRef.current.rotation.x = Math.sin(attackTime) * 0.6;
        rightHandRef.current.position.z += Math.sin(attackTime) * 0.2;
        leftHandRef.current.rotation.x = Math.sin(attackTime + 1) * 0.4;
        
        if (wandRef.current) {
          wandRef.current.rotation.x = Math.sin(attackTime) * 0.3;
          wandRef.current.position.y = 0.4 + Math.sin(attackTime) * 0.15;
        }
      }
      
      // Enhanced magic aura effects
      if (magicAuraRef.current) {
        const intensity = isAttacking ? 1.5 + Math.sin(time * 10) * 0.5 : 0.8 + Math.sin(time * 3) * 0.2;
        magicAuraRef.current.scale.setScalar(intensity);
        magicAuraRef.current.material.opacity = isAttacking ? 0.6 : 0.3;
      }
    }
  });

  return (
    <group>
      {/* RIGHT HAND - Enhanced Magic Wand Hand */}
      <group ref={rightHandRef}>        
        {/* Enhanced forearm */}
        <mesh position={[0, 0.3, 0]}>
          <boxGeometry args={[0.16, 0.7, 0.16]} />
          <meshLambertMaterial color="#fdbcb4" />
        </mesh>
        
        {/* Enhanced main hand block */}
        <mesh position={[0, -0.05, 0]}>
          <boxGeometry args={[0.2, 0.24, 0.12]} />
          <meshLambertMaterial color="#fdbcb4" />
        </mesh>
        
        {/* Enhanced thumb */}
        <mesh position={[0.12, -0.02, 0]}>
          <boxGeometry args={[0.08, 0.12, 0.08]} />
          <meshLambertMaterial color="#fdbcb4" />
        </mesh>
        
        {/* Enhanced fingers */}
        <mesh position={[0, -0.15, -0.08]}>
          <boxGeometry args={[0.16, 0.06, 0.04]} />
          <meshLambertMaterial color="#e6a69a" />
        </mesh>
        
        {/* ENHANCED MAGIC WAND with Authentic Effects */}
        <group ref={wandRef} position={[0.2, 0.4, -0.1]} rotation={[0.1, 0.2, 0.1]}>
          <MagicWand wandType={selectedSpell} />
        </group>
        
        {/* Enhanced magical aura around hand during casting */}
        {isAttacking && (
          <mesh ref={magicAuraRef} position={[0, 0, 0]}>
            <sphereGeometry args={[0.4, 8, 8]} />
            <meshBasicMaterial 
              color={currentSpellColor}
              transparent
              opacity={0.4}
            />
          </mesh>
        )}
        
        {/* Spell-specific hand effects */}
        {isAttacking && (
          <SpellHandEffects spellType={selectedSpell} />
        )}
      </group>
      
      {/* LEFT HAND - Enhanced Spell Gesture Hand */}
      <group ref={leftHandRef}>
        {/* Enhanced forearm */}
        <mesh position={[0, 0.3, 0]}>
          <boxGeometry args={[0.16, 0.7, 0.16]} />
          <meshLambertMaterial color="#fdbcb4" />
        </mesh>
        
        {/* Enhanced main hand block */}
        <mesh position={[0, -0.05, 0]}>
          <boxGeometry args={[0.2, 0.24, 0.12]} />
          <meshLambertMaterial color="#fdbcb4" />
        </mesh>
        
        {/* Enhanced thumb */}
        <mesh position={[-0.12, -0.02, 0]}>
          <boxGeometry args={[0.08, 0.12, 0.08]} />
          <meshLambertMaterial color="#fdbcb4" />
        </mesh>
        
        {/* Enhanced fingers in spell-casting position */}
        <mesh position={[0, -0.1, -0.1]} rotation={[0.2, 0, 0]}>
          <boxGeometry args={[0.16, 0.06, 0.04]} />
          <meshLambertMaterial color="#e6a69a" />
        </mesh>
        
        {/* Enhanced spell energy emanating from left hand */}
        {isAttacking && (
          <group>
            {/* Main spell energy orb with authentic effects */}
            <mesh position={[0, 0.1, -0.2]}>
              <sphereGeometry args={[0.1, 8, 8]} />
              <meshBasicMaterial 
                color={currentSpellColor}
                transparent
                opacity={0.9}
              />
            </mesh>
            
            {/* Enhanced magical particles */}
            {[...Array(8)].map((_, i) => (
              <mesh 
                key={i}
                position={[
                  (Math.random() - 0.5) * 0.4,
                  Math.random() * 0.3,
                  -0.1 - Math.random() * 0.3
                ]}
              >
                <sphereGeometry args={[0.02, 4, 4]} />
                <meshBasicMaterial 
                  color={currentSpellColor}
                  transparent
                  opacity={0.8}
                />
              </mesh>
            ))}
            
            {/* Spell-specific left hand effects */}
            <SpellLeftHandEffects spellType={selectedSpell} />
          </group>
        )}
        
        {/* Enhanced selected block display for building mode */}
        {!isAttacking && selectedBlock && (
          <group position={[-0.1, 0.2, -0.15]} scale={[0.3, 0.3, 0.3]}>
            <mesh>
              <boxGeometry args={[1, 1, 1]} />
              <meshLambertMaterial color={'#567C35'} />
            </mesh>
          </group>
        )}
      </group>
    </group>
  );
};

// Spell-specific hand effects for right hand
const SpellHandEffects = ({ spellType }) => {
  const effectRef = useRef();
  
  useFrame((state) => {
    if (effectRef.current) {
      const time = state.clock.elapsedTime;
      
      switch (spellType) {
        case 'fireball':
          effectRef.current.rotation.y += 0.1;
          effectRef.current.scale.setScalar(1 + Math.sin(time * 8) * 0.3);
          break;
        case 'iceball':
          effectRef.current.rotation.x += 0.05;
          effectRef.current.rotation.z += 0.08;
          break;
        case 'lightning':
          effectRef.current.visible = Math.random() > 0.3;
          break;
        case 'arcane':
          effectRef.current.rotation.y += 0.15;
          effectRef.current.position.y = 0.2 + Math.sin(time * 6) * 0.1;
          break;
      }
    }
  });
  
  if (spellType === 'fireball') {
    return (
      <mesh ref={effectRef} position={[0.1, 0.2, 0]}>
        <coneGeometry args={[0.1, 0.3, 6]} />
        <meshBasicMaterial color="#FF4500" transparent opacity={0.7} />
      </mesh>
    );
  }
  
  if (spellType === 'iceball') {
    return (
      <group ref={effectRef}>
        {[...Array(4)].map((_, i) => (
          <mesh key={i} position={[0, 0.2, 0]} rotation={[0, (i * Math.PI) / 2, 0]}>
            <coneGeometry args={[0.05, 0.2, 4]} />
            <meshBasicMaterial color="#87CEEB" transparent opacity={0.8} />
          </mesh>
        ))}
      </group>
    );
  }
  
  if (spellType === 'lightning') {
    return (
      <mesh ref={effectRef} position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.4, 4]} />
        <meshBasicMaterial color="#FFFF00" transparent opacity={0.9} />
      </mesh>
    );
  }
  
  if (spellType === 'arcane') {
    return (
      <mesh ref={effectRef} position={[0, 0.2, 0]}>
        <torusGeometry args={[0.15, 0.03, 6, 8]} />
        <meshBasicMaterial color="#9932CC" transparent opacity={0.8} />
      </mesh>
    );
  }
  
  return null;
};

// Spell-specific effects for left hand
const SpellLeftHandEffects = ({ spellType }) => {
  const effectRef = useRef();
  
  useFrame((state) => {
    if (effectRef.current) {
      const time = state.clock.elapsedTime;
      effectRef.current.rotation.y += 0.1;
      effectRef.current.scale.setScalar(1 + Math.sin(time * 5) * 0.2);
    }
  });
  
  const colors = {
    fireball: '#FFD700',
    iceball: '#E0FFFF',
    lightning: '#FFFACD',
    arcane: '#E6E6FA'
  };
  
  return (
    <mesh ref={effectRef} position={[0, 0.05, -0.15]}>
      <sphereGeometry args={[0.06, 6, 6]} />
      <meshBasicMaterial 
        color={colors[spellType] || colors.fireball}
        transparent 
        opacity={0.6} 
      />
    </mesh>
  );
};

export default OptimizedPlayer;