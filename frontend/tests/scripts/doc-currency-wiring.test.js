import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isolatedGitEnv } from './_isolatedGit.js';
import { run, CHECKS, CANONICAL } from '../../scripts/ci/doc-currency.mjs';

/**
 * DOC-CURRENCY IS TESTED WHERE ITS CHECKS CONNECT, not only in the pure helpers behind them (plan U8a).
 *
 * Until this file, `doc-currency.mjs` ran entirely at module scope with no export, and nothing under
 * `frontend/tests` spawned or imported it. The pure functions it calls (`checkBlock`, `checkFile`, `parseBlock`,
 * `unresolved`) each had tests, so deleting the CALL to one of them, or the loop that feeds it, stayed green under
 * every test in the suite. Each later harness unit that wires a check into doc-currency adds one case here: the
 * check by name through `run({ root: fixture, only: [name], enforce })`, red on a fixture that breaks it and green
 * on its one-token twin.
 *
 * Two seams are driven, because a check can be disconnected at either:
 *   - `run()`, the function every check is wired into, on a fixture root (a tmp dir holding only the files the
 *     named checks read) and on the real tree, where every check must report a non-zero denominator;
 *   - the CLI the pipeline actually invokes (`node scripts/ci/doc-currency.mjs`), on the real tree and on a failing
 *     fixture through its `--root=` seam, so a CLI that stopped printing or exiting on `run()`'s verdict goes red.
 *
 * Sited in tests/scripts: the subject's input is the doc corpus (files), and the tool is EXECUTED against
 * fixtures, never read as source text.
 *
 * Mutation-Proof: via scripts/dev/mutate-batch.mjs against scripts/ci/doc-currency.mjs (10 tests, 2026-10-27 21:00Z);
 * the identity mutant (a trailing `// identity mutant`) SURVIVED, then 16 of 16 observed RED:
 *   M-U8a1  run() skips the dangling check (call site disconnected) -> both dangling cases, both CLI fixture cases
 *   M-U8a2  dangling resolves a citation against the checkout, not `root` -> "...existing path passes"
 *   M-U8a3  dangling reads the docs from the checkout, not `root`   -> both dangling cases
 *   M-U8a4  `only` ignored (every check runs)                        -> the dangling and sections fixture cases
 *   M-U8a5/6/7  an empty `only`, an unknown check name, an unknown enforce flag accepted -> "...is refused"
 *   M-U8a8/9/10 the dangling, packages, sections denominators count nothing -> "...non-zero denominator"
 *   M-U8a11 the CLI exits 0 on errors                               -> "on a failing root, exits 1 ..."
 *   M-U8a12 the CLI drops run()'s warnings                          -> both CLI cases (the fixture sets its own warning)
 *   M-U8a13 the CLI ignores --root                                  -> "on a failing root, exits 1 ..."
 *   M-U8a14 the CLI guard compares resolve(argv[1]) again           -> "run through a symlinked path, still runs ..."
 *   M-U8a15 the space before the section sign dropped again         -> "sections: ... with the full message"
 *   M-U8a16 run() skips the sections check                          -> both sections cases
 *
 * The real-tree denominator case reads what the docs say today: an honest edit that leaves a check with nothing to
 * examine (the last watched-package line, the last `<doc> §` citation) turns it red. That is intended — a check
 * that examines nothing on the real tree guards nothing, and is re-pointed or retired rather than left green.
 *
 * BLIND SPOT: `root` moves where the DOCS are read from. The generated blocks' sources — the hook that defines the
 * gates (gate-table) and the src tree that `measure()` walks — are always this checkout's, so a fixture root can
 * drive `gates` and `measured` only to their "block missing" branches.
 */
const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const fixtures = [];
afterAll(() => {
  for (const dir of fixtures) rmSync(dir, { recursive: true, force: true });
});

/** A tmp root holding every canonical doc (empty) plus `files`. */
function fixture(files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'crafty-doc-currency-'));
  fixtures.push(root);
  const put = (rel, text) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  };
  for (const rel of CANONICAL) put(rel, '');
  for (const [rel, text] of Object.entries(files)) put(rel, text);
  return root;
}

const cli = (...args) =>
  spawnSync(process.execPath, ['scripts/ci/doc-currency.mjs', ...args], { cwd: APP, encoding: 'utf8', env: isolatedGitEnv() });

/** The STATUS age warning carries a day count that can tick over between two runs; nothing else is normalised. */
const steady = (s) => s.replace(/committed in \d+ days/g, 'committed in N days');

describe('doc-currency run() — the seam every check is wired into', () => {
  it('names its checks, and the list is pinned (a check removed from the list stops running silently)', () => {
    expect(CHECKS).toEqual(['dangling', 'packages', 'status', 'gates', 'measured', 'read-order', 'sections']);
  });

  it('dangling: a canonical doc citing a missing path errors', () => {
    const root = fixture({ 'memory/ARCHITECTURE.md': 'see `docs/plans/gone.md`\n', 'docs/plans/here.md': 'x\n' });
    const r = run({ root, only: ['dangling'] });
    expect(r.checked, 'only the named check runs, and it examined the one citation').toEqual({ dangling: 1 });
    expect(r.errors).toEqual(['DANGLING path in memory/ARCHITECTURE.md: "docs/plans/gone.md" does not exist']);
  });

  it('dangling: the same doc citing an existing path passes (one token from the case above)', () => {
    const root = fixture({ 'memory/ARCHITECTURE.md': 'see `docs/plans/here.md`\n', 'docs/plans/here.md': 'x\n' });
    const r = run({ root, only: ['dangling'] });
    expect(r.checked).toEqual({ dangling: 1 });
    expect(r.errors).toEqual([]);
  });

  it('sections: a citation of a section the cited doc does not have errors, with the full message', () => {
    const root = fixture({ 'memory/STATUS.md': '## 2. THE REGISTRY\n', 'memory/ARCHITECTURE.md': 'see STATUS §9 for it\n' });
    const r = run({ root, only: ['sections'] });
    expect(r.checked).toEqual({ sections: 1 });
    expect(r.danglingSections).toBe(1);
    expect(r.errors).toEqual([
      'SECTION-CITATION RATCHET: 1 dangling cross-doc citations, frozen at 0.\n' +
        '      - memory/ARCHITECTURE.md: status §9\n' +
        "    A § pointer to a section that does not exist sends the next reader looking for a rule that isn't there.",
    ]);
  });

  it('sections: the same citation of a section that exists passes (one token from the case above)', () => {
    const root = fixture({ 'memory/STATUS.md': '## 2. THE REGISTRY\n', 'memory/ARCHITECTURE.md': 'see STATUS §2 for it\n' });
    const r = run({ root, only: ['sections'] });
    expect(r.checked).toEqual({ sections: 1 });
    expect(r.errors).toEqual([]);
  });

  it('every check reports a non-zero denominator on the real tree', () => {
    const r = run();
    expect(Object.keys(r.checked).sort(), 'every check ran and reported').toEqual([...CHECKS].sort());
    for (const name of CHECKS) expect(r.checked[name], `${name} examined nothing`).toBeGreaterThan(0);
  });

  it('an unknown check name, an empty `only` or an unknown enforce flag is refused, never an empty run', () => {
    const root = fixture();
    expect(() => run({ root, only: ['danglng'] })).toThrow(/danglng/);
    expect(() => run({ root, only: [] })).toThrow(/only/);
    expect(() => run({ root, only: ['dangling'], enforce: { cursorCap: true } })).toThrow(/cursorCap/);
  });
});

describe('doc-currency CLI — the call site the pipeline runs', () => {
  it('on the real tree, prints run()\'s warnings and verdict and exits on its errors', () => {
    const r = run();
    const p = cli();
    expect(p.status, p.stderr).toBe(r.errors.length ? 1 : 0);
    const warned = p.stderr.split('\n').filter((l) => l.startsWith('⚠ '));
    expect(warned.map(steady)).toEqual(r.warnings.map((w) => steady(`⚠ ${w}`)));
    if (r.errors.length === 0) {
      expect(p.stdout.trim()).toMatch(new RegExp(`^✓ doc-currency PASSED \\(${CANONICAL.length} canonical docs checked; `));
    }
  });

  it('on a failing root, exits 1 and prints every error and warning run() returns — the wiring case among them', () => {
    const root = fixture({ 'memory/ARCHITECTURE.md': 'see `docs/plans/gone.md`\n' });
    const r = run({ root });
    expect(r.errors).toContain('DANGLING path in memory/ARCHITECTURE.md: "docs/plans/gone.md" does not exist');
    // The fixture is not a git checkout, so STATUS's age is unknown: a warning this test sets up itself, so the
    // CLI's warning path is exercised whatever the real tree's STATUS age happens to be.
    expect(r.warnings, 'presence: the fixture produces a warning').toContain(
      'STATUS.md age is unknown here: git log is unavailable, so staleness went unchecked.',
    );
    const p = cli(`--root=${root}`);
    expect(p.status, p.stderr).toBe(1);
    expect(p.stdout).toBe('');
    expect(p.stderr.split('\n').filter((l) => l.startsWith('⚠ '))).toEqual(r.warnings.map((w) => `⚠ ${w}`));
    for (const e of r.errors) expect(p.stderr).toContain(`  • ${e}`);
    expect(p.stderr.split('  • ').length - 1, 'one bullet per error, no more').toBe(r.errors.length);
  });

  it('run through a symlinked path, still runs the lint — never exits 0 having checked nothing', () => {
    const root = fixture({ 'memory/ARCHITECTURE.md': 'see `docs/plans/gone.md`\n' });
    const link = join(mkdtempSync(join(tmpdir(), 'crafty-doc-currency-link-')), 'app');
    fixtures.push(dirname(link));
    symlinkSync(APP, link);
    const p = spawnSync(process.execPath, [join(link, 'scripts/ci/doc-currency.mjs'), `--root=${root}`], {
      cwd: link,
      encoding: 'utf8',
      env: isolatedGitEnv(),
    });
    expect(p.status, `stdout: ${p.stdout}\nstderr: ${p.stderr}`).toBe(1);
    expect(p.stderr).toContain('  • DANGLING path in memory/ARCHITECTURE.md: "docs/plans/gone.md" does not exist');
  });
});
