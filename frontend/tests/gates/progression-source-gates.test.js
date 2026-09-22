import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SRC, strip, sourceFiles } from './_srcWalk.js';
import { deriveMaxStats, xpForLevel } from '../../src/game/progression.js';


/**
 * A3 progression single-source gate — the max-stat formula has exactly one home.
 *
 * REWRITTEN 2026-09-22, selected by `gate-census.mjs` at 0/5. The old version had a hole its own title
 * announced: it claimed "the level-up max-stat formula lives ONLY in progression.js" and then never once
 * read progression.js. It checked three hand-named files for the formula's ABSENCE. Delete the formula
 * from progression.js itself and all four cases stayed green while every level-up in the game silently
 * stopped granting health — a dead instrument and a clean codebase reading identically, which is the
 * defect this repo has shipped seventeen times.
 *
 * Two changes. First, the PRESENCE is driven: `deriveMaxStats` is a pure function, so the formula is
 * asserted by calling it, not by matching its text. Second, "only" now means only — the uniqueness claim
 * walks all of `src/` instead of the three files someone thought of, so a fourth copy appearing in a file
 * nobody listed reds here. A scope-qualified claim ("only", over three files) is the shape that survives
 * fact-checking while being false.
 *
 * BLIND SPOT, stated (R7): the uniqueness half matches the formula's TEXT, so a duplicate written with
 * different spacing or decomposed into named constants would evade it. The driven half is exact but
 * speaks only for `deriveMaxStats`; nothing here proves the game CALLS it on level-up.
 *
 * Mutation-Proof: 4 mutations, recorded on the commit. Denominator asserted (the src walk must exceed
 * 300 files, or "appears in exactly one" is quantifying over nothing).
 */
describe('progression single-source gates', () => {
  const files = sourceFiles();
  // The formula as it is actually written, tolerant of spacing but not of a different shape.
  const FORMULA = /100\s*\+\s*\(\s*lv?e?v?e?l?\s*-\s*1\s*\)\s*\*\s*10\s*\+/;

  it('the src walk reached the codebase — every claim below quantifies over it', () => {
    expect(files.length).toBeGreaterThan(300);
  });

  it('deriveMaxStats IS the formula — driven, not matched', () => {
    // The presence the "only" claim depends on. Values are the A3 design's, fixed before this gate.
    const attrs = { strength: 0, intellect: 0 };
    expect(deriveMaxStats(1, attrs).maxHealth).toBe(100);
    expect(deriveMaxStats(5, attrs).maxHealth).toBe(140); // 100 + 4*10
    expect(deriveMaxStats(1, { strength: 3, intellect: 0 }).maxHealth).toBe(115); // + str*5
    expect(deriveMaxStats(5, attrs).maxMana).toBe(120); // 100 + 4*5
    expect(deriveMaxStats(1, { strength: 0, intellect: 4 }).maxMana).toBe(108); // + int*2
    // The COUPLINGS, which are what a tuner could break without noticing.
    expect(deriveMaxStats(9, attrs).maxHealth - deriveMaxStats(8, attrs).maxHealth).toBe(10);
    expect(xpForLevel(2)).toBeGreaterThan(xpForLevel(1));
  });

  it('the mana bonus reads `intellect` — the store\'s spelling, not `intelligence`', () => {
    // Writing this gate, I typed `intelligence` and got 100 mana back. That is not a hypothetical: the
    // attribute is spelled `intellect` in all ten files that name it and `intelligence` in none, so a
    // rename landing in the store but not here would zero every player's intellect mana bonus and throw
    // nothing. Both spellings are pinned so the silent-zero direction cannot return.
    expect(deriveMaxStats(1, { intellect: 5 }).maxMana).toBe(110);
    expect(deriveMaxStats(1, { intelligence: 5 }).maxMana).toBe(100);
  });

  it('the formula appears in exactly ONE file in all of src/', () => {
    const carriers = files.filter((f) => FORMULA.test(strip(readFileSync(f, 'utf8'))))
      .map((f) => f.slice(SRC.length + 1));
    expect(carriers, 'the max-stat formula must have exactly one home').toEqual(['game/progression.js']);
  });

  it('the old owners hold no level/XP useState of their own', () => {
    const s = readFileSync(resolve(SRC, 'SimpleExperienceSystem.jsx'), 'utf8');
    expect(/const\s*\[\s*playerLevel\s*,/.test(s)).toBe(false);
    expect(/const\s*\[\s*currentXP\s*,/.test(s)).toBe(false);
    expect(/const\s*\[\s*totalXP\s*,/.test(s)).toBe(false);
    expect(/setGetPlayerLevel/.test(readFileSync(resolve(SRC, 'App.jsx'), 'utf8'))).toBe(false);
  });
});
