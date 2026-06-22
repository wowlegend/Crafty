import { describe, it, expect } from 'vitest';
import { wandManaMultiplier, applyWandFocus, WAND_MANA_PER, WAND_MANA_CAP } from './wandFocus.js';

// B7 (Phase B) — wand/crystal economy. The Crystals->Wand trade used to buy a `wand` counter that
// NOTHING consumed (dead sink; crystals had no real payoff). Now each owned wand is a SPELL FOCUS:
// it shaves a small, capped % off spell mana cost — closing the earn(ore->crystals)->spend(crystals->
// wands)->benefit(cheaper spells) loop. Distinct from spell-upgrades (which raise damage). Pure +
// conservative + clamped so it can never zero-out cost or invert.
describe('B7 wand focus — capped spell mana-efficiency', () => {
  it('0 wands = no discount (multiplier 1.0)', () => {
    expect(wandManaMultiplier(0)).toBe(1);
  });
  it('each wand shaves WAND_MANA_PER (linear below the cap)', () => {
    expect(wandManaMultiplier(1)).toBeCloseTo(1 - WAND_MANA_PER, 5);
    expect(wandManaMultiplier(2)).toBeCloseTo(1 - 2 * WAND_MANA_PER, 5);
  });
  it('caps at WAND_MANA_CAP (a big wand stash cannot trivialize mana)', () => {
    const atCap = 1 - WAND_MANA_CAP;
    expect(wandManaMultiplier(999)).toBeCloseTo(atCap, 5);
    expect(wandManaMultiplier(Math.ceil(WAND_MANA_CAP / WAND_MANA_PER) + 5)).toBeCloseTo(atCap, 5);
  });
  it('nullish / negative / NaN wand counts = no discount (safe defaults)', () => {
    expect(wandManaMultiplier(undefined)).toBe(1);
    expect(wandManaMultiplier(null)).toBe(1);
    expect(wandManaMultiplier(-4)).toBe(1);
    expect(wandManaMultiplier(NaN)).toBe(1);
    expect(wandManaMultiplier(2.7)).toBeCloseTo(1 - 2 * WAND_MANA_PER, 5); // floors fractional
  });

  it('applyWandFocus reduces an integer mana cost, floored at 1', () => {
    expect(applyWandFocus(25, 0)).toBe(25);
    expect(applyWandFocus(25, 1)).toBe(Math.max(1, Math.round(25 * (1 - WAND_MANA_PER))));
    expect(applyWandFocus(1, 999)).toBe(1);              // never below 1 — a spell always costs something
    expect(applyWandFocus(25, 999)).toBe(Math.round(25 * (1 - WAND_MANA_CAP)));
  });
  it('cap is bounded so spells stay meaningful (>=50% of base)', () => {
    expect(WAND_MANA_CAP).toBeLessThanOrEqual(0.5);
    expect(WAND_MANA_CAP).toBeGreaterThan(0);
    expect(WAND_MANA_PER).toBeGreaterThan(0);
  });
});
