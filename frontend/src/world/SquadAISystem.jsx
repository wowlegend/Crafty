import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../store/useGameStore';
import { GameMethods } from '../GameMethods';
import { mobsQuery, alliesQuery } from '../ecs/world';
import { isCaptureMode } from '../devtest/captureMode';
import { stepSquad, ALLY_DPS_HIT } from '../game/squadAI';

const AI_TICK_SEC = 1 / 15; // the AIWorkerSystem cadence (SimplifiedNPCSystem :72)

/**
 * SquadAISystem — S2-B3-M5: the 15Hz main-thread bridge for the pure squad brain.
 * The worker is NEVER touched (v1 stance: the player stays the tank). Orders apply
 * transiently: positions ground-snapped (the worker-reply precedent), attacks via
 * damageMob(...,'ally') (no hitstop/shake/XP — the M1 attribution contract) + the
 * victim's isAggro set (persists through the worker; the siege turns toward the fight).
 * NO voxel/worker seams (noremesh-gated).
 */
export function SquadAISystem() {
  const accumRef = useRef(0);
  useFrame((state, delta) => {
    if (isCaptureMode()) return;
    accumRef.current += delta;
    if (accumRef.current < AI_TICK_SEC) return;
    accumRef.current = 0;
    if (alliesQuery.entities.length === 0) return;
    const store = useGameStore.getState();
    const p = store.playerPosition;
    if (!p) return;
    const now = state.clock.getElapsedTime();
    const { moves, attacks, teleports } = stepSquad(alliesQuery.entities, mobsQuery.entities, p, now, store.isAlive);
    for (const m of moves.concat(teleports)) {
      const a = alliesQuery.entities.find((e) => e.id === m.id);
      if (!a) continue;
      a.position.x = m.x;
      a.position.z = m.z;
      if (store.getMobGroundLevel) {
        const gy = store.getMobGroundLevel(m.x, m.z);
        if (gy !== null && !Number.isNaN(gy)) a.position.y = gy + 0.5;
      }
    }
    for (const at of attacks) {
      const a = alliesQuery.entities.find((e) => e.id === at.id);
      if (a) a.lastAllyAttack = now;
      if (GameMethods.damageMob) GameMethods.damageMob(at.targetId, ALLY_DPS_HIT, 'physical', 'ally');
      const victim = mobsQuery.entities.find((e) => e.id === at.targetId);
      if (victim) victim.isAggro = true; // the siege notices (persists through the worker)
    }
  });
  return null;
}
