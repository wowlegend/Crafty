#!/usr/bin/env node
/**
 * FLAKY-SPEC REPORT — which e2e specs needed a retry to pass.
 *
 * WHAT THIS IS FOR. `retries: 2` in CI means a spec that fails twice and passes on the third attempt
 * makes the run conclude `success`. Playwright calls that FLAKY and prints it in the summary, but the
 * run CONCLUSION is the only thing anyone reads, so flakiness is invisible by default. Two specs were
 * flaky for weeks under that cover and were found only by grepping five runs' logs by hand.
 *
 * WHY NOT JUST `failOnFlakyTests`. Because that turns a retry-then-pass into a hard failure, and at the
 * time of writing there is exactly ONE clean CI run since those two specs were fixed. Flipping a gate on
 * a single observation is the error this session already had to correct once, in this very repo, on this
 * very day. The retries also exist for a real reason — software-WebGL browsers on a shared runner — so
 * the flip must be justified by a record, not by a hope. This instrument BUILDS that record: every run
 * prints its flaky count, so the observation window accumulates where anyone can count it, instead of
 * depending on a future session remembering to grep.
 *
 * IT IS A REPORT, NOT A GATE. It exits 0 even when it finds flaky specs, and even when it finds itself
 * broken. Same posture as `coverage-zero.mjs`. The flip criterion is recorded in
 * `docs/superpowers/DECISIONS.md` — not here, where it would be a comment nobody diffs.
 *
 *   node scripts/ci/flaky-report.mjs [path/to/results.json]
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * PURE. Walk a Playwright JSON report and name every spec that only passed on a retry.
 *
 * Shape verified against `node_modules/playwright/types/testReporter.d.ts` (1.61.1): `stats.flaky` is a
 * top-level tally, `suites` nest recursively via an optional `suites`, and each `tests[].status` is one
 * of 'skipped' | 'expected' | 'unexpected' | 'flaky'.
 *
 * The returned `agrees` field is the point of the function. A walk that silently misses a nested suite
 * returns `flaky: []`, which reads exactly like a clean run — so the walk is checked against
 * `stats.flaky`, a tally computed by Playwright rather than by this file. A mismatch means THIS
 * INSTRUMENT is wrong, and it has to say so rather than print a reassuring zero.
 *
 * @param {object} report  parsed results.json
 * @returns {{flaky: {file: string, line: number, title: string, attempts: number}[],
 *            walked: number, statsFlaky: number, agrees: boolean, empty: boolean,
 *            expected: number, unexpected: number, skipped: number}}
 */
export function summarizeFlaky(report) {
  const flaky = [];
  let walked = 0;

  const walk = (suites) => {
    if (!Array.isArray(suites)) return;
    for (const suite of suites) {
      if (!suite || typeof suite !== 'object') continue;
      for (const spec of Array.isArray(suite.specs) ? suite.specs : []) {
        walked++;
        for (const t of Array.isArray(spec.tests) ? spec.tests : []) {
          if (t && t.status === 'flaky') {
            flaky.push({
              file: spec.file ?? suite.file ?? '(unknown file)',
              line: spec.line ?? 0,
              title: spec.title ?? '(untitled)',
              // Attempts come from THIS spec's results, not from config.retries — the latter is the
              // ceiling and would be reported identically for a spec that passed first time.
              attempts: Array.isArray(t.results) ? t.results.length : 0,
            });
          }
        }
      }
      walk(suite.suites);
    }
  };
  walk(report && report.suites);

  const stats = (report && report.stats) || {};
  const statsFlaky = Number.isFinite(stats.flaky) ? stats.flaky : flaky.length;
  return {
    flaky,
    walked,
    statsFlaky,
    agrees: flaky.length === statsFlaky,
    empty: walked === 0,
    expected: stats.expected || 0,
    unexpected: stats.unexpected || 0,
    skipped: stats.skipped || 0,
  };
}

// CLI kept behind this guard so importing the seam does not run the tool — `cli-guard.mjs` is a pre-push
// gate over exactly that mistake, because a module-scope CLI corrupts the vitest run that imports it.
const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const p = resolve(ROOT, process.argv[2] || 'test-results/results.json');
  if (!existsSync(p)) {
    console.log(`flaky-report: no report at ${p} — nothing to read (this is not a failure)`);
    process.exit(0);
  }
  let r;
  try {
    r = summarizeFlaky(JSON.parse(readFileSync(p, 'utf8')));
  } catch (e) {
    console.log(`flaky-report: could not parse ${p} — ${e.message}`);
    process.exit(0);
  }

  console.log(`\nflaky-report: walked ${r.walked} spec(s) — ${r.expected} passed, ${r.unexpected} failed, ${r.skipped} skipped`);
  if (r.empty) {
    console.log('  ZERO SPECS WALKED. This is not a clean run — the shard ran nothing, or the report is a stub.');
  } else if (!r.agrees) {
    console.log(`  ⚠ MISMATCH: this walk found ${r.flaky.length} flaky, Playwright's own stats say ${r.statsFlaky}.`);
    console.log('    Trust the stats and FIX THIS SCRIPT — a walk that loses specs reports a clean run.');
  }
  if (!r.flaky.length) {
    console.log('  no flaky specs — every spec that passed, passed on its first attempt.');
  } else {
    console.log(`  ${r.flaky.length} spec(s) passed only on a RETRY:`);
    for (const f of r.flaky) console.log(`    ${f.file}:${f.line}  "${f.title}"  (${f.attempts} attempts)`);
    console.log('\n  These pass CI today because retries mask them. See DECISIONS.md for the failOnFlakyTests criterion.');
  }
  process.exit(0); // a report, never a gate — see the header
}
