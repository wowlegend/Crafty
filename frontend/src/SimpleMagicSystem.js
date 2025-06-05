import React, { useRef, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// Simple Magic System - No Runtime Errors
export const SimpleMagicProjectileSystem = ({ gameState, playerPosition }) => {
  const [projectiles, setProjectiles] = useState([]);
  const projectileId = useRef(0);

  // Spell types
  const SPELL_TYPES = {
    fireball: {
      color: '#FF4500',
      speed: 25,
      size: 0.3,
      damage: 50
    },
    iceball: {
      color: '#00BFFF',
      speed: 20,
      size: 0.25,
      damage: 40
    },
    lightning: {
      color: '#FFD700',
      speed: 50,
      size: 0.2,
      damage: 75
    },
    arcane: {
      color: '#9932CC',
      speed: 30,
      size: 0.35,
      damage: 60
    }
  };

  // Cast spell function
  useEffect(() => {
    window.castSpell = (spellType = 'fireball') => {
      const spell = SPELL_TYPES[spellType];
      const camera = window.gameCamera;
      
      if (!camera || !spell) return;
      
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      
      const startPos = camera.position.clone().add(direction.clone().multiplyScalar(2));
      
      const newProjectile = {
        id: projectileId.current++,
        type: spellType,
        position: startPos,
        velocity: direction.multiplyScalar(spell.speed),
        ...spell,
        age: 0,
        maxAge: 3000
      };
      
      setProjectiles(prev => [...prev, newProjectile]);
    };
  }, []);

  // Update projectiles
  useFrame((state, delta) => {
    const deltaMs = delta * 1000;
    
    setProjectiles(prev => prev.map(projectile => {
      // Update position
      const newPos = projectile.position.clone().add(
        projectile.velocity.clone().multiplyScalar(delta)
      );
      
      // Add gravity
      if (projectile.type === 'fireball' || projectile.type === 'iceball') {
        projectile.velocity.y -= 15 * delta;
      }
      
      return {
        ...projectile,
        position: newPos,
        age: projectile.age + deltaMs
      };
    }).filter(projectile => {
      // Remove expired projectiles
      if (projectile.age > projectile.maxAge) return false;
      
      // Check collision with terrain
      if (window.getHighestBlockAt) {
        const groundLevel = window.getHighestBlockAt(projectile.position.x, projectile.position.z);
        if (projectile.position.y <= groundLevel + 1) {
          return false;
        }
      }
      
      return true;
    }));
  });

  return (
    <group>
      {projectiles.map(projectile => (
        <SimpleMagicProjectile key={projectile.id} projectile={projectile} />
      ))}
    </group>
  );
};

// Individual Magic Projectile Component
const SimpleMagicProjectile = ({ projectile }) => {
  const meshRef = useRef();
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.position.copy(projectile.position);
      meshRef.current.rotation.x += 0.1;
      meshRef.current.rotation.z += 0.05;
      
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 10) * 0.2;
      meshRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <mesh ref={meshRef} position={projectile.position}>
      <sphereGeometry args={[projectile.size, 8, 8]} />
      <meshBasicMaterial 
        color={projectile.color}
        transparent
        opacity={0.9}
      />
    </mesh>
  );
};

// Simple Magic Wand Component
export const SimpleMagicWand = ({ wandType = 'fire', position = [0, 0, 0], rotation = [0, 0, 0] }) => {
  const wandRef = useRef();
  
  const WAND_TYPES = {
    fire: { color: '#FF4500', gem: '#FF6347' },
    ice: { color: '#4169E1', gem: '#00BFFF' },
    lightning: { color: '#FFD700', gem: '#FFFF00' },
    arcane: { color: '#9932CC', gem: '#DA70D6' }
  };
  
  const wandConfig = WAND_TYPES[wandType] || WAND_TYPES.fire;
  
  useFrame((state) => {
    if (wandRef.current) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.1;
      if (wandRef.current.children[2]) {
        wandRef.current.children[2].scale.setScalar(pulse);
      }
    }
  });
  
  return (
    <group ref={wandRef} position={position} rotation={rotation}>
      {/* Wand handle */}
      <mesh position={[0, -0.4, 0]}>
        <cylinderGeometry args={[0.03, 0.04, 0.8, 8]} />
        <meshLambertMaterial color="#8B4513" />
      </mesh>
      
      {/* Wand tip */}
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.02, 0.03, 0.2, 8]} />
        <meshLambertMaterial color={wandConfig.color} />
      </mesh>
      
      {/* Magic gem */}
      <mesh position={[0, 0.25, 0]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshBasicMaterial 
          color={wandConfig.gem}
          transparent
          opacity={0.8}
        />
      </mesh>
    </group>
  );
};

export default SimpleMagicProjectileSystem;