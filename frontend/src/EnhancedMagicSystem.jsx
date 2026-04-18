import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { GameMethods } from './GameMethods';
import { useGameStore } from './store/useGameStore';
import { SPELL_MANA_COSTS } from './GameSystems';
import * as THREE from 'three';

export const EnhancedMagicSystem = React.memo(({ playerPosition }) => {
  const gameState = useGameStore();
  const [projectiles, setProjectiles] = useState([]);
  const [spellTrails, setSpellTrails] = useState([]);
  const [spellImpacts, setSpellImpacts] = useState([]);
  const [debuffs, setDebuffs] = useState([]);
  const projectileId = useRef(0);
  const trailId = useRef(0);
  const impactId = useRef(0);
  const debuffId = useRef(0);

  const projectilesRef = useRef([]);
  const frameCounter = useRef(0);
  const projectilesDirty = useRef(false);

  const SPELL_TYPES = useMemo(() => ({
    fireball: {
      color: '#FF4500',
      trailColor: '#FF6347',
      particleColor: '#FFD700',
      glowColor: '#FF6600',
      speed: 25,
      size: 1.2,
      damage: 50,
      trailLength: 25,
      particleCount: 15,
      effect: 'fire',
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
      size: 1.0,
      damage: 40,
      trailLength: 20,
      particleCount: 12,
      effect: 'ice',
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
      speed: 60,
      size: 0.8,
      damage: 75,
      trailLength: 30,
      particleCount: 20,
      effect: 'lightning',
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
      size: 1.1,
      damage: 60,
      trailLength: 22,
      particleCount: 14,
      effect: 'arcane',
      secondary: {
        type: 'pierce',
        pierceCount: 3,
        lifestealPercent: 15,
        color: '#DA70D6'
      }
    }
  }), []);

  const applyBurnEffect = useCallback((mobId, duration, dps) => {
    let ticksRemaining = Math.floor(duration);
    const burnInterval = setInterval(() => {
      if (ticksRemaining <= 0 || !GameMethods.damageMob) {
        clearInterval(burnInterval);
        return;
      }
      const mob = GameMethods.damageMob(mobId, dps);
      if (!mob) {
        clearInterval(burnInterval);
        return;
      }
      ticksRemaining--;
    }, 1000);
  }, []);

  const applyFreezeEffect = useCallback((mobId, duration, slowPercent, freezeChance) => {
    useGameStore.setState(state => {
      const slowEffects = { ...(state.mobSlowEffects || {}) };
      slowEffects[mobId] = {
        slowMultiplier: 1 - (slowPercent / 100),
        endTime: Date.now() + (duration * 1000)
      };
      return { mobSlowEffects: slowEffects };
    });

    if (Math.random() < freezeChance) {
      useGameStore.setState(state => {
        const stunEffects = { ...(state.mobStunEffects || {}) };
        stunEffects[mobId] = Date.now() + 2000;
        return { mobStunEffects: stunEffects };
      });
    }

    setTimeout(() => {
      useGameStore.setState(state => {
        const slowEffects = { ...(state.mobSlowEffects || {}) };
        delete slowEffects[mobId];
        return { mobSlowEffects: slowEffects };
      });
    }, duration * 1000);
  }, []);

  const applyChainLightning = useCallback((startPos, excludeId, baseDamage, maxChains, range, damageReduction) => {
    const allMobs = useGameStore.getState().mobEntities;
    if (!allMobs) return;

    let currentDamage = baseDamage * damageReduction;
    let lastPos = startPos.clone ? startPos.clone() : new THREE.Vector3(startPos.x, startPos.y, startPos.z);
    const hitMobs = new Set([excludeId]);

    const maxPossibleRangeSq = (range * maxChains) ** 2;
    const nearbyMobs = allMobs.filter(mob => {
      const dx = mob.position[0] - lastPos.x;
      const dy = mob.position[1] - lastPos.y;
      const dz = mob.position[2] - lastPos.z;
      return (dx*dx + dy*dy + dz*dz) <= maxPossibleRangeSq;
    });

    for (let i = 0; i < maxChains; i++) {
      let nearestMob = null;
      let nearestDistSq = range * range;

      for (const mob of nearbyMobs) {
        if (hitMobs.has(mob.id)) continue;

        const dx = mob.position[0] - lastPos.x;
        const dy = mob.position[1] - lastPos.y;
        const dz = mob.position[2] - lastPos.z;
        const distSq = dx*dx + dy*dy + dz*dz;

        if (distSq < nearestDistSq) {
          nearestDistSq = distSq;
          nearestMob = mob;
        }
      }

      if (nearestMob) {
        hitMobs.add(nearestMob.id);
        if (GameMethods.damageMob) {
          GameMethods.damageMob(nearestMob.id, Math.floor(currentDamage));
        }
        lastPos = new THREE.Vector3(nearestMob.position[0], nearestMob.position[1], nearestMob.position[2]);
        currentDamage *= (1 - damageReduction);
      } else {
        break;
      }
    }
  }, []);

  const createSpellTrail = useCallback((startPos, direction, spell) => {
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

    setSpellTrails(prev => {
      const maxTrails = 20;
      const next = [...prev, newTrail];
      return next.length > maxTrails ? next.slice(next.length - maxTrails) : next;
    });
  }, []);

  const createSpellImpact = useCallback((position, spellType) => {
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

    if (window.playMagicHit) {
      window.playMagicHit();
    } else if (window.playSpellImpactSound) {
      window.playSpellImpactSound(spellType);
    } else if (useGameStore.getState().playHitSound) {
      useGameStore.getState().playHitSound();
    }
  }, [SPELL_TYPES]);

  useEffect(() => {
    useGameStore.setState({ castSpell: (spellType = 'fireball') => {
      const spell = SPELL_TYPES[spellType];
      const camera = useGameStore.getState().gameCamera;

      if (!camera || !spell) return;

      const manaCost = SPELL_MANA_COSTS[spellType] || 15;
      if (useGameStore.getState().useMana && !useGameStore.getState().useMana(manaCost)) {
        return;
      }

      if (window.playMagicCast) {
        window.playMagicCast();
      } else if (window.playAttack) {
        window.playAttack();
      } else if (useGameStore.getState().playAttackSounds) {
        useGameStore.getState().playAttackSounds();
      }

      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);

      const startPos = camera.position.clone().add(direction.clone().multiplyScalar(2));

      const damageMultiplier = window.getSpellDamageMultiplier ? window.getSpellDamageMultiplier() : 1;
      const finalDamage = Math.floor(spell.damage * damageMultiplier);

      const newProjectile = {
        id: projectileId.current++,
        type: spellType,
        position: startPos.clone(),
        velocity: direction.clone().multiplyScalar(spell.speed),
        ...spell,
        damage: finalDamage,
        age: 0,
        maxAge: 3000,
        trailPositions: [startPos.clone()],
        lastTrailUpdate: 0
      };

      projectilesRef.current.push(newProjectile);
      projectilesDirty.current = true;

      createSpellTrail(startPos, direction, spell);

      if (window.playSpellCastSound) {
        window.playSpellCastSound(spellType);
      }

      if (GameMethods.grantXP) {
        GameMethods.grantXP(3);
      }
    }});
  }, [SPELL_TYPES, createSpellTrail]);

  useFrame((state, delta) => {
    const deltaMs = delta * 1000;
    const time = state.clock.elapsedTime;

    let survivingProjectiles = [];

    for (let i = 0; i < projectilesRef.current.length; i++) {
      const projectile = projectilesRef.current[i];
      projectile.age += deltaMs;

      if (projectile.type === 'fireball' || projectile.type === 'iceball') {
        projectile.velocity.y -= 12 * delta;
      }

      projectile.position.x += projectile.velocity.x * delta;
      projectile.position.y += projectile.velocity.y * delta;
      projectile.position.z += projectile.velocity.z * delta;

      if (time - projectile.lastTrailUpdate > 0.05) {
        if (projectile.trailPositions.length >= projectile.trailLength) {
           const oldest = projectile.trailPositions.shift();
           oldest.copy(projectile.position);
           projectile.trailPositions.push(oldest);
        } else {
           projectile.trailPositions.push(projectile.position.clone());
        }
        projectile.lastTrailUpdate = time;
      }

      let keep = true;

      if (projectile.age > projectile.maxAge) {
        createSpellImpact(projectile.position, projectile.type);
        keep = false;
      } else {
        if (useGameStore.getState().getMobGroundLevel) {
          const groundLevel = useGameStore.getState().getMobGroundLevel(projectile.position.x, projectile.position.z);
          if (projectile.position.y <= groundLevel + 0.5) {
            createSpellImpact(projectile.position, projectile.type);
            keep = false;
          }
        } else if (projectile.position.y <= 12.5) {
          createSpellImpact(projectile.position, projectile.type);
          keep = false;
        }

        if (keep && GameMethods.checkMobCollision) {
          const hitMob = GameMethods.checkMobCollision(projectile.position, projectile.size + 1.5);
          if (hitMob) {
            const spellConfig = SPELL_TYPES[projectile.type];

            if (GameMethods.damageMob) {
              GameMethods.damageMob(hitMob.id, projectile.damage);
            }

            let willPierce = false;
            if (spellConfig?.secondary) {
              const sec = spellConfig.secondary;

              switch (sec.type) {
                case 'burn':
                  applyBurnEffect(hitMob.id, sec.duration, sec.damagePerSecond);
                  break;
                case 'freeze':
                  applyFreezeEffect(hitMob.id, sec.duration, sec.slowPercent, sec.freezeChance);
                  break;
                case 'chain':
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
                  const healAmount = Math.floor(projectile.damage * sec.lifestealPercent / 100);
                  if (useGameStore.getState().healPlayer) useGameStore.getState().healPlayer(healAmount);
                  projectile.pierceCount = (projectile.pierceCount || 0) + 1;
                  if (projectile.pierceCount < sec.pierceCount) {
                    willPierce = true;
                  }
                  break;
              }
            }

            if (!willPierce) {
              createSpellImpact(projectile.position, projectile.type);
              keep = false;
            }

            if (GameMethods.grantXP) GameMethods.grantXP(5);
          }
        }
      }

      if (keep) {
        survivingProjectiles.push(projectile);
      }
    }

    projectilesRef.current = survivingProjectiles;

    const lengthChanged = survivingProjectiles.length !== projectiles.length;
    if (projectilesDirty.current || lengthChanged) {
      setProjectiles([...survivingProjectiles]);
      projectilesDirty.current = false;
    }

    let trailsChanged = false;
    let impactsChanged = false;

    for (const trail of spellTrails) {
      trail.age += deltaMs;
      if (trail.age >= trail.maxAge) trailsChanged = true;
    }

    for (const impact of spellImpacts) {
      impact.age += deltaMs;
      if (impact.age >= impact.maxAge) impactsChanged = true;
    }

    if (trailsChanged) {
      setSpellTrails(prev => prev.filter(t => t.age < t.maxAge));
    }
    if (impactsChanged) {
      setSpellImpacts(prev => prev.filter(i => i.age < i.maxAge));
    }
  });

  return (
    <group>
      {projectiles.map(projectile => (
        <EnhancedSpellProjectile key={projectile.id} projectile={projectile} />
      ))}

      {spellTrails.map(trail => (
        <SpellTrail key={trail.id} trail={trail} />
      ))}

      {spellImpacts.map(impact => (
        <SpellImpact key={impact.id} impact={impact} />
      ))}
    </group>
  );
});

const EnhancedSpellProjectile = React.memo(({ projectile }) => {
  const meshRef = useRef();
  const particlesRef = useRef();

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.position.copy(projectile.position);

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
      <mesh ref={meshRef}>
        <sphereGeometry args={[projectile.size, 8, 8]} />
        <meshBasicMaterial
          color={projectile.color}
          transparent
          opacity={0.9}
        />
      </mesh>

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

      {projectile.type === 'fireball' && (
        <FireballAura projectile={projectile} />
      )}

      {projectile.type === 'lightning' && (
        <LightningEffect projectile={projectile} />
      )}
    </group>
  );
});

const FireballAura = React.memo(({ projectile }) => {
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
});

const LightningEffect = React.memo(({ projectile }) => {
  const lightningRef = useRef();

  useFrame((state) => {
    if (lightningRef.current) {
      lightningRef.current.position.copy(projectile.position);
      lightningRef.current.visible = Math.random() > 0.3;
    }
  });

  return (
    <group ref={lightningRef}>
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
});

const SpellTrail = React.memo(({ trail }) => {
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
});

const SpellImpact = React.memo(({ impact }) => {
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
      <mesh ref={impactRef}>
        <sphereGeometry args={[0.5, 8, 8]} />
        <meshBasicMaterial
          color={impact.color}
          transparent
          opacity={0.8}
        />
      </mesh>

      {[...Array(impact.particleCount)].map((_, i) => (
        <ImpactParticle
          key={i}
          impact={impact}
          index={i}
          total={impact.particleCount}
        />
      ))}

      {impact.type === 'fireball' && <FireImpactEffect impact={impact} />}
      {impact.type === 'iceball' && <IceImpactEffect impact={impact} />}
      {impact.type === 'lightning' && <LightningImpactEffect impact={impact} />}
      {impact.type === 'arcane' && <ArcaneImpactEffect impact={impact} />}
    </group>
  );
});

const ImpactParticle = React.memo(({ impact, index, total }) => {
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
});

const FireImpactEffect = React.memo(({ impact }) => {
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
});

const IceImpactEffect = React.memo(({ impact }) => {
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
});

const LightningImpactEffect = React.memo(({ impact }) => {
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
});

const ArcaneImpactEffect = React.memo(({ impact }) => {
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
});

export const MagicWand = React.memo(({ wandType = 'fireball', position = [0, 0, 0], rotation = [0, 0, 0] }) => {
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
      <mesh position={[0, -0.4, 0]}>
        <cylinderGeometry args={[0.03, 0.05, 0.8, 8]} />
        <meshLambertMaterial color={config.handleColor} />
      </mesh>

      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.02, 0.04, 0.3, 8]} />
        <meshLambertMaterial color={config.tipColor} />
      </mesh>

      <mesh ref={gemRef} position={[0, 0.3, 0]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshBasicMaterial
          color={config.gemColor}
          transparent
          opacity={0.9}
        />
      </mesh>

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
});
