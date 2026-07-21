import { describe, it, expect } from 'vitest';
import { ITEMS, getItemRarity } from '../../src/data/items.js';
import { BOSS_LOOT } from '../../src/game/bossConfig.js';

// bossReward: the Shadow Dragon kill grants BOSS_LOOT (world/bossSystem's kill handler loops over it).
// These tests are now COUPLED to that actual drop via the shared BOSS_LOOT constant — previously they
// hardcoded the item names independently, so the boss drop and this test could silently drift apart.
describe('boss reward items (coupled to the actual BOSS_LOOT drop)', () => {
  it('every item the boss actually drops is registered in the ITEMS registry', () => {
    expect(BOSS_LOOT.length).toBeGreaterThan(0);
    for (const [name, qty] of BOSS_LOOT) {
      const entry = Object.values(ITEMS).find((i) => i.name === name);
      expect(entry, `boss drops "${name}" — it MUST exist in src/data/items.js`).toBeTruthy();
      expect(qty).toBeGreaterThan(0);
    }
  });

  it('Crown of the Dragon King is dropped and is a registered legendary', () => {
    expect(BOSS_LOOT.some(([n]) => n === 'Crown of the Dragon King')).toBe(true);
    expect(getItemRarity('Crown of the Dragon King')).toBe('legendary');
  });

  it('Dragon Scale is dropped and is a registered epic', () => {
    expect(BOSS_LOOT.some(([n]) => n === 'Dragon Scale')).toBe(true);
    expect(getItemRarity('Dragon Scale')).toBe('epic');
  });
});
