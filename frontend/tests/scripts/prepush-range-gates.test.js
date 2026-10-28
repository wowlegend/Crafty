import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fixtureGit, isolatedGitEnv } from './_isolatedGit.js';

/**
 * A RECEIPT SKIPS THE OFFLINE CORE — NEVER THE COMMIT-RANGE GATES.
 *
 * pre-push used to `continue` past ci/pipeline.sh whenever the pushed tree matched the pre-commit receipt.
 * The gates that read a commit range — queue-ledger, artifact-currency, registry-append-only — live in the
 * pipeline's push tier, so on every receipt-matched push they silently never ran, while the hook's own
 * comment said they "run unconditionally, above". artifact-currency, skipped for a day, surfaced 74
 * commits of operator-page drift the first time a push took the full path.
 *
 * Two seams, both driven for real:
 *   1. the HOOK: .githooks/pre-push in a throwaway repo whose committed ci/pipeline.sh only records its
 *      arguments — a receipt match must invoke it with `--range-only`, a mismatch without.
 *   2. the PIPELINE: the real ci/pipeline.sh with recording `node` / `npm` stubs first on PATH, so it runs
 *      offline and in milliseconds — `--range-only` must run exactly the range gates and print every skip.
 *
 * Sited in tests/scripts/: the subjects are the hook and the pipeline, driven as processes.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, each observed RED:
 *   M1 pre-push: the receipt branch `continue`s again (the original defect)        -> hook receipt case RED
 *   M2 pre-push: plausible-wrong — pass --range-only on EVERY push (skips the core on a mismatch) -> mismatch case RED
 *   M3 pipeline: --range-only skips the RANGE steps too (SECTION never set to range) -> range-only case RED
 *      (it exits 3 via the zero-guard — the guard is only reachable through a defect like this one, so
 *      deleting it on its own is an unkillable mutant by construction, and is not claimed here)
 *   M4 pipeline: accept --range-only on the commit tier                             -> tier-refusal case RED
 *
 * BLIND SPOT: the stubs prove WHICH gates run, not that the real gates pass; and the worktree + lockfile
 * branch of the hook runs here only in its symlink form.
 */
const ROOT = resolve(__dirname, '../../..');
const HOOK = join(ROOT, '.githooks/pre-push');
const PIPELINE = join(ROOT, 'ci/pipeline.sh');
const ZERO = '0'.repeat(40);
const EXEC_PATH = fixtureGit(process.cwd(), '--exec-path');

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'crafty-prepush-test-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const git = fixtureGit; // never the caller's repository: tests/scripts/_isolatedGit.js

/** A throwaway repo whose committed ci/pipeline.sh appends its argv to $PIPE_LOG. */
function fixtureRepo() {
  const repo = join(dir, 'repo');
  mkdirSync(join(repo, 'ci'), { recursive: true });
  mkdirSync(join(repo, 'frontend/node_modules'), { recursive: true });
  writeFileSync(join(repo, 'ci/pipeline.sh'), 'echo "ARGS $*" >> "$PIPE_LOG"\n');
  writeFileSync(join(repo, 'frontend/package-lock.json'), '{}\n');
  writeFileSync(join(repo, '.gitignore'), 'node_modules/\n');
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.email', 'fixture@example.invalid');
  git(repo, 'config', 'user.name', 'fixture');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'fixture');
  return { repo, sha: git(repo, 'rev-parse', 'HEAD'), tree: git(repo, 'rev-parse', 'HEAD^{tree}') };
}

function runHook({ repo, sha }) {
  const log = join(dir, 'pipe.log');
  const tmp = join(dir, 'tmp');
  mkdirSync(tmp, { recursive: true });
  const r = spawnSync('sh', [HOOK, 'origin', 'https://example.invalid/repo.git'], {
    cwd: repo, encoding: 'utf8',
    input: `refs/heads/main ${sha} refs/heads/main ${ZERO}\n`,
    // git prepends its exec-path to PATH when it runs a hook, so a real push reaches the real git binary
    // ahead of any PATH-level wrapper. Mirror that, or an operator's git shim answers instead of git.
    env: isolatedGitEnv({ PIPE_LOG: log, TMPDIR: tmp, PATH: `${EXEC_PATH}:${process.env.PATH}` }),
  });
  return { ...r, calls: existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [] };
}

/** A hand-written receipt file, the way ci/write-receipt.sh lays one out. */
function writeReceipt(repo, tree, tier) {
  mkdirSync(join(repo, '.git/crafty-green-trees'), { recursive: true });
  writeFileSync(join(repo, '.git/crafty-green-trees', tree), `${tree} ${tier} 2026-10-28T00:00:00Z\n`);
}
/** The REAL ci/write-receipt.sh, run in the fixture the way the certify tier runs it: the tree first, then the write. */
function certify(repo) {
  const sh = (...args) => spawnSync('sh', [join(ROOT, 'ci/write-receipt.sh'), ...args], { cwd: repo, encoding: 'utf8', env: isolatedGitEnv() });
  const start = sh('--tree');
  expect(start.status, `the real writer refused the start tree: ${start.stderr}`).toBe(0);
  const r = sh(join(repo, '.git/crafty-green-trees'), 'certify', start.stdout.trim());
  expect(r.status, `the real writer refused: ${r.stdout}${r.stderr}`).toBe(0);
}

describe('pre-push — a certify receipt narrows the pipeline, it never skips it', () => {
  it('a certify receipt for the pushed tree: the pipeline IS invoked, with --range-only', () => {
    const f = fixtureRepo();
    writeReceipt(f.repo, f.tree, 'certify');
    const r = runHook(f);
    expect(r.status, r.stderr + r.stdout).toBe(0);
    expect(r.calls).toEqual(['ARGS --tier=push --range-only']);
  });

  it('a receipt of the COMMIT tier for the pushed tree no longer skips the core: full certification', () => {
    const f = fixtureRepo();
    writeReceipt(f.repo, f.tree, 'commit');
    const r = runHook(f);
    expect(r.status, r.stderr + r.stdout).toBe(0);
    expect(r.calls).toEqual(['ARGS --tier=push']);
  });

  it('a certify receipt for a DIFFERENT tree only: full certification', () => {
    const f = fixtureRepo();
    writeReceipt(f.repo, 'a'.repeat(40), 'certify');
    const r = runHook(f);
    expect(r.status, r.stderr + r.stdout).toBe(0);
    expect(r.calls).toEqual(['ARGS --tier=push']);
  });

  it('the old single-file receipt, even naming this tree, is ignored: full certification', () => {
    const f = fixtureRepo();
    writeFileSync(join(f.repo, '.git/crafty-pipeline-green-tree'), `${f.tree} commit 2026-09-22T00:00:00Z\n`);
    const r = runHook(f);
    expect(r.calls).toEqual(['ARGS --tier=push']);
  });

  it('no receipt: full certification', () => {
    const r = runHook(fixtureRepo());
    expect(r.status, r.stderr + r.stdout).toBe(0);
    expect(r.calls).toEqual(['ARGS --tier=push']);
  });

  it('the writer\'s output is what the reader honours: the REAL write-receipt.sh, then the REAL hook', () => {
    const f = fixtureRepo();
    certify(f.repo);
    const r = runHook(f);
    expect(r.status, r.stderr + r.stdout).toBe(0);
    expect(r.calls).toEqual(['ARGS --tier=push --range-only']);
  });

  it('two lanes\' receipts coexist: certifying tree B leaves tree A\'s receipt standing', () => {
    const a = fixtureRepo();
    certify(a.repo);
    writeFileSync(join(a.repo, 'second.txt'), 'b\n');
    git(a.repo, 'add', 'second.txt');
    git(a.repo, 'commit', '-q', '-m', 'second');
    const b = { repo: a.repo, sha: git(a.repo, 'rev-parse', 'HEAD') };
    certify(a.repo);
    expect(runHook(a).calls, 'tree A').toEqual(['ARGS --tier=push --range-only']);
    rmSync(join(dir, 'pipe.log'), { force: true });
    expect(runHook(b).calls, 'tree B').toEqual(['ARGS --tier=push --range-only']);
  });
});

describe('ci/pipeline.sh --range-only — the range gates run, every skipped core step is printed', () => {
  /** Run the REAL pipeline with recording node/npm stubs first on PATH. */
  function runPipeline(args) {
    const bin = join(dir, 'bin');
    const log = join(dir, 'cmd.log');
    mkdirSync(bin, { recursive: true });
    for (const tool of ['node', 'npm']) {
      const p = join(bin, tool);
      writeFileSync(p, `#!/bin/sh\necho "${tool} $*" >> "${log}"\nexit 0\n`);
      chmodSync(p, 0o755);
    }
    const r = spawnSync('bash', [PIPELINE, ...args], {
      encoding: 'utf8', env: isolatedGitEnv({ PATH: `${bin}:${process.env.PATH}` }),
    });
    return { ...r, cmds: existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [] };
  }

  it('runs exactly the three commit-range gates, and none of the offline core', () => {
    const r = runPipeline(['--tier=push', '--range-only']);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.cmds).toEqual([
      'node scripts/ci/queue-ledger.mjs',
      'node scripts/ci/artifact-currency.mjs',
      'node scripts/ci/registry-append-only.mjs',
    ]);
    const skipped = r.stdout.match(/skipped \(certified by a certify receipt/g) || [];
    expect(skipped.length).toBeGreaterThanOrEqual(8); // every core step is NAMED as skipped, not silently absent
    expect(r.stdout).toMatch(/3 commit-range gate\(s\) passed/);
  });

  it('positive control: without --range-only the same stubs see the offline core run', () => {
    const r = runPipeline(['--tier=push']);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.cmds).toContain('npm run --silent test:unit');
    expect(r.cmds).toContain('npm run --silent build');
    expect(r.cmds).toContain('node scripts/ci/artifact-currency.mjs');
  });

  it('--range-only is refused on any tier but push', () => {
    expect(runPipeline(['--tier=commit', '--range-only']).status).toBe(2);
    expect(runPipeline(['--tier=fast', '--range-only']).status).toBe(2);
    expect(runPipeline(['--tier=certify', '--range-only']).status).toBe(2);
  });
});
