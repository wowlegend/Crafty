import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useSounds } from './SoundManager';

// Diablo-style Magic System with Visual Effects
export const MagicProjectileSystem = ({ gameState, playerPosition }) => {
  const [projectiles, setProjectiles] = useState([]);
  const { playAttack } = useSounds();
  const projectileId = useRef(0);

  // Spell types with Diablo-inspired effects
  const SPELL_TYPES = {
    fireball: {
      color: '#FF4500',
      speed: 25,
      size: 0.3,
      damage: 50,
      effect: 'explosion',
      trail: true,
      particle: 'fire'
    },
    iceball: {
      color: '#00BFFF',
      speed: 20,
      size: 0.25,
      damage: 40,
      effect: 'freeze',
      trail: true,
      particle: 'ice'
    },
    lightning: {
      color: '#FFD700',
      speed: 50,
      size: 0.2,
      damage: 75,
      effect: 'shock',
      trail: false,
      particle: 'lightning'
    },
    arcane: {
      color: '#9932CC',
      speed: 30,
      size: 0.35,
      damage: 60,
      effect: 'arcane',
      trail: true,
      particle: 'arcane'
    }
  };

  // Cast spell function exposed globally
  useEffect(() => {
    window.castSpell = (spellType = 'fireball') => {
      if (!gameState?.selectedSpell && !SPELL_TYPES[spellType]) return;
      
      const spell = SPELL_TYPES[spellType] || SPELL_TYPES[gameState.selectedSpell];
      const camera = window.gameCamera;
      
      if (!camera) return;
      
      // Create projectile with proper physics
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
        maxAge: 3000, // 3 seconds max flight time
        trail: []
      };
      
      setProjectiles(prev => [...prev, newProjectile]);
      
      // Play casting sound
      if (playAttack) playAttack();
      
      // Visual casting effect
      if (window.addCastingEffect) {
        window.addCastingEffect(camera.position, spellType);
      }
    };
  }, [gameState, playAttack]);

  // Update projectiles each frame
  useFrame((state, delta) => {
    const deltaMs = delta * 1000;
    
    setProjectiles(prev => prev.map(projectile => {
      // Update position
      const newPos = projectile.position.clone().add(
        projectile.velocity.clone().multiplyScalar(delta)
      );
      
      // Add gravity for some spells
      if (projectile.type === 'fireball' || projectile.type === 'iceball') {
        projectile.velocity.y -= 15 * delta; // Gravity effect
      }
      
      // Update trail
      const newTrail = projectile.trail ? [...projectile.trail] : [];
      if (newTrail.length > 10) newTrail.shift();
      newTrail.push(projectile.position.clone());
      
      return {
        ...projectile,
        position: newPos,
        age: projectile.age + deltaMs,
        trail: newTrail
      };
    }).filter(projectile => {
      // Remove expired projectiles
      if (projectile.age > projectile.maxAge) return false;
      
      // Check collision with terrain
      if (window.getHighestBlockAt) {
        const groundLevel = window.getHighestBlockAt(projectile.position.x, projectile.position.z);
        if (projectile.position.y <= groundLevel + 1) {
          // Create impact effect
          if (window.createMagicImpact) {
            window.createMagicImpact(projectile.position, projectile.type);
          }
          return false;
        }
      }
      
      // Check collision with mobs
      if (window.checkMobCollision) {
        const hitMob = window.checkMobCollision(projectile.position, projectile.size);
        if (hitMob) {
          // Damage mob
          if (window.damageMob) {
            window.damageMob(hitMob.id, projectile.damage);
          }
          // Create hit effect
          if (window.createMagicImpact) {
            window.createMagicImpact(projectile.position, projectile.type);
          }
          return false;
        }
      }
      
      return true;
    }));
  });

  return (
    <group>
      {projectiles.map(projectile => (
        <MagicProjectile key={projectile.id} projectile={projectile} />
      ))}
    </group>
  );
};

// Individual Magic Projectile Component
const MagicProjectile = ({ projectile }) => {
  const meshRef = useRef();
  const trailRef = useRef();
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.position.copy(projectile.position);
      
      // Rotation for visual effect
      meshRef.current.rotation.x += 0.1;
      meshRef.current.rotation.z += 0.05;
      
      // Pulsing effect
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 10) * 0.2;
      meshRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <group>
      {/* Main projectile */}
      <mesh ref={meshRef} position={projectile.position}>
        <sphereGeometry args={[projectile.size, 8, 8]} />
        <meshBasicMaterial 
          color={projectile.color}
          transparent
          opacity={0.9}
          emissive={projectile.color}
          emissiveIntensity={0.5}
        />
      </mesh>
      
      {/* Projectile glow */}
      <mesh position={projectile.position}>
        <sphereGeometry args={[projectile.size * 1.5, 8, 8]} />
        <meshBasicMaterial 
          color={projectile.color}
          transparent
          opacity={0.3}
          emissive={projectile.color}
          emissiveIntensity={0.2}
        />
      </mesh>
      
      {/* Trail effect */}
      {projectile.trail && projectile.trail.length > 1 && (
        <TrailEffect trail={projectile.trail} color={projectile.color} />
      )}
    </group>
  );
};

// Trail Effect Component
const TrailEffect = ({ trail, color }) => {
  const points = useMemo(() => {
    return trail.map(pos => new THREE.Vector3(pos.x, pos.y, pos.z));
  }, [trail]);
  
  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [points]);
  
  if (!geometry) return null;
  
  return (
    <line geometry={geometry}>
      <lineBasicMaterial 
        color={color}
        transparent
        opacity={0.6}
        linewidth={2}
      />
    </line>
  );
};

// Magic Wand Component for Player Hands
export const MagicWand = ({ wandType = 'fire', position = [0, 0, 0], rotation = [0, 0, 0] }) => {
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
      // Gentle magical pulsing
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.1;
      wandRef.current.children[2].scale.setScalar(pulse); // Gem pulsing
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
          emissive={wandConfig.gem}
          emissiveIntensity={0.5}
        />
      </mesh>
      
      {/* Magical aura */}
      <mesh position={[0, 0.25, 0]}>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshBasicMaterial 
          color={wandConfig.gem}
          transparent
          opacity={0.2}
          emissive={wandConfig.gem}
          emissiveIntensity={0.1}
        />
      </mesh>
    </group>
  );
};

// Magic Impact Effects
export const MagicImpactSystem = () => {
  const [impacts, setImpacts] = useState([]);
  const impactId = useRef(0);
  
  useEffect(() => {
    window.createMagicImpact = (position, spellType) => {
      const newImpact = {
        id: impactId.current++,
        position: position.clone(),
        type: spellType,
        age: 0,
        maxAge: 1000 // 1 second effect
      };
      
      setImpacts(prev => [...prev, newImpact]);
    };
  }, []);
  
  useFrame((state, delta) => {
    const deltaMs = delta * 1000;
    
    setImpacts(prev => prev.filter(impact => {
      impact.age += deltaMs;
      return impact.age < impact.maxAge;
    }));
  });
  
  return (
    <group>
      {impacts.map(impact => (
        <MagicImpact key={impact.id} impact={impact} />
      ))}
    </group>
  );
};

// Individual Impact Effect
const MagicImpact = ({ impact }) => {
  const meshRef = useRef();
  const particlesRef = useRef();
  
  const progress = impact.age / impact.maxAge;
  const scale = Math.sin(progress * Math.PI) * 2;
  const opacity = 1 - progress;
  
  const IMPACT_COLORS = {
    fireball: '#FF4500',
    iceball: '#00BFFF',
    lightning: '#FFD700',
    arcane: '#9932CC'
  };
  
  const color = IMPACT_COLORS[impact.type] || IMPACT_COLORS.fireball;
  
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.scale.setScalar(scale);
      meshRef.current.material.opacity = opacity;
    }
    
    if (particlesRef.current) {
      particlesRef.current.children.forEach((particle, index) => {
        particle.position.y += 0.05;
        particle.rotation.y += 0.1;
        particle.material.opacity = opacity * (1 - index * 0.1);
      });
    }
  });
  
  return (
    <group position={impact.position}>
      {/* Main explosion sphere */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial 
          color={color}
          transparent
          opacity={opacity}
          emissive={color}
          emissiveIntensity={0.5}
        />
      </mesh>
      
      {/* Particle effects */}
      <group ref={particlesRef}>
        {[...Array(8)].map((_, i) => (
          <mesh 
            key={i}
            position={[
              (Math.random() - 0.5) * 2,
              Math.random() * 0.5,
              (Math.random() - 0.5) * 2
            ]}
          >
            <sphereGeometry args={[0.1, 6, 6]} />
            <meshBasicMaterial 
              color={color}
              transparent
              opacity={opacity}
              emissive={color}
              emissiveIntensity={0.3}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
};

export default MagicProjectileSystem;
