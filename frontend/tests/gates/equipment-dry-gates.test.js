import { describe, it, expect } from 'vitest';
import { SRC, carriersOf, sourceFiles } from './_srcWalk.js';
import { getWeaponBaseDamage } from '../../src/game/equipment.js';

/**
 * Equipment DRY gate — the weapon damage ladder has exactly one home.
 *
 * REWRITTEN 2026-09-22, selected by `gate-census.mjs` at 0/5. Its "the ladder is not inlined" claim
 * checked TWO hand-named files. That is the scope-qualified shape: correct about `Components.jsx` and
 * `GamePanels.jsx`, silent about every other module, and a re-inlined ladder lands wherever someone is
 * working rather than where the gate happens to look. It also pinned one rung by literal
 * (`'Stone Sword') baseWeaponDmg = 12`), so an inlined copy with any other weapon or number passed.
 *
 * The ladder's VALUES are not re-asserted here — `src/game/equipment.test.js` already drives
 * `getWeaponBaseDamage`. What this gate owns is the DRY property: one source, and every consumer
 * reaching it through the shared module rather than carrying its own copy.
 *
 * BLIND SPOT, stated (R7): the inlined-ladder detector matches an identifier assigned a NUMBER under a
 * weapon-name equality. A copy written as its own lookup OBJECT with different key names, or assembled
 * at runtime, is invisible to it — and widening it that far was measured to false-positive on four
 * legitimate files (recipes, items, player models, the store all name three or more weapons for honest
 * reasons), so the count of weapon names is NOT a usable signal here. The fallback assertion below is the real safety net: it pins that the shared module
 * answers for an UNKNOWN weapon, which is the behaviour an inlined `if/else` chain silently gets wrong.
 *
 * Mutation-Proof: 4 mutations, recorded on the commit. Denominator asserted on the src walk.
 */
describe('equipment DRY gates', () => {
  const files = sourceFiles();

  it('the src walk reached the codebase', () => {
    expect(files.length).toBeGreaterThan(300);
  });

  it('NOTHING in src/ inlines a weapon damage ladder — repo-wide, not two named files', () => {
    // ANY identifier assigned a NUMBER under a weapon-name equality. The first version of this required
    // the variable to be named `*dmg*`, and a mutation planting `if (w === 'Stone Sword') d = 12;`
    // walked straight through it — the detector was name-dependent, which is the defect, not the
    // mutation. Measured against the current tree: 0 false positives, and it catches both the `d = 12`
    // and `baseWeaponDmg = 20` shapes while ignoring a UI branch that returns JSX.
    const INLINED = /===\s*'[A-Z][a-z]+ (?:Sword|Axe|Pickaxe|Bow|Shovel)'\s*\)?\s*\)?[^;{]{0,30}?\b[A-Za-z_$][\w$]*\s*=\s*\d+/;
    expect(carriersOf(INLINED, files), 'a weapon damage ladder is inlined outside game/equipment.js')
      .toEqual([]);
  });

  it('the shared module is the ONLY place weapon base damage is decided', () => {
    // A consumer must import the function, not re-derive it. `game/equipment.js` is the definition and
    // is named here rather than excluded, so the expectation is legible.
    const carriers = carriersOf(/WEAPON_BASE_DAMAGE/, files);
    expect(carriers, 'the damage table is being read outside its module').toEqual(['game/equipment.js']);
  });

  it('both UI consumers reach it through the shared function', () => {
    const consumers = carriersOf(/getWeaponBaseDamage\s*\(/, files);
    expect(consumers, 'a consumer stopped using the shared weapon-damage function')
      .toEqual(expect.arrayContaining(['Components.jsx', 'ui/GamePanels.jsx']));
    expect(consumers.length, 'the definition plus at least the two UI consumers').toBeGreaterThanOrEqual(3);
  });

  it('an UNKNOWN weapon falls back rather than returning undefined — what an inlined chain gets wrong', () => {
    // The behavioural reason the ladder must be shared. An inlined if/else returns undefined for a
    // weapon nobody listed, and `undefined` damage propagates into combat arithmetic as NaN.
    expect(getWeaponBaseDamage('Some Weapon That Does Not Exist')).toBe(5);
    expect(getWeaponBaseDamage(undefined)).toBe(5);
    expect(Number.isFinite(getWeaponBaseDamage(null))).toBe(true);
  });

  it('GamePanels no longer defines a local getItemSlot', () => {
    expect(carriersOf(/const\s+getItemSlot\s*=/, files), 'a local slot resolver is back').toEqual([]);
  });
});
