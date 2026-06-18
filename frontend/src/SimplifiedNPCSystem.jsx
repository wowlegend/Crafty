import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGameStore } from './store/useGameStore';
import { useGameSounds } from './SoundManager';
import * as THREE from 'three';
import { World } from 'miniplex';
import { ecs, mobsQuery, alliesQuery } from './ecs/world';
import { convertMobToAlly } from './game/allegiance';
import { GameMethods } from './GameMethods';
import { isPointInCone } from './combat/cone.js';
import { isCaptureMode } from './devtest/captureMode';
import { siegeParams } from './game/dayNight.js';
import { zoneTier } from './world/zoneTier.js';
import { weightedPick } from './game/spawnWeights';
import { MOB_TYPES } from './game/mobTypes';
import { DamageNumber, ImpactShockwave } from './render/combatVfx';
import { XPOrbRender, LootDropRender, LootPopRender } from './render/pickupVfx';
import { DeathFxRender } from './render/deathVfx';
import { stepXPOrb, stepLootDrop } from './game/xpOrbStepper';
import { sparkFor, hitKnockback, deathBurst } from './game/mobHitFx';
import { stepEnemyProjectiles } from './game/enemyProjectiles.js';
import { getItemRarity } from './data/items.js';
import { rarityBeam } from './game/lootJuice.js';
import { emitMobKill } from './game/mobKillBus.js';
import { DEATH_DISSOLVE_MS } from './game/deathFx.js';
import { HITSTOP } from './game/trauma.js';
import { MobModel } from './render/MobModel';


const xpOrbsQuery = ecs.with('isXPOrb', 'position', 'amount');
const lootDropsQuery = ecs.with('isLootDrop', 'position', 'item', 'xp');

// Shared monotonic id for ECS-spawned pickups (loot drops + XP orbs). These are
// rendered with key={loot.id}/key={orb.id}; without a stamped id React threw the
// duplicate/undefined unique-key warning. One counter keeps both streams unique.
let _spawnId = 0;

const spawnLootDrop = (item, xp, pos) => {
  // Capture-determinism: in capture mode the LootSystem physics loop is frozen, so the
  // drop never moves -> a zero velocity keeps the drop pinned exactly at its spawn pos
  // (no reliance on Math.random in the capture path). Gameplay keeps the random pop arc.
  const capture = isCaptureMode();
  const angle = capture ? 0 : Math.random() * Math.PI * 2;
  const speed = capture ? 0 : 1.0 + Math.random() * 2.0;
  const vx = Math.cos(angle) * speed;
  const vy = capture ? 0 : 3 + Math.random() * 3; // vertical pop
  const vz = Math.sin(angle) * speed;

  const spawnPos = pos
    ? new THREE.Vector3(pos[0], pos[1] + 0.3, pos[2])
    : new THREE.Vector3(0, 15, 0);

  ecs.add({
    id: _spawnId++,
    isLootDrop: true,
    item,
    xp: xp || 0,
    position: spawnPos,
    velocity: new THREE.Vector3(vx, vy, vz),
    spawnTime: performance.now(),
    age: 0
  });
};
GameMethods.spawnLootDrop = spawnLootDrop;

// Custom miniplex React hook for compatibility
const useEntities = (query) => {
  const [entities, setEntities] = useState([...query.entities]);
  useEffect(() => {
    const update = () => setEntities([...query.entities]);
    const unsubAdded = query.onEntityAdded.subscribe(update);
    const unsubRemoved = query.onEntityRemoved.subscribe(update);
    return () => {
      unsubAdded();
      unsubRemoved();
    };
  }, [query]);
  return entities;
};

// S2-B2-pre-M2 perf: the AI worker bridge ticks at this rate, not render rate (see AIWorkerSystem).
const AI_TICK_SEC = 1 / 15;

// Enemy-presence audio: a single global cooldown so a whole siege turning aggro snarls ONCE, not 20x.
const AGGRO_GROWL_COOLDOWN_SEC = 2.5;
let _lastAggroGrowl = -Infinity;

// Mob Model Component with variety - PURE ECS RENDERER
// React.memo on the per-entity renderers (STATE-REVIEW-2026-06-10 #4 mitigation): the useEntities
// bridge re-renders NPCSystem on every entity add/remove; memo + stable miniplex entity refs
// confine that to the changed children — a kill burst (mob remove + N orb adds/removes) now
// reconciles only the changed keys instead of every mounted mob/orb/loot subtree. The full
// DEEPEN (transient query reads in useFrame, no bridge) stays tracked in the PRE-S2B audit.

// --- ECS SYSTEMS ---
const SpawnerSystem = () => {
  const { camera } = useThree();
  const lastSpawnCheck = useRef(0);
  const nextId = useRef(0);

  const spawnMob = (x, z, forceType = null, explicitY = null) => {
    const store = useGameStore.getState();
    let y = explicitY;
    if (y === null) {
      if (!store.getMobGroundLevel) return false;
      y = store.getMobGroundLevel(x, z);
      if (y === null || isNaN(y)) {
        return false;
      }
    }

    const mobTypeKeys = Object.keys(MOB_TYPES);
    let type = forceType;
    if (!type) {
      // M3b: at night the hostile-spawn bias ramps with nightCount (siegeParams);
      // day stays the calm baseline (this branch only fires when !store.isDay).
      // S7: the spawn point's distance zone-tier ADDS to the bias -> the frontier is more hostile far out.
      const nightHostileChance = siegeParams(store.nightCount, zoneTier(x, z)).hostileChance;
      // the mob-variety pass: WEIGHTED picks (a 220hp brute must not roll like a zombie)
      const entriesFor = (keys) => keys.map((k) => [k, MOB_TYPES[k].weight ?? 1]);
      if (!store.isDay && Math.random() < nightHostileChance) {
        const hostileTypes = mobTypeKeys.filter(k => !MOB_TYPES[k].passive);
        type = weightedPick(entriesFor(hostileTypes), Math.random());
      } else {
        type = weightedPick(entriesFor(mobTypeKeys), Math.random());
      }
    }
    const mobConfig = MOB_TYPES[type];

    ecs.add({
      isMob: true,
      id: nextId.current++,
      type,
      position: new THREE.Vector3(x, y + 0.5, z),
      color: mobConfig.color,
      health: mobConfig.health,
      maxHealth: mobConfig.health,
      speed: mobConfig.speed,
      passive: mobConfig.passive,
      damage: mobConfig.damage,
      xp: mobConfig.xp,
      // the mob-variety pass: registry legMode reaches the renderer (only hybrids carried it before)
      ...(mobConfig.legMode ? { legMode: mobConfig.legMode } : {}),
      targetX: x,
      targetZ: z,
      // Explicit-Y placement (visual-capture fixtures) faces the mob toward +Z so the
      // camera, posed on the +Z side, sees the front (eyes). Gameplay spawns stay random.
      rotation: explicitY !== null ? 0 : Math.random() * Math.PI * 2,
      moveTimer: Math.random() * 3,
      isMoving: false,
      isAggro: false,
      lastAttackTime: 0,
      knockback: null,
      lastHit: 0
    });
    return true;
  };

  useEffect(() => {
    useGameStore.setState({ spawnMob: spawnMob });
    const checkInterval = setInterval(() => {
      const state = useGameStore.getState();
      // Dev capture mode: suppress mob spawns so frames are byte-stable. No-op in gameplay.
      if (isCaptureMode()) { clearInterval(checkInterval); return; }
      if (state.getMobGroundLevel && state.getGeneratedChunks && state.getGeneratedChunks().size > 0 && state.isSpawnChunkLoaded) {
        for (let i = 0; i < 20; i++) {
          const angle = (i / 20) * Math.PI * 2;
          const distance = 30 + Math.random() * 20;
          const x = Math.cos(angle) * distance;
          const z = Math.sin(angle) * distance;
          spawnMob(x, z);
        }
        clearInterval(checkInterval);
      }
    }, 500);
    return () => {
      clearInterval(checkInterval);
      useGameStore.setState({ spawnMob: null });
    };
  }, []);

  useFrame((state, delta) => {
    if (!camera) return;
    const store = useGameStore.getState();
    const now = performance.now();

    if (now - lastSpawnCheck.current >= 1000) {
      lastSpawnCheck.current = now;
      const playerX = camera.position.x;
      const playerZ = camera.position.z;

      // Dynamic spawning based on loaded chunks.
      // Dev capture mode: suppress this per-frame spawner so capture frames are
      // byte-stable (otherwise mobs pop in at random chunk positions during the
      // capture settle window -> run-to-run jitter). Companion to the setInterval
      // spawner gate above. No-op in normal gameplay.
      if (!isCaptureMode() && store.getGeneratedChunks && store.getGeneratedChunks().size > 0) {
        const activeMobs = mobsQuery.entities.filter(e => e.health > 0).length;
        // M3b: the night siege raises the max-mob cap with nightCount (siegeParams);
        // day holds the calm baseline (siegeParams(0).maxMobs === DAY_MAX_MOBS).
        // S7: the player's distance zone-tier ADDS to the cap in BOTH day + night -> the frontier is
        // busier far from spawn even by day (zoneTier 0 near spawn = unchanged baseline).
        const pTier = zoneTier(playerX, playerZ);
        const maxMobs = store.isDay ? siegeParams(0, pTier).maxMobs : siegeParams(store.nightCount, pTier).maxMobs;
        if (activeMobs < maxMobs) {
          const mobsNeeded = maxMobs - activeMobs;
          const spawnCount = Math.min(mobsNeeded, 3); // Spawn up to 3 per tick to prevent spikes
          const loadedChunkKeys = Array.from(store.getGeneratedChunks());
          
          // Pre-filter chunks whose center distance to the player is in [20, 90]
          let candidateChunks = loadedChunkKeys.filter(key => {
            const [cx, cz] = key.split('_').map(Number);
            const centerX = cx * 16 + 8;
            const centerZ = cz * 16 + 8;
            const chunkDist = Math.sqrt((centerX - playerX) ** 2 + (centerZ - playerZ) ** 2);
            return chunkDist >= 20 && chunkDist <= 90;
          });
          
          if (candidateChunks.length === 0) {
            candidateChunks = loadedChunkKeys;
          }

          let spawnedThisTick = 0;
          let attempts = 0;
          const maxAttempts = 12;
          
          while (spawnedThisTick < spawnCount && attempts < maxAttempts) {
            const randomKey = candidateChunks[Math.floor(Math.random() * candidateChunks.length)];
            const [cx, cz] = randomKey.split('_').map(Number);
            const x = cx * 16 + Math.random() * 16;
            const z = cz * 16 + Math.random() * 16;
            const dist = Math.sqrt((x - playerX) ** 2 + (z - playerZ) ** 2);
            
            // Only spawn if not too close (avoid visible spawning) and not too far
            if (dist >= 28 && dist <= 85) {
              attempts++;
              const success = spawnMob(x, z);
              if (success) {
                spawnedThisTick++;
              }
            }
          }
        }
      }

      const maxDistance = 100;
      for (const entity of [...mobsQuery.entities]) {
        // M2 #7: a dissolving corpse -- remove it only AFTER the death dissolve has played out.
        if (entity.dyingUntil) {
          if (performance.now() >= entity.dyingUntil) ecs.remove(entity);
          continue;
        }
        if (entity.health <= 0) continue;
        const dist = Math.sqrt((entity.position.x - playerX)**2 + (entity.position.z - playerZ)**2);
        if (dist > maxDistance) {
          ecs.remove(entity);
        }
      }
    }
  });
  return null;
};

const AIWorkerSystem = () => {
  const tickAccumRef = useRef(0);
  const { camera } = useThree();
  const workerRef = useRef();

  useEffect(() => {
    workerRef.current = new Worker(new URL('./workers/ai.worker.js', import.meta.url));
    
    workerRef.current.onmessage = (e) => {
      const { type, updates, attacks } = e.data;
      if (type === 'TICK_RESULT') {
        const store = useGameStore.getState();
        
        // Handle attacks
        for (const attack of attacks) {
          if (attack.type === 'projectile') {
            // Phase 12: Archer System - Spawn Arrow
            if (store.spawnEnemyProjectile) {
              store.spawnEnemyProjectile(attack.position, [camera.position.x, camera.position.y, camera.position.z]);
            }
          } else if (attack.type === 'leap') {
            // Phase 12: Leap System - Physics Impulse
            const entity = mobsQuery.entities.find(ent => ent.id === attack.id);
            if (entity) {
                const dir = [
                    camera.position.x - entity.position.x,
                    8, // Vertical boost
                    camera.position.z - entity.position.z
                ];
                const mag = Math.sqrt(dir[0]*dir[0] + dir[2]*dir[2]);
                entity.knockback = [dir[0]/mag * 15, dir[1], dir[2]/mag * 15]; // Reuse knockback for leap
            }
          } else if (store.damagePlayer) {
            store.damagePlayer(attack.damage, attack.type, attack.position); // sourcePos -> directional hit cue
            
            // Phase 11: Spatial Attack Sound
            if (store.playSpatialSound) {
              store.playSpatialSound('attack', attack.position, 1.1, 15);
            }
          }
        }

        // Apply updates
        const entityMap = new Map();
        for (const entity of mobsQuery.entities) {
          if (entity.health <= 0) continue;
          entityMap.set(entity.id, entity);
        }

        for (const update of updates) {
          const entity = entityMap.get(update.id);
          if (entity && entity.health > 0) {
            entity.position.x = update.x;
            entity.position.z = update.z;
            entity.rotation = update.rotation;
            // AUDIO (enemy-presence split): the false->true aggro edge SNARLS spatially — you HEAR a
            // hostile notice you before it reaches you (global cooldown so a siege turn isn't a wall of growls).
            if (!entity.passive && !entity.isAggro && update.isAggro && store.playSpatialSound) {
              const nowS = performance.now() / 1000;
              if (nowS - _lastAggroGrowl > AGGRO_GROWL_COOLDOWN_SEC) {
                _lastAggroGrowl = nowS;
                store.playSpatialSound('aggroGrowl', [entity.position.x, entity.position.y, entity.position.z], 0.9, 22);
              }
            }
            entity.isAggro = update.isAggro;

            // Sync back worker state
            entity.isMoving = update.isMoving;
            entity.targetX = update.targetX;
            entity.targetZ = update.targetZ;
            entity.lastAttackTime = update.lastAttackTime;
            entity.windupUntil = update.windupUntil; // M2 #4: render reads this for the charge pose (slice 2)
            entity.moveTimer = update.moveTimer;
            entity.isCoverSeeking = update.isCoverSeeking;

            if (store.getMobGroundLevel) {
              const groundY = store.getMobGroundLevel(entity.position.x, entity.position.z);
              if (groundY !== null && !isNaN(groundY)) {
                entity.position.y = groundY + 0.5;
              }
            }
          }
        }
      }
    };

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  useFrame((state, delta) => {
    if (!camera || !workerRef.current) return;
    if (isCaptureMode()) return; // freeze mob AI/movement so capture frames are byte-stable
    const now = performance.now();

    // Process knockback in main thread
    for (const entity of mobsQuery.entities) {
      if (entity.health <= 0) continue;
      if (entity.knockback) {
        entity.position.x += entity.knockback[0] * delta * 4;
        entity.position.z += entity.knockback[2] * delta * 4;
        entity.knockback = null;
        entity.snapSync = true; // MobModel exact-copies this frame so the shove reads instant (not damped)
      }
    }

    // S2-B2-pre-M2 perf (STATE-REVIEW-2026-06-10 #3): the AI bridge ticks at 15Hz, not render
    // rate. The mobsData rebuild (~20 fields × N mobs), the structured-clone postMessage, the
    // 81-cell aggro heightGrids and the reply ground-snap raycasts all drop from 60-120Hz to 15Hz
    // (4-8× cut; 120Hz ProMotion iPads no longer pay double). MobModel's render-side damp keeps
    // 15Hz authority updates reading as smooth motion. The worker receives the ACCUMULATED
    // seconds since the last tick (movement-speed parity), clamped vs tab-stall spikes.
    // (Knockback above stays render-rate — instant hit feel.)
    tickAccumRef.current += delta;
    if (tickAccumRef.current < AI_TICK_SEC) return;
    const tickDelta = Math.min(tickAccumRef.current, 0.25);
    tickAccumRef.current = 0;

    const store = useGameStore.getState();
    const getMobGroundLevel = store.getMobGroundLevel;
    const mobsData = mobsQuery.entities.filter(e => e && e.health > 0).map(e => {
      let heightGrid = null;
      if (!e.passive && e.isAggro) {
        heightGrid = [];
        const startX = Math.round(e.position.x) - 4;
        const startZ = Math.round(e.position.z) - 4;
        if (getMobGroundLevel) {
          for (let gz = 0; gz < 9; gz++) {
            for (let gx = 0; gx < 9; gx++) {
              const worldX = startX + gx;
              const worldZ = startZ + gz;
              const h = getMobGroundLevel(worldX, worldZ);
              heightGrid.push((h === null || isNaN(h)) ? e.position.y : h);
            }
          }
        }
      }
      return {
        id: e.id,
        passive: e.passive,
        x: e.position.x,
        y: e.position.y,
        z: e.position.z,
        targetX: e.targetX,
        targetZ: e.targetZ,
        isMoving: e.isMoving,
        isAggro: e.isAggro,
        lastAttackTime: e.lastAttackTime,
        windupUntil: e.windupUntil || 0,
        damage: e.damage,
        type: e.type,
        moveTimer: e.moveTimer,
        speed: e.speed * (e.zoneSlowMult || 1), // S2-B4-M4: frozen zones slow (the ONE consumer — gate-locked)
        rotation: e.rotation,
        health: e.health,
        maxHealth: e.maxHealth,
        heightGrid: heightGrid
      };
    });

    workerRef.current.postMessage({
      type: 'TICK',
      playerPos: [camera.position.x, camera.position.y, camera.position.z],
      now,
      delta: tickDelta,
      mobs: mobsData
    });
  });

  return null;
};

const MinimapSyncSystem = () => {
  useFrame(() => {
    const now = performance.now();
    const store = useGameStore.getState();
    if (now - (store._lastMinimapUpdate || 0) > 250) {
      const activeMobs = mobsQuery.entities.filter(e => e && e.health > 0);
      store.setMobEntities(activeMobs.map(e => ({
        id: e.id, type: e.type, passive: e.passive, position: [e.position.x, e.position.y, e.position.z]
      })));
      const hostileCount = activeMobs.filter(e => !e.passive).length;
      useGameStore.setState({ 
        _lastMinimapUpdate: now,
        activeHostilesCount: hostileCount 
      });
    }
  });
  return null;
};

const CombatSystem = ({ setDamageNumbers, setShockwaves, damageId }) => {
  const { playHit } = useGameSounds();
  useEffect(() => {
    const damageMob = (id, damage = 25, type = 'physical', source = 'player') => {
      const entity = mobsQuery.entities.find(e => e.id === id);
      if (!entity) return null;

      // Phase 9 / S1-D-M1: Visceral Hitstop (micro-freeze for game feel).
      // Was a MAIN-THREAD BUSY-WAIT (a spin loop on the wall clock) that froze
      // the entire tab — rendering, audio, AND input — for 35ms. Replaced with a
      // non-blocking store flag: a `performance.now()` timestamp the player movement
      // loop reads to clamp its motion toward zero for the window. Same felt micro-
      // freeze, zero main-thread stall, and it benefits every damageMob caller
      // (melee AND spells). Shorter window (28ms) since it's now a true motion dip,
      // not a wall-clock stall stacked on top of frame time.
      // S2-B3-M1: hitstop is PLAYER feel — an ally's hit must not clamp the player's motion.
      // SOTA M1: weight-TIERED hitstop (was a flat 28ms that collapsed the light/heavy/crit hierarchy --
      // the audit's #1 game-feel gap). Tier by the incoming damage (matches the isCrit>=40 proxy below) +
      // scale by the global juiceIntensity dial.
      if (source === 'player') {
        const weight = damage >= 40 ? 'crit' : damage >= 30 ? 'heavy' : 'light';
        const ji = useGameStore.getState().juiceIntensity ?? 1;
        useGameStore.setState({ hitstopUntil: performance.now() + HITSTOP[weight] * ji });
      }

      const store = useGameStore.getState();

      // Hit direction (away-from-player, world unit) -- computed up-front so the camera shake, the
      // spark cone, AND the flinch tilt all share the SAME vector (pure pulls -> game/mobHitFx.js).
      const { knockback, hitDir } = hitKnockback(entity.position, store.gameCamera ? store.gameCamera.position : null);
      if (knockback) entity.knockback = knockback;
      entity.hitDirection = new THREE.Vector3(hitDir[0], hitDir[1], hitDir[2]);

      // NOTE (M5 review [B]): this is a MAGNITUDE proxy ("big hit -> bigger spray"), NOT the crit
      // source-of-truth (that's the real isCrit at Components.jsx triggerMeleeAttack). Since M5 the
      // incoming `damage` is form-multiplied, so heavy beast forms (ice/golem) cross 40 more often and
      // light forms (comet/hawk) less — intended feel. Thread the real isCrit here only if Kevin wants
      // the spray to track the crit ROLL rather than the damage magnitude (combat-differentiation depth).
      const isCrit = damage >= 40;
      // S2-B3-M1: camera shake is PLAYER feel — 3 allies on attack cooldowns would judder it continuously.
      if (source === 'player' && store.triggerCameraShake) {
        store.triggerCameraShake(isCrit ? 1.6 : 1.0, hitDir[0], hitDir[2]);
      }
      
      // Phase 11: Spatial Hit Sound
      if (store.playSpatialSound) {
        store.playSpatialSound('hit', [entity.position.x, entity.position.y, entity.position.z]);
      } else {
        playHit();
      }

      // SOTA High-performance fully GPU-driven particle burst triggering
      if (store.triggerGPUSparks) {
        const { color: sparkColor, count } = sparkFor(type, isCrit); // pure pull -> game/mobHitFx.js (S3-M6)

        store.triggerGPUSparks(
          new THREE.Vector3(entity.position.x, entity.position.y + 0.8, entity.position.z),
          sparkColor,
          count,
          type,
          hitDir
        );
      }

      entity.health -= damage;
      entity.lastHit = performance.now();

      setDamageNumbers(nums => [...nums, {
        id: damageId.current++,
        damage,
        type,
        position: [entity.position.x, entity.position.y, entity.position.z]
      }]);

      setShockwaves(waves => [...waves, {
        id: damageId.current++,
        type,
        position: [entity.position.x, entity.position.y + 0.1, entity.position.z]
      }]);

      if (entity.health <= 0 && !entity.dyingUntil) {
        const store = useGameStore.getState();

        // Spawn glowing physical green XP orbs scattered explosively
        const orbValue = 5;
        const totalXP = entity.xp || 10;
        // S2-B3-M1: XP drops only on YOUR kills (ally kills would farm pickups).
        const count = source === 'player' ? Math.max(1, Math.floor(totalXP / orbValue)) : 0;
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 1.5 + Math.random() * 2.5;
          const vx = Math.cos(angle) * speed;
          const vy = 4 + Math.random() * 4; // Upward impulse
          const vz = Math.sin(angle) * speed;

          ecs.add({
            id: _spawnId++,
            isXPOrb: true,
            position: new THREE.Vector3(entity.position.x, entity.position.y + 0.2, entity.position.z),
            velocity: new THREE.Vector3(vx, vy, vz),
            amount: orbValue,
            spawnTime: performance.now(),
            age: 0
          });
        }

        // Death FINISHER: a bigger, mob-coloured spark burst so a kill reads as a payoff (was silent --
        // the mob just vanished). Reuses the proven GPU spark pool; capture-safe (no kills under capture).
        // W2-T5: pass the FULL deathBurst descriptor -- db.color carries the hue-preserving dark-mob
        // tint floor, db.burst selects the upward-biased death velocity branch, hitDir gives the rise
        // a directional lean away from the player. A t=0 flash + a fading ground decal are spawned too.
        const db = deathBurst(entity.type);
        const deathPos = new THREE.Vector3(entity.position.x, entity.position.y + 0.8, entity.position.z);
        if (store.triggerGPUSparks) {
          store.triggerGPUSparks(deathPos, db.color, db.count, db.burst, entity.hitDirection);
        }
        if (GameMethods.spawnDeathFx) {
          GameMethods.spawnDeathFx([entity.position.x, entity.position.y, entity.position.z], deathPos.y, db.color);
        }
        emitMobKill(entity.type, [entity.position.x, entity.position.y, entity.position.z], source); // M3.5 fan-out + B3-M1 attribution
        // M2 #7 death weight: defer removal behind a dissolve so a kill has WEIGHT (XP / spark / kill-bus
        // already fired this frame). The dying-sweep removes the corpse after the dissolve elapses.
        entity.dyingUntil = performance.now() + DEATH_DISSOLVE_MS;
      }
      return entity;
    };

    // S2-B3-M3: capture a mob into the squad — the SNARE bind's apply-path (M4 calls this).
    const captureMob = (id) => {
      const entity = mobsQuery.entities.find(e => e.id === id);
      if (!entity || entity.health <= 0) return null;
      return convertMobToAlly(ecs, entity);
    };

    useGameStore.setState({ damageMob: damageMob });
    GameMethods.damageMob = damageMob;
    GameMethods.captureMob = captureMob;

    const checkMobCollision = (pos, range = 3) => {
      return mobsQuery.entities.find(e => {
        const dx = e.position.x - pos.x;
        const dy = e.position.y - pos.y;
        const dz = e.position.z - pos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        return dist < range;
      });
    };

    const checkMobsInMeleeCone = (playerPos, lookDir, range = 4.5, angleRad = Math.PI / 2) => {
      // Cone geometry extracted to the pure, unit-tested helper `isPointInCone`
      // (src/combat/cone.js) so the SAME front-arc test is reused for the boss
      // (Components.jsx triggerMeleeAttack). Behaviour here is IDENTICAL.
      return mobsQuery.entities.filter(e =>
        isPointInCone(playerPos, lookDir, e.position, range, angleRad)
      );
    };

    useGameStore.setState({ checkMobCollision: checkMobCollision, checkMobsInMeleeCone: checkMobsInMeleeCone });
    GameMethods.checkMobCollision = checkMobCollision;
    GameMethods.checkMobsInMeleeCone = checkMobsInMeleeCone;
  }, [setDamageNumbers, setShockwaves]);

  return null;
};

// --- ORCHESTRATOR ---
const EnemyProjectileSystem = () => {
  // GLI fix (STATE-REVIEW-2026-06-10 BLOCKING #1): the live list is a REF mutated per frame by the
  // pure stepper (src/game/enemyProjectiles.js); React state mirrors MEMBERSHIP only (spawn /
  // expire / hit), so this component re-renders on transitions, never at render rate. Mesh
  // positions are written transiently each frame below (same pattern as EnhancedMagicSystem).
  const liveRef = useRef([]);
  const meshRefs = useRef(new Map());
  const [rendered, setRendered] = useState([]);
  const projectileId = useRef(0);
  const { camera } = useThree();

  useEffect(() => {
    useGameStore.setState({ spawnEnemyProjectile: (pos, target) => {
        const dir = new THREE.Vector3(target[0] - pos[0], target[1] - pos[1], target[2] - pos[2]).normalize();
        liveRef.current.push({
            id: projectileId.current++,
            position: new THREE.Vector3(...pos).add(dir.clone().multiplyScalar(1)),
            velocity: dir.multiplyScalar(0.4),
            age: 0
        });
        setRendered([...liveRef.current]); // transition: spawn
    }});
  }, []);

  useFrame((state, delta) => {
    const list = liveRef.current;
    if (list.length === 0) return;
    const { survivors, hits } = stepEnemyProjectiles(list, delta, camera.position);
    if (hits > 0) {
      const damagePlayer = useGameStore.getState().damagePlayer;
      if (damagePlayer) for (let i = 0; i < hits; i++) damagePlayer(15, 'projectile');
    }
    if (survivors.length !== list.length) {
      liveRef.current = survivors;
      setRendered([...survivors]); // transition: expiry / hit
    }
    for (const p of liveRef.current) {
      const m = meshRefs.current.get(p.id);
      if (m) m.position.copy(p.position);
    }
  });

  return (
    <group>
        {rendered.map(p => (
            <mesh key={p.id} position={p.position}
                  ref={(m) => { if (m) meshRefs.current.set(p.id, m); else meshRefs.current.delete(p.id); }}>
                <boxGeometry args={[0.2, 0.2, 0.5]} />
                <meshStandardMaterial color="#F5F5DC" emissive="#ffffff" emissiveIntensity={0.5} />
            </mesh>
        ))}
    </group>
  );
};

// --- XP Orb Physics & Pull System ---
const XPOrbSystem = () => {
  const { camera } = useThree();
  const { playPickup } = useGameSounds();

  useFrame((state, delta) => {
    if (!camera) return;
    const store = useGameStore.getState();
    const playerPos = camera.position;

    for (const entity of [...xpOrbsQuery.entities]) {
      // physics extracted to the pure game/xpOrbStepper.js (S3-M6 NPC de-monolith, byte-equivalent);
      // the component keeps the ECS iteration + the collect side-effects.
      const collected = stepXPOrb(entity, delta, {
        playerPos,
        groundYAt: store.getMobGroundLevel,
      }).collected;
      if (collected) {
        if (GameMethods.grantXP) GameMethods.grantXP(entity.amount);
        if (GameMethods.spawnXPText) GameMethods.spawnXPText(entity.amount, entity.position);
        playPickup();
        ecs.remove(entity);
      }
    }
  });

  return null;
};


// --- Physical Loot Helpers ---
// Re-exported for the M3 loot/rarity characterization tests, which import
// getItemRarity from this module. M3-T3 routed rarity through the single registry
// in src/data/items.js (removing the local duplicate with its emoji-fallback
// branches), so this re-export now resolves to the registry — resolving the prior
// cross-file divergence with GamePanels (both re-export the same registry function).
export { getItemRarity };

// --- Loot Physics & Pull System ---
const LootSystem = () => {
  const { camera } = useThree();
  const { playPickup } = useGameSounds();

  useFrame((state, delta) => {
    if (!camera) return;
    // Capture-determinism: FREEZE the loot physics/magnet/collection loop so spawned
    // fixture drops hold their exact spawn position (no gravity arc, no camera-magnet
    // pull, no auto-collect) -> the loot-showcase frame is byte-stable. Mirrors the mob
    // AI freeze (NPCSystem useFrame early-returns in capture). No-op in gameplay.
    if (isCaptureMode()) return;
    const store = useGameStore.getState();
    const playerPos = camera.position;

    for (const entity of [...lootDropsQuery.entities]) {
      // physics extracted to the pure game/xpOrbStepper.js stepLootDrop (S3-M6, byte-equivalent;
      // magnet range 7 / base 40 / floor 3); the component keeps the loot collect side-effects.
      const collected = stepLootDrop(entity, delta, {
        playerPos,
        groundYAt: store.getMobGroundLevel,
      }).collected;
      if (collected) {
        if (store.addToInventory) store.addToInventory(entity.item, 1);
        if (entity.xp > 0 && GameMethods.grantXP) GameMethods.grantXP(entity.xp, entity.item);
        if (entity.xp > 0 && GameMethods.spawnXPText) GameMethods.spawnXPText(entity.xp, entity.position);
        if (store.addNotification) store.addNotification(`Looted: ${entity.item}`, 'loot');
        playPickup();
        // M3c-T2: rarity-tinted pickup pop at the collect point (same color as the drop's beam).
        if (GameMethods.spawnLootPop) GameMethods.spawnLootPop(entity.position, rarityBeam(getItemRarity(entity.item)).color);
        ecs.remove(entity);
      }
    }
  });

  return null;
};

export const NPCSystem = React.memo(() => {
  const [damageNumbers, setDamageNumbers] = useState([]);
  const [shockwaves, setShockwaves] = useState([]);
  const [lootPops, setLootPops] = useState([]);
  const [deathFx, setDeathFx] = useState([]);
  const damageId = useRef(0);
  const entities = useEntities(mobsQuery);
  const allies = useEntities(alliesQuery); // S2-B3-M5: bound creatures RENDER again (they left mobsQuery at bind)
  const xpOrbs = useEntities(xpOrbsQuery);
  const lootDrops = useEntities(lootDropsQuery);

  const removeDamageNumber = (id) => {
    setDamageNumbers(prev => prev.filter(d => d.id !== id));
  };

  useEffect(() => {
    GameMethods.spawnXPText = (amount, position) => {
      setDamageNumbers(prev => [...prev, {
        id: damageId.current++,
        isXP: true,
        damage: amount,
        position: [position.x, position.y, position.z]
      }]);
    };
    // M7-T3: the gold WALL HIT! label — fired by HurlSystem when the anvil 3x lands.
    GameMethods.spawnAnvilText = (position) => {
      setDamageNumbers(prev => [...prev, {
        id: damageId.current++,
        isAnvil: true,
        damage: 0,
        position: [position.x, position.y + 0.6, position.z]
      }]);
    };
    // M3c-T2: rarity-tinted pickup pop, fired from the LootSystem collect branch.
    GameMethods.spawnLootPop = (position, color) => {
      setLootPops(prev => [...prev, {
        id: damageId.current++,
        position: [position.x, position.y + 0.1, position.z],
        color
      }]);
    };
    // W2-T5: mob-death flourish -- a t=0 hot flash at the burst centre + a fading ground-ring decal
    // in the mob's hue-preserved colour, fired from the damageMob kill path.
    GameMethods.spawnDeathFx = (position, flashY, color) => {
      setDeathFx(prev => [...prev, {
        id: damageId.current++,
        position,
        flashY,
        color
      }]);
    };
  }, []);

  return (
    <group>
      <SpawnerSystem />
      <AIWorkerSystem />
      <MinimapSyncSystem />
      <CombatSystem setDamageNumbers={setDamageNumbers} setShockwaves={setShockwaves} damageId={damageId} />
      <EnemyProjectileSystem />
      <XPOrbSystem />
      <LootSystem />

      {entities.filter(entity => entity && (entity.health > 0 || entity.dyingUntil)).map(entity => (
        <MobModel key={entity.id} entity={entity} />
      ))}

      {/* S2-B3-M5: the squad — the same parametric MobModel (the jade color lerp from the bind
          already differentiates; a rim treatment is M6-look-judge material). */}
      {allies.map(entity => (
        <MobModel key={'ally-' + entity.id} entity={entity} />
      ))}

      {xpOrbs.map(orb => (
        <XPOrbRender key={orb.id} entity={orb} />
      ))}

      {lootDrops.map(loot => (
        <LootDropRender key={loot.id} entity={loot} />
      ))}

      {damageNumbers.map(dmg => (
        <DamageNumber
          key={dmg.id}
          id={dmg.id}
          damage={dmg.damage}
          isXP={dmg.isXP}
          isAnvil={dmg.isAnvil}
          type={dmg.type}
          position={dmg.position}
          onComplete={removeDamageNumber}
        />
      ))}

      {shockwaves.map(wave => (
        <ImpactShockwave
          key={wave.id}
          id={wave.id}
          position={wave.position}
          type={wave.type}
          onComplete={(id) => setShockwaves(prev => prev.filter(w => w.id !== id))}
        />
      ))}

      {lootPops.map(pop => (
        <LootPopRender
          key={pop.id}
          id={pop.id}
          position={pop.position}
          color={pop.color}
          onComplete={(id) => setLootPops(prev => prev.filter(p => p.id !== id))}
        />
      ))}

      {deathFx.map(fx => (
        <DeathFxRender
          key={fx.id}
          id={fx.id}
          position={fx.position}
          flashY={fx.flashY}
          color={fx.color}
          onComplete={(id) => setDeathFx(prev => prev.filter(f => f.id !== id))}
        />
      ))}
    </group>
  );
});
