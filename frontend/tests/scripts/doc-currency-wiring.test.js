import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isolatedGitEnv } from './_isolatedGit.js';
import { run, CHECKS, CANONICAL } from '../../scripts/ci/doc-currency.mjs';
import { derive as deriveGates, renderBlock as renderGates, END as GATES_END } from '../../scripts/ci/gate-table.mjs';
import { measure, renderBlock as renderMeasured } from '../../scripts/ci/measure.mjs';
import { SURFACES, renderBlock as renderReadOrder } from '../../scripts/ci/read-order.mjs';

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
 * Fix round (tranche A review: five of seven checks were never shown to read `root` or to report an ERROR), via
 * mutate-batch (20 tests, 2026-10-27 21:45Z); identity SURVIVED, then 17 of 17 RED, each in its check's red case:
 *   M-A1/2   packages reads package.json / the docs from the checkout, not root
 *   M-A3/4   packages finding downgraded to a warning / its error line never reached
 *   M-A5/6/7 status reads STATUS from the checkout / finding downgraded to a warning / error line deleted
 *   M-A8/9/10   gates: the same three
 *   M-A11/12/13 measured: the same three (the source-file count)
 *   M-A14/15/16 read-order: the same three;  M-A17 read-order reads only the first surface
 * run() iterates the RUNNERS table and throws when a named check records no denominator (review item 4), via
 * mutate-batch (22 tests); identity SURVIVED, then 6 of 6 RED: M-L1 the did-not-run throw deleted, M-L2 the `runners`
 * seam ignored, M-L3 `status` dropped from the table, M-L4 `only` inverted, M-L5 the run order changed, M-L6 a name
 * with no runner called anyway.
 *
 * RECEIPT CORRECTION. f5207462's message records "the neighbouring specs (read-order, gate-table, measure, doc-anchors,
 * cli-guard) 65/65". Those five specs held 58 tests, all green (re-run at ae28b702, 2026-10-27): the run was 58/58.
 *
 * The real-tree denominator case reads what the docs say today: an honest edit that leaves a check with nothing to
 * examine (the last watched-package line, the last `<doc> §` citation) turns it red. That is intended — a check
 * that examines nothing on the real tree guards nothing, and is re-pointed or retired rather than left green.
 *
 * BLIND SPOT: `root` moves where the DOCS are read from. The generated blocks' sources — the hook that defines the
 * gates (gate-table) and the src tree that `measure()` walks — are always this checkout's. So the `gates` and
 * `measured` fixtures hold blocks RENDERED from this checkout's sources (current, or one row/number off): they prove
 * the check reads the block from `root`, and say nothing about a check that read its SOURCE from the wrong place.
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
  it('names its checks in run order, and the list is pinned (run() iterates exactly this list, so a check dropped from it stops running; this pin is what turns that red)', () => {
    expect(CHECKS).toEqual(['dangling', 'packages', 'status', 'gates', 'measured', 'read-order', 'sections']);
    expect(Object.keys(run().checked), 'run() visits the checks in CHECKS order').toEqual([...CHECKS]);
  });

  it('a named check that reports no denominator THROWS — it did not run, and an empty run must never read as a pass', () => {
    const root = fixture();
    expect(() => run({ root, only: ['packages'], runners: { packages: () => {} } })).toThrow(/"packages" did not run/);
    expect(() => run({ root, only: ['packages'], runners: {} }), 'a name with no runner at all').toThrow(/"packages" did not run/);
    // allow twin: a check that ran and examined nothing reports 0, which is a result, not a throw
    const r = run({ root, only: ['packages'], runners: { packages: (_root, out) => { out.checked.packages = 0; } } });
    expect(r.checked).toEqual({ packages: 0 });
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

  // The five checks below each get a red case that is an ERROR only when the check reads the FIXTURE root: the real
  // tree is current for all five (the real-tree case below says so), so a check that read this checkout instead of
  // `root` reports nothing on the red fixture. Each red case pins the exact `errors` and the exact `warnings`, so a
  // finding downgraded to a warning, or its error line deleted, goes red too. Each has a one-token green twin.
  const STATUS_WHOLE = "The single source of truth.\n## 2. THE REGISTRY\n## 3. What's next\n- [LOOP] a\n- [KEVIN] b\n";
  // The fixture root is not a git checkout, so the STATUS age is unknown: the one warning a status run sets up itself.
  const AGE_UNKNOWN = 'STATUS.md age is unknown here: git log is unavailable, so staleness went unchecked.';

  it('packages: a doc claiming a package the fixture package.json lacks errors', () => {
    const root = fixture({
      'memory/ARCHITECTURE.md': 'knip is installed\n',
      'frontend/package.json': JSON.stringify({ devDependencies: { vitest: '1.0.0' } }),
    });
    const r = run({ root, only: ['packages'] });
    expect(r.checked).toEqual({ packages: 1 });
    expect(r.errors).toEqual([
      'STALE PACKAGE CLAIM in memory/ARCHITECTURE.md:1 — claims "knip" is installed/landed, but it is NOT in frontend/package.json.',
    ]);
    expect(r.warnings).toEqual([]);
  });

  it('packages: the same claim passes when the fixture package.json has the package (one token from the case above)', () => {
    const root = fixture({
      'memory/ARCHITECTURE.md': 'knip is installed\n',
      'frontend/package.json': JSON.stringify({ devDependencies: { knip: '1.0.0' } }),
    });
    const r = run({ root, only: ['packages'] });
    expect(r.checked).toEqual({ packages: 1 });
    expect(r.errors).toEqual([]);
  });

  it('status: a fixture STATUS that lost a load-bearing section errors', () => {
    const root = fixture({ 'memory/STATUS.md': STATUS_WHOLE.replace('- [LOOP] a\n', '') });
    const r = run({ root, only: ['status'] });
    expect(r.checked).toEqual({ status: 5 });
    expect(r.errors).toEqual(['STATUS.md has lost at least one [LOOP]-tagged item — it is the source of truth; keep it whole.']);
    expect(r.warnings).toEqual([AGE_UNKNOWN]);
  });

  it('status: the whole fixture STATUS passes (one line from the case above)', () => {
    const root = fixture({ 'memory/STATUS.md': STATUS_WHOLE });
    const r = run({ root, only: ['status'] });
    expect(r.checked).toEqual({ status: 5 });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([AGE_UNKNOWN]);
  });

  it('gates: a stale GATES block in the fixture AGENTS.md errors', () => {
    const { gates } = deriveGates();
    const stale = renderGates(gates).replace(GATES_END, `| stale | row |\n${GATES_END}`);
    const root = fixture({ '.agent/AGENTS.md': `# agents\n\n${stale}\n` });
    const r = run({ root, only: ['gates'] });
    expect(r.checked).toEqual({ gates: gates.length });
    expect(r.errors).toEqual([
      `.agent/AGENTS.md: GATES block is stale (hook defines ${gates.length} gates) — regenerate: node frontend/scripts/ci/gate-table.mjs --write`,
    ]);
    expect(r.warnings).toEqual([]);
  });

  it('gates: the current GATES block passes (one row from the case above)', () => {
    const { gates } = deriveGates();
    const root = fixture({ '.agent/AGENTS.md': `# agents\n\n${renderGates(gates)}\n` });
    const r = run({ root, only: ['gates'] });
    expect(r.checked).toEqual({ gates: gates.length });
    expect(r.errors).toEqual([]);
  });

  it('measured: a MEASURED block claiming twice the source files errors', () => {
    const m = measure();
    const root = fixture({ '.agent/AGENTS.md': `# agents\n\n${renderMeasured({ ...m, srcFiles: m.srcFiles * 2 })}\n` });
    const r = run({ root, only: ['measured'] });
    expect(r.checked).toEqual({ measured: 2 + m.largeFiles.length });
    expect(r.errors).toEqual([
      `.agent/AGENTS.md: MEASURED source files says ${(m.srcFiles * 2).toLocaleString('en-US')}, actual ` +
        `${m.srcFiles.toLocaleString('en-US')} (100% drift, band 10%) — regenerate: node frontend/scripts/ci/measure.mjs --write`,
    ]);
    expect(r.warnings).toEqual([]);
  });

  it('measured: the current MEASURED block passes (one number from the case above)', () => {
    const m = measure();
    const root = fixture({ '.agent/AGENTS.md': `# agents\n\n${renderMeasured(m)}\n` });
    const r = run({ root, only: ['measured'] });
    expect(r.checked).toEqual({ measured: 2 + m.largeFiles.length });
    expect(r.errors).toEqual([]);
  });

  it('read-order: one stale surface among the current ones errors, naming that surface', () => {
    expect(SURFACES.length, 'the red surface below must not be the only one read').toBeGreaterThan(1);
    const files = Object.fromEntries(SURFACES.map((rel) => [rel, `# doc\n\n${renderReadOrder()}\n`]));
    const red = SURFACES[1];
    files[red] = files[red].replace('\n1. ', '\n1.  ');
    const root = fixture(files);
    const r = run({ root, only: ['read-order'] });
    expect(r.checked).toEqual({ 'read-order': SURFACES.length });
    expect(r.errors).toEqual([`${red}: READ-ORDER block is stale — regenerate: node frontend/scripts/ci/read-order.mjs --write`]);
    expect(r.warnings).toEqual([]);
  });

  it('read-order: every surface current passes (one space from the case above)', () => {
    const root = fixture(Object.fromEntries(SURFACES.map((rel) => [rel, `# doc\n\n${renderReadOrder()}\n`])));
    const r = run({ root, only: ['read-order'] });
    expect(r.checked).toEqual({ 'read-order': SURFACES.length });
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
  it('importing the module runs no CLI: the importer\'s output is its own, and it exits 0', () => {
    // cli-guard reads the guard off the AST; this watches the behaviour. Importing in this worker would hide a CLI
    // that ran (on a clean tree it only prints), so a fresh process imports it and owns its stdout and stderr.
    const url = pathToFileURL(join(APP, 'scripts/ci/doc-currency.mjs')).href;
    const p = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(url)}); console.log('imported');`], {
      cwd: APP,
      encoding: 'utf8',
      env: isolatedGitEnv(),
    });
    expect(p.status, p.stderr).toBe(0);
    expect(p.stdout, 'presence: the import finished, and nothing else printed').toBe('imported\n');
    expect(p.stderr).toBe('');
  });

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
