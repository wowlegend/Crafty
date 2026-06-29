import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore';
import { ecs, mobsQuery } from '../ecs/world';
import { HUB_NPCS, makeNpcEntity } from '../world/npcSpawn.js';
import { HEARTH_Y } from '../world/homeAnchor.js';
import { isCaptureMode } from '../devtest/captureMode';
import { siegeParams } from '../game/dayNight.js';
import { zoneTier } from '../world/zoneTier.js';
import { weightedPick } from '../game/spawnWeights';
import { MOB_TYPES } from '../game/mobTypes';

// SpawnerSystem -- siege/day mob spawning + the one-time static hub-NPC spawn + distance-cull.
// Extracted VERBATIM from SimplifiedNPCSystem.jsx (v6 de-monolith A1.3); behavior unchanged.
// Self-contained: only top-level imports, no shared module-local state from the former host file.
export const SpawnerSystem = () => {
  const { camera } = useThree();
  const lastSpawnCheck = useRef(0);
  const nextId = useRef(0);
  const _npcSpawned = useRef(false); // M-NPCS.2: spawn the static hub NPCs exactly once

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
    if (!mobConfig) return false; // weightedPick returned an unknown key -> don't spawn an undefined mob (NaN cascade)

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
        // M-NPCS.2: spawn the 4 static hub NPCs ONCE (non-capture path — line 164 returns under capture,
        // so they never appear in the deterministic baselines). They reuse the mob render + the
        // type==='villager' npcEntities minimap mirror; the worker tick + knockback loop skip them
        // (isStatic) so they hold their post. Placed on the flushed grade via the ground raycast.
        if (!_npcSpawned.current) {
          _npcSpawned.current = true;
          for (const npc of HUB_NPCS) {
            const a = makeNpcEntity(npc, nextId.current++, 0);
            const gy = state.getMobGroundLevel(a.homeX, a.homeZ);
            a.position.y = (gy != null && !isNaN(gy)) ? gy + 0.5 : HEARTH_Y + 1;
            ecs.add(a);
          }
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
        if (entity.isStatic) continue; // hub NPCs hold their post — never distance-culled (no respawn path; mirrors the AI-tick + serializer isStatic skips)
        const dist = Math.sqrt((entity.position.x - playerX)**2 + (entity.position.z - playerZ)**2);
        if (dist > maxDistance) {
          ecs.remove(entity);
        }
      }
    }
  });
  return null;
};
