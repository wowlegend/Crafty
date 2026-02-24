import React, { useRef, useState, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from './store/useGameStore';
import { SPELL_MANA_COSTS } from './GameSystems';
import * as THREE from 'three';

// ENHANCED Magic System with Authentic Visual Effects
export const EnhancedMagicSystem = ({ playerPosition }) => {
  const gameState = useGameStore();
  const [projectiles, setProjectiles] = useState([]);
  const [spellTrails, setSpellTrails] = useState([]);
  const [spellImpacts, setSpellImpacts] = useState([]);
  const [debuffs, setDebuffs] = useState([]); // Track active debuffs on mobs
  const projectileId = useRef(0);
  const trailId = useRef(0);
  const impactId = useRef(0);
  const debuffId = useRef(0);

  // CRITICAL: Use ref to track projectiles for reliable rapid casting
  const projectilesRef = useRef([]);
  const frameCounter = useRef(0); // Throttle React state sync
  const projectilesDirty = useRef(false); // Only re-render when changed

  // Enhanced spell configurations with MUCH LARGER sizes and secondary effects
  const SPELL_TYPES = useMemo(() => ({
    fireball: {
      color: '#FF4500',
      trailColor: '#FF6347',
      particleColor: '#FFD700',
      glowColor: '#FF6600',
      speed: 25,
      size: 1.2,  // MUCH BIGGER
      damage: 50,
      trailLength: 25,
      particleCount: 15,
      effect: 'fire',
      // Secondary effect: BURN
      secondary: {
        type: 'burn',
        duration: 4,
        damagePerSecond: 8,
        color: '#FF4500'
      }
    },
    iceball: {
      color: '#00BFFF',
      trailColor: '#87CEEB',
      particleColor: '#E0FFFF',
      glowColor: '#00FFFF',
      speed: 20,
      size: 1.0,  // MUCH BIGGER
      damage: 40,
      trailLength: 20,
      particleCount: 12,
      effect: 'ice',
      // Secondary effect: FREEZE/SLOW
      secondary: {
        type: 'freeze',
        duration: 5,
        slowPercent: 70,
        freezeChance: 0.2,
        color: '#87CEEB'
      }
    },
    lightning: {
      color: '#FFD700',
      trailColor: '#FFFF00',
      particleColor: '#FFFFE0',
      glowColor: '#FFFF00',
      speed: 60,  // Very fast
      size: 0.8,  // Thinner but bright
      damage: 75,
      trailLength: 30,
      particleCount: 20,
      effect: 'lightning',
      // Secondary effect: CHAIN LIGHTNING
      secondary: {
        type: 'chain',
        maxChains: 3,
        chainRange: 8,
        chainDamageReduction: 0.3,
        stunDuration: 1,
        color: '#FFFF00'
      }
    },
    arcane: {
      color: '#9932CC',
      trailColor: '#DA70D6',
      particleColor: '#DDA0DD',
      glowColor: '#FF00FF',
      speed: 30,
      size: 1.1,  // BIGGER
      damage: 60,
      trailLength: 22,
      particleCount: 14,
      effect: 'arcane',
      // Secondary effect: PIERCE + LIFESTEAL
      secondary: {
        type: 'pierce',
        pierceCount: 3,
        lifestealPercent: 15,
        color: '#DA70D6'
      }
    }
  }), []);

  // === SECONDARY EFFECT FUNCTIONS ===

  // BURN EFFECT - Damage over time
  const applyBurnEffect = (mobId, duration, dps) => {
    let ticksRemaining = Math.floor(duration);
    const burnInterval = setInterval(() => {
      if (ticksRemaining <= 0 || !window.damageMob) {
        clearInterval(burnInterval);
        return;
      }
      window.damageMob(mobId, dps);
      ticksRemaining--;
    }, 1000);
  };

  // FREEZE EFFECT - Slow mob speed
  const applyFreezeEffect = (mobId, duration, slowPercent, freezeChance) => {
    // Apply slow via global mob modifier
    if (!window.mobSlowEffects) window.mobSlowEffects = {};
    window.mobSlowEffects[mobId] = {
      slowMultiplier: 1 - (slowPercent / 100),
      endTime: Date.now() + (duration * 1000)
    };

    // Chance to fully freeze (stun)
    if (Math.random() < freezeChance) {
      if (!window.mobStunEffects) window.mobStunEffects = {};
      window.mobStunEffects[mobId] = Date.now() + 2000; // 2 sec stun
    }

    // Clear effect after duration
    setTimeout(() => {
      if (window.mobSlowEffects) delete window.mobSlowEffects[mobId];
    }, duration * 1000);
  };

  // CHAIN LIGHTNING - Jump to nearby mobs
  const applyChainLightning = (startPos, excludeId, baseDamage, maxChains, range, damageReduction) => {
    if (!window.getAllMobs) return;

    const allMobs = window.getAllMobs();
    let currentDamage = baseDamage * damageReduction;
    let lastPos = startPos.clone ? startPos.clone() : new THREE.Vector3(startPos.x, startPos.y, startPos.z);
    const hitMobs = new Set([excludeId]);

    for (let i = 0; i < maxChains; i++) {
      // Find nearest mob not yet hit
      let nearestMob = null;
      let nearestDist = range;

      for (const mob of allMobs) {
        if (hitMobs.has(mob.id)) continue;

        const mobPos = new THREE.Vector3(mob.position[0], mob.position[1], mob.position[2]);
        const dist = lastPos.distanceTo(mobPos);

        if (dist < nearestDist) {
          nearestDist = dist;
          nearestMob = mob;
        }
      }

      if (nearestMob) {
        hitMobs.add(nearestMob.id);
        if (window.damageMob) {
          window.damageMob(nearestMob.id, Math.floor(currentDamage));
        }
        lastPos = new THREE.Vector3(nearestMob.position[0], nearestMob.position[1], nearestMob.position[2]);
        currentDamage *= (1 - damageReduction);
      } else {
        break; // No more targets in range
      }
    }
  };

  // Enhanced spell casting with visual effects and MANA SYSTEM
  useEffect(() => {
    window.castSpell = (spellType = 'fireball') => {
      const spell = SPELL_TYPES[spellType];
      const camera = window.gameCamera;

      if (!camera || !spell) return;

      // CHECK MANA COST
      const manaCost = SPELL_MANA_COSTS[spellType] || 15;
      if (window.useMana && !window.useMana(manaCost)) {
        return; // Don't cast if not enough mana
      }

      // SOUND EFFECTS - Multiple fallbacks
      if (window.playMagicCast) {
        window.playMagicCast();
      } else if (window.playAttack) {
        window.playAttack();
      } else if (window.playAttackSounds) {
        window.playAttackSounds();
      }

      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);

      const startPos = camera.position.clone().add(direction.clone().multiplyScalar(2));

      // Apply level-based damage multiplier
      const damageMultiplier = window.getSpellDamageMultiplier ? window.getSpellDamageMultiplier() : 1;
      const finalDamage = Math.floor(spell.damage * damageMultiplier);

      // Create projectile with unique ID
      const newProjectile = {
        id: projectileId.current++,
        type: spellType,
        position: startPos.clone(),
        velocity: direction.clone().multiplyScalar(spell.speed),
        ...spell,
        damage: finalDamage, // Use scaled damage
        age: 0,
        maxAge: 3000,
        trailPositions: [startPos.clone()],
        lastTrailUpdate: 0
      };

      // CRITICAL: Add to ref immediately for reliable rapid casting
      projectilesRef.current = [...projectilesRef.current, newProjectile];
      projectilesDirty.current = true;
      // Immediately sync state for this new projectile (so it renders on next frame)
      setProjectiles([...projectilesRef.current]);


      // Create initial spell trail from wand
      createSpellTrail(startPos, direction, spell);

      // Play spell casting sound
      if (window.playSpellCastSound) {
        window.playSpellCastSound(spellType);
      }

      // Grant XP for spell cast
      if (window.grantXP) {
        window.grantXP(3);
      }
    };
  }, [SPELL_TYPES]);

  // Create spell trail effect
  const createSpellTrail = (startPos, direction, spell) => {
    const trailPoints = [];
    for (let i = 0; i < spell.trailLength; i++) {
      const point = startPos.clone().add(
        direction.clone().multiplyScalar(i * 0.2)
      );
      trailPoints.push(point);
    }

    const newTrail = {
      id: trailId.current++,
      type: spell.effect,
      points: trailPoints,
      color: spell.trailColor,
      age: 0,
      maxAge: 1000
    };

    setSpellTrails(prev => [...prev, newTrail]);
  };

  // Create spell impact effect
  const createSpellImpact = (position, spellType) => {
    const spell = SPELL_TYPES[spellType];

    const newImpact = {
      id: impactId.current++,
      position: position.clone(),
      type: spellType,
      effect: spell.effect,
      color: spell.color,
      particleColor: spell.particleColor,
      particleCount: spell.particleCount,
      age: 0,
      maxAge: 2000
    };

    setSpellImpacts(prev => [...prev, newImpact]);

    // Play impact sound - Multiple fallbacks
    if (window.playMagicHit) {
      window.playMagicHit();
    } else if (window.playSpellImpactSound) {
      window.playSpellImpactSound(spellType);
    } else if (window.playHitSound) {
      window.playHitSound();
    }
  };

  // Update projectiles with enhanced effects
  useFrame((state, delta) => {
    const deltaMs = delta * 1000;
    const time = state.clock.elapsedTime;

    // Update projectiles using REF for reliability
    const updatedProjectiles = projectilesRef.current.map(projectile => {
      // Clone velocity to avoid mutation
      const velocity = projectile.velocity.clone();

      // Add gravity for fireball and iceball
      if (projectile.type === 'fireball' || projectile.type === 'iceball') {
        velocity.y -= 12 * delta;
      }

      // Update position using cloned velocity
      const newPos = projectile.position.clone().add(
        velocity.clone().multiplyScalar(delta)
      );

      const updatedProjectile = {
        ...projectile,
        position: newPos,
        velocity: velocity, // Store updated velocity
        age: projectile.age + deltaMs
      };

      // Add to trail every few frames
      if (time - projectile.lastTrailUpdate > 0.05) {
        updatedProjectile.trailPositions = [
          ...projectile.trailPositions.slice(-projectile.trailLength),
          newPos.clone()
        ];
        updatedProjectile.lastTrailUpdate = time;
      }

      return updatedProjectile;
    }).filter(projectile => {
      // Check for expiration
      if (projectile.age > projectile.maxAge) {
        createSpellImpact(projectile.position, projectile.type);
        return false;
      }

      // Check collision with terrain
      if (window.getMobGroundLevel) {
        const groundLevel = window.getMobGroundLevel(projectile.position.x, projectile.position.z);
        if (projectile.position.y <= groundLevel + 0.5) {
          createSpellImpact(projectile.position, projectile.type);
          return false;
        }
      } else if (projectile.position.y <= 12.5) {
        createSpellImpact(projectile.position, projectile.type);
        return false;
      }

      // Check collision with mobs
      if (window.checkMobCollision) {
        const hitMob = window.checkMobCollision(projectile.position, projectile.size + 1.5);
        if (hitMob) {
          const spellConfig = SPELL_TYPES[projectile.type];

          if (window.damageMob) {
            window.damageMob(hitMob.id, projectile.damage);
          }

          // APPLY SECONDARY EFFECTS
          if (spellConfig?.secondary) {
            const sec = spellConfig.secondary;

            switch (sec.type) {
              case 'burn':
                // Apply burn damage over time
                applyBurnEffect(hitMob.id, sec.duration, sec.damagePerSecond);
                break;

              case 'freeze':
                // Apply slow effect
                applyFreezeEffect(hitMob.id, sec.duration, sec.slowPercent, sec.freezeChance);
                break;

              case 'chain':
                // Chain lightning to nearby mobs
                applyChainLightning(
                  projectile.position,
                  hitMob.id,
                  projectile.damage,
                  sec.maxChains,
                  sec.chainRange,
                  sec.chainDamageReduction
                );
                break;

              case 'pierce':
                // Heal player
                const healAmount = Math.floor(projectile.damage * sec.lifestealPercent / 100);
                if (window.healPlayer) window.healPlayer(healAmount);
                // Pierce continues (don't remove projectile)
                projectile.pierceCount = (projectile.pierceCount || 0) + 1;
                if (projectile.pierceCount < sec.pierceCount) {
                  return true; // Continue through mob
                }
                break;
            }
          }

          createSpellImpact(projectile.position, projectile.type);

          // Grant XP for hit
          if (window.grantXP) window.grantXP(5);

          return false;
        }
      }

      return true;
    });

    // Sync ref always
    projectilesRef.current = updatedProjectiles;

    // Throttle React state sync: only every 2 frames OR when dirty (new projectile added/removed)
    frameCounter.current++;
    const lengthChanged = updatedProjectiles.length !== projectiles.length;
    if (frameCounter.current % 2 === 0 || projectilesDirty.current || lengthChanged) {
      setProjectiles([...updatedProjectiles]);
      projectilesDirty.current = false;
    }

    // Update spell trails (throttled)
    if (frameCounter.current % 2 === 0) {
      setSpellTrails(prev => {
        const updated = prev.map(trail => ({
          ...trail,
          age: trail.age + deltaMs * 2 // Compensate for skipped frames
        })).filter(trail => trail.age < trail.maxAge);
        return updated.length !== prev.length || updated.length > 0 ? updated : prev;
      });

      // Update spell impacts
      setSpellImpacts(prev => {
        const updated = prev.map(impact => ({
          ...impact,
          age: impact.age + deltaMs * 2 // Compensate for skipped frames
        })).filter(impact => impact.age < impact.maxAge);
        return updated.length !== prev.length || updated.length > 0 ? updated : prev;
      });
    }
  });

  return (
    <group>
      {/* Render projectiles with enhanced visuals */}
      {projectiles.map(projectile => (
        <EnhancedSpellProjectile key={projectile.id} projectile={projectile} />
      ))}

      {/* Render spell trails */}
      {spellTrails.map(trail => (
        <SpellTrail key={trail.id} trail={trail} />
      ))}

      {/* Render spell impacts */}
      {spellImpacts.map(impact => (
        <SpellImpact key={impact.id} impact={impact} />
      ))}
    </group>
  );
};

// Enhanced Spell Projectile with authentic effects
const EnhancedSpellProjectile = ({ projectile }) => {
  const meshRef = useRef();
  const particlesRef = useRef();

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.position.copy(projectile.position);

      // Spell-specific animations
      switch (projectile.type) {
        case 'fireball':
          meshRef.current.rotation.x += 0.15;
          meshRef.current.rotation.z += 0.1;
          const firePulse = 1 + Math.sin(state.clock.elapsedTime * 8) * 0.3;
          meshRef.current.scale.setScalar(firePulse);
          break;

        case 'iceball':
          meshRef.current.rotation.y += 0.1;
          const icePulse = 1 + Math.sin(state.clock.elapsedTime * 6) * 0.2;
          meshRef.current.scale.setScalar(icePulse);
          break;

        case 'lightning':
          const lightningFlicker = 0.8 + Math.random() * 0.4;
          meshRef.current.scale.setScalar(lightningFlicker);
          break;

        case 'arcane':
          meshRef.current.rotation.x += 0.2;
          meshRef.current.rotation.y += 0.15;
          const arcanePulse = 1 + Math.sin(state.clock.elapsedTime * 10) * 0.25;
          meshRef.current.scale.setScalar(arcanePulse);
          break;
      }
    }

    // Animate trailing particles
    if (particlesRef.current) {
      particlesRef.current.children.forEach((particle, index) => {
        const trailPos = projectile.trailPositions[Math.max(0, projectile.trailPositions.length - 1 - index)];
        if (trailPos) {
          particle.position.copy(trailPos);
          particle.scale.setScalar(Math.max(0.1, 1 - (index / projectile.trailPositions.length)));
        }
      });
    }
  });

  return (
    <group>
      {/* Main projectile */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[projectile.size, 8, 8]} />
        <meshBasicMaterial
          color={projectile.color}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Trailing particles */}
      <group ref={particlesRef}>
        {projectile.trailPositions.slice(-projectile.particleCount).map((_, index) => (
          <mesh key={index}>
            <sphereGeometry args={[projectile.size * 0.3, 4, 4]} />
            <meshBasicMaterial
              color={projectile.particleColor}
              transparent
              opacity={0.6}
            />
          </mesh>
        ))}
      </group>

      {/* Spell-specific effects */}
      {projectile.type === 'fireball' && (
        <FireballAura projectile={projectile} />
      )}

      {projectile.type === 'lightning' && (
        <LightningEffect projectile={projectile} />
      )}
    </group>
  );
};

// Fireball Aura Effect
const FireballAura = ({ projectile }) => {
  const auraRef = useRef();

  useFrame((state) => {
    if (auraRef.current) {
      auraRef.current.position.copy(projectile.position);
      const intensity = 0.5 + Math.sin(state.clock.elapsedTime * 12) * 0.3;
      auraRef.current.scale.setScalar(intensity);
    }
  });

  return (
    <mesh ref={auraRef}>
      <sphereGeometry args={[projectile.size * 1.5, 8, 8]} />
      <meshBasicMaterial
        color="#FF4500"
        transparent
        opacity={0.3}
      />
    </mesh>
  );
};

// Lightning Effect
const LightningEffect = ({ projectile }) => {
  const lightningRef = useRef();

  useFrame((state) => {
    if (lightningRef.current) {
      lightningRef.current.position.copy(projectile.position);
      lightningRef.current.visible = Math.random() > 0.3; // Flickering effect
    }
  });

  return (
    <group ref={lightningRef}>
      {/* Lightning bolts */}
      {[...Array(3)].map((_, i) => (
        <mesh key={i} rotation={[0, (i * Math.PI * 2) / 3, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 1, 4]} />
          <meshBasicMaterial
            color="#FFFF00"
            transparent
            opacity={0.8}
          />
        </mesh>
      ))}
    </group>
  );
};

// Spell Trail Component
const SpellTrail = ({ trail }) => {
  const trailRef = useRef();

  useFrame(() => {
    if (trailRef.current) {
      const opacity = Math.max(0, 1 - (trail.age / trail.maxAge));
      trailRef.current.material.opacity = opacity * 0.6;
    }
  });

  return (
    <group>
      {trail.points.map((point, index) => (
        <mesh key={index} position={point} ref={index === 0 ? trailRef : null}>
          <sphereGeometry args={[0.05 * (1 - index / trail.points.length), 4, 4]} />
          <meshBasicMaterial
            color={trail.color}
            transparent
            opacity={0.6}
          />
        </mesh>
      ))}
    </group>
  );
};

// Spell Impact Effect
const SpellImpact = ({ impact }) => {
  const impactRef = useRef();

  useFrame((state) => {
    if (impactRef.current) {
      const progress = impact.age / impact.maxAge;
      const scale = 1 + progress * 2;
      const opacity = Math.max(0, 1 - progress);

      impactRef.current.scale.setScalar(scale);
      impactRef.current.material.opacity = opacity;

      impactRef.current.rotation.y += 0.1;
    }
  });

  return (
    <group position={impact.position}>
      {/* Main impact explosion */}
      <mesh ref={impactRef}>
        <sphereGeometry args={[0.5, 8, 8]} />
        <meshBasicMaterial
          color={impact.color}
          transparent
          opacity={0.8}
        />
      </mesh>

      {/* Impact particles */}
      {[...Array(impact.particleCount)].map((_, i) => (
        <ImpactParticle
          key={i}
          impact={impact}
          index={i}
          total={impact.particleCount}
        />
      ))}

      {/* Spell-specific impact effects */}
      {impact.type === 'fireball' && <FireImpactEffect impact={impact} />}
      {impact.type === 'iceball' && <IceImpactEffect impact={impact} />}
      {impact.type === 'lightning' && <LightningImpactEffect impact={impact} />}
      {impact.type === 'arcane' && <ArcaneImpactEffect impact={impact} />}
    </group>
  );
};

// Impact Particle
const ImpactParticle = ({ impact, index, total }) => {
  const particleRef = useRef();
  const angle = (index / total) * Math.PI * 2;
  const distance = 1 + Math.random();

  useFrame(() => {
    if (particleRef.current) {
      const progress = impact.age / impact.maxAge;
      const x = Math.cos(angle) * distance * progress;
      const z = Math.sin(angle) * distance * progress;
      const y = Math.sin(progress * Math.PI) * 0.5;

      particleRef.current.position.set(x, y, z);
      particleRef.current.scale.setScalar(Math.max(0, 1 - progress));
    }
  });

  return (
    <mesh ref={particleRef}>
      <sphereGeometry args={[0.1, 4, 4]} />
      <meshBasicMaterial
        color={impact.particleColor}
        transparent
        opacity={0.7}
      />
    </mesh>
  );
};

// Fire Impact Effect
const FireImpactEffect = ({ impact }) => {
  const fireRef = useRef();

  useFrame((state) => {
    if (fireRef.current) {
      const flicker = 0.8 + Math.sin(state.clock.elapsedTime * 15) * 0.2;
      fireRef.current.scale.setScalar(flicker);
    }
  });

  return (
    <mesh ref={fireRef} position={[0, 0.3, 0]}>
      <cylinderGeometry args={[0.3, 0.1, 0.6, 6]} />
      <meshBasicMaterial
        color="#FF4500"
        transparent
        opacity={0.6}
      />
    </mesh>
  );
};

// Ice Impact Effect
const IceImpactEffect = ({ impact }) => {
  return (
    <group>
      {[...Array(6)].map((_, i) => (
        <mesh
          key={i}
          position={[
            Math.cos((i / 6) * Math.PI * 2) * 0.5,
            0,
            Math.sin((i / 6) * Math.PI * 2) * 0.5
          ]}
          rotation={[0, (i / 6) * Math.PI * 2, 0]}
        >
          <coneGeometry args={[0.1, 0.4, 4]} />
          <meshBasicMaterial
            color="#87CEEB"
            transparent
            opacity={0.8}
          />
        </mesh>
      ))}
    </group>
  );
};

// Lightning Impact Effect
const LightningImpactEffect = ({ impact }) => {
  const lightningRef = useRef();

  useFrame(() => {
    if (lightningRef.current) {
      lightningRef.current.visible = Math.random() > 0.5;
    }
  });

  return (
    <mesh ref={lightningRef} position={[0, 0.5, 0]}>
      <cylinderGeometry args={[0.05, 0.05, 1, 4]} />
      <meshBasicMaterial
        color="#FFFF00"
        transparent
        opacity={0.9}
      />
    </mesh>
  );
};

// Arcane Impact Effect
const ArcaneImpactEffect = ({ impact }) => {
  const arcaneRef = useRef();

  useFrame((state) => {
    if (arcaneRef.current) {
      arcaneRef.current.rotation.y += 0.15;
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 8) * 0.3;
      arcaneRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <mesh ref={arcaneRef}>
      <torusGeometry args={[0.4, 0.1, 6, 8]} />
      <meshBasicMaterial
        color="#9932CC"
        transparent
        opacity={0.7}
      />
    </mesh>
  );
};

// Enhanced Magic Wand with glowing effects
export const MagicWand = ({ wandType = 'fireball', position = [0, 0, 0], rotation = [0, 0, 0] }) => {
  const wandRef = useRef();
  const gemRef = useRef();

  const WAND_CONFIGS = {
    fireball: {
      handleColor: '#8B4513',
      tipColor: '#FF4500',
      gemColor: '#FF6347',
      auraColor: '#FFD700'
    },
    iceball: {
      handleColor: '#4169E1',
      tipColor: '#00BFFF',
      gemColor: '#87CEEB',
      auraColor: '#E0FFFF'
    },
    lightning: {
      handleColor: '#FFD700',
      tipColor: '#FFFF00',
      gemColor: '#FFFFE0',
      auraColor: '#FFFACD'
    },
    arcane: {
      handleColor: '#9932CC',
      tipColor: '#DA70D6',
      gemColor: '#DDA0DD',
      auraColor: '#E6E6FA'
    }
  };

  const config = WAND_CONFIGS[wandType] || WAND_CONFIGS.fireball;

  useFrame((state) => {
    if (wandRef.current) {
      const idle = Math.sin(state.clock.elapsedTime * 2) * 0.05;
      wandRef.current.rotation.z = idle;
    }

    if (gemRef.current) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.2;
      gemRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <group ref={wandRef} position={position} rotation={rotation}>
      {/* Enhanced wand handle */}
      <mesh position={[0, -0.4, 0]}>
        <cylinderGeometry args={[0.03, 0.05, 0.8, 8]} />
        <meshLambertMaterial color={config.handleColor} />
      </mesh>

      {/* Enhanced wand tip */}
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.02, 0.04, 0.3, 8]} />
        <meshLambertMaterial color={config.tipColor} />
      </mesh>

      {/* Glowing magic gem */}
      <mesh ref={gemRef} position={[0, 0.3, 0]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshBasicMaterial
          color={config.gemColor}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Magic aura around gem */}
      <mesh position={[0, 0.3, 0]}>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshBasicMaterial
          color={config.auraColor}
          transparent
          opacity={0.3}
        />
      </mesh>
    </group>
  );
};

export default EnhancedMagicSystem;