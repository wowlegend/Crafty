import { describe, it, expect } from 'vitest';
import { WEAPON_LINE, GOODS, forgeOffers, canAfford, shortfall, buy, bestBlade } from './forge.js';
import { RELIC_MAX_TIER, relicTier, normalizeRelicTiers } from './relics.js';
import { getWeaponBaseDamage } from './equipment.js';

// MARA'S FORGE (DECISIONS 2026-10-28 W1-H item 7; 2026-10-29 items 60-63). Each offer shows its price in mined blocks
// and coins, and buying spends exactly that price or refuses and changes nothing. The states below are built by hand,
// so every count the assertions read is one this file set.
const state = (over = {}) => ({
  inventory: { blocks: { stone: 16, iron: 4, gold: 0, diamond: 0, wood: 16, sand: 16, 'Stone Sword': 1 }, tools: { sword: 1 }, magic: {} },
  coins: 0,
  equipment: { head: null, chest: null, boots: null, weapon: null, offhand: null, relic: null },
  relicTiers: {},
  ...over,
});
const withBlocks = (s, blocks) => ({ ...s, inventory: { ...s.inventory, blocks: { ...s.inventory.blocks, ...blocks } } });
const line = (s, name) => forgeOffers(s).filter((o) => o.line === name);
const weaponOffer = (s) => line(s, 'weapon')[0] || null;

describe('the weapon line', () => {
  it('reforges the best blade held into the next one, whichever bag it is in', () => {
    const o = weaponOffer(state());
    expect(o, 'a fresh profile holding a Stone Sword was offered no weapon').not.toBeNull();
    expect(o.give).toBe('Iron Sword');
    expect(o.price.blade, 'the price does not name the blade it reforges').toBe('Stone Sword');
    expect(o.price.blocks).toEqual({ iron: 4 });
    expect(o.price.coins).toBe(30);
  });

  it('climbs one tier at a time, each dearer than the last, and stops at the Diamond Sword', () => {
    const seen = [];
    for (const blade of WEAPON_LINE) {
      const s = state({ inventory: { blocks: {}, tools: {}, magic: {} }, equipment: { ...state().equipment, weapon: blade } });
      const o = weaponOffer(s);
      const i = WEAPON_LINE.indexOf(blade);
      if (i === WEAPON_LINE.length - 1) {
        expect(o, 'the top blade was offered a next one').toBeNull();
        continue;
      }
      expect(o.give, `${blade} skipped a tier`).toBe(WEAPON_LINE[i + 1]);
      expect(o.price.blade).toBe(blade);
      seen.push(o);
    }
    expect(seen, 'the line has fewer steps than blades').toHaveLength(WEAPON_LINE.length - 1);
    for (let k = 1; k < seen.length; k++) {
      expect(seen[k].price.coins, `${seen[k].give} is not dearer than ${seen[k - 1].give}`).toBeGreaterThan(seen[k - 1].price.coins);
      expect(getWeaponBaseDamage(seen[k].give)).toBeGreaterThan(getWeaponBaseDamage(seen[k - 1].give));
    }
  });

  it('holding no blade at all offers the sword and takes no blade', () => {
    const o = weaponOffer(state({ inventory: { blocks: { wood: 8 }, tools: {}, magic: {} } }));
    expect(o.give).toBe('sword');
    expect(o.price.blade ?? null).toBeNull();
  });

  it('the best blade is the highest on the line, in hand or in any bag; a blade off the line counts for nothing', () => {
    expect(bestBlade(state())).toBe('Stone Sword');
    expect(bestBlade(state({ equipment: { ...state().equipment, weapon: 'Iron Sword' } }))).toBe('Iron Sword');
    expect(bestBlade(state({ inventory: { blocks: { 'Diamond Sword': 0, 'Iron Sword': 1 }, tools: {}, magic: { 'Diamond Sword': 1 } } }))).toBe('Diamond Sword');
    expect(bestBlade(state({ inventory: { blocks: { 'Diamond Sword': 0 }, tools: { pickaxe: 1 }, magic: {} } }))).toBeNull();
  });
});

describe('the relic line', () => {
  it('offers nothing with no relic worn', () => {
    expect(line(state({ coins: 999 }), 'relic')).toEqual([]);
  });

  it('tempers the worn relic one tier at a time, each dearer, and stops at the top tier', () => {
    let s = withBlocks(state({ coins: 10000, equipment: { ...state().equipment, relic: 'Ember Fang' } }), { gold: 99, diamond: 99 });
    const prices = [];
    for (let tier = 2; tier <= RELIC_MAX_TIER; tier++) {
      const [o] = line(s, 'relic');
      expect(o, `no offer for tier ${tier}`).toBeTruthy();
      expect(o.give).toBe('Ember Fang');
      expect(o.tier).toBe(tier);
      prices.push(o.price.coins);
      const r = buy(s, o);
      expect(r.ok, `tier ${tier} refused with everything in hand`).toBe(true);
      expect(relicTier(r.state.relicTiers, 'Ember Fang')).toBe(tier);
      s = r.state;
    }
    expect(line(s, 'relic'), 'a relic at the top tier was offered another').toEqual([]);
    expect(prices[1]).toBeGreaterThan(prices[0]);
  });

  it('a saved tier is read between I and the top, and a relic that does not exist has none', () => {
    const saved = { 'Ember Fang': 2, Lodestone: 9, 'Snare Knot': 'x', 'Prism Shard': 0, constructor: 3, 'Golden Spoon': 3 };
    expect(['Ember Fang', 'Lodestone', 'Snare Knot', 'Prism Shard'].map((n) => relicTier(saved, n))).toEqual([2, RELIC_MAX_TIER, 1, 1]);
    expect(relicTier(null, 'Ember Fang')).toBe(1);
    expect([relicTier(saved, 'constructor'), relicTier(saved, 'Golden Spoon')], 'a name no relic has read a tier').toEqual([1, 1]);
    expect(normalizeRelicTiers(saved), 'an unknown key or a tier I survived the load').toEqual({ 'Ember Fang': 2, Lodestone: RELIC_MAX_TIER });
  });

  it('a relic\'s tier stays with that relic: another worn relic starts at tier I', () => {
    const s = state({ relicTiers: { 'Ember Fang': 3 }, equipment: { ...state().equipment, relic: 'Lodestone' } });
    expect(line(s, 'relic')[0].tier).toBe(2);
  });
});

describe('buy', () => {
  const rich = () => withBlocks(state({ coins: 30 }), { iron: 4 });

  it('with enough, spends exactly the shown price, equips the new blade and touches nothing else', () => {
    const before = rich();
    const o = weaponOffer(before);
    const r = buy(before, o);
    expect(r.ok).toBe(true);
    const after = r.state;
    expect(after.coins, 'the coins debited are not the shown price').toBe(before.coins - o.price.coins);
    expect(after.inventory.blocks.iron).toBe(before.inventory.blocks.iron - o.price.blocks.iron);
    expect(after.inventory.blocks['Stone Sword'], 'the reforged blade was not taken').toBe(0);
    expect(after.equipment.weapon, 'the new blade is not in hand').toBe('Iron Sword');
    expect(getWeaponBaseDamage(after.equipment.weapon)).toBeGreaterThan(getWeaponBaseDamage('Stone Sword'));
    for (const k of Object.keys(before.inventory.blocks).filter((k) => k !== 'iron' && k !== 'Stone Sword')) {
      expect(after.inventory.blocks[k], `${k} moved`).toBe(before.inventory.blocks[k]);
    }
    expect(after.inventory.tools).toEqual(before.inventory.tools);
    expect(before.coins, 'buy mutated the state it was given').toBe(30);
  });

  it('a blade it replaces in hand goes back to the bag; the blade it reforges does not', () => {
    const s = withBlocks(state({ coins: 30, equipment: { ...state().equipment, weapon: 'sword' }, inventory: { blocks: { iron: 4, 'Stone Sword': 1 }, tools: {}, magic: {} } }), {});
    const r = buy(s, weaponOffer(s));
    expect(r.state.equipment.weapon).toBe('Iron Sword');
    expect(r.state.inventory.blocks.sword, 'the sword in hand was lost').toBe(1);
    expect(r.state.inventory.blocks['Stone Sword']).toBe(0);
  });

  it('reforging the blade in hand takes it from the hand, not from a bag', () => {
    const s = state({ coins: 30, inventory: { blocks: { iron: 4, 'Stone Sword': 1 }, tools: {}, magic: {} }, equipment: { ...state().equipment, weapon: 'Stone Sword' } });
    const r = buy(s, weaponOffer(s));
    expect(r.state.equipment.weapon).toBe('Iron Sword');
    expect(r.state.inventory.blocks['Stone Sword'], 'the bag\'s spare blade was taken instead of the one in hand').toBe(1);
    const only = state({ coins: 30, inventory: { blocks: { iron: 4 }, tools: {}, magic: {} }, equipment: { ...state().equipment, weapon: 'Stone Sword' } });
    const r2 = buy(only, weaponOffer(only));
    expect(r2.state.equipment.weapon).toBe('Iron Sword');
    expect(r2.state.inventory, 'the only blade, in hand, came back to a bag after its reforge').toEqual({ blocks: { iron: 0 }, tools: {}, magic: {} });
  });

  it.each([
    ['a block', (s) => withBlocks(s, { iron: 3 })],
    ['the coins', (s) => ({ ...s, coins: 29 })],
  ])('with one short of %s, refuses and returns the same state', (_, short) => {
    const s = short(rich());
    const o = weaponOffer(s);
    expect(canAfford(s, o)).toBe(false);
    const r = buy(s, o);
    expect(r.ok).toBe(false);
    expect(r.state, 'a refused buy returned a new state').toBe(s);
    expect(r.short.length, 'a refusal named nothing short').toBe(1);
  });

  it('shortfall names each part held against its price', () => {
    const s = state({ coins: 5 });
    const o = weaponOffer(withBlocks(s, { iron: 1 }));
    expect(shortfall(withBlocks(s, { iron: 1 }), o)).toEqual([{ key: 'iron', need: 4, have: 1 }, { key: 'coins', need: 30, have: 5 }]);
  });

  it('with exactly the price, buys (the comparison includes equality)', () => {
    const s = rich();
    expect(canAfford(s, weaponOffer(s))).toBe(true);
    expect(shortfall(s, weaponOffer(s))).toEqual([]);
  });

  it('refuses a stale offer, one this state no longer lists, and changes nothing', () => {
    const s = rich();
    const o = weaponOffer(s);
    const once = buy(s, o).state;
    const again = buy(withBlocks({ ...once, coins: 999 }, { iron: 99, 'Stone Sword': 1 }), o);
    expect(again.ok, 'the Iron Sword offer was bought twice').toBe(false);
    expect(buy(s, { ...o, id: 'weapon:Golden Spoon' }).ok).toBe(false);
    expect(buy(s, null).ok).toBe(false);
  });

  it('charges the listed price, not one carried on the offer passed in', () => {
    const s = rich();
    const r = buy(s, { ...weaponOffer(s), price: { blocks: {}, coins: 0, blade: 'Stone Sword' } });
    expect(r.ok).toBe(true);
    expect(r.state.coins).toBe(0);
  });

  it('a NaN, negative or fractional count holds what it floors to, at least nothing', () => {
    const s = state({ coins: NaN, inventory: { blocks: { iron: -4, 'Stone Sword': 1 }, tools: {}, magic: {} } });
    expect(shortfall(s, weaponOffer(s))).toEqual([{ key: 'iron', need: 4, have: 0 }, { key: 'coins', need: 30, have: 0 }]);
    const frac = state({ coins: 30.9, inventory: { blocks: { iron: 3.9, 'Stone Sword': 1 }, tools: {}, magic: {} } });
    expect(canAfford(frac, weaponOffer(frac))).toBe(false);
    const over = state({ coins: 30.5, inventory: { blocks: { iron: 4.5, 'Stone Sword': 1 }, tools: {}, magic: {} } });
    const r = buy(over, weaponOffer(over));
    expect([r.state.inventory.blocks.iron, r.state.coins], 'a fraction of a block or coin survived the purchase').toEqual([0, 0]);
  });
});

describe('goods', () => {
  it('sells the three blocks the world never makes, at the grid\'s rates, for no coins', () => {
    const offers = line(state(), 'goods');
    expect(offers.map((o) => [o.give, o.count, o.price.blocks, o.price.coins])).toEqual([
      ['chest', 1, { wood: 8 }, 0],
      ['cobblestone', 4, { stone: 4 }, 0],
      ['glass', 4, { sand: 4 }, 0],
    ]);
    expect(offers).toHaveLength(GOODS.length);
  });

  it('a chest for eight wood lands in the bag', () => {
    const s = state();
    const chest = line(s, 'goods').find((o) => o.give === 'chest');
    const r = buy(s, chest);
    expect(r.state.inventory.blocks.chest).toBe(1);
    expect(r.state.inventory.blocks.wood).toBe(8);
    expect(r.state.coins).toBe(0);
  });
});
