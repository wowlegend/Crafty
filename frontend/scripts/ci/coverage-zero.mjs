#!/usr/bin/env node
/**
 * ZERO-COVERAGE REPORT — which src/ modules are executed by NO test at all.
 *
 * WHAT THIS IS FOR. 113 of the 131 gate tests read their target as TEXT and execute none of it, so the
 * suite's 2,559-test headline says very little about how much of the app is ever run. Nothing in this repo
 * could answer "which modules does no test touch". This answers exactly that and nothing more.
 *
 * WHAT IT IS EXPLICITLY NOT. It does NOT catch the dead-on-arrival class — the four defects of 2026-08-05
 * where a feature shipped, compiled, gated green and never RAN in the game. Coverage measures whether a
 * TEST executed a line; it can never measure whether the APP reaches it. A module with 100% coverage can
 * be unreachable in the running game, and `AGENTS.md` draws that distinction deliberately. Anyone citing
 * this as evidence that a feature works has misread it.
 *
 * NO THRESHOLD, DELIBERATELY, and this is not laziness. A coverage gate rewards EXECUTION, while
 * `gate-shape.mjs` — already a pre-push gate — exists to reject assertions that are satisfied without
 * verifying anything. Ratcheting a coverage number would push the corpus toward exactly the tests
 * gate-shape is there to reject: ones that import a module, call it, and assert nothing. So this prints
 * and returns 0. It is an instrument, not a gate.
 *
 *   npm run coverage        (vitest run --coverage, then this)
 *   node scripts/ci/coverage-zero.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * PURE. Split a v8 coverage map into executed / never-executed.
 *
 * Both halves are returned so the caller can print a DENOMINATOR. A report that lists only the zeroes
 * cannot distinguish "3 modules untested" from "3 modules untested out of 4" — and this repo has shipped
 * seven instruments that reported a clean pass over input they never examined.
 *
 * @param {Record<string, {s: Record<string, number>}>} cov  coverage-final.json
 * @returns {{zero: string[], executed: number, total: number}}
 */
export function partitionCoverage(cov) {
  const zero = [];
  let executed = 0;
  const files = Object.keys(cov || {});
  for (const f of files) {
    const counts = Object.values((cov[f] && cov[f].s) || {});
    // A file with no statements at all (a pure re-export barrel) is not "uncovered" — it has nothing to
    // execute. Counting it as a zero would inflate the finding with noise.
    if (counts.length === 0) continue;
    if (counts.some((n) => n > 0)) executed++;
    else zero.push(f);
  }
  return { zero: zero.sort(), executed, total: files.length };
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const p = resolve(ROOT, 'coverage/coverage-final.json');
  if (!existsSync(p)) {
    console.log('coverage-zero: no coverage/coverage-final.json — run `npm run coverage` first');
    process.exit(0);
  }
  const { zero, executed, total } = partitionCoverage(JSON.parse(readFileSync(p, 'utf8')));
  console.log(`\ncoverage-zero: ${executed} of ${total} src modules are executed by at least one test`);
  if (!zero.length) {
    console.log('  every module with statements is executed somewhere.');
  } else {
    console.log(`  ${zero.length} module(s) executed by NOTHING:`);
    for (const f of zero) console.log(`    ${relative(ROOT, f)}`);
    console.log('\n  Reminder: this measures whether a TEST ran a line, never whether the GAME reaches it.');
  }
  process.exit(0); // an instrument, never a gate — see the header
}
