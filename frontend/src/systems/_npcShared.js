import { useState, useEffect } from 'react';
import * as THREE from 'three';
import { ecs } from '../ecs/world';
import { isCaptureMode } from '../devtest/captureMode';
import { GameMethods } from '../GameMethods';

// Shared ECS pickup state for the NPC systems (XPOrb/Loot render + spawn) + the miniplex React hook.
// Hoisted VERBATIM from SimplifiedNPCSystem.jsx (v6 de-monolith A1.5) so XPOrbSystem / LootSystem /
// CombatSystem + the NPCSystem orchestrator can each be extracted while still sharing one query set,
// one id counter, and one spawnLootDrop registration. Behavior unchanged.

export const xpOrbsQuery = ecs.with('isXPOrb', 'position', 'amount');
export const lootDropsQuery = ecs.with('isLootDrop', 'position', 'item', 'xp');

// One monotonic id for ECS-spawned pickups (loot drops + XP orbs). They render with key={id}; without
// a stamped id React threw the duplicate/undefined unique-key warning. One counter keeps both unique.
let _spawnId = 0;
export const nextSpawnId = () => _spawnId++;

export const spawnLootDrop = (item, xp, pos) => {
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
    id: nextSpawnId(),
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
export const useEntities = (query) => {
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
