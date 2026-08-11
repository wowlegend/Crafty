import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGameStore } from '../store/useGameStore';
import { mobsQuery } from '../ecs/world';
import { isCaptureMode } from '../devtest/captureMode';
import { routinePosition } from '../game/npcRoutine.js';
import { spellSlowFactor } from '../game/freeze.js';
// `?worker` — Vite's worker import, the SAME construction src/world/Terrain.jsx has always used for
// terrain.worker.js (which imports ten modules). This replaced `new Worker(new URL(...))`, whose only
// practical consequence here was that ai.worker.js was hand-maintaining inline COPIES of three pure
// modules because a comment claimed a "classic Worker cannot import". Vite bundles the worker either
// way; the copies were never necessary. See ai.worker.js's header.
import AIWorker from '../workers/ai.worker.js?worker';
import { drainKnockback } from '../game/captureRest.js';

// AIWorkerSystem -- bridges mob AI to a Web Worker at 15Hz (movement/attacks/aggro), processes
// knockback main-thread, and runs the ambient hub-NPC routine. Extracted VERBATIM from
// SimplifiedNPCSystem.jsx (v6 de-monolith A1.4); behavior unchanged. The three module consts below
// are AIWorker-only and moved with it. The Worker URL is now `../workers/...` (file in src/systems/).

// S2-B2-pre-M2 perf: the AI worker bridge ticks at this rate, not render rate (see AIWorkerSystem).
const AI_TICK_SEC = 1 / 15;

// A fixed, documented seed for capture runs. Named rather than inline so it cannot quietly differ
// between the two places that would otherwise have to agree.
const CAPTURE_AI_SEED = 'crafty-capture-ai-v1';

// Enemy-presence audio: a single global cooldown so a whole siege turning aggro snarls ONCE, not 20x.
const AGGRO_GROWL_COOLDOWN_SEC = 2.5;
let _lastAggroGrowl = -Infinity;

export const AIWorkerSystem = () => {
  const tickAccumRef = useRef(0);
  const { camera } = useThree();
  const workerRef = useRef();

  useEffect(() => {
    workerRef.current = new AIWorker();

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
                    0, // no vertical term: the knockback consumer (below) applies X/Z only, so the leap is horizontal
                    camera.position.z - entity.position.z
                ];
                const mag = Math.sqrt(dir[0]*dir[0] + dir[2]*dir[2]) || 1; // guard: mob directly under player -> 0 -> NaN position
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
            entity.wanderRoll = update.wanderRoll; // round-trips the seeded wander's roll counter
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

  // M-AMBIENT.2: gentle ambient routine for the static hub NPCs (the AI worker + knockback skip them).
  // Each isNPC lerps toward routinePosition (a slow daytime patrol around its post; retreat home at
  // night) and re-raycasts ground Y so it stays FLUSH even at the patrol extremes (the M-HUB float
  // class). Capture-suppressed -> NPCs freeze + don't even spawn in capture, so baselines are byte-stable.
  useFrame(() => {
    if (isCaptureMode()) return;
    const store = useGameStore.getState();
    const isDay = store.isDay;
    const gameTime = store.gameTime || 0;
    for (const e of mobsQuery.entities) {
      if (!e || !e.isNPC) continue;
      const target = routinePosition({ x: e.homeX, z: e.homeZ }, gameTime, isDay);
      e.position.x += (target.x - e.position.x) * 0.04;
      e.position.z += (target.z - e.position.z) * 0.04;
      if (store.getMobGroundLevel) {
        const gy = store.getMobGroundLevel(e.position.x, e.position.z);
        if (gy != null && !isNaN(gy)) e.position.y += ((gy + 0.5) - e.position.y) * 0.1;
      }
    }
  });

  useFrame((state, delta) => {
    if (!camera || !workerRef.current) return;
    if (isCaptureMode()) {
      // CLEAR without displacing — that IS the declared reset. Returning past the drain left any impulse
      // stamped in the instant before the flag flipped sitting on the entity for the whole capture (this
      // loop is its only reader) to fire on the way out. Whether a mob carries one at capture time is a
      // race, i.e. exactly the run-dependence the guard exists to remove.
      drainKnockback(mobsQuery.entities, delta, true);
      return; // AI/movement stays frozen so capture frames are byte-stable
    }
    const now = performance.now();

    drainKnockback(mobsQuery.entities, delta, false);

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
    const mobsData = mobsQuery.entities.filter(e => e && e.health > 0 && !e.isStatic).map(e => {
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
        speed: e.speed * (e.zoneSlowMult || 1) * spellSlowFactor(e, performance.now()), // zone slow + iceball spell-freeze (separate channels)
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
      mobs: mobsData,
      // DECLARE determinism to the worker rather than letting it infer. A worker is its own module
      // realm, so isCaptureMode() is structurally unreachable inside ai.worker.js — its wander logic was
      // deterministic only because the early return above means this post never happens under capture.
      // That is an accident, not a guarantee: move that return and the nondeterminism returns silently,
      // inside a worker, where the visual harness would show it as an unexplained flapping frame. Null in
      // normal play, so mobs wander freely for real players.
      // DEAD UNTIL THE SUPPRESSION BECOMES SUBSTITUTION, and deliberately kept. The useFrame this
      // sits in early-returns on isCaptureMode() ~69 lines above, so this ternary has evaluated its
      // capture branch exactly zero times and always yields null. It is scaffolding for the
      // capture-clock work: the moment that early return is replaced by a seeded tick, the seed has
      // to already be here. Deleting it would mean re-deriving it later; leaving it undocumented
      // meant the next reader took it for working plumbing, which is how the CONSUMER of this seed
      // (the wander re-roll) shipped a constant sequence nobody could observe.
      captureSeed: isCaptureMode() ? CAPTURE_AI_SEED : null
    });
  });

  return null;
};
