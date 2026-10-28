import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { dimensions, scoreOf, verdict, SCORE_KEYS, drivenBy, survey, POPULATION } from '../../scripts/ci/gate-census.mjs';

/**
 * The census is an instrument, so its own reading has to be provable on inputs where the answer is known
 * by construction. R8a: a derived metric needs its own positive control — the estate nearly killed a
 * healthy mutation campaign on a count that was a property of the LOGGING, not of the run.
 *
 * Every fixture here is synthetic (a string, or a scratch tree for survey()), never a real repo file. A
 * fixture pointing at the real world expires when the real world moves (R8b), and this file's whole
 * subject is other files.
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
  });

  it('a Mutation-Proof line in the file scores nothing: the receipt is the commit trailer (DECISIONS 2026-10-28 item 17)', () => {
    expect(SCORE_KEYS).toEqual(['executes', 'denominator', 'zeroGuard', 'blindSpot']);
    const receiptOnly = dimensions('// Mutation-Proof: deleted X -> RED\nexport const x = 1;');
    expect(receiptOnly).not.toHaveProperty('receipt');
    expect(scoreOf(receiptOnly)).toBe(0);
  });

  it('zeroGuard counts ANY numeric floor, not only the literal zero', () => {
    // A gate asserting `toBeGreaterThan(400)` has a STRONGER guard than `> 0`. Scoring it as absent would
    // push authors toward the weaker form — the census steering the corpus the wrong way.
    expect(dimensions('expect(src.length).toBeGreaterThan(400);').zeroGuard).toBe(true);
    expect(dimensions('expect(rows.length).toBeGreaterThan(0);').zeroGuard).toBe(true);
    expect(dimensions('expect(x).toBe(1);').zeroGuard).toBe(false);
  });

  it('a .length pinned to a non-zero literal is a zero-guard; pinned to ZERO it is not', () => {
    // Widened 2026-09-22 after the detector scored `expect(GATED.length).toBe(12)` as no guard at all.
    // That form is STRICTER than `> 0` — it reds on an empty collection and on a silently shrunk one —
    // so scoring it zero pushed authors toward the weaker shape. Both directions are pinned here, and the
    // `toBe(0)` case is the one that must stay FALSE: asserting a collection is empty is the vacuous
    // verdict this dimension exists to find, not a guard against it.
    expect(dimensions('expect(GATED.length).toBe(12);').zeroGuard).toBe(true);
    expect(dimensions('expect(files.length).toEqual(5);').zeroGuard).toBe(true);
    expect(dimensions('expect(GATED.length, "msg").toBe(3);').zeroGuard).toBe(true);
    expect(dimensions('expect(GATED.length).toBe(0);').zeroGuard).toBe(false);
    expect(dimensions('expect(x.size).toBe(3);').zeroGuard).toBe(false);
  });

  it('denominator and zeroGuard are detected in code, not prose', () => {
    expect(dimensions('expect(files).toHaveLength(12);').denominator).toBe(true);
    expect(dimensions('expect(rows.length).toBeGreaterThan(0);').zeroGuard).toBe(true);
  });

  it('scoreOf counts the dimensions that are actually present', () => {
    expect(scoreOf({})).toBe(0);
    expect(scoreOf(Object.fromEntries(SCORE_KEYS.map((k) => [k, true])))).toBe(SCORE_KEYS.length);
    expect(scoreOf({ executes: true, receipt: true }), 'a key outside SCORE_KEYS scores nothing').toBe(1);
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
      { file: 'a', group: 'g', executes: true, denominator: false, zeroGuard: false, blindSpot: false, score: 1 },
      { file: 'b', group: 'g', executes: false, denominator: false, zeroGuard: false, blindSpot: false, score: 0 },
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

describe('drivenBy — an import is RESOLVED against its importer, not matched as text (R1.7)', () => {
  // Mutation-Proof: via scripts/dev/mutate.sh against scripts/ci/gate-census.mjs, each observed RED —
  //   M1 revert to the `ci/<name>.mjs` text match (the sibling case)      M2 skip relative resolution (join dropped)
  //   M3 plausible-wrong: compare basenames only (the lookalike case)
  const SUBJECT = 'scripts/ci/helper.mjs';
  const files = {
    [SUBJECT]: 'export const x = 1;',
    'scripts/ci/sibling.mjs': "import { x } from './helper.mjs';",
    'tests/scripts/driver.test.js': "import { x } from '../../scripts/ci/helper.mjs';",
    'tests/scripts/dynamic.test.js': "const m = await import('../../scripts/ci/helper.mjs');",
    'tests/scripts/prose.test.js': '// see scripts/ci/helper.mjs for the rule; run node scripts/ci/helper.mjs',
    'scripts/ci/lookalike.mjs': "import { y } from './other/helper.mjs';",
    'scripts/ci/prefix.mjs': "import { z } from './helper.mjs.bak';",
  };
  const read = (f) => files[f] ?? '';
  const drivers = drivenBy(SUBJECT, Object.keys(files), read).sort();

  it('a SIBLING import in scripts/ci counts — the case the text match could not see', () => {
    expect(drivers).toContain('scripts/ci/sibling.mjs');
  });
  it('static and dynamic imports from tests count', () => {
    expect(drivers).toContain('tests/scripts/driver.test.js');
    expect(drivers).toContain('tests/scripts/dynamic.test.js');
  });
  it('prose, a same-named file elsewhere, and a longer path do NOT count — and the subject never drives itself', () => {
    expect(drivers).toEqual(['scripts/ci/sibling.mjs', 'tests/scripts/driver.test.js', 'tests/scripts/dynamic.test.js']);
  });
});

describe('survey — the population the census ranks, walked on a scratch tree', () => {
  const root = mkdtempSync(join(tmpdir(), 'gate-census-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const IN = {
    'tests/gates/a.test.js': 'tests/gates',
    'tests/gates/b.test.jsx': 'tests/gates',
    'tests/scripts/c.test.js': 'tests/scripts',
    'tests/store/d.test.js': 'tests/store+data',
    'tests/visual/e.test.js': 'tests/visual',
    'tests/e2e/f.spec.js': 'tests/e2e',
    'src/game/g.test.js': 'src colocated',
    'scripts/ci/h.mjs': 'scripts/ci',
  };
  const OUT = [
    'scripts/visual/capture.mjs',
    'scripts/dev/mutate.sh',
    'src/game/g.js',
    'tests/e2e/_boot.js',
    'tests/gates/node_modules/x.test.js',
    'tests/gates/build/y.test.js',
    'tests/gates/.hidden/z.test.js',
  ];
  for (const rel of [...Object.keys(IN), ...OUT]) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), 'export const x = 1;\n');
  }

  it('finds every declared group, sorted, and nothing outside them', () => {
    const rows = survey(root);
    expect(rows).toEqual(Object.keys(IN).sort((a, b) => a.localeCompare(b)).map((file) => ({ file, group: IN[file] })));
    expect(new Set(rows.map((r) => r.group)).size, 'every declared group is represented').toBe(POPULATION.length);
  });

  it('an empty tree surveys to nothing, which the verdict refuses as COULD NOT CHECK', () => {
    const empty = mkdtempSync(join(tmpdir(), 'gate-census-empty-'));
    try {
      expect(survey(empty)).toEqual([]);
      expect(verdict(survey(empty)).code).toBe(3);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
