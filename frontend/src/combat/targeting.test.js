import { describe, it, expect } from 'vitest';
import { damageableInCone, nearestDamageable, canPlayerDamage } from './targeting.js';

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
