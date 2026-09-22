import { describe, it, expect } from 'vitest';
import { mobLockoutKey, damageArgsForAttack } from './mobDamage.js';

// The invariant, not an example: two mobs of the SAME TYPE must get DIFFERENT lockout keys. That is the
// whole defect — `attack.type` was being used as the key, so every melee mob in the world shared one
// cooldown and a pack of six was rate-limited as a single attacker.
describe('mobLockoutKey — identity is the entity, never the type', () => {
  it('gives two mobs of the same type different keys', () => {
    const a = mobLockoutKey({ id: 11, type: 'melee' });
    const b = mobLockoutKey({ id: 12, type: 'melee' });
    expect(a).not.toBe(b);
  });

  it('gives the same mob a stable key across its attacks', () => {
    expect(mobLockoutKey({ id: 11, type: 'melee' })).toBe(mobLockoutKey({ id: 11, type: 'projectile' }));
  });

  // Guards the regression directly: if the key ever collapses back onto the type, these two are equal.
  it('does not key on type — a melee and a projectile mob with distinct ids stay distinct', () => {
    expect(mobLockoutKey({ id: 1, type: 'melee' })).not.toBe(mobLockoutKey({ id: 2, type: 'projectile' }));
  });
});

describe('damageArgsForAttack — the damagePlayer call shape', () => {
  const attack = { id: 42, type: 'melee', damage: 7, position: [1, 2, 3] };

  it('carries damage, display source, position and the entity-scoped key, in that order', () => {
    expect(damageArgsForAttack(attack)).toEqual([7, 'melee', [1, 2, 3], 'mob:42']);
  });

  it('keeps `type` as the DISPLAY source and the id as the KEY — they are different jobs', () => {
    const [, source, , key] = damageArgsForAttack(attack);
    expect(source).toBe('melee'); // what the hit log and death screen read
    expect(key).toContain('42'); // what the lockout is keyed on
    expect(key).not.toBe(source);
  });

  it('produces four arguments — a three-arg call is the pre-fix shape that lost the id', () => {
    expect(damageArgsForAttack(attack)).toHaveLength(4);
  });
});
