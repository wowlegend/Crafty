// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

import { ecs, mobsQuery } from '../../src/ecs/world';
import { CombatSystem } from '../../src/systems/CombatSystem';
import { GameMethods } from '../../src/GameMethods';
import { makeNpcEntity } from '../../src/world/npcSpawn';
import { MOB_TYPES } from '../../src/game/mobTypes';
import { solveChainTargets } from '../../src/game/chainLightning';
import { isProtected, isAutoTargetable, canPlayerDamage } from '../../src/combat/targeting';

// B1 — FRIEND/FOE. The 18-domain review's #1 CRITICAL: the player could permanently kill all four hub
// questgivers (merchant / smith / healer / guide) with 2.7 seconds of holding left-click, deleting
// trading, crafting, healing and the entire quest chain for the rest of the run. There is no respawn.
//
// Root cause: hub NPCs carry `isMob: true` (to reuse the MobModel renderer + the minimap mirror) so they
// sit in `mobsQuery`. The AI tick gates them out with `!isStatic`. COMBAT NEVER DID.
//
// These gates drive the REAL CombatSystem seam with the REAL hub-NPC entity shape (`makeNpcEntity`) —
// not a mock — so they cannot drift away from what the game actually spawns.
//
// MUTATION-PROOF: drop the `canPlayerDamage` guard in CombatSystem's damageMob, or swap
// `damageableInCone` back to a bare `mobsQuery.entities.filter(isPointInCone)`, and these go RED.

vi.mock('../../src/SoundManager', () => ({
  useGameSounds: () => ({ playHit: () => {} }),
}));

const spawn = (over) => {
  const t = MOB_TYPES[over.type];
  const e = {
    isMob: true,
    health: t.health, maxHealth: t.health, xp: t.xp, damage: t.damage,
    passive: !!t.passive, speed: t.speed, color: t.color,
    knockback: null, isAggro: false, lastHit: 0,
    ...over,
    position: new THREE.Vector3(...(over.pos || [0, 0, 0])),
  };
  delete e.pos;
  return ecs.add(e);
};

const clearWorld = () => {
  for (const e of [...ecs.entities]) ecs.remove(e);
};

describe('B1 friend/foe — the hub questgivers are not target practice', () => {
  beforeEach(() => {
    clearWorld();
    render(<CombatSystem setDamageNumbers={() => {}} setShockwaves={() => {}} damageId={{ current: 0 }} />);
  });

  it('the REAL hub NPC entity is in mobsQuery — this is the trap, and it is intended', () => {
    const npc = ecs.add(makeNpcEntity({ role: 'merchant', name: 'Bram the Trader', glyph: 'B', color: '#c9a86a' }, 9001, 0));
    // If this ever becomes false the renderer/minimap break. The NPC MUST stay a "mob" for rendering —
    // which is exactly why the protection has to live in the damage path, not in the query.
    expect(mobsQuery.entities).toContain(npc);
    expect(isProtected(npc)).toBe(true);
  });

  it('damageMob CANNOT hurt a hub questgiver — not at 9999 damage, not ever', () => {
    const npc = ecs.add(makeNpcEntity({ role: 'merchant', name: 'Bram the Trader', glyph: 'B', color: '#c9a86a' }, 9001, 0));
    const before = npc.health;

    const hit = GameMethods.damageMob(npc.id, 9999, 'physical', 'player');

    expect(hit).toBeNull();                    // the damage path refuses outright
    expect(npc.health).toBe(before);           // untouched
    expect(mobsQuery.entities).toContain(npc); // still alive, still trading
  });

  it('holding LMB in the hub does not put the questgivers in the melee cone', () => {
    const npc = ecs.add(makeNpcEntity({ role: 'smith', name: 'Mara the Smith', glyph: 'M', color: '#a8703c' }, 9001, 0));
    npc.position.set(0, 0, -2);                    // dead ahead, well inside the cone
    const zombie = spawn({ id: 9002, type: 'zombie', pos: [1, 0, -2] });

    const hits = GameMethods.checkMobsInMeleeCone(
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1), 4.5, Math.PI / 2
    );

    expect(hits).toContain(zombie);      // the hostile still gets hit
    expect(hits).not.toContain(npc);     // the smith does not
  });

  it('livestock stay huntable — protection is for questgivers, not a no-damage world', () => {
    const cow = spawn({ id: 9003, type: 'cow', pos: [0, 0, -2] });

    expect(canPlayerDamage(cow)).toBe(true);
    const hits = GameMethods.checkMobsInMeleeCone(
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1), 4.5, Math.PI / 2
    );
    expect(hits).toContain(cow);

    GameMethods.damageMob(cow.id, 30, 'physical', 'player');
    expect(cow.health).toBeLessThan(cow.maxHealth);   // you can still hunt for food
  });

  it('an aimed projectile resolves against the NEAREST target, not first-in-ECS', () => {
    // Insertion order is deliberately hostile: the FAR cow goes in first. The old
    // `mobsQuery.entities.find(...)` returned it, so your fireball hit the cow behind the zombie.
    const farCow = spawn({ id: 9004, type: 'cow', pos: [0, 0, -2.8] });
    const nearZombie = spawn({ id: 9005, type: 'zombie', pos: [0, 0, -1.0] });

    const hit = GameMethods.checkMobCollision(new THREE.Vector3(0, 0, 0), 3);

    expect(hit).toBe(nearZombie);
    expect(hit).not.toBe(farCow);
  });

  it('a projectile passes THROUGH a questgiver instead of detonating on them', () => {
    const npc = ecs.add(makeNpcEntity({ role: 'healer', name: 'Sister Wren', glyph: 'W', color: '#d8c7a1' }, 9006, 0));
    npc.position.set(0, 0, -1);
    const zombie = spawn({ id: 9007, type: 'zombie', pos: [0, 0, -2.5] });

    const hit = GameMethods.checkMobCollision(new THREE.Vector3(0, 0, 0), 3);

    expect(hit).toBe(zombie);   // the spell reaches the enemy standing behind the healer
  });
});

describe('B1 friend/foe — auto-targeters may not pick their own victims', () => {
  it('chain lightning never hops to a questgiver or to livestock', () => {
    const zombie = { id: 1, position: [0, 0, 0], passive: false };
    const cow = { id: 2, position: [0, 0, 3], passive: true };
    const questgiver = { id: 3, position: [0, 0, 4], passive: true, isNPC: true };
    const skeleton = { id: 4, position: [0, 0, 5], passive: false };

    const hops = solveChainTargets([zombie, cow, questgiver, skeleton], { x: 0, y: 0, z: 0 }, {
      excludeId: 1, baseDamage: 75, maxChains: 3, range: 8, damageReduction: 0.3,
    });

    const ids = hops.map((h) => h.id);
    expect(ids).not.toContain(2);   // the Ox you were standing next to
    expect(ids).not.toContain(3);   // the healer
    expect(ids).toContain(4);       // it still chains to the real enemy
  });

  it('the auto-target predicate is the one that draws the line', () => {
    expect(isAutoTargetable({ id: 1, passive: false })).toBe(true);
    expect(isAutoTargetable({ id: 2, passive: true })).toBe(false);               // livestock
    expect(isAutoTargetable({ id: 3, passive: true, isNPC: true })).toBe(false);  // questgiver
  });

  it('a PROTECTED-but-hostile entity is still refused — the guard is isNPC, not "passive" luck', () => {
    // The questgivers happen to be `passive: true`, so a `!passive` filter excludes them BY ACCIDENT.
    // This pins the real rule: protection comes from isNPC. Delete `isProtected` from `isHostile` and
    // this goes red while every other test stays green.
    expect(isAutoTargetable({ id: 9, passive: false, isNPC: true })).toBe(false);
    expect(canPlayerDamage({ id: 9, passive: false, isNPC: true })).toBe(false);
  });

  it('the mobEntities SNAPSHOT carries every field the targeting predicates read', () => {
    // Chain lightning targets off the store SNAPSHOT (MinimapSyncSystem), not off live ECS entities.
    // `isNPC` was missing from that snapshot, so the questgivers were excluded only incidentally.
    // Read the projection MinimapSyncSystem actually writes and assert it preserves allegiance.
    const live = { id: 1, type: 'villager', passive: true, isNPC: true, role: 'merchant', npcName: 'Bram',
                   position: { x: 1, y: 2, z: 3 } };
    const snap = { id: live.id, type: live.type, passive: live.passive, isNPC: live.isNPC, role: live.role,
                   npcName: live.npcName, position: [live.position.x, live.position.y, live.position.z] };

    expect(isProtected(snap)).toBe(true);
    expect(isProtected(snap)).toBe(isProtected(live));       // the snapshot cannot disagree with the entity
    expect(isAutoTargetable(snap)).toBe(isAutoTargetable(live));

    const src = readFileSync(resolve(HERE, '../../src/systems/MinimapSyncSystem.jsx'), 'utf8');
    expect(src).toMatch(/setMobEntities\([\s\S]{0,200}isNPC:\s*e\.isNPC/);
  });
});
