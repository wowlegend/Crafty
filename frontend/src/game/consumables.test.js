import { describe, it, expect } from 'vitest';
import { isConsumable, consumeEffect, CONSUMABLE_EFFECTS } from './consumables.js';

describe('isConsumable — exact-name (fixes the substring consume-trap)', () => {
  it('true for real consumables (potions/XP tokens)', () => {
    for (const name of ['Health Potion', 'Mana Potion', 'Diamond', 'Golden Crown', 'Star Fragment']) {
      expect(isConsumable(name)).toBe(true);
    }
  });
  // No food is consumable, because nothing feeds (DECISIONS 2026-10-29 item 71): a consumable meat would be a Use button
  // that spends the item for nothing.
  it('false for the retired foods', () => {
    for (const food of ['Raw Porkchop', 'Raw Beef', 'Cooked Porkchop', 'Cooked Beef', 'Rotten Flesh']) {
      expect(isConsumable(food), food).toBe(false);
    }
  });
  it('FALSE for equippable Diamond gear — the bug (substring .includes("Diamond") matched these)', () => {
    for (const gear of ['Diamond Sword', 'Diamond Shield', 'Diamond Helmet', 'Diamond Chestplate', 'Diamond Boots']) {
      expect(isConsumable(gear)).toBe(false);
    }
  });
  it('false for other gear + non-items + nullish', () => {
    expect(isConsumable('Iron Sword')).toBe(false);
    expect(isConsumable('Stone')).toBe(false);
    expect(isConsumable('')).toBe(false);
    expect(isConsumable(null)).toBe(false);
    expect(isConsumable(undefined)).toBe(false);
  });
});

describe('consumeEffect — exact per-name effect', () => {
  it('maps each consumable to its effect', () => {
    expect(consumeEffect('Health Potion')).toEqual({ heal: 30 });
    expect(consumeEffect('Mana Potion')).toEqual({ mana: 40 });
    expect(consumeEffect('Diamond')).toEqual({ xp: 50 });
    expect(consumeEffect('Golden Crown')).toEqual({ xp: 200 });
    expect(consumeEffect('Star Fragment')).toEqual({ xp: 100 });
  });
  it('returns null for non-consumables (so the consume handler no-ops on gear)', () => {
    expect(consumeEffect('Diamond Sword')).toBeNull();
    expect(consumeEffect('Iron Helmet')).toBeNull();
    expect(consumeEffect(null)).toBeNull();
  });
  it('CONSUMABLE_EFFECTS has no equippable-gear keys', () => {
    for (const key of Object.keys(CONSUMABLE_EFFECTS)) {
      expect(/ (Sword|Shield|Helmet|Chestplate|Boots)$/.test(key)).toBe(false);
    }
  });
});
