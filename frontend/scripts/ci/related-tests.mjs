#!/usr/bin/env node
/**
 * related-tests.mjs — the commit tier's unit step: only the test files that statically import a staged file.
 *
 *   node scripts/ci/related-tests.mjs --staged-list <file>
 *
 * <file> holds one staged path per line, relative to frontend/ (ci/git-env.sh `staged_frontend_files`). Run from
 * frontend/. The selection is `vitest related`, which follows STATIC imports only: a lazily imported module and a
 * gate that reads a file as text are not selected. The full suite, build and bundle budget run in CI on every sha and
 * by hand in the certify tier, so this step trades coverage for speed on the commit alone, and its line says so on
 * every run.
 *
 * Exit: vitest's own status when tests ran · 0 when nothing was staged or nothing was selected (each printed as
 * such) · 3 when the list is missing or the test-file count cannot be read (COULD NOT CHECK).
 */
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

export const TAIL = 'dynamic imports, source-grep gates, the full suite, build and bundle run in CI and certify';

/** PURE. The staged paths in a list file's text: one per line, blanks dropped. */
export function parseList(text) {
  return String(text).split('\n').map((l) => l.trim()).filter(Boolean);
}

/** PURE. The line printed for S staged files, N selected of M test files. */
export function summary({ staged, selected = 0, total = 0 }) {
  if (staged === 0) return 'related tests: 0 staged frontend file(s), 0 selected — SKIPPED, not a pass';
  if (selected === 0) return `related tests: 0 selected from ${staged} staged file(s) — nothing imports them statically`;
  return `related tests: ${selected} of ${total} test files selected by static import from ${staged} staged file(s); ${TAIL}`;
}

const vitest = (args) => spawnSync('npx', ['vitest', ...args], { encoding: 'utf8', stdio: ['ignore', 'inherit', 'inherit'] });

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function main(argv) {
  const at = argv.indexOf('--staged-list');
  const listPath = at >= 0 ? argv[at + 1] : '';
  let staged;
  try {
    staged = parseList(readFileSync(listPath, 'utf8'));
  } catch {
    console.log(`related tests: COULD NOT CHECK — no staged list at ${JSON.stringify(listPath || '(none given)')}`);
    return 3;
  }
  if (staged.length === 0) {
    console.log(summary({ staged: 0 }));
    return 0;
  }

  const out = mkdtempSync(join(tmpdir(), 'crafty-related-'));
  try {
    const listing = vitest(['list', '--filesOnly', `--json=${join(out, 'list.json')}`]);
    const all = readJson(join(out, 'list.json'));
    if (listing.status !== 0 || !Array.isArray(all) || all.length === 0) {
      console.log('related tests: COULD NOT CHECK — `vitest list --filesOnly` listed no test files, so there is no denominator');
      return 3;
    }
    const run = vitest([
      'related', '--run', '--passWithNoTests',
      '--reporter=default', '--reporter=json', `--outputFile.json=${join(out, 'run.json')}`,
      ...staged,
    ]);
    const report = readJson(join(out, 'run.json'));
    if (!report || !Array.isArray(report.testResults)) {
      console.log(`related tests: vitest exited ${run.status} and wrote no report`);
      return run.status || 1;
    }
    const files = report.testResults.map((t) => relative(process.cwd(), t.name)).sort();
    console.log(summary({ staged: staged.length, selected: files.length, total: all.length }));
    for (const f of files) console.log(`  selected: ${f}`);
    return run.status ?? 1;
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
