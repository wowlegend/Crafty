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
 *   receipt     carries the literal `Mutation-Proof:` token naming what makes it fail. Shared with
 *               killability-ledger, whose POPULATION and survey() this file imports rather than restates.
 *   denominator asserts a COUNT of what it examined. "0 findings" and "never looked" are the same reading
 *               from outside; seventeen things in this repo have shipped a clean report over input they
 *               never examined.
 *   zeroGuard   has an empty-input case that EXITS rather than passing. R3a: a verdict quantified over an
 *               empty set is vacuously true, and that vacuity sits one layer in from the input.
 *   blindSpot   states in the file what it cannot see (R7).
 *
 * A check scoring 0 on all five is not necessarily WRONG — it may guard something trivial. It is
 * UNEVIDENCED, which is a different and checkable claim, and the only one this file makes.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT IT DELIBERATELY CANNOT SEE, stated per R7
 *
 *   - whether a receipt is TRUE. Nothing can; the token is a claim by its author.
 *   - whether an executing test asserts anything MEANINGFUL. `expect(true).toBe(true)` imports nothing
 *     and would score 0, but a real import plus a weak assertion scores 1 and deserves no credit for it.
 *   - whether a weak gate is the LAST guard for a property. That is precisely the judgement that made the
 *     DELETE column unsafe, and it is why nothing here prints a disposition.
 *
 * Mutation-Proof: 5 mutations against tests/scripts/gate-census.test.js, 10/10 cases collected each run.
 *   M1 stop stripping comments             -> comment-immunity case RED (prose naming a dimension scores)
 *   M2 drop the harness-import lookahead   -> harness-import case RED (`import 'vitest'` would count as
 *      reaching the subject, scoring nearly every file in the repo)
 *   M3 scoreOf always counts 1             -> scoring + zero-score cases RED
 *   M5 empty population returns code 0     -> control-failure case RED (the guard must EXIT, not print)
 *   M6 receipt matches the bare word       -> receipt case RED (only the trailing colon makes it a claim)
 * Restored from a cp backup and diffed byte-identical after each.
 *
 * Exit: 0 = census produced · 3 = COULD NOT CHECK (empty population — the scan matched nothing).
 * Usage: node scripts/ci/gate-census.mjs [--json <path>] [--top N] [--group <name>]
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve, posix } from 'node:path';
import { APP_ROOT, POPULATION, survey } from './killability-ledger.mjs';

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
    receipt: src.includes('Mutation-Proof:'),
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

export const SCORE_KEYS = ['executes', 'receipt', 'denominator', 'zeroGuard', 'blindSpot'];
export const scoreOf = (d) => SCORE_KEYS.reduce((n, k) => n + (d[k] ? 1 : 0), 0);

/**
 * PURE: which of `files` (repo-relative) import `subject`, i.e. DRIVE it.
 *
 * Added 2026-09-22, and it fixes a category error in this file's own output. Five files under
 * `scripts/ci/` all scored 0/5 and read as one uniform class of "unevidenced". Four of them are pure
 * HELPER modules — `_density-ratchet` is imported by FOUR tests, `_gate-ratchet` by one — and scoring a
 * library on "does it carry a Mutation-Proof receipt" is asking the wrong question of it. Exactly one of
 * the five, `read-order.mjs`, was driven by nothing at all: the generator behind the orientation block
 * rendered into three surfaces, with no test anywhere.
 *
 * So the uniform low score CONVEYED NOTHING and hid the single real gap inside it. That is this repo's
 * own "read the count, not the tick" turned on the census itself. A helper's meaningful question is not
 * "does it have a receipt" but "does anything execute it", and that is mechanically answerable.
 */
//
// RESOLVED, NOT MATCHED (QUEUE R1.7). The first version matched `…ci/<name>.mjs` in an import string, which
// cannot see a SIBLING — `scripts/ci/gate-census.mjs` imports `'./killability-ledger.mjs'`, no `ci/` in it —
// so a helper driven only by another CI script was listed UNDRIVEN. Every relative import specifier is now
// resolved against its importer's directory and compared to the subject path, which is what an import IS.
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
  // survey() returns { rows, total, receipted, unreceipted } — not an array. Read the shape from the
  // source rather than assuming it; the first draft called .map on the envelope and threw.
  const rows = survey(root).rows;
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
    `  receipt        ${pct('receipt').padEnd(22)} never states what makes it fail`,
    `  denominator    ${pct('denominator').padEnd(22)} a clean report is indistinguishable from never looking`,
    `  zeroGuard      ${pct('zeroGuard').padEnd(22)} an empty subject set passes vacuously`,
    `  blindSpot      ${pct('blindSpot').padEnd(22)} does not say what it cannot see`,
    '',
    ...(() => {
      // A scripts/ci file nothing imports is either a CLI (fine — it is executed, not imported) or a
      // helper with no driver (a real gap). Naming them separately is the whole point of the `driven`
      // dimension: without it they sit indistinguishably among the 0/5 rows.
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
  for (let s = 0; s <= 5; s++) {
    const c = rows.filter((r) => r.score === s).length;
    if (c) lines.push(`    ${s}/5  ${String(c).padStart(4)} files  ${'#'.repeat(Math.max(1, Math.round((c / n) * 50)))}`);
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
      for (const r of rows.filter((x) => x.score === 0).slice(0, top)) console.log(`    0/5  ${r.file}`);
    }
    const json = arg('--json');
    if (json) { writeFileSync(json, `${JSON.stringify(rows, null, 2)}\n`); console.log(`\n  wrote ${json}`); }
  }
  process.exit(v.code);
}
