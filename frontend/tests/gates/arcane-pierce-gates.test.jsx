// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import * as THREE from 'three';
import { ecs } from '../../src/ecs/world';
import { CombatSystem } from '../../src/systems/CombatSystem';
import { GameMethods } from '../../src/GameMethods';
import { nearestDamageable } from '../../src/combat/targeting';
import { MOB_TYPES } from '../../src/game/mobTypes';

// B8 — ARCANE 'PIERCE 3 TARGETS' TRIPLE-HIT ONE TARGET. (18-domain review, HIGH.)
//
// The projectile hit-loop resolves the nearest mob (checkMobCollision) and, for a 'pierce' spell, keeps the
// projectile alive up to pierceCount times. But it never excluded the mob it had already hit — and a pierced
// projectile stays inside that mob's radius — so every frame it re-resolved the SAME nearest mob. "Pierce 3
// targets" delivered 3x damage + 3x lifesteal to ONE target and never reached a second.
//
// FIX: a per-projectile `hitIds` set + `nearestDamageable(..., excludeIds)` skips already-hit mobs, so the
// shot advances to DISTINCT targets. Absent/empty excludeIds is unchanged single-hit behaviour.
//
// MUTATION-PROOF: delete the `if (excludeIds && excludeIds.has(e.id)) continue;` line in targeting.js —
// the pierce loop re-hits the same mob and the "distinct targets" test goes RED.

vi.mock('../../src/SoundManager', () => ({ useGameSounds: () => ({ playHit: () => {} }) }));

const clearWorld = () => { for (const e of [...ecs.entities]) ecs.remove(e); };
const spawn = (id, x) => ecs.add({
  isMob: true, id, type: 'zombie', passive: false,
  health: MOB_TYPES.zombie.health, maxHealth: MOB_TYPES.zombie.health,
  position: new THREE.Vector3(x, 0, 0),
});

describe('B8 nearestDamageable — excludeIds skips already-hit mobs', () => {
  it('excluding the nearest returns the NEXT-nearest', () => {
    const a = { id: 1, isMob: true, type: 'zombie', position: { x: 0.5, y: 0, z: 0 } };
    const b = { id: 2, isMob: true, type: 'zombie', position: { x: 1.0, y: 0, z: 0 } };
    const pos = { x: 0, y: 0, z: 0 };
    expect(nearestDamageable([a, b], pos, 3)).toBe(a);                    // nearest
    expect(nearestDamageable([a, b], pos, 3, new Set([1])).id).toBe(2);   // a excluded -> b
    expect(nearestDamageable([a, b], pos, 3, new Set([1, 2]))).toBeNull(); // both excluded
  });
});

describe('B8 arcane pierce — a piercing shot hits DISTINCT targets', () => {
  beforeEach(() => {
    clearWorld();
    render(<CombatSystem setDamageNumbers={() => {}} setShockwaves={() => {}} damageId={{ current: 0 }} />);
  });

  it('the pierce loop (checkMobCollision + hitIds) advances through 3 distinct mobs, not one thrice', () => {
    spawn(1, 0.4); spawn(2, 0.9); spawn(3, 1.4);            // three mobs, in a line, all within range
    const pos = new THREE.Vector3(0, 0, 0);

    // Replicate the projectile hit-loop for a pierceCount:3 spell: each "frame" resolves the nearest mob
    // NOT yet hit, records it, and (as the real loop does) marks it hit.
    const projectile = {};
    const hit = [];
    for (let i = 0; i < 3; i++) {
      const mob = GameMethods.checkMobCollision(pos, 2, projectile.hitIds);
      if (!mob) break;
      hit.push(mob.id);
      (projectile.hitIds || (projectile.hitIds = new Set())).add(mob.id);
    }

    expect(hit).toEqual([1, 2, 3]);          // RED before the fix: [1, 1, 1] — the same mob thrice
    expect(new Set(hit).size).toBe(3);       // three DISTINCT targets
  });
});
