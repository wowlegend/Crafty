import { describe, it, expect } from 'vitest';
import { dimensions, scoreOf, verdict, SCORE_KEYS } from '../../scripts/ci/gate-census.mjs';

/**
 * The census is an instrument, so its own reading has to be provable on inputs where the answer is known
 * by construction. R8a: a derived metric needs its own positive control — the estate nearly killed a
 * healthy mutation campaign on a count that was a property of the LOGGING, not of the run.
 *
 * Every fixture here is a synthetic string, never a real repo file. A fixture pointing at the real world
 * expires when the real world moves (R8b), and this file's whole subject is other files.
 *
 * Mutation-Proof: 6 mutations, denominator asserted (10/10 cases collected on every run).
 *   M1 dimensions() stops stripping comments -> the comment-immunity case RED (prose naming a dimension
 *      would score, which is the exact defect that made opsec-scan fire on the files documenting its ban)
 *   M2 `executes` regex drops the vitest/node negative lookahead -> harness-import case RED (importing
 *      `vitest` would count as reaching the subject, which would score ~every test file in the repo)
 *   M3 scoreOf sums a fixed 1 -> scoring case RED
 *   M4 verdict() drops its empty-rows guard -> control-failure case RED (an empty population would report
 *      a flawless corpus forever — R3a, and the single most dangerous reading this file can produce)
 *   M5 verdict() returns code 0 on empty rows -> control-failure case RED (the guard must EXIT, not just
 *      print; printing a denominator while returning success is what made two estate gates useless)
 *   M6 `receipt` matches /Mutation/ instead of the full token -> receipt case RED (the word appears in
 *      prose all over this repo; only the trailing colon makes it a claim)
 */
const wrap = (body) => `import { describe } from 'vitest';\n${body}`;

describe('gate-census dimensions', () => {
  it('executes: an import of the SUBJECT counts', () => {
    expect(dimensions(wrap("import { thing } from '../../src/game/thing.js';")).executes).toBe(true);
  });

  it('executes: a DYNAMIC import of the subject counts too', () => {
    // A test that must load its subject AFTER vi.mock hoisting has to use `await import(...)`. Scoring
    // that as "executes nothing" undercounts exactly the shape the census exists to encourage.
    expect(dimensions("const { thing } = await import('../../src/game/thing.js');").executes).toBe(true);
    expect(dimensions("await import('vitest');").executes).toBe(false); // harness, still excluded
  });

  it('executes: a HARNESS import does not — importing vitest proves nothing about reaching the code', () => {
    for (const m of ['vitest', 'node:fs', '@testing-library/react', '@playwright/test']) {
      expect(dimensions(`import x from '${m}';`).executes, m).toBe(false);
    }
  });

  it('is immune to PROSE about a dimension — comments are stripped before every check', () => {
    // The defect this guards: three separate checks in this repo have matched the documentation of their
    // own rule. A census that scored comments would rank a well-commented weak gate as strong.
    const commented = `// this file has a Mutation-Proof: receipt and imports from '../../src/a.js'\n/* toHaveLength */\nexport const x = 1;`;
    const d = dimensions(commented);
    expect(d.executes).toBe(false);
    expect(d.denominator).toBe(false);
    // `receipt` is deliberately measured on the RAW source: a receipt IS a comment, by design.
    expect(d.receipt).toBe(true);
  });

  it('receipt: only the full token counts, not the bare word', () => {
    expect(dimensions('// Mutation-Proof: deleted X -> RED').receipt).toBe(true);
    expect(dimensions('// mutation testing is good').receipt).toBe(false);
    expect(dimensions('// Mutation proof was considered').receipt).toBe(false);
  });

  it('zeroGuard counts ANY numeric floor, not only the literal zero', () => {
    // A gate asserting `toBeGreaterThan(400)` has a STRONGER guard than `> 0`. Scoring it as absent would
    // push authors toward the weaker form — the census steering the corpus the wrong way.
    expect(dimensions('expect(src.length).toBeGreaterThan(400);').zeroGuard).toBe(true);
    expect(dimensions('expect(rows.length).toBeGreaterThan(0);').zeroGuard).toBe(true);
    expect(dimensions('expect(x).toBe(1);').zeroGuard).toBe(false);
  });

  it('denominator and zeroGuard are detected in code, not prose', () => {
    expect(dimensions('expect(files).toHaveLength(12);').denominator).toBe(true);
    expect(dimensions('expect(rows.length).toBeGreaterThan(0);').zeroGuard).toBe(true);
  });

  it('scoreOf counts the dimensions that are actually present', () => {
    expect(scoreOf({})).toBe(0);
    expect(scoreOf(Object.fromEntries(SCORE_KEYS.map((k) => [k, true])))).toBe(SCORE_KEYS.length);
    expect(scoreOf({ executes: true, receipt: true })).toBe(2);
  });

  it('a file with nothing scores 0, and that is a CLAIM about evidence, not about correctness', () => {
    expect(scoreOf(dimensions('export const x = 1;'))).toBe(0);
  });
});

describe('gate-census verdict', () => {
  it('an EMPTY population is a control failure that EXITS, never a flawless corpus', () => {
    const v = verdict([]);
    expect(v.code).toBe(3);                              // exits — printing alone is not acting
    expect(v.lines.join(' ')).toMatch(/COULD NOT CHECK/);
  });

  it('a real population reports its denominator and exits 0', () => {
    const rows = [
      { file: 'a', group: 'g', executes: true, receipt: false, denominator: false, zeroGuard: false, blindSpot: false, score: 1 },
      { file: 'b', group: 'g', executes: false, receipt: false, denominator: false, zeroGuard: false, blindSpot: false, score: 0 },
    ];
    const v = verdict(rows);
    expect(v.code).toBe(0);
    expect(v.lines[0]).toMatch(/2 check files/);
    expect(v.lines.join('\n')).toMatch(/1\/2 \(50%\)/);   // the count is real, not decorative
  });

  it('never prints a disposition — ranking is not sentencing', () => {
    // The whole reason this instrument exists: the prior one-shot audit's DELETE column was unsafe.
    const v = verdict([{ file: 'a', group: 'g', score: 0 }]);
    expect(v.lines.join('\n')).not.toMatch(/\b(DELETE|REMOVE|SAFE TO)\b/);
  });
});
