import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// UNIFIED COMPREHENSIVE MAGIC SYSTEM
// Combines all features from: MagicSystem, EnhancedMagicSystem, SimpleMagicSystem, EnhancedMagic
export const UnifiedMagicSystem = ({ gameState, playerPosition }) => {
  const [projectiles, setProjectiles] = useState([]);
  const [impacts, setImpacts] = useState([]);
  const [castingEffects, setCastingEffects] = useState([]);
  const projectileId = useRef(0);
  const impactId = useRef(0);
  const effectId = useRef(0);

  // COMPREHENSIVE SPELL TYPES - Best from all systems
  const SPELL_TYPES = useMemo(() => ({
    fireball: {
      color: '#FF4500',
      trailColor: '#FF6347',
      particleColor: '#FFD700',
      speed: 25,
      size: 0.4,
      damage: 50,
      trailLength: 20,
      particleCount: 8,
      effect: 'fire',
      manaCost: 10
    },
    iceball: {
      color: '#00BFFF',
      trailColor: '#87CEEB',
      particleColor: '#E0FFFF',
      speed: 20,
      size: 0.35,
      damage: 40,
      trailLength: 15,
      particleCount: 6,
      effect: 'ice',
      manaCost: 8
    },
    lightning: {
      color: '#FFD700',
      trailColor: '#FFFF00',
      particleColor: '#FFFFE0',
      speed: 50,
      size: 0.3,
      damage: 75,
      trailLength: 25,
      particleCount: 12,
      effect: 'lightning',
      manaCost: 15
    },
    arcane: {
      color: '#9932CC',
      trailColor: '#DA70D6',
      particleColor: '#E6E6FA',
      speed: 30,
      size: 0.35,
      damage: 60,
      trailLength: 18,
      particleCount: 10,
      effect: 'arcane',
      manaCost: 12
    }
  }), []);

  // UNIFIED SPELL CASTING with all features
  useEffect(() => {
    window.castSpell = (spellType = 'fireball') => {
      const spell = SPELL_TYPES[spellType];
      const camera = window.gameCamera;
      
      if (!camera || !spell) {
        console.warn(`❌ Invalid spell: ${spellType}`);
        return;
      }
      
      // SOUND EFFECTS - Comprehensive
      if (window.playMagicCast) {
        window.playMagicCast();
      } else if (window.playAttack) {
        window.playAttack();
      }
      
      // SPELL CASTING EFFECT
      createCastingEffect(camera.position, spellType);
      
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      
      const startPos = camera.position.clone().add(direction.clone().multiplyScalar(2));
      
      // CREATE PROJECTILE with all features
      const newProjectile = {
        id: projectileId.current++,
        type: spellType,
        position: startPos.clone(),
        velocity: direction.clone().multiplyScalar(spell.speed),
        ...spell,
        age: 0,
        maxAge: 3000, // 3 seconds max flight
        trailPositions: [startPos.clone()],
        lastTrailUpdate: 0
      };
      
      setProjectiles(prev => [...prev, newProjectile]);
      
      // XP GAIN for casting
      if (window.addExperience) {
        window.addExperience(3, `Cast ${spellType}`);
      }
      
      console.log(`🔥 UNIFIED: Cast ${spellType}! Damage: ${spell.damage}`);
    };
    
    // IMPACT EFFECTS
    window.createMagicImpact = (position, spellType) => {
      createImpactEffect(position, spellType);
    };
    
  }, [SPELL_TYPES]);

  // CASTING EFFECTS
  const createCastingEffect = (position, spellType) => {
    const effect = {
      id: effectId.current++,
      position: position.clone(),
      type: spellType,
      age: 0,
      maxAge: 600
    };
    setCastingEffects(prev => [...prev, effect]);
  };

  // IMPACT EFFECTS  
  const createImpactEffect = (position, spellType) => {
    const impact = {
      id: impactId.current++,
      position: position.clone(),
      type: spellType,
      age: 0,
      maxAge: 1000
    };
    setImpacts(prev => [...prev, impact]);
    
    // IMPACT SOUND
    if (window.playMagicHit) {
      window.playMagicHit();
    } else if (window.playHitSound) {
      window.playHitSound();
    }
  };

  // UNIFIED PROJECTILE UPDATE with all collision systems
  useFrame((state, delta) => {
    const deltaMs = delta * 1000;
    const time = state.clock.elapsedTime;
    
    // UPDATE PROJECTILES
    setProjectiles(prev => prev.map(projectile => {
      // Update position
      const newPos = projectile.position.clone().add(
        projectile.velocity.clone().multiplyScalar(delta)
      );
      
      // Add gravity for fire and ice
      if (projectile.type === 'fireball' || projectile.type === 'iceball') {
        projectile.velocity.y -= 12 * delta;
      }
      
      // Update trail
      const updatedProjectile = {
        ...projectile,
        position: newPos,
        age: projectile.age + deltaMs
      };
      
      // Add trail positions
      if (time - projectile.lastTrailUpdate > 0.05) {
        updatedProjectile.trailPositions = [
          ...projectile.trailPositions.slice(-projectile.trailLength),
          newPos.clone()
        ];
        updatedProjectile.lastTrailUpdate = time;
      }
      
      return updatedProjectile;
      
    }).filter(projectile => {
      // Check expiration
      if (projectile.age > projectile.maxAge) {
        createImpactEffect(projectile.position, projectile.type);
        return false;
      }
      
      // TERRAIN COLLISION - using proper ground detection
      if (window.getMobGroundLevel) {
        const groundLevel = window.getMobGroundLevel(projectile.position.x, projectile.position.z);
        if (projectile.position.y <= groundLevel + 1) {
          createImpactEffect(projectile.position, projectile.type);
          return false;
        }
      }
      
      // MOB COLLISION - COMPREHENSIVE DAMAGE SYSTEM
      if (window.checkMobCollision) {
        const hitMob = window.checkMobCollision(projectile.position, projectile.size);
        if (hitMob) {
          // DAMAGE MOB
          if (window.damageMob) {
            window.damageMob(hitMob.id, projectile.damage);
            console.log(`💥 UNIFIED SPELL HIT ${hitMob.type}! Damage: ${projectile.damage}`);
          }
          
          // IMPACT EFFECT
          createImpactEffect(projectile.position, projectile.type);
          
          // XP GAIN for combat
          if (window.addExperience) {
            const xpGain = Math.floor(projectile.damage / 5);
            window.addExperience(xpGain, `Spell Combat`);
          }
          
          return false; // Remove projectile
        }
      }
      
      return true;
    }));
    
    // UPDATE IMPACTS
    setImpacts(prev => prev.filter(impact => {
      impact.age += deltaMs;
      return impact.age < impact.maxAge;
    }));
    
    // UPDATE CASTING EFFECTS
    setCastingEffects(prev => prev.filter(effect => {
      effect.age += deltaMs;
      return effect.age < effect.maxAge;
    }));
  });

  return (
    <group>
      {/* PROJECTILES with enhanced visuals */}
      {projectiles.map(projectile => (
        <UnifiedProjectile key={projectile.id} projectile={projectile} />
      ))}
      
      {/* IMPACT EFFECTS */}
      {impacts.map(impact => (
        <UnifiedImpact key={impact.id} impact={impact} />
      ))}
      
      {/* CASTING EFFECTS */}
      {castingEffects.map(effect => (
        <UnifiedCastingEffect key={effect.id} effect={effect} />
      ))}
    </group>
  );
};

// UNIFIED PROJECTILE COMPONENT
const UnifiedProjectile = ({ projectile }) => {
  const meshRef = useRef();
  const trailRef = useRef();
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.position.copy(projectile.position);
      
      // Enhanced rotation
      meshRef.current.rotation.x += 0.1;
      meshRef.current.rotation.z += 0.05;
      
      // Pulsing effect
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 10) * 0.2;
      meshRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <group>
      {/* Main projectile sphere */}
      <mesh ref={meshRef} position={projectile.position}>
        <sphereGeometry args={[projectile.size, 12, 12]} />
        <meshBasicMaterial 
          color={projectile.color}
          transparent
          opacity={0.9}
          emissive={projectile.color}
          emissiveIntensity={0.5}
        />
      </mesh>
      
      {/* Outer glow */}
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
      
      {/* Particle trail */}
      {projectile.trailPositions && projectile.trailPositions.length > 1 && (
        <UnifiedTrail positions={projectile.trailPositions} color={projectile.trailColor} />
      )}
    </group>
  );
};

// UNIFIED TRAIL EFFECT
const UnifiedTrail = ({ positions, color }) => {
  const points = useMemo(() => {
    return positions.map(pos => new THREE.Vector3(pos.x, pos.y, pos.z));
  }, [positions]);
  
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
        linewidth={3}
      />
    </line>
  );
};

// UNIFIED IMPACT EFFECT
const UnifiedImpact = ({ impact }) => {
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
      {/* Main explosion */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[1.5, 16, 16]} />
        <meshBasicMaterial 
          color={color}
          transparent
          opacity={opacity}
          emissive={color}
          emissiveIntensity={0.8}
        />
      </mesh>
      
      {/* Explosion particles */}
      <group ref={particlesRef}>
        {[...Array(12)].map((_, i) => (
          <mesh 
            key={i}
            position={[
              (Math.random() - 0.5) * 3,
              Math.random() * 1,
              (Math.random() - 0.5) * 3
            ]}
          >
            <sphereGeometry args={[0.15, 6, 6]} />
            <meshBasicMaterial 
              color={color}
              transparent
              opacity={opacity}
              emissive={color}
              emissiveIntensity={0.5}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
};

// UNIFIED CASTING EFFECT
const UnifiedCastingEffect = ({ effect }) => {
  const meshRef = useRef();
  
  const progress = effect.age / effect.maxAge;
  const scale = (1 - progress) * 2;
  const opacity = 1 - progress;
  
  const SPELL_COLORS = {
    fireball: '#FF4500',
    iceball: '#00BFFF',
    lightning: '#FFD700',
    arcane: '#9932CC'
  };
  
  const color = SPELL_COLORS[effect.type] || SPELL_COLORS.fireball;
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.scale.setScalar(scale);
      meshRef.current.material.opacity = opacity;
      meshRef.current.rotation.y += 0.1;
    }
  });
  
  return (
    <mesh ref={meshRef} position={effect.position}>
      <torusGeometry args={[0.5, 0.1, 8, 16]} />
      <meshBasicMaterial 
        color={color}
        transparent
        opacity={opacity}
        emissive={color}
        emissiveIntensity={0.6}
      />
    </mesh>
  );
};

// UNIFIED MAGIC WAND
export const UnifiedMagicWand = ({ wandType = 'fireball', position = [0, 0, 0], rotation = [0, 0, 0] }) => {
  const wandRef = useRef();
  
  const WAND_CONFIGS = {
    fireball: { color: '#FF4500', gem: '#FF6347' },
    iceball: { color: '#4169E1', gem: '#00BFFF' },
    lightning: { color: '#FFD700', gem: '#FFFF00' },
    arcane: { color: '#9932CC', gem: '#DA70D6' }
  };
  
  const config = WAND_CONFIGS[wandType] || WAND_CONFIGS.fireball;
  
  useFrame((state) => {
    if (wandRef.current && wandRef.current.children[2]) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.15;
      wandRef.current.children[2].scale.setScalar(pulse);
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
        <meshLambertMaterial color={config.color} />
      </mesh>
      
      {/* Magic gem with enhanced glow */}
      <mesh position={[0, 0.25, 0]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshBasicMaterial 
          color={config.gem}
          transparent
          opacity={0.8}
          emissive={config.gem}
          emissiveIntensity={0.7}
        />
      </mesh>
      
      {/* Enhanced magical aura */}
      <mesh position={[0, 0.25, 0]}>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshBasicMaterial 
          color={config.gem}
          transparent
          opacity={0.2}
          emissive={config.gem}
          emissiveIntensity={0.3}
        />
      </mesh>
    </group>
  );
};

export default UnifiedMagicSystem;