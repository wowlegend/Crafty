import { describe, it, expect, vi, afterEach } from 'vitest';
import { solveMeleeDamage, solveSpellDamage, mitigateDamage } from './combat';

// S3-M2 T0: the damage path's FIRST characterization (the de-monolith charter rule:
// characterize before anything around it moves). Values pinned from the live formulas.
afterEach(() => vi.restoreAllMocks());

describe('solveMeleeDamage', () => {
  it('base formula at no-crit: weapon + STR*1.5, white', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // never crit
    const r = solveMeleeDamage({ strength: 10, agility: 10 }, 5);
    expect(r).toEqual({ damage: 20, isCrit: false, color: '#FFFFFF' }); // 5 + 15
  });
  it('crit doubles and goes orange; chance = 5% + AGI*0.5%, capped 75%', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.0); // always crit
    const r = solveMeleeDamage({ strength: 10, agility: 10 }, 5);
    expect(r).toEqual({ damage: 40, isCrit: true, color: '#FF4500' });
    // the cap: AGI 1000 -> raw 5.05 but capped at 0.75 — a roll of 0.76 must NOT crit
    vi.spyOn(Math, 'random').mockReturnValue(0.76);
    expect(solveMeleeDamage({ strength: 10, agility: 1000 }, 5).isCrit).toBe(false);
  });
  it('defaults: stats 10/10, weapon 5', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    expect(solveMeleeDamage({}).damage).toBe(20);
  });
});

describe('solveSpellDamage', () => {
  it('base formula: spell * (1 + INT*0.02), rounded', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    expect(solveSpellDamage({ intellect: 10, agility: 10 }, 20).damage).toBe(24); // 20*1.2
    expect(solveSpellDamage({ intellect: 25, agility: 10 }, 20).damage).toBe(30); // 20*1.5
  });
  it('crit = x1.8; chance = 5% + AGI*0.3%, capped 50%', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.0);
    expect(solveSpellDamage({ intellect: 10, agility: 10 }, 20).damage).toBe(43); // round(24*1.8)
    vi.spyOn(Math, 'random').mockReturnValue(0.51);
    expect(solveSpellDamage({ intellect: 10, agility: 1000 }, 20).isCrit).toBe(false); // the cap
  });
  it('the element colors: fire orange / ice blue / lightning gold / arcane violet default', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    expect(solveSpellDamage({}, 20, 'fireball').color).toBe('#FF4500');
    expect(solveSpellDamage({}, 20, 'iceball').color).toBe('#00BFFF');
    expect(solveSpellDamage({}, 20, 'lightning').color).toBe('#FFD700');
    expect(solveSpellDamage({}, 20, 'arcane').color).toBe('#9932CC');
  });
});

describe('mitigateDamage', () => {
  it('armor/(armor+100) reduction, floor 1', () => {
    expect(mitigateDamage({ armor: 0 }, 50)).toBe(50);
    expect(mitigateDamage({ armor: 100 }, 50)).toBe(25);  // 50% DR
    expect(mitigateDamage({ armor: 300 }, 100)).toBe(25); // 75% DR
    expect(mitigateDamage({ armor: 10000 }, 2)).toBe(1);  // the floor
  });
});
