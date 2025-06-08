import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// ENHANCED NPC System with DAY/NIGHT cycle and better spawning
export const NPCSystem = ({ gameState }) => {
  const [entities, setEntities] = useState([]);
  const { camera } = useThree();
  const [terrainReady, setTerrainReady] = useState(false);
  const [lastTimeOfDay, setLastTimeOfDay] = useState(true);

  // Wait for terrain to be ready, then spawn NPCs
  useEffect(() => {
    const checkTerrain = () => {
      if (window.getMobGroundLevel && window.checkCollision) {
        setTerrainReady(true);
        return true;
      }
      return false;
    };

    if (checkTerrain()) {
      return;
    }

    const interval = setInterval(() => {
      if (checkTerrain()) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Define drops for different mobs
  const getDrops = (type) => {
    switch(type) {
      case 'zombie': return ['flesh', 'iron'];
      case 'skeleton': return ['bone', 'arrow'];
      case 'creeper': return ['gunpowder'];
      case 'spider': return ['string', 'spider_eye'];
      case 'enderman': return ['ender_pearl'];
      case 'witch': return ['potion', 'sugar'];
      case 'pig': return ['pork'];
      case 'cow': return ['beef', 'leather'];
      case 'chicken': return ['feather', 'chicken'];
      case 'sheep': return ['wool', 'mutton'];
      case 'wolf': return ['bone'];
      default: return ['meat'];
    }
  };

  // Enhanced stats for better gameplay
  const getEntityStats = (type) => {
    switch(type) {
      case 'villager': return { health: 120, hostile: false, speed: 0.6 };
      case 'zombie': return { health: 80, hostile: true, speed: 0.8 };
      case 'skeleton': return { health: 70, hostile: true, speed: 0.9 };
      case 'creeper': return { health: 100, hostile: true, speed: 0.7 };
      case 'spider': return { health: 60, hostile: true, speed: 1.0 };
      case 'enderman': return { health: 150, hostile: true, speed: 1.2 };
      case 'witch': return { health: 90, hostile: true, speed: 0.8 };
      case 'wolf': return { health: 80, hostile: false, speed: 1.0 };
      default: return { health: 60, hostile: false, speed: 0.7 };
    }
  };

  // DAY/NIGHT mob variety - different mobs spawn based on time
  const getDayMobs = () => [
    'villager', 'pig', 'chicken', 'cow', 'sheep', 'wolf', // Peaceful day mobs
    'pig', 'chicken', 'cow', 'sheep', 'villager' // Extra peaceful for balance
  ];
  
  const getNightMobs = () => [
    'zombie', 'skeleton', 'creeper', 'spider', 'witch', 'enderman', // Hostile night mobs
    'zombie', 'skeleton', 'creeper', // Extra hostile for challenge
    'pig', 'chicken' // Few peaceful mobs remain at night
  ];

  // Spawn mobs based on day/night cycle
  useEffect(() => {
    if (!terrainReady) return;

    console.log(`🌅 Initializing ${gameState.isDay ? 'DAY' : 'NIGHT'} mob ecosystem...`);
    
    // ENHANCED spawn system - only spawn on generated terrain
    const spawnPositions = [];
    
    // Create smaller initial spawn area around player
    for (let x = -40; x <= 40; x += 10) {
      for (let z = -40; z <= 40; z += 10) {
        // Add random offset for natural distribution
        const offsetX = x + (Math.random() - 0.5) * 6;
        const offsetZ = z + (Math.random() - 0.5) * 6;
        
        if (Math.abs(offsetX) > 8 || Math.abs(offsetZ) > 8) { // Don't spawn too close to player
          spawnPositions.push({ x: offsetX, z: offsetZ });
        }
      }
    }

    // Choose mobs based on day/night cycle
    const entityTypes = gameState.isDay ? getDayMobs() : getNightMobs();

    const initialEntities = spawnPositions.map((pos, index) => {
      // ENHANCED ground level calculation - wait for terrain generation
      let groundY = 15; // Safe default
      let attempts = 0;
      
      // Try multiple times to get accurate ground level
      while (attempts < 3) {
        try {
          if (window.getMobGroundLevel) {
            const calculatedY = window.getMobGroundLevel(pos.x, pos.z);
            if (typeof calculatedY === 'number' && !isNaN(calculatedY) && calculatedY > 12) {
              groundY = calculatedY + 0.5; // Spawn just above ground
              break;
            }
          }
        } catch (error) {
          console.warn(`Attempt ${attempts + 1}: Error calculating ground for mob at ${pos.x}, ${pos.z}:`, error);
        }
        attempts++;
      }
      
      // SAFETY: Ensure reasonable spawn height
      groundY = Math.max(groundY, 13); // Never below 13
      groundY = Math.min(groundY, 20); // Never above 20
      
      const entityType = entityTypes[index % entityTypes.length];
      const stats = getEntityStats(entityType);
      
      console.log(`🐺 Spawning ${gameState.isDay ? 'DAY' : 'NIGHT'} ${entityType} at height ${groundY.toFixed(1)}`);
      
      return {
        id: `entity_${index}_${Date.now()}`,
        type: entityType,
        position: [pos.x, groundY, pos.z],
        health: stats.health,
        maxHealth: stats.health,
        hostile: stats.hostile,
        speed: stats.speed,
        initialPosition: [pos.x, groundY, pos.z],
        wanderRadius: stats.hostile ? 8 : 5,
        drops: getDrops(entityType),
        spawnTime: Date.now(),
        isNightMob: !gameState.isDay
      };
    });

    setEntities(initialEntities);
    setLastTimeOfDay(gameState.isDay);
    console.log(`✅ ${gameState.isDay ? 'DAY' : 'NIGHT'} ecosystem spawned: ${initialEntities.length} entities`);
  }, [terrainReady, gameState.isDay]); // Re-spawn when day/night changes
    
  // DISTRIBUTED RESPAWNING SYSTEM - spawns around player position
  useEffect(() => {
    if (!terrainReady) return;
    
    // Choose mobs based on day/night cycle
    const entityTypes = gameState.isDay ? getDayMobs() : getNightMobs();
    
    const respawnInterval = setInterval(() => {
      setEntities(currentEntities => {
        const targetMobCount = 30; // Balanced target
        
        if (currentEntities.length < targetMobCount) {
          const playerPos = camera?.position;
          if (!playerPos) return currentEntities;
          
          const mobsToSpawn = Math.min(6, targetMobCount - currentEntities.length);
          const newMobs = [];
          
          for (let i = 0; i < mobsToSpawn; i++) {
            // Spawn in multiple rings around player for better distribution
            const ring = Math.floor(Math.random() * 3); // 3 different rings
            const angle = Math.random() * Math.PI * 2;
            const distance = 30 + (ring * 20) + Math.random() * 15; // 30-80 blocks away
            
            const spawnX = Math.floor(playerPos.x + Math.cos(angle) * distance);
            const spawnZ = Math.floor(playerPos.z + Math.sin(angle) * distance);
            
            // FIXED spawn height calculation using separate mob function
            let spawnY = 15; // Safe default
            try {
              if (window.getMobGroundLevel) {
                const calculatedY = window.getMobGroundLevel(spawnX, spawnZ);
                if (typeof calculatedY === 'number' && !isNaN(calculatedY)) {
                  spawnY = calculatedY + 1.5; // Spawn above ground
                }
              }
            } catch (error) {
              console.warn(`Error calculating spawn height at ${spawnX}, ${spawnZ}:`, error);
            }
            
            // SAFETY: Ensure reasonable spawn height
            spawnY = Math.max(spawnY, 13);
            spawnY = Math.min(spawnY, 22);
            
            const entityType = entityTypes[Math.floor(Math.random() * entityTypes.length)];
            const stats = getEntityStats(entityType);
            
            newMobs.push({
              id: `entity_respawn_${Date.now()}_${i}`,
              type: entityType,
              position: [spawnX, spawnY, spawnZ],
              health: stats.health,
              maxHealth: stats.health,
              hostile: stats.hostile,
              speed: stats.speed,
              initialPosition: [spawnX, spawnY, spawnZ],
              wanderRadius: stats.hostile ? 10 : 6,
              drops: getDrops(entityType),
              spawnTime: Date.now()
            });
          }
          
          console.log(`🔄 Distributed respawn: ${newMobs.length} mobs across terrain (Total: ${currentEntities.length + newMobs.length})`);
          return [...currentEntities, ...newMobs];
        }
        return currentEntities;
      });
    }, 8000); // Spawn every 8 seconds

    return () => clearInterval(respawnInterval);
  }, [terrainReady, camera, gameState.isDay, getDayMobs, getNightMobs]);

  // ENHANCED attack function with VISUAL EFFECTS, SOUND EFFECTS and weapon display
  const attackEntity = (entityId) => {
    // PLAY ATTACK SOUNDS
    if (window.playAttackSounds) {
      window.playAttackSounds();
    }

    // Show weapon during attack with enhanced feedback
    if (window.setPlayerAttacking) {
      window.setPlayerAttacking(true);
      setTimeout(() => {
        window.setPlayerAttacking(false);
      }, 600);
    }

    setEntities(prev => prev.map(entity => {
      if (entity.id === entityId) {
        const damage = 25;
        const newHealth = Math.max(0, entity.health - damage);
        
        console.log(`⚔️ ATTACKING ${entity.type}! Health: ${newHealth}/${entity.maxHealth}`);
        
        // PLAY HIT SOUND
        if (window.playHitSound) {
          window.playHitSound();
        }
        
        // CREATE ATTACK VISUAL EFFECTS
        createAttackEffects(entity.position);
        
        // SPAWN DAMAGE NUMBER
        spawnDamageNumber(entity.position, damage);
        
        if (newHealth <= 0) {
          // PLAY DEFEAT SOUND
          if (window.playDefeatSound) {
            window.playDefeatSound();
          }
          
          // DEATH EFFECTS
          createDeathEffects(entity.position);
          
          // Drop items when mob dies
          if (entity.drops && gameState.addToInventory) {
            entity.drops.forEach(drop => {
              gameState.addToInventory(drop, 1);
            });
          }
          
          console.log(`💀 ${entity.type} DEFEATED! Dropped: ${entity.drops?.join(', ') || 'nothing'}`);
          return null; // Remove entity
        } else {
          // DAMAGE EFFECTS - Mark entity as recently damaged for visual feedback
          return { 
            ...entity, 
            health: newHealth, 
            lastDamageTime: Date.now(),
            isFlashing: true 
          };
        }
      }
      return entity;
    }).filter(Boolean));
  };

  // CREATE ATTACK VISUAL EFFECTS
  const createAttackEffects = (position) => {
    // Spark particles
    for (let i = 0; i < 8; i++) {
      const particle = document.createElement('div');
      particle.style.position = 'absolute';
      particle.style.width = '4px';
      particle.style.height = '4px';
      particle.style.backgroundColor = '#ffff00';
      particle.style.borderRadius = '50%';
      particle.style.pointerEvents = 'none';
      particle.style.zIndex = '1000';
      
      // Position relative to screen center (where crosshair is)
      particle.style.left = '50%';
      particle.style.top = '50%';
      particle.style.transform = 'translate(-50%, -50%)';
      
      document.body.appendChild(particle);
      
      // Animate particle
      const angle = (i / 8) * Math.PI * 2;
      const distance = 20 + Math.random() * 30;
      const endX = Math.cos(angle) * distance;
      const endY = Math.sin(angle) * distance;
      
      particle.animate([
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${endX}px), calc(-50% + ${endY}px)) scale(0)`, opacity: 0 }
      ], {
        duration: 400,
        easing: 'ease-out'
      }).onfinish = () => {
        document.body.removeChild(particle);
      };
    }
    
    // Flash effect
    const flash = document.createElement('div');
    flash.style.position = 'fixed';
    flash.style.top = '0';
    flash.style.left = '0';
    flash.style.width = '100%';
    flash.style.height = '100%';
    flash.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
    flash.style.pointerEvents = 'none';
    flash.style.zIndex = '999';
    
    document.body.appendChild(flash);
    
    flash.animate([
      { opacity: 1 },
      { opacity: 0 }
    ], {
      duration: 150,
      easing: 'ease-out'
    }).onfinish = () => {
      document.body.removeChild(flash);
    };
  };

  // SPAWN DAMAGE NUMBER
  const spawnDamageNumber = (position, damage) => {
    const damageText = document.createElement('div');
    damageText.textContent = `-${damage}`;
    damageText.style.position = 'absolute';
    damageText.style.color = '#ff4444';
    damageText.style.fontSize = '24px';
    damageText.style.fontWeight = 'bold';
    damageText.style.fontFamily = 'monospace';
    damageText.style.pointerEvents = 'none';
    damageText.style.zIndex = '1000';
    damageText.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
    
    // Position near center of screen with slight randomness
    damageText.style.left = `calc(50% + ${(Math.random() - 0.5) * 100}px)`;
    damageText.style.top = `calc(50% + ${(Math.random() - 0.5) * 100}px)`;
    damageText.style.transform = 'translate(-50%, -50%)';
    
    document.body.appendChild(damageText);
    
    // Animate damage number
    damageText.animate([
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      { transform: 'translate(-50%, -150%) scale(1.5)', opacity: 0 }
    ], {
      duration: 1000,
      easing: 'ease-out'
    }).onfinish = () => {
      document.body.removeChild(damageText);
    };
  };

  // CREATE DEATH EFFECTS
  const createDeathEffects = (position) => {
    // Multiple explosion particles
    for (let i = 0; i < 16; i++) {
      const particle = document.createElement('div');
      particle.style.position = 'absolute';
      particle.style.width = '6px';
      particle.style.height = '6px';
      particle.style.backgroundColor = '#ff6600';
      particle.style.borderRadius = '50%';
      particle.style.pointerEvents = 'none';
      particle.style.zIndex = '1000';
      
      particle.style.left = '50%';
      particle.style.top = '50%';
      particle.style.transform = 'translate(-50%, -50%)';
      
      document.body.appendChild(particle);
      
      const angle = (i / 16) * Math.PI * 2;
      const distance = 40 + Math.random() * 60;
      const endX = Math.cos(angle) * distance;
      const endY = Math.sin(angle) * distance;
      
      particle.animate([
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${endX}px), calc(-50% + ${endY}px)) scale(0)`, opacity: 0 }
      ], {
        duration: 800,
        easing: 'ease-out'
      }).onfinish = () => {
        document.body.removeChild(particle);
      };
    }
    
    // Screen shake effect
    const body = document.body;
    body.style.animation = 'none';
    body.offsetHeight; // Trigger reflow
    body.style.animation = 'shake 0.3s ease-in-out';
    
    setTimeout(() => {
      body.style.animation = '';
    }, 300);
  };

  useEffect(() => {
    window.attackEntity = attackEntity;
    
    // ENHANCED MOB COLLISION - COMPREHENSIVE DEBUG
    window.checkMobCollision = (position, size = 0.5) => {
      console.log(`🔍 checkMobCollision called: position=(${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)}), entities count: ${entities.length}`);
      
      for (const entity of entities) {
        if (entity.position) {
          const [ex, ey, ez] = entity.position;
          const distance = Math.sqrt(
            Math.pow(position.x - ex, 2) + 
            Math.pow(position.y - ey, 2) + 
            Math.pow(position.z - ez, 2)
          );
          // INCREASED collision radius for easier spell targeting
          const hitRadius = size + 8.0; // Much larger hit box for spells (was 2.5)
          
          console.log(`🔍 Entity ${entity.type} at (${ex.toFixed(1)}, ${ey.toFixed(1)}, ${ez.toFixed(1)}) - Distance: ${distance.toFixed(2)}, Required: ${hitRadius.toFixed(2)}`);
          
          if (distance <= hitRadius) {
            console.log(`🎯 SPELL COLLISION! Mob: ${entity.type}, Distance: ${distance.toFixed(2)}, Required: ${hitRadius.toFixed(2)}`);
            return entity; // Return hit entity
          }
        } else {
          console.log(`⚠️ Entity has no position:`, entity);
        }
      }
      console.log(`❌ No collision found with any of ${entities.length} entities`);
      return null;
    };
    
    // DAMAGE MOB from spells - COMPREHENSIVE DEBUG
    window.damageMob = (entityId, damage) => {
      console.log(`🔮 damageMob called! EntityID: ${entityId}, Damage: ${damage}`);
      
      // PLAY SPELL HIT SOUND
      if (window.playHitSound) {
        window.playHitSound();
      }
      
      setEntities(prev => {
        console.log(`🔍 Current entities before damage:`, prev.map(e => `${e.type}(${e.id})`));
        
        const newEntities = prev.map(entity => {
          if (entity.id === entityId) {
            console.log(`🎯 Found target entity: ${entity.type}, Current health: ${entity.health}`);
            const newHealth = Math.max(0, entity.health - damage);
            console.log(`💥 New health after damage: ${newHealth}`);
            
            // SPAWN DAMAGE NUMBER
            spawnDamageNumber(entity.position, damage);
            
            if (newHealth <= 0) {
              console.log(`💀 ENTITY KILLED! ${entity.type}`);
              // PLAY DEFEAT SOUND
              if (window.playDefeatSound) {
                window.playDefeatSound();
              }
              
              // DEATH EFFECTS
              createDeathEffects(entity.position);
              
              // Drop items when mob dies from spells
              if (entity.drops && gameState.addToInventory) {
                entity.drops.forEach(drop => {
                  gameState.addToInventory(drop, 1);
                });
              }
              
              // BONUS XP for kill
              if (window.addExperience) {
                window.addExperience(25, `Defeated ${entity.type}`);
                console.log(`⭐ +25 XP for defeating ${entity.type}`);
              }
              
              console.log(`💀 ${entity.type} DEFEATED BY SPELL! Dropped: ${entity.drops?.join(', ') || 'nothing'}`);
              return null; // Remove entity
            } else {
              console.log(`🩸 ${entity.type} damaged but alive, health: ${newHealth}`);
              // DAMAGE EFFECTS
              return { 
                ...entity, 
                health: newHealth, 
                lastDamageTime: Date.now(),
                isFlashing: true 
              };
            }
          }
          return entity;
        }).filter(Boolean);
        
        console.log(`🔍 Entities after damage:`, newEntities.map(e => `${e.type}(${e.id})`));
        return newEntities;
      });
    };
    
  }, [entities, gameState]);

  return (
    <group>
      {entities.map(entity => (
        <Entity 
          key={entity.id} 
          entity={entity} 
          gameState={gameState}
          camera={camera}
          onAttack={attackEntity}
        />
      ))}
    </group>
  );
};

const Entity = ({ entity, gameState, camera, onAttack }) => {
  const meshRef = useRef();
  const [isFlashing, setIsFlashing] = useState(false);

  // Handle damage flashing effect
  useEffect(() => {
    if (entity.lastDamageTime && Date.now() - entity.lastDamageTime < 500) {
      setIsFlashing(true);
      const flashTimer = setTimeout(() => {
        setIsFlashing(false);
      }, 500);
      return () => clearTimeout(flashTimer);
    }
  }, [entity.lastDamageTime]);

  // Enhanced AI movement with proper ground positioning
  useFrame((state, delta) => {
    if (!meshRef.current) return;

    const time = state.clock.elapsedTime;
    const [initX, initY, initZ] = entity.initialPosition;
    
    // Apply flashing effect by changing material opacity
    if (meshRef.current.children) {
      meshRef.current.children.forEach(child => {
        if (child.material) {
          if (isFlashing) {
            child.material.opacity = Math.sin(time * 20) * 0.3 + 0.7; // Rapid flashing
            child.material.transparent = true;
            child.material.color.setHex(0xff6666); // Reddish tint when damaged
          } else {
            child.material.opacity = 1;
            child.material.transparent = false;
            child.material.color.setHex(0xffffff); // Normal color
          }
        }
      });
    }
    
    // FIXED: Proper ground-based positioning using MOB-specific function
    let targetY = initY;
    try {
      if (window.getMobGroundLevel) {
        const groundLevel = window.getMobGroundLevel(meshRef.current.position.x, meshRef.current.position.z);
        if (typeof groundLevel === 'number' && !isNaN(groundLevel)) {
          targetY = groundLevel + 1.2; // Keep mobs above ground
        }
      }
    } catch (error) {
      console.warn('Error updating mob height:', error);
    }
    
    // SAFETY: Ensure reasonable height
    targetY = Math.max(targetY, 13);
    targetY = Math.min(targetY, 22);
    
    if (entity.type === 'villager') {
      // Villagers stay mostly still but on proper ground
      const offsetX = Math.sin(time * 0.1) * 0.3;
      const offsetZ = Math.cos(time * 0.1) * 0.3;
      
      const newX = initX + offsetX;
      const newZ = initZ + offsetZ;
      
      // COLLISION DETECTION for villagers
      let canMove = true;
      if (window.checkCollision) {
        canMove = !window.checkCollision(newX, targetY, newZ);
      }
      
      if (canMove) {
        meshRef.current.position.x = newX;
        meshRef.current.position.z = newZ;
      } else {
        meshRef.current.position.x = initX;
        meshRef.current.position.z = initZ;
      }
      meshRef.current.position.y = targetY;
      
    } else if (['pig', 'chicken', 'cow', 'sheep', 'wolf'].includes(entity.type)) {
      // Passive animals wander but stay on ground with collision detection
      const offsetX = Math.sin(time * 0.2 * entity.speed) * entity.wanderRadius;
      const offsetZ = Math.cos(time * 0.15 * entity.speed) * entity.wanderRadius;
      
      const newX = initX + offsetX;
      const newZ = initZ + offsetZ;
      
      // COLLISION DETECTION for animals
      let canMove = true;
      if (window.checkCollision) {
        canMove = !window.checkCollision(newX, targetY, newZ) && 
                  !window.checkCollision(newX, targetY + 0.5, newZ);
      }
      
      if (canMove) {
        meshRef.current.position.x = newX;
        meshRef.current.position.z = newZ;
      } else {
        // If blocked, try alternative movement
        const altOffsetX = Math.sin(time * 0.3 * entity.speed) * (entity.wanderRadius * 0.5);
        const altOffsetZ = Math.cos(time * 0.25 * entity.speed) * (entity.wanderRadius * 0.5);
        const altX = initX + altOffsetX;
        const altZ = initZ + altOffsetZ;
        
        if (!window.checkCollision || !window.checkCollision(altX, targetY, altZ)) {
          meshRef.current.position.x = altX;
          meshRef.current.position.z = altZ;
        } else {
          meshRef.current.position.x = initX;
          meshRef.current.position.z = initZ;
        }
      }
      meshRef.current.position.y = targetY;
      
    } else if (entity.hostile) {
      // Hostile mobs move toward player but stay on ground with collision detection
      const playerPos = camera.position;
      const entityPos = new THREE.Vector3(initX, targetY, initZ);
      const distance = playerPos.distanceTo(entityPos);
      
      if (distance < 20) {
        const direction = new THREE.Vector3()
          .subVectors(playerPos, entityPos)
          .normalize();
        
        const moveDistance = entity.speed * Math.sin(time * 0.5) * 4;
        const newX = initX + direction.x * moveDistance;
        const newZ = initZ + direction.z * moveDistance;
        
        // COLLISION DETECTION for hostile mobs
        let canMove = true;
        if (window.checkCollision) {
          canMove = !window.checkCollision(newX, targetY, newZ) && 
                    !window.checkCollision(newX, targetY + 0.5, newZ);
        }
        
        if (canMove) {
          meshRef.current.position.x = newX;
          meshRef.current.position.z = newZ;
        } else {
          // Try to move around obstacle
          const sideDirection = new THREE.Vector3(-direction.z, 0, direction.x);
          const sideX = initX + sideDirection.x * moveDistance * 0.5;
          const sideZ = initZ + sideDirection.z * moveDistance * 0.5;
          
          if (!window.checkCollision || !window.checkCollision(sideX, targetY, sideZ)) {
            meshRef.current.position.x = sideX;
            meshRef.current.position.z = sideZ;
          } else {
            meshRef.current.position.x = initX;
            meshRef.current.position.z = initZ;
          }
        }
        meshRef.current.position.y = targetY;
      } else {
        // Wander when player is far with collision detection
        const offsetX = Math.sin(time * 0.3) * 2;
        const offsetZ = Math.cos(time * 0.3) * 2;
        const newX = initX + offsetX;
        const newZ = initZ + offsetZ;
        
        let canMove = true;
        if (window.checkCollision) {
          canMove = !window.checkCollision(newX, targetY, newZ);
        }
        
        if (canMove) {
          meshRef.current.position.x = newX;
          meshRef.current.position.z = newZ;
        } else {
          meshRef.current.position.x = initX;
          meshRef.current.position.z = initZ;
        }
        meshRef.current.position.y = targetY;
      }
    }
  });

  const handleClick = (event) => {
    event.stopPropagation();
    
    if (event.shiftKey) {
      console.log(`🗡️ ATTACKING ${entity.type}!`);
      onAttack(entity.id);
    } else {
      console.log(`👋 Interacting with ${entity.type}!`);
      if (entity.type === 'villager') {
        console.log('💬 "Welcome, traveler!"');
        gameState.setShowTradingInterface(true);
        gameState.setSelectedVillager(entity);
      }
    }
  };

  return (
    <group>
      <mesh 
        ref={meshRef} 
        position={entity.position}
        onClick={handleClick}
      >
        {entity.type === 'villager' && <VillagerModel />}
        {entity.type === 'pig' && <PigModel />}
        {entity.type === 'chicken' && <ChickenModel />}
        {entity.type === 'cow' && <CowModel />}
        {entity.type === 'sheep' && <SheepModel />}
        {entity.type === 'wolf' && <WolfModel />}
        {entity.type === 'zombie' && <ZombieModel />}
        {entity.type === 'skeleton' && <SkeletonModel />}
        {entity.type === 'creeper' && <CreeperModel />}
        {entity.type === 'spider' && <SpiderModel />}
        {entity.type === 'enderman' && <EndermanModel />}
        {entity.type === 'witch' && <WitchModel />}
      </mesh>
      
      {/* Enhanced health bar with damage indication - RESTORED */}
      {entity.health < entity.maxHealth && (
        <HealthBar 
          entity={entity} 
          position={[entity.position[0], entity.position[1] + 2.2, entity.position[2]]} 
          isFlashing={isFlashing}
        />
      )}
    </group>
  );
};

// Enhanced health bar with flashing damage indication
const HealthBar = ({ entity, position, isFlashing }) => {
  const healthPercent = entity.health / entity.maxHealth;
  const barColor = healthPercent > 0.6 ? '#00ff00' : healthPercent > 0.3 ? '#ffff00' : '#ff0000';
  const flashColor = isFlashing ? '#ffffff' : barColor;
  
  return (
    <group position={position}>
      {/* Background */}
      <mesh position={[0, 0, 0]}>
        <planeGeometry args={[1.8, 0.25]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
      {/* Health bar with flashing effect */}
      <mesh position={[-0.9 + (healthPercent * 0.9), 0, 0.01]} scale={[healthPercent, 1, 1]}>
        <planeGeometry args={[1.8, 0.25]} />
        <meshBasicMaterial color={flashColor} />
      </mesh>
      {/* Border */}
      <mesh position={[0, 0, 0.02]}>
        <planeGeometry args={[1.8, 0.25]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.3} />
      </mesh>
      {/* Damage indicator text */}
      {entity.health < entity.maxHealth && (
        <mesh position={[0, 0.4, 0]}>
          <planeGeometry args={[1.5, 0.2]} />
          <meshBasicMaterial color="transparent" />
        </mesh>
      )}
    </group>
  );
};

// Enhanced mob models
const VillagerModel = () => {
  return (
    <group>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.6, 1.2, 0.3]} />
        <meshLambertMaterial color="#8B4513" />
      </mesh>
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshLambertMaterial color="#FDBCB4" />
      </mesh>
      <mesh position={[-0.4, 0.3, 0]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshLambertMaterial color="#8B4513" />
      </mesh>
      <mesh position={[0.4, 0.3, 0]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshLambertMaterial color="#8B4513" />
      </mesh>
      <mesh position={[-0.2, -0.8, 0]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshLambertMaterial color="#654321" />
      </mesh>
      <mesh position={[0.2, -0.8, 0]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshLambertMaterial color="#654321" />
      </mesh>
      <mesh position={[0, 1.3, 0]}>
        <cylinderGeometry args={[0.3, 0.25, 0.1, 8]} />
        <meshLambertMaterial color="#228B22" />
      </mesh>
    </group>
  );
};

const CowModel = () => {
  return (
    <group scale={1.1}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.2, 0.8, 1.8]} />
        <meshLambertMaterial color="#000000" />
      </mesh>
      <mesh position={[0.1, 0.1, 0.2]}>
        <boxGeometry args={[0.3, 0.3, 0.3]} />
        <meshLambertMaterial color="#ffffff" />
      </mesh>
      <mesh position={[-0.2, 0, -0.3]}>
        <boxGeometry args={[0.4, 0.4, 0.4]} />
        <meshLambertMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, 0.2, 1.2]}>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
        <meshLambertMaterial color="#000000" />
      </mesh>
      {[-0.4, 0.4].map((x, i) => 
        [0.7, -0.7].map((z, j) => (
          <mesh key={`${i}-${j}`} position={[x, -0.7, z]}>
            <boxGeometry args={[0.3, 0.6, 0.3]} />
            <meshLambertMaterial color="#000000" />
          </mesh>
        ))
      )}
    </group>
  );
};

const SheepModel = () => {
  return (
    <group scale={0.9}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.0, 0.7, 1.4]} />
        <meshLambertMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, 0.1, 0.8]}>
        <boxGeometry args={[0.6, 0.6, 0.6]} />
        <meshLambertMaterial color="#000000" />
      </mesh>
      {[-0.3, 0.3].map((x, i) => 
        [0.5, -0.5].map((z, j) => (
          <mesh key={`${i}-${j}`} position={[x, -0.6, z]}>
            <boxGeometry args={[0.25, 0.5, 0.25]} />
            <meshLambertMaterial color="#000000" />
          </mesh>
        ))
      )}
    </group>
  );
};

const WolfModel = () => {
  return (
    <group scale={0.8}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.8, 0.6, 1.2]} />
        <meshLambertMaterial color="#808080" />
      </mesh>
      <mesh position={[0, 0.1, 0.7]}>
        <boxGeometry args={[0.5, 0.5, 0.6]} />
        <meshLambertMaterial color="#808080" />
      </mesh>
      <mesh position={[0, 0, 1.0]}>
        <boxGeometry args={[0.2, 0.2, 0.3]} />
        <meshLambertMaterial color="#000000" />
      </mesh>
      <mesh position={[0, 0.6, -0.4]}>
        <boxGeometry args={[0.1, 0.3, 0.1]} />
        <meshLambertMaterial color="#808080" />
      </mesh>
      {[-0.25, 0.25].map((x, i) => 
        [0.4, -0.4].map((z, j) => (
          <mesh key={`${i}-${j}`} position={[x, -0.5, z]}>
            <boxGeometry args={[0.2, 0.4, 0.2]} />
            <meshLambertMaterial color="#808080" />
          </mesh>
        ))
      )}
    </group>
  );
};

const SpiderModel = () => {
  return (
    <group scale={0.7}>
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.5, 8, 6]} />
        <meshLambertMaterial color="#000000" />
      </mesh>
      <mesh position={[0, 0.2, 0.4]}>
        <sphereGeometry args={[0.3, 8, 6]} />
        <meshLambertMaterial color="#800000" />
      </mesh>
      {[-0.6, -0.3, 0.3, 0.6].map((x, i) => (
        <mesh key={i} position={[x, -0.3, 0]} rotation={[0, 0, (i - 1.5) * 0.5]}>
          <boxGeometry args={[0.05, 0.8, 0.05]} />
          <meshLambertMaterial color="#000000" />
        </mesh>
      ))}
      {[-0.1, 0.1].map((x, i) => (
        <mesh key={i} position={[x, 0.3, 0.6]}>
          <sphereGeometry args={[0.05, 6, 4]} />
          <meshLambertMaterial color="#ff0000" />
        </mesh>
      ))}
    </group>
  );
};

const EndermanModel = () => {
  return (
    <group scale={1.3}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.4, 1.8, 0.4]} />
        <meshLambertMaterial color="#000000" />
      </mesh>
      <mesh position={[0, 1.2, 0]}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshLambertMaterial color="#000000" />
      </mesh>
      <mesh position={[-0.1, 1.3, 0.26]}>
        <boxGeometry args={[0.1, 0.1, 0.05]} />
        <meshLambertMaterial color="#ff00ff" />
      </mesh>
      <mesh position={[0.1, 1.3, 0.26]}>
        <boxGeometry args={[0.1, 0.1, 0.05]} />
        <meshLambertMaterial color="#ff00ff" />
      </mesh>
      <mesh position={[-0.6, 0.5, 0]}>
        <boxGeometry args={[0.3, 1.8, 0.3]} />
        <meshLambertMaterial color="#000000" />
      </mesh>
      <mesh position={[0.6, 0.5, 0]}>
        <boxGeometry args={[0.3, 1.8, 0.3]} />
        <meshLambertMaterial color="#000000" />
      </mesh>
      <mesh position={[-0.15, -1.2, 0]}>
        <boxGeometry args={[0.3, 0.6, 0.3]} />
        <meshLambertMaterial color="#000000" />
      </mesh>
      <mesh position={[0.15, -1.2, 0]}>
        <boxGeometry args={[0.3, 0.6, 0.3]} />
        <meshLambertMaterial color="#000000" />
      </mesh>
    </group>
  );
};

const WitchModel = () => {
  return (
    <group scale={1.05}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.6, 1.2, 0.3]} />
        <meshLambertMaterial color="#4B0082" />
      </mesh>
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshLambertMaterial color="#90EE90" />
      </mesh>
      <mesh position={[0, 0.9, 0.26]}>
        <boxGeometry args={[0.1, 0.2, 0.1]} />
        <meshLambertMaterial color="#654321" />
      </mesh>
      <mesh position={[0, 1.5, 0]}>
        <coneGeometry args={[0.4, 0.8, 6]} />
        <meshLambertMaterial color="#4B0082" />
      </mesh>
      <mesh position={[-0.4, 0.3, 0]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshLambertMaterial color="#4B0082" />
      </mesh>
      <mesh position={[0.4, 0.3, 0]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshLambertMaterial color="#4B0082" />
      </mesh>
      <mesh position={[0.5, 0.5, 0]}>
        <boxGeometry args={[0.1, 0.4, 0.1]} />
        <meshLambertMaterial color="#8B4513" />
      </mesh>
    </group>
  );
};

const PigModel = () => {
  return (
    <group scale={0.8}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1, 0.6, 1.2]} />
        <meshLambertMaterial color="#FFC0CB" />
      </mesh>
      <mesh position={[0, 0.1, 0.7]}>
        <boxGeometry args={[0.6, 0.5, 0.6]} />
        <meshLambertMaterial color="#FFC0CB" />
      </mesh>
      <mesh position={[0, -0.1, 1.0]}>
        <boxGeometry args={[0.3, 0.2, 0.2]} />
        <meshLambertMaterial color="#FFB6C1" />
      </mesh>
      {[-0.3, 0.3].map((x, i) => 
        [0.4, -0.4].map((z, j) => (
          <mesh key={`${i}-${j}`} position={[x, -0.5, z]}>
            <boxGeometry args={[0.2, 0.4, 0.2]} />
            <meshLambertMaterial color="#FFC0CB" />
          </mesh>
        ))
      )}
    </group>
  );
};

const ChickenModel = () => {
  return (
    <group scale={0.6}>
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.4, 8, 6]} />
        <meshLambertMaterial color="#FFFFFF" />
      </mesh>
      <mesh position={[0, 0.5, 0.3]}>
        <sphereGeometry args={[0.25, 8, 6]} />
        <meshLambertMaterial color="#FFFFFF" />
      </mesh>
      <mesh position={[0, 0.4, 0.5]}>
        <coneGeometry args={[0.1, 0.2, 4]} />
        <meshLambertMaterial color="#FF8C00" />
      </mesh>
      <mesh position={[0, 0.7, 0.3]}>
        <boxGeometry args={[0.1, 0.2, 0.1]} />
        <meshLambertMaterial color="#FF0000" />
      </mesh>
      {[-0.1, 0.1].map((x, i) => (
        <mesh key={i} position={[x, -0.5, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.3, 6]} />
          <meshLambertMaterial color="#FF8C00" />
        </mesh>
      ))}
    </group>
  );
};

const ZombieModel = () => {
  return (
    <group scale={1.1}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.6, 1.2, 0.3]} />
        <meshLambertMaterial color="#2F4F2F" />
      </mesh>
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshLambertMaterial color="#90EE90" />
      </mesh>
      <mesh position={[-0.1, 0.95, 0.26]}>
        <boxGeometry args={[0.05, 0.05, 0.05]} />
        <meshLambertMaterial color="#ff0000" />
      </mesh>
      <mesh position={[0.1, 0.95, 0.26]}>
        <boxGeometry args={[0.05, 0.05, 0.05]} />
        <meshLambertMaterial color="#ff0000" />
      </mesh>
      <mesh position={[-0.4, 0.3, 0]} rotation={[0, 0, 0.5]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshLambertMaterial color="#2F4F2F" />
      </mesh>
      <mesh position={[0.4, 0.3, 0]} rotation={[0, 0, -0.5]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshLambertMaterial color="#2F4F2F" />
      </mesh>
      <mesh position={[-0.2, -0.8, 0]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshLambertMaterial color="#654321" />
      </mesh>
      <mesh position={[0.2, -0.8, 0]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshLambertMaterial color="#654321" />
      </mesh>
    </group>
  );
};

const SkeletonModel = () => {
  return (
    <group scale={1.1}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.6, 1.2, 0.3]} />
        <meshLambertMaterial color="#F5F5DC" />
      </mesh>
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshLambertMaterial color="#F5F5DC" />
      </mesh>
      <mesh position={[-0.1, 0.95, 0.26]}>
        <boxGeometry args={[0.08, 0.08, 0.05]} />
        <meshLambertMaterial color="#000000" />
      </mesh>
      <mesh position={[0.1, 0.95, 0.26]}>
        <boxGeometry args={[0.08, 0.08, 0.05]} />
        <meshLambertMaterial color="#000000" />
      </mesh>
      <mesh position={[-0.4, 0.3, 0]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshLambertMaterial color="#F5F5DC" />
      </mesh>
      <mesh position={[0.4, 0.3, 0]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshLambertMaterial color="#F5F5DC" />
      </mesh>
      <mesh position={[0.6, 0.5, 0]}>
        <boxGeometry args={[0.1, 0.6, 0.1]} />
        <meshLambertMaterial color="#8B4513" />
      </mesh>
      <mesh position={[-0.2, -0.8, 0]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshLambertMaterial color="#F5F5DC" />
      </mesh>
      <mesh position={[0.2, -0.8, 0]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshLambertMaterial color="#F5F5DC" />
      </mesh>
    </group>
  );
};

const CreeperModel = () => {
  return (
    <group scale={1.1}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.6, 1.2, 0.6]} />
        <meshLambertMaterial color="#0F5132" />
      </mesh>
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshLambertMaterial color="#0F5132" />
      </mesh>
      <mesh position={[-0.1, 0.95, 0.26]}>
        <boxGeometry args={[0.05, 0.15, 0.05]} />
        <meshLambertMaterial color="#064420" />
      </mesh>
      <mesh position={[0.1, 0.95, 0.26]}>
        <boxGeometry args={[0.05, 0.15, 0.05]} />
        <meshLambertMaterial color="#064420" />
      </mesh>
      <mesh position={[0, 0.85, 0.26]}>
        <boxGeometry args={[0.08, 0.05, 0.05]} />
        <meshLambertMaterial color="#064420" />
      </mesh>
      <mesh position={[-0.15, -0.8, -0.15]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshLambertMaterial color="#0F5132" />
      </mesh>
      <mesh position={[0.15, -0.8, -0.15]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshLambertMaterial color="#0F5132" />
      </mesh>
      <mesh position={[-0.15, -0.8, 0.15]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshLambertMaterial color="#0F5132" />
      </mesh>
      <mesh position={[0.15, -0.8, 0.15]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshLambertMaterial color="#0F5132" />
      </mesh>
    </group>
  );
};

// Enhanced Combat Instructions
export const CombatInstructions = () => {
  return (
    <div className="absolute top-4 right-4 bg-black/90 text-white p-4 rounded-lg text-sm max-w-xs">
      <h3 className="font-bold mb-2 text-red-400">⚔️ Combat Controls:</h3>
      <ul className="space-y-1 text-xs">
        <li><strong className="text-yellow-400">Shift + Click:</strong> Attack mob (shows weapon!)</li>
        <li><strong className="text-green-400">Regular Click:</strong> Interact/Trade</li>
        <li><strong className="text-red-300">Hostile:</strong> Zombies, Skeletons, Creepers, Spiders, Endermen, Witches</li>
        <li><strong className="text-blue-300">Passive:</strong> Pigs, Chickens, Cows, Sheep, Wolves, Villagers</li>
        <li><span className="text-orange-300">💰 Mobs drop items when defeated!</span></li>
      </ul>
    </div>
  );
};

// Trading Interface
export const TradingInterface = ({ villager, onClose, gameState }) => {
  if (!villager) return null;

  return (
    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-40">
      <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-white">🏪 Trading Post</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">×</button>
        </div>
        
        <div className="mb-4">
          <p className="text-gray-300 italic">"Welcome, brave adventurer!"</p>
        </div>

        <div className="space-y-3">
          <div className="p-3 rounded border-2 border-green-500 bg-green-900/20">
            <div className="flex justify-between items-center">
              <div className="text-white">
                <span className="text-red-400">5 iron</span>
                <span className="mx-2 text-yellow-400">→</span>
                <span className="text-green-400">1 diamond</span>
              </div>
              <div className="text-sm text-gray-400">Stock: 3</div>
            </div>
          </div>
          
          <div className="p-3 rounded border-2 border-green-500 bg-green-900/20">
            <div className="flex justify-between items-center">
              <div className="text-white">
                <span className="text-red-400">10 wood</span>
                <span className="mx-2 text-yellow-400">→</span>
                <span className="text-green-400">2 gold</span>
              </div>
              <div className="text-sm text-gray-400">Stock: 5</div>
            </div>
          </div>
          
          <div className="p-3 rounded border-2 border-green-500 bg-green-900/20">
            <div className="flex justify-between items-center">
              <div className="text-white">
                <span className="text-red-400">3 string</span>
                <span className="mx-2 text-yellow-400">→</span>
                <span className="text-green-400">1 bow</span>
              </div>
              <div className="text-sm text-gray-400">Stock: 2</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
