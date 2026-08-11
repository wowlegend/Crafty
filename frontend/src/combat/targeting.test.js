import { describe, it, expect } from 'vitest';
import { damageableInCone, nearestDamageable, canPlayerDamage, isAutoTargetable } from './targeting.js';

// A plain entity (no isNPC) is damageable — isProtected only shields the hub questgivers.
const at = (x, y, z) => ({ id: `${x},${y},${z}`, position: { x, y, z } });

describe('targeting — position-guard consistency (damageableInCone matches nearestDamageable)', () => {
  const playerPos = { x: 0, y: 0, z: 0 };
  const lookDir = { x: 0, y: 0, z: 1 }; // looking +Z

  it('damageableInCone skips a position-less entity WITHOUT throwing (guards e.position)', () => {
    const noPos = { id: 'ghost' };  // damageable (not isNPC) but has NO position
    const inFront = at(0, 0, 2);    // directly ahead, in range
    let out;
    // MUTATION-PROOF: drop the `e.position &&` guard and isPointInCone(…, undefined, …) throws -> this fails.
    expect(() => { out = damageableInCone([noPos, inFront], playerPos, lookDir, 5, Math.PI); }).not.toThrow();
    expect(out).toContain(inFront);
    expect(out).not.toContain(noPos);
  });

  it('nearestDamageable already skips a position-less entity (the sibling this now matches)', () => {
    const inRange = at(0, 0, 1);
    expect(nearestDamageable([{ id: 'ghost' }, inRange], playerPos, 5)).toBe(inRange);
  });

  it('a hub NPC (isNPC) is never damageable in the cone', () => {
    const npc = { id: 'smith', isNPC: true, position: { x: 0, y: 0, z: 1 } };
    expect(canPlayerDamage(npc)).toBe(false);
    expect(damageableInCone([npc], playerPos, lookDir, 5, Math.PI)).toEqual([]);
  });
});

// CORPSES ATE THE SHOT.
//
// A killed mob is not removed from the ECS when it dies: CombatSystem stamps `dyingUntil` and lets the
// model dissolve, and the only removal runs inside SpawnerSystem's 1000ms sweep throttle — so a corpse
// stays in `mobsQuery` (which carries no health component) for 320-1320ms, most of it scaled to 0.001,
// i.e. invisible. Every comparable system already filtered `health <= 0`; targeting.js, the one the
// projectile hit-resolution goes through, did not. So the nearest damageable entity to your fireball was
// the thing you had just killed.
describe('targeting — the dead are not targets', () => {
  const playerPos = { x: 0, y: 0, z: 0 };
  const lookDir = { x: 0, y: 0, z: 1 };
  const corpse = (x, y, z, extra) => ({ ...at(x, y, z), health: 0, ...extra });

  it('a zero-health corpse is not damageable', () => {
    expect(canPlayerDamage(corpse(0, 0, 1))).toBe(false);
  });

  it('a mid-dissolve body (health still positive, dyingUntil stamped) is not damageable either', () => {
    // The 0-320ms slice: CombatSystem sets dyingUntil at the killing blow. A second hit here used to
    // re-run the entire damage side-effect chain — numbers, sounds, lifesteal — on something dead.
    expect(canPlayerDamage({ ...at(0, 0, 1), health: 4, dyingUntil: 12345 })).toBe(false);
  });

  it('nearestDamageable skips the nearer corpse and returns the LIVE mob behind it', () => {
    // The exact failure: aim past a fresh kill at the zombie behind it and the shot vanishes.
    const dead = corpse(0, 0, 1);
    const live = { ...at(0, 0, 2), health: 20 };
    expect(nearestDamageable([dead, live], playerPos, 5)).toBe(live);
  });

  it('damageableInCone excludes corpses, so a swing does not spend itself on a body', () => {
    const dead = corpse(0, 0, 1);
    const live = { ...at(0, 0, 2), health: 20 };
    const out = damageableInCone([dead, live], playerPos, lookDir, 5, Math.PI);
    expect(out).toEqual([live]);
  });

  it('an entity with NO health field stays damageable — undefined means untracked, not dead', () => {
    // The failure direction on the other side: over-filtering would make ordinary mobs unkillable.
    expect(canPlayerDamage(at(0, 0, 1))).toBe(true);
    expect(nearestDamageable([at(0, 0, 1)], playerPos, 5)).not.toBe(null);
  });

  it('a LIVING mob at full health is still damageable — the control for every assertion above', () => {
    expect(canPlayerDamage({ ...at(0, 0, 1), health: 20 })).toBe(true);
  });

  it('chain lightning does not hop to a corpse', () => {
    expect(isAutoTargetable(corpse(0, 0, 1))).toBe(false);
    expect(isAutoTargetable({ ...at(0, 0, 1), health: 20 })).toBe(true);
  });
});
