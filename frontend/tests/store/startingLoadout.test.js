import { describe, it, expect } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { forgeOffers, shortfall } from '../../src/game/forge.js';

// The starting loadout (Phase B / B6, Kevin 2026-06-22 "build all"): a HUMBLE frontier start, so the loot and the
// Forge's weapon line have something to climb. A starter holding the Diamond Sword (the best blade, 35 base damage), an
// armour set, a diamond and gold hoard or a stack of potions would leave nothing to earn and nothing to reforge toward.
// The Inventory panel renders only `inventory.blocks` (see inventory-flat-bucket-gates), so these assertions govern
// exactly what the player sees and can equip.
describe('B6 starting loadout — humble frontier start (the loot and the Forge matter)', () => {
  const blocks = useGameStore.getState().inventory.blocks;

  it('ships exactly ONE starter weapon — the humble Stone Sword (reforged up to Iron and Diamond at the Forge)', () => {
    expect(blocks['Stone Sword']).toBe(1);
    expect(blocks['Iron Sword']).toBeUndefined();   // reforged at the Forge, or a quest's reward
    expect(blocks['Diamond Sword']).toBeUndefined(); // the endgame weapon — never handed out
  });

  it('hands out NO armor / shields — a quest or a chest gives the few that remain', () => {
    for (const piece of [
      'Golden Crown', 'Iron Helmet', 'Iron Chestplate', 'Leather Chestplate',
      'Leather Boots', 'Iron Boots', 'Wooden Shield', 'Iron Shield',
    ]) {
      expect(blocks[piece]).toBeUndefined();
    }
  });

  it('hands out NO endgame-ore hoard — diamond + gold are mined, not gifted', () => {
    expect(blocks.diamond || 0).toBe(0);
    expect(blocks.gold || 0).toBe(0);
  });

  it('potions are a modest safety net, not a stack', () => {
    expect(blocks['Health Potion'] || 0).toBeLessThanOrEqual(2);
    expect(blocks['Mana Potion'] || 0).toBeLessThanOrEqual(1);
  });

  it('the Forge loop is REACHABLE: the starting blade and ore pay the first reforge\'s blocks, so only coins stand between', () => {
    const s = useGameStore.getState();
    const first = forgeOffers({ inventory: s.inventory, coins: s.coins, equipment: s.equipment, relicTiers: s.relicTiers }).find((o) => o.line === 'weapon');
    expect(first?.price.blade, 'the starting loadout holds no blade for the Forge to reforge').toBe('Stone Sword');
    expect(shortfall({ ...s, coins: first.price.coins }, first), 'the first reforge needs blocks a fresh profile lacks').toEqual([]);
    expect(s.inventory.tools.pickaxe, 'the retired pickaxe is back in the loadout').toBeUndefined();
  });

  it('building basics are still present so you can build immediately', () => {
    expect(blocks.wood).toBeGreaterThan(0);
    expect(blocks.stone).toBeGreaterThan(0);
    expect(blocks.dirt).toBeGreaterThan(0);
  });
});
