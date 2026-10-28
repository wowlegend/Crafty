#!/usr/bin/env node
/**
 * gate-census.mjs — rank every check in this repo by MACHINE-DETERMINABLE weakness.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS RATHER THAN ANOTHER AUDIT
 *
 * `docs/superpowers/sota-2026-09/GATES.md` is a 708-line enumeration of 471 check files with a per-file
 * verdict — DELETE / CONVERT / ENHANCE — produced in one pass. Working that list, FOUR of its verdicts
 * were false on contact: a fabricated `game/damageSource.js` path, advice to commit absolute symlinks into
 * a public repo, a file census short by 92, and a DELETE column whose entries included the last remaining
 * guard for a live property (`hud-stat-wire-gates` is named in `tests/e2e/_boot.js` as the committed guard
 * for exactly what the e2e layer says it does NOT assert).
 *
 * The pattern: **the enumeration was reliable at finding CANDIDATES and unreliable at issuing VERDICTS.**
 * A verdict is a judgement about what a check is FOR, which needs the whole codebase in view. A weakness
 * is a property of the check's own text, which a script can read exactly and re-read tomorrow. So this
 * computes the second and refuses to emit the first: it ranks, it does not sentence.
 *
 * This is the estate's instrument-not-instructions rule applied to a review: a frozen verdict list rots
 * the moment anyone edits a gate, while a script re-derives itself on every run.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────
 * THE DIMENSIONS, and what each one is evidence OF
 *
 *   executes    the file IMPORTS its subject rather than reading it as text. A source-grep can only see
 *               that a line exists; it cannot see whether the line RUNS. The repo's own scar list has
 *               four same-day cases of shipped-compiling-gated-green-and-never-reached code.
 *   denominator asserts a COUNT of what it examined. "0 findings" and "never looked" are the same reading
 *               from outside; seventeen things in this repo have shipped a clean report over input they
 *               never examined.
 *   zeroGuard   has an empty-input case that EXITS rather than passing. R3a: a verdict quantified over an
 *               empty set is vacuously true, and that vacuity sits one layer in from the input.
 *   blindSpot   states in the file what it cannot see (R7).
 *
 * A check scoring 0 on every dimension is not necessarily WRONG — it may guard something trivial. It is
 * UNEVIDENCED, which is a different and checkable claim, and the only one this file makes.
 *
 * A `Mutation-Proof:` line inside the file is not a dimension: the receipt lives in the commit trailer, and
 * a check file carries none (DECISIONS 2026-10-28 items 15 and 17).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT IT DELIBERATELY CANNOT SEE, stated per R7
 *
 *   - whether a check has ever been shown to fail. That receipt is a commit trailer, which this file
 *     does not read.
 *   - whether an executing test asserts anything MEANINGFUL. `expect(true).toBe(true)` imports nothing
 *     and would score 0, but a real import plus a weak assertion scores 1 and deserves no credit for it.
 *   - whether a weak gate is the LAST guard for a property. That is precisely the judgement that made the
 *     DELETE column unsafe, and it is why nothing here prints a disposition.
 *
 * Exit: 0 = census produced · 3 = COULD NOT CHECK (empty population — the scan matched nothing).
 * Usage: node scripts/ci/gate-census.mjs [--json <path>] [--top N] [--group <name>]
 */
import { readdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, relative, resolve, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Every file here asserts something, so it can be asked what makes it fail. `scripts/visual/*.mjs` is left
 * out: those probes drive a browser and mostly assert nothing by design.
 */
export const POPULATION = [
  { group: 'tests/gates', re: /^tests\/gates\/.+\.test\.jsx?$/ },
  { group: 'tests/scripts', re: /^tests\/scripts\/.+\.test\.jsx?$/ },
  { group: 'tests/store+data', re: /^tests\/(?!gates\/|scripts\/|e2e\/|visual\/).+\.test\.jsx?$/ },
  { group: 'tests/visual', re: /^tests\/visual\/.+\.test\.jsx?$/ },
  { group: 'tests/e2e', re: /^tests\/e2e\/.+\.spec\.js$/ },
  { group: 'src colocated', re: /^src\/.+\.test\.jsx?$/ },
  { group: 'scripts/ci', re: /^scripts\/ci\/.+\.mjs$/ },
];

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'build' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** The population under `root`, as sorted `{ file, group }` rows with repo-relative paths. */
export function survey(root = APP_ROOT) {
  const rows = [];
  for (const rel of walk(root).map((f) => relative(root, f))) {
    const hit = POPULATION.find((p) => p.re.test(rel));
    if (hit) rows.push({ file: rel, group: hit.group });
  }
  return rows.sort((a, b) => a.file.localeCompare(b.file));
}

/** PURE: the weakness dimensions of one check file's text. */
export function dimensions(src) {
  // Strip comments first: every dimension below is a claim about what the file DOES, and prose about
  // any of them would otherwise score. This repo has three separate cases of a check matching the
  // documentation of its own rule (opsec-scan on the files banning attribution, the flipflops gate on the
  // comment naming the removed value, gate-shape's own report).
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  return {
    // An import of the SUBJECT, not of the test framework. `vitest`, `node:*` and `@testing-library`
    // are harness imports and prove nothing about reaching the code under test.
    // STATIC or DYNAMIC. The first version matched only `import … from '…'`, so a file reaching its
    // subject through `await import('../../src/x.js')` — which is how a test must do it when the module
    // has to load AFTER `vi.mock` calls are hoisted — scored as if it executed nothing. Found by scoring
    // a conversion I had just written and getting 2/5 for a file that drives its subject with fake timers.
    // A census that undercounts the good shape pushes work in the wrong direction, which is worse than
    // being merely incomplete.
    executes: /^\s*import\s[\s\S]*?from\s+'(?!vitest|node:|@testing-library|@playwright)[^']+'/m.test(code)
      || /\bimport\(\s*'(?!vitest|node:|@testing-library|@playwright)[^']+'\s*\)/.test(code),
    denominator: /\b(toHaveLength|toBeGreaterThan|\.length\b[\s\S]{0,40}toBe|scanned|checked|count)\b/.test(code),
    // toBeGreaterThan(N) for ANY N, not just 0. Found by scoring a gate that asserted a source file was
    // longer than 400 chars — a STRONGER guard than `> 0`, scored as none because the detector only knew
    // the literal zero. Same class as the dynamic-import miss: a census that undercounts the better form
    // pushes authors toward the weaker one.
    // Widened 2026-09-22 (third false negative this instrument has found in itself): a `.length` pinned
    // to a NON-ZERO literal — `expect(GATED.length).toBe(12)` — is a zero-guard, and a strict one, since
    // it reds on an empty collection AND on a silently shrunk one. `toBe(0)` is deliberately NOT matched:
    // asserting a collection is empty is the vacuous case this dimension exists to find.
    zeroGuard: /\b(length\)?\s*(===|>)\s*0|toBeGreaterThan\(\s*\d+\s*\)|toHaveLength\(\s*[1-9]|length\s*(?:,[^)]*)?\)\s*\.\s*to(?:Be|Equal)\(\s*[1-9]|COULD NOT CHECK|exit\(3\))/.test(code),
    blindSpot: /(BLIND SPOT|blind spot|cannot see|does NOT prove|CANNOT answer|UNMEASURED)/.test(src),
  };
}

export const SCORE_KEYS = ['executes', 'denominator', 'zeroGuard', 'blindSpot'];
export const scoreOf = (d) => SCORE_KEYS.reduce((n, k) => n + (d[k] ? 1 : 0), 0);

/**
 * PURE: which of `files` (repo-relative) import `subject`, i.e. DRIVE it.
 *
 * A `scripts/ci` helper is a library, and a low score cannot tell a helper several tests drive from one
 * nothing executes. Whether anything imports it is the question that separates them, and it is
 * mechanically answerable.
 */
// Each relative import specifier is resolved against its importer's directory and compared to the subject
// path, because a text match on `ci/<name>.mjs` cannot see a sibling's `'./<name>.mjs'`.
const IMPORT_SPEC = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)['"](\.{1,2}\/[^'"]+)['"]/g;
export function drivenBy(subjectFile, files, readText) {
  return files.filter((f) => {
    if (f === subjectFile) return false;
    const dir = posix.dirname(f);
    for (const m of readText(f).matchAll(IMPORT_SPEC)) {
      if (posix.normalize(posix.join(dir, m[1])) === subjectFile) return true;
    }
    return false;
  });
}

export function census(root = APP_ROOT) {
  const rows = survey(root);
  // Each file is read ONCE (R1.9): drivenBy scans the whole population per scripts/ci subject, which was
  // ~8,000 readFileSync per run for ~500 files.
  const cache = new Map();
  const read = (f) => {
    if (!cache.has(f)) { let t = ''; try { t = readFileSync(resolve(root, f), 'utf8'); } catch { /* absent -> '' */ } cache.set(f, t); }
    return cache.get(f);
  };
  const all = rows.map((r) => r.file);
  return rows.map((row) => {
    const d = dimensions(read(row.file));
    // Only meaningful for the scripts/ci group: a test file is not "driven by" anything, it IS the driver.
    const driven = row.file.startsWith('scripts/ci/') ? drivenBy(row.file, all, read).length : null;
    // An `export` that is not the CLI's own entry point is a SEAM: something a test could execute.
    const exportsSeam = driven !== null && /^export\s+(function|const|class)\s/m.test(read(row.file));
    return { ...row, ...d, driven, exportsSeam, score: scoreOf(d) };
  });
}

/** PURE: the verdict about the CENSUS itself, separated from I/O so a selftest can drive it. */
export function verdict(rows) {
  // R3a — an empty population means the globs stopped matching, which would make every future run report
  // a flawless corpus. That is a control failure, not good news.
  if (!rows.length) {
    return { code: 3, lines: ['gate-census: COULD NOT CHECK — 0 check files matched the population. The scan found nothing; this is a control failure, not a clean corpus.'] };
  }
  const n = rows.length;
  const pct = (k) => `${rows.filter((r) => r[k]).length}/${n} (${Math.round((rows.filter((r) => r[k]).length / n) * 100)}%)`;
  const lines = [
    `gate-census: ${n} check files across ${POPULATION.length} declared groups`,
    '',
    '  DIMENSION      HOW MANY CARRY IT      what its absence means',
    `  executes       ${pct('executes').padEnd(22)} reads its subject as TEXT — cannot see whether the line RUNS`,
    `  denominator    ${pct('denominator').padEnd(22)} a clean report is indistinguishable from never looking`,
    `  zeroGuard      ${pct('zeroGuard').padEnd(22)} an empty subject set passes vacuously`,
    `  blindSpot      ${pct('blindSpot').padEnd(22)} does not say what it cannot see`,
    '',
    ...(() => {
      // A scripts/ci file nothing imports is either a CLI (fine — it is executed, not imported) or a
      // helper with no driver (a real gap). Naming them separately is the whole point of the `driven`
      // dimension: without it they sit indistinguishably among the score-0 rows.
      // STRUCTURAL, not a name list. The first version of this filter matched `/_|-ratchet|read-order|
      // doc-anchors/` — an allowlist of shapes I happened to have in mind, which is the exact defect
      // this session spent the day deleting from other gates (a gate with a named exception is two
      // gates, one unwritten). The real property is: it EXPORTS a seam and nothing imports it. A pure
      // CLI with no exports is legitimately undriven — it is executed, not imported — and a module that
      // offers a seam nobody exercises is a gap whatever it is called.
      const undriven = rows.filter((r) => r.driven === 0 && r.exportsSeam);
      if (!undriven.length) return [];
      return ['', `  UNDRIVEN HELPERS (${undriven.length}) — exports a seam, and no test imports it:`,
        ...undriven.map((r) => `    ${r.file}`)];
    })(),
    '',
    '  BY SCORE (0 = unevidenced on every dimension; it may still guard something real)',
  ];
  for (let s = 0; s <= SCORE_KEYS.length; s++) {
    const c = rows.filter((r) => r.score === s).length;
    if (c) lines.push(`    ${s}/${SCORE_KEYS.length}  ${String(c).padStart(4)} files  ${'#'.repeat(Math.max(1, Math.round((c / n) * 50)))}`);
  }
  return { code: 0, lines };
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('gate-census.mjs')) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  let rows = census();
  const g = arg('--group');
  if (g) rows = rows.filter((r) => r.group === g);
  const v = verdict(rows);
  console.log(v.lines.join('\n'));
  if (v.code === 0) {
    const top = Number(arg('--top') || 0);
    if (top) {
      console.log(`\n  WEAKEST ${top} (ranked; NO disposition — see the docblock on why this file refuses to issue one)`);
      for (const r of rows.filter((x) => x.score === 0).slice(0, top)) console.log(`    0/${SCORE_KEYS.length}  ${r.file}`);
    }
    const json = arg('--json');
    if (json) { writeFileSync(json, `${JSON.stringify(rows, null, 2)}\n`); console.log(`\n  wrote ${json}`); }
  }
  process.exit(v.code);
}
