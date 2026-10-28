// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import * as THREE from 'three';
import { ecs, mobsQuery } from '../../src/ecs/world';
import { CombatSystem } from '../../src/systems/CombatSystem';
import { GameMethods } from '../../src/GameMethods';
import { makeNpcEntity } from '../../src/world/npcSpawn';
import { MOB_TYPES } from '../../src/game/mobTypes';
import { solveChainTargets } from '../../src/game/chainLightning';
import { isProtected, isAutoTargetable, canPlayerDamage } from '../../src/combat/targeting';
import { useGameStore } from '../../src/store/useGameStore';
import { useFerocityAccrual, useKineticAccrual, useSoulAccrual } from '../../src/world/accrualHooks';

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

// UNMOUNT BETWEEN TESTS. This suite rendered <CombatSystem> in a beforeEach and never tore it down, and
// RTL's own auto-cleanup is INACTIVE here: it registers only `if (typeof afterEach === 'function')`, and
// vitest.config.js sets no `globals` and no `setupFiles`, so that branch never runs. Six mounted trees
// accumulated in document.body across the file. Same shape as tests/gates/modal-a11y.test.jsx.
afterEach(cleanup);

describe('B1 friend/foe — the hub questgivers are not target practice', () => {
  beforeEach(() => {
    expect(document.body.childElementCount, 'a previous test left a mounted React tree behind').toBe(0);
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
    const zombie = { id: 1, position: { x: 0, y: 0, z: 0 }, passive: false };
    const cow = { id: 2, position: { x: 0, y: 0, z: 3 }, passive: true };
    const questgiver = { id: 3, position: { x: 0, y: 0, z: 4 }, passive: true, isNPC: true };
    const skeleton = { id: 4, position: { x: 0, y: 0, z: 5 }, passive: false };

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
});

// A Settler is NEUTRAL: killable when you aim at one, but killing villagers must never be a way to power up. The kill
// runs through the real damage path and the real kill bus into the three accrual hooks the game mounts.
describe('the NEUTRAL tier banks no Aspect power', () => {
  const Accrual = () => { useFerocityAccrual(); useKineticAccrual(); useSoulAccrual(); return null; };
  const banks = () => {
    const s = useGameStore.getState();
    return { ferocity: s.ferocityBanked, kinetic: s.kineticBanked, soul: s.soulBanked };
  };
  beforeEach(() => {
    clearWorld();
    useGameStore.setState({ isDay: true, ferocityBanked: 0, kineticBanked: 0, soulBanked: 0 });
    render(<><CombatSystem setDamageNumbers={() => {}} setShockwaves={() => {}} damageId={{ current: 0 }} /><Accrual /></>);
  });

  it('a deliberate day kill of a Settler leaves every bank where it was; a Husk kill fills them', () => {
    const settler = spawn({ id: 9201, type: 'villager', pos: [0, 0, -2] });
    GameMethods.damageMob(settler.id, 9999, 'physical', 'player');
    expect(settler.health, 'the Settler did not die — nothing below is about a kill').toBeLessThanOrEqual(0);
    expect(banks(), 'killing a Settler banked Aspect power').toEqual({ ferocity: 0, kinetic: 0, soul: 0 });

    // The same instrument, same frame of mind: a hostile day kill does bank, so a zero above is not a dead bus.
    const husk = spawn({ id: 9202, type: 'zombie', pos: [0, 0, -3] });
    GameMethods.damageMob(husk.id, 9999, 'physical', 'player');
    expect(husk.health).toBeLessThanOrEqual(0);
    const after = banks();
    expect(after.ferocity, 'a Husk kill banked no Ferocity — the accrual path is dead').toBeGreaterThan(0);
    expect(after.kinetic, 'a Husk kill banked no Kinetic').toBeGreaterThan(0);
    expect(after.soul, 'a Husk kill banked no Soul').toBeGreaterThan(0);
  });
});
