import { describe, it, expect } from 'vitest';
import { getItemSlot, getWeaponBaseDamage } from './equipment.js';

describe('getItemSlot', () => {
  it('maps gear names to slots', () => {
    expect(getItemSlot('Diamond Sword')).toBe('weapon');
    expect(getItemSlot('pickaxe')).toBe('weapon');
    expect(getItemSlot('Iron Shield')).toBe('offhand');
    expect(getItemSlot('Golden Crown')).toBe('head');
    expect(getItemSlot('Diamond Chestplate')).toBe('chest');
    expect(getItemSlot('Leather Boots')).toBe('boots');
  });
  it('returns null for non-gear / null', () => {
    expect(getItemSlot('grass')).toBeNull();
    expect(getItemSlot(null)).toBeNull();
  });
});

describe('getWeaponBaseDamage', () => {
  it('matches the canonical ladder', () => {
    expect(getWeaponBaseDamage('Stone Sword')).toBe(12);
    expect(getWeaponBaseDamage('Iron Sword')).toBe(20);
    expect(getWeaponBaseDamage('Diamond Sword')).toBe(35);
    expect(getWeaponBaseDamage('pickaxe')).toBe(8);
    expect(getWeaponBaseDamage('sword')).toBe(10);
  });
  it('defaults to 5 for unarmed / unknown', () => {
    expect(getWeaponBaseDamage(null)).toBe(5);
    expect(getWeaponBaseDamage('grass')).toBe(5);
  });
});
