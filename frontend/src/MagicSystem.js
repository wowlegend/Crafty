import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameSounds } from './SoundManager';

// ============ ADVANCED MAGIC SYSTEM ============
// Diablo-inspired magic combat with sophisticated visual effects

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
    trail: true,
    explosion: true,
    particleCount: 20,
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
    trail: true,
    freeze: true,
    particleCount: 15,
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
    beam: true,
    chain: true,
    particleCount: 30,
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
    pierce: true,
    slow: true,
    particleCount: 25,
    description: 'Slow but powerful piercing orb'
  }
};

// Enhanced Magic Projectile System
export const MagicProjectile = ({ spell, startPosition, direction, onHit, onComplete }) => {
  const meshRef = useRef();
  const trailRef = useRef();
  const particlesRef = useRef();
  const position = useRef(startPosition.clone());
  const velocity = useRef(direction.clone().multiplyScalar(spell.speed));
  const { playMagicCast, playMagicHit, playMagicExplosion } = useGameSounds();
  
  const [active, setActive] = useState(true);
  const [particles, setParticles] = useState([]);
  
  // Initialize particles for trail effect
  useEffect(() => {
    if (spell.trail) {
      const initialParticles = [];
      for (let i = 0; i < spell.particleCount; i++) {
        initialParticles.push({
          position: startPosition.clone(),
          velocity: new THREE.Vector3(
            (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 0.5
          ),
          life: 1.0,
          maxLife: 0.5 + Math.random() * 0.5
        });
      }
      setParticles(initialParticles);
    }
    
    // Play cast sound
    playMagicCast();
  }, []);
  
  useFrame((state, delta) => {
    if (!active || !meshRef.current) return;
    
    // Update projectile position
    position.current.add(velocity.current.clone().multiplyScalar(delta));
    meshRef.current.position.copy(position.current);
    
    // Rotation for visual appeal
    meshRef.current.rotation.x += delta * 5;
    meshRef.current.rotation.y += delta * 3;
    
    // Update trail particles
    if (spell.trail && particlesRef.current) {
      setParticles(prev => prev.map(particle => {
        particle.life -= delta * 2;
        particle.position.add(particle.velocity.clone().multiplyScalar(delta));
        return particle;
      }).filter(p => p.life > 0));
      
      // Add new particles
      if (Math.random() < 0.8) {
        setParticles(prev => [...prev, {
          position: position.current.clone().add(
            new THREE.Vector3(
              (Math.random() - 0.5) * 0.3,
              (Math.random() - 0.5) * 0.3,
              (Math.random() - 0.5) * 0.3
            )
          ),
          velocity: velocity.current.clone().multiplyScalar(-0.1).add(
            new THREE.Vector3(
              (Math.random() - 0.5) * 0.5,
              (Math.random() - 0.5) * 0.5,
              (Math.random() - 0.5) * 0.5
            )
          ),
          life: 1.0,
          maxLife: 0.5 + Math.random() * 0.5
        }]);
      }
    }
    
    // Check for collision with terrain or max distance
    const groundY = window.getHighestBlockAt ? 
      window.getHighestBlockAt(position.current.x, position.current.z) + 1 : 15;
    
    if (position.current.y <= groundY || 
        position.current.distanceTo(startPosition) > 50) {
      // Impact!
      if (onHit) {
        onHit(position.current.clone(), spell);
      }
      
      // Play impact sound
      if (spell.explosion) {
        playMagicExplosion();
      } else {
        playMagicHit();
      }
      
      setActive(false);
      setTimeout(() => {
        if (onComplete) onComplete();
      }, 100);
    }
  });
  
  if (!active) return null;
  
  return (
    <group>
      {/* Main projectile */}
      <mesh ref={meshRef} position={startPosition}>
        <sphereGeometry args={[spell.size, 16, 16]} />
        <meshBasicMaterial 
          color={spell.color}
          emissive={spell.color}
          emissiveIntensity={0.8}
          transparent
          opacity={0.9}
        />
        
        {/* Inner glow */}
        <mesh scale={[0.6, 0.6, 0.6]}>
          <sphereGeometry args={[spell.size, 8, 8]} />
          <meshBasicMaterial 
            color={spell.secondaryColor}
            emissive={spell.secondaryColor}
            emissiveIntensity={1.2}
            transparent
            opacity={0.7}
          />
        </mesh>
      </mesh>
      
      {/* Trail particles */}
      {spell.trail && (
        <group ref={particlesRef}>
          {particles.map((particle, index) => (
            <mesh 
              key={index}
              position={particle.position}
              scale={[0.1, 0.1, 0.1]}
            >
              <sphereGeometry args={[1, 4, 4]} />
              <meshBasicMaterial 
                color={spell.color}
                transparent
                opacity={particle.life / particle.maxLife * 0.6}
              />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
};

// Magic Impact Effect
export const MagicImpact = ({ position, spell, onComplete }) => {
  const meshRef = useRef();
  const [scale, setScale] = useState(0.1);
  const [opacity, setOpacity] = useState(1.0);
  
  useFrame((state, delta) => {
    if (!meshRef.current) return;
    
    // Expand impact effect
    setScale(prev => prev + delta * 8);
    setOpacity(prev => Math.max(0, prev - delta * 3));
    
    meshRef.current.scale.setScalar(scale);
    
    if (opacity <= 0) {
      if (onComplete) onComplete();
    }
  });
  
  return (
    <group>
      {/* Main explosion */}
      <mesh ref={meshRef} position={position}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial 
          color={spell.color}
          emissive={spell.color}
          emissiveIntensity={1.5}
          transparent
          opacity={opacity * 0.7}
        />
      </mesh>
      
      {/* Shockwave ring */}
      <mesh position={position} scale={[scale * 2, 0.1, scale * 2]}>
        <torusGeometry args={[1, 0.1, 8, 16]} />
        <meshBasicMaterial 
          color={spell.secondaryColor}
          emissive={spell.secondaryColor}
          emissiveIntensity={1.0}
          transparent
          opacity={opacity * 0.5}
        />
      </mesh>
      
      {/* Particle burst */}
      {Array.from({length: spell.particleCount}, (_, i) => {
        const angle = (i / spell.particleCount) * Math.PI * 2;
        const radius = scale * 2;
        const particlePos = [
          position.x + Math.cos(angle) * radius,
          position.y + (Math.random() - 0.5) * radius,
          position.z + Math.sin(angle) * radius
        ];
        
        return (
          <mesh key={i} position={particlePos} scale={[0.2, 0.2, 0.2]}>
            <sphereGeometry args={[1, 4, 4]} />
            <meshBasicMaterial 
              color={spell.color}
              transparent
              opacity={opacity * 0.8}
            />
          </mesh>
        );
      })}
    </group>
  );
};

// Enhanced Magic Wand Component
export const MagicWand = ({ selectedSpell, isAttacking, position, rotation }) => {
  const wandRef = useRef();
  const crystalRef = useRef();
  const { playMagicCharge } = useGameSounds();
  
  useFrame((state) => {
    if (!wandRef.current || !crystalRef.current) return;
    
    const time = state.clock.elapsedTime;
    
    // Gentle floating animation
    wandRef.current.position.y = position[1] + Math.sin(time * 2) * 0.02;
    
    // Crystal glow pulse
    const glowIntensity = 0.5 + Math.sin(time * 4) * 0.3;
    crystalRef.current.material.emissiveIntensity = glowIntensity;
    
    // Enhanced attack animation
    if (isAttacking) {
      const attackTime = time * 10;
      wandRef.current.rotation.x = rotation[0] + Math.sin(attackTime) * 0.5;
      wandRef.current.position.z = position[2] + Math.sin(attackTime) * 0.2;
      crystalRef.current.material.emissiveIntensity = 2.0;
    }
  });
  
  // Play charge sound when attacking
  useEffect(() => {
    if (isAttacking) {
      playMagicCharge();
    }
  }, [isAttacking]);
  
  const spell = MAGIC_SPELLS[selectedSpell] || MAGIC_SPELLS.fireball;
  
  return (
    <group ref={wandRef} position={position} rotation={rotation}>
      {/* Wand handle - elegant wood design */}
      <mesh position={[0, -0.4, 0]}>
        <cylinderGeometry args={[0.03, 0.04, 0.8, 12]} />
        <meshLambertMaterial color="#4A4A4A" />
      </mesh>
      
      {/* Ornate metal band */}
      <mesh position={[0, -0.1, 0]}>
        <cylinderGeometry args={[0.045, 0.045, 0.1, 16]} />
        <meshLambertMaterial color="#FFD700" />
      </mesh>
      
      {/* Magic crystal - spell-specific color */}
      <mesh ref={crystalRef} position={[0, 0.1, 0]}>
        <octahedronGeometry args={[0.08, 0]} />
        <meshBasicMaterial 
          color={spell.color}
          emissive={spell.color}
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
      
      {/* Magical aura when attacking */}
      {isAttacking && (
        <group>
          {Array.from({length: 8}, (_, i) => {
            const angle = (i / 8) * Math.PI * 2;
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
                  color={spell.color}
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

// Magic System Manager
export const MagicSystemManager = ({ gameState }) => {
  const [activeProjectiles, setActiveProjectiles] = useState([]);
  const [activeImpacts, setActiveImpacts] = useState([]);
  const { camera } = useThree();
  
  // Cast spell function
  const castSpell = (spellId) => {
    const spell = MAGIC_SPELLS[spellId];
    if (!spell) return;
    
    // Check mana/cost
    if ((gameState.inventory?.magic?.crystals || 0) < spell.cost) {
      console.log('Not enough mana crystals!');
      return;
    }
    
    // Consume mana
    gameState.setInventory(prev => ({
      ...prev,
      magic: {
        ...prev.magic,
        crystals: Math.max(0, (prev.magic.crystals || 0) - spell.cost)
      }
    }));
    
    // Create projectile
    const startPosition = camera.position.clone();
    startPosition.y -= 0.5; // Adjust for hand position
    
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    
    const projectileId = Date.now() + Math.random();
    
    setActiveProjectiles(prev => [...prev, {
      id: projectileId,
      spell,
      startPosition,
      direction,
      createdAt: Date.now()
    }]);
    
    // Auto-remove projectile after timeout
    setTimeout(() => {
      setActiveProjectiles(prev => prev.filter(p => p.id !== projectileId));
    }, 5000);
  };
  
  const handleProjectileHit = (position, spell) => {
    // Create impact effect
    const impactId = Date.now() + Math.random();
    setActiveImpacts(prev => [...prev, {
      id: impactId,
      position,
      spell,
      createdAt: Date.now()
    }]);
    
    // Remove impact after animation
    setTimeout(() => {
      setActiveImpacts(prev => prev.filter(i => i.id !== impactId));
    }, 2000);
    
    // Damage nearby mobs (if NPCs are available)
    if (window.damageNearbyMobs) {
      window.damageNearbyMobs(position, spell.damage, spell.size * 3);
    }
  };
  
  const handleProjectileComplete = (projectileId) => {
    setActiveProjectiles(prev => prev.filter(p => p.id !== projectileId));
  };
  
  const handleImpactComplete = (impactId) => {
    setActiveImpacts(prev => prev.filter(i => i.id !== impactId));
  };
  
  // Expose casting function globally
  useEffect(() => {
    window.castMagicSpell = castSpell;
  }, [gameState]);
  
  return (
    <group>
      {/* Active projectiles */}
      {activeProjectiles.map(projectile => (
        <MagicProjectile
          key={projectile.id}
          spell={projectile.spell}
          startPosition={projectile.startPosition}
          direction={projectile.direction}
          onHit={(pos, spell) => handleProjectileHit(pos, spell)}
          onComplete={() => handleProjectileComplete(projectile.id)}
        />
      ))}
      
      {/* Active impact effects */}
      {activeImpacts.map(impact => (
        <MagicImpact
          key={impact.id}
          position={impact.position}
          spell={impact.spell}
          onComplete={() => handleImpactComplete(impact.id)}
        />
      ))}
    </group>
  );
};
