import React, { useRef, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// ============ SAFE MAGIC SYSTEM ============
// Simple implementation that won't cause Three.js errors

export const MAGIC_SPELLS = {
  fireball: {
    id: 'fireball',
    name: 'Fireball',
    damage: 25,
    cost: 5,
    cooldown: 1000,
    color: '#FF6B35',
    secondaryColor: '#FF4500',
    speed: 15,
    size: 0.8,
    description: 'Launches a devastating fireball'
  },
  iceShard: {
    id: 'iceShard', 
    name: 'Ice Shard',
    damage: 20,
    cost: 4,
    cooldown: 800,
    color: '#00BFFF',
    secondaryColor: '#87CEEB',
    speed: 18,
    size: 0.6,
    description: 'Fires sharp ice projectiles'
  },
  lightningBeam: {
    id: 'lightningBeam',
    name: 'Lightning Beam', 
    damage: 35,
    cost: 8,
    cooldown: 1500,
    color: '#FFFF00',
    secondaryColor: '#FFFFFF',
    speed: 25,
    size: 0.4,
    description: 'Devastating lightning that chains between enemies'
  },
  arcaneOrb: {
    id: 'arcaneOrb',
    name: 'Arcane Orb',
    damage: 30,
    cost: 7,
    cooldown: 1200,
    color: '#9932CC',
    secondaryColor: '#DDA0DD',
    speed: 12,
    size: 1.0,
    description: 'Slow but powerful piercing orb'
  }
};

// Simple Magic Wand Component - No complex Three.js usage
export const MagicWand = ({ selectedSpell = 'fireball', isAttacking = false, position = [0, 0, 0], rotation = [0, 0, 0] }) => {
  const wandRef = useRef();
  const crystalRef = useRef();
  
  // Safe position and rotation with defaults
  const safePosition = Array.isArray(position) && position.length === 3 ? position : [0, 0, 0];
  const safeRotation = Array.isArray(rotation) && rotation.length === 3 ? rotation : [0, 0, 0];
  
  useFrame((state) => {
    if (!wandRef.current || !crystalRef.current) return;
    
    try {
      const time = state.clock.elapsedTime;
      
      // Simple animations
      if (wandRef.current.position) {
        wandRef.current.position.y = safePosition[1] + Math.sin(time * 2) * 0.02;
      }
      
      // Crystal glow effect
      if (crystalRef.current.material && crystalRef.current.material.emissiveIntensity !== undefined) {
        const glowIntensity = 0.5 + Math.sin(time * 4) * 0.3;
        crystalRef.current.material.emissiveIntensity = isAttacking ? 2.0 : glowIntensity;
      }
      
    } catch (error) {
      console.warn('Error in magic wand animation:', error);
    }
  });
  
  const spell = MAGIC_SPELLS[selectedSpell] || MAGIC_SPELLS.fireball;
  
  return (
    <group ref={wandRef} position={safePosition} rotation={safeRotation}>
      {/* Wand handle */}
      <mesh position={[0, -0.4, 0]}>
        <cylinderGeometry args={[0.03, 0.04, 0.8, 12]} />
        <meshLambertMaterial color="#4A4A4A" />
      </mesh>
      
      {/* Metal band */}
      <mesh position={[0, -0.1, 0]}>
        <cylinderGeometry args={[0.045, 0.045, 0.1, 16]} />
        <meshLambertMaterial color="#FFD700" />
      </mesh>
      
      {/* Magic crystal */}
      <mesh ref={crystalRef} position={[0, 0.1, 0]}>
        <octahedronGeometry args={[0.08, 0]} />
        <meshBasicMaterial 
          color={spell.color || '#FF6B35'}
          emissive={spell.color || '#FF6B35'}
          emissiveIntensity={0.8}
          transparent
          opacity={0.9}
        />
      </mesh>
      
      {/* Crystal holder */}
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.05, 0.03, 0.08, 8]} />
        <meshLambertMaterial color="#C0C0C0" />
      </mesh>
      
      {/* Simple magical aura when attacking */}
      {isAttacking && (
        <group>
          {Array.from({length: 4}, (_, i) => {
            const angle = (i / 4) * Math.PI * 2;
            const radius = 0.15;
            return (
              <mesh 
                key={i} 
                position={[
                  Math.cos(angle) * radius,
                  0.1,
                  Math.sin(angle) * radius
                ]}
                scale={[0.1, 0.1, 0.1]}
              >
                <sphereGeometry args={[1, 4, 4]} />
                <meshBasicMaterial 
                  color={spell.color || '#FF6B35'}
                  transparent
                  opacity={0.7}
                />
              </mesh>
            );
          })}
        </group>
      )}
    </group>
  );
};

// Simple Magic System Manager - Basic implementation
export const MagicSystemManager = ({ gameState }) => {
  const { camera } = useThree();
  
  // Simple spell casting function without complex projectiles
  const castSpell = (spellId) => {
    try {
      const spell = MAGIC_SPELLS[spellId];
      if (!spell) {
        console.warn(`Unknown spell: ${spellId}`);
        return;
      }
      
      // Check mana/cost
      if ((gameState?.inventory?.magic?.crystals || 0) < spell.cost) {
        console.log('Not enough mana crystals!');
        return;
      }
      
      // Consume mana
      if (gameState?.setInventory) {
        gameState.setInventory(prev => ({
          ...prev,
          magic: {
            ...prev.magic,
            crystals: Math.max(0, (prev.magic?.crystals || 0) - spell.cost)
          }
        }));
      }
      
      console.log(`✨ Cast ${spell.name} for ${spell.damage} damage!`);
      
      // Play sound effects if available
      if (window.playMagicCast) {
        window.playMagicCast();
      }
      
    } catch (error) {
      console.error('Error casting spell:', error);
    }
  };
  
  // Expose casting function globally
  useEffect(() => {
    window.castMagicSpell = castSpell;
  }, [gameState]);
  
  // Simple implementation - no complex 3D effects to avoid errors
  return null;
};