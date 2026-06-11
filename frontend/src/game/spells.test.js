import { describe, it, expect } from 'vitest';
import { SPELL_TYPES } from './spells';

describe('the spell roster (S3-M2 — the shape lock)', () => {
  it('exactly the four elements', () => {
    expect(Object.keys(SPELL_TYPES).sort()).toEqual(['arcane', 'fireball', 'iceball', 'lightning']);
  });
  it('every spell carries the combat-critical fields', () => {
    for (const [name, s] of Object.entries(SPELL_TYPES)) {
      expect(s.damage, `${name}.damage`).toBeGreaterThan(0);
      expect(s.speed, `${name}.speed`).toBeGreaterThan(0);
    }
  });
});
