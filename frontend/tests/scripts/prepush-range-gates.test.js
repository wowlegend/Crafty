import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, chmodSync, realpathSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fixtureGit, isolatedGitEnv } from './_isolatedGit.js';

/**
 * THE PUSH RUNS THE RANGE GATES ON THE PUSHED COMMIT, AND NEVER THE OFFLINE CORE (DECISIONS 2026-10-28 item 24).
 *
 * Two seams, both driven for real:
 *   1. the HOOK: .githooks/pre-push in a throwaway repo whose committed ci/pipeline.sh only records how it was called
 *      (its argv, the file that ran, which committed version it is, whether frontend/node_modules was reachable) and
 *      exits $PIPE_EXIT. The hook must call it once per pushed commit with exactly `--tier=push`: IN PLACE when the
 *      pushed commit is the checkout's HEAD and `git status` lists nothing, from a detached worktree of THAT commit
 *      otherwise (removed afterwards), never run npm, and refuse the push when the pipeline fails.
 *   2. the PIPELINE: the real ci/pipeline.sh with recording `node` / `npm` stubs first on PATH: `--tier=push` runs
 *      opsec-scan and the three commit-range gates, and nothing else.
 *
 * Sited in tests/scripts/: the subjects are the hook and the pipeline, driven as processes.
 *
 * BLIND SPOT: the stubs prove WHICH gates run and where, not that the real gates pass; artifact-currency-scope.test.js
 * runs the real artifact-currency through this hook on both paths.
 */
const ROOT = resolve(__dirname, '../../..');
const HOOK = join(ROOT, '.githooks/pre-push');
const PIPELINE = join(ROOT, 'ci/pipeline.sh');
const ZERO = '0'.repeat(40);
const EXEC_PATH = fixtureGit(process.cwd(), '--exec-path');

let dir;
beforeEach(() => { dir = realpathSync(mkdtempSync(join(tmpdir(), 'crafty-prepush-test-'))); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const git = fixtureGit; // never the caller's repository: tests/scripts/_isolatedGit.js
const lines = (file) => (existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n') : []);

/** The committed stub pipeline, version `v`. The hook cd's into frontend/ first, so `node_modules` is frontend's. */
const stub = (v) =>
  `echo "ARGS $* FROM $0 V ${v} NM $( [ -e node_modules ] && echo present || echo absent )" >> "$PIPE_LOG"\nexit "\${PIPE_EXIT:-0}"\n`;

/** A throwaway repo with one commit, its own installed node_modules (ignored), and stub pipeline version 1. */
function fixtureRepo() {
  const repo = join(dir, 'repo');
  mkdirSync(join(repo, 'ci'), { recursive: true });
  mkdirSync(join(repo, 'frontend/node_modules'), { recursive: true });
  writeFileSync(join(repo, 'ci/pipeline.sh'), stub(1));
  writeFileSync(join(repo, 'frontend/package-lock.json'), '{"lock":1}\n');
  writeFileSync(join(repo, '.gitignore'), 'node_modules/\n');
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.email', 'fixture@example.invalid');
  git(repo, 'config', 'user.name', 'fixture');
  git(repo, 'config', 'commit.gpgsign', 'false');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'fixture');
  return { repo, sha: git(repo, 'rev-parse', 'HEAD') };
}

/** The real hook, fed the stdin a push of `sha` to a new remote branch gives it, with a recording `npm` on PATH. */
function runHook(repo, sha, extra = {}) {
  const log = join(dir, 'pipe.log');
  const npmLog = join(dir, 'npm.log');
  const tmp = join(dir, 'tmp');
  const bin = join(dir, 'bin');
  rmSync(log, { force: true });
  rmSync(npmLog, { force: true });
  mkdirSync(tmp, { recursive: true });
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, 'npm'), `#!/bin/sh\necho "npm $*" >> "${npmLog}"\nexit 0\n`);
  chmodSync(join(bin, 'npm'), 0o755);
  const r = spawnSync('sh', [HOOK, 'origin', 'https://example.invalid/repo.git'], {
    cwd: repo, encoding: 'utf8',
    input: `refs/heads/main ${sha} refs/heads/main ${ZERO}\n`,
    // git prepends its exec-path to PATH when it runs a hook, so a real push reaches the real git binary
    // ahead of any PATH-level wrapper. Mirror that, or an operator's git shim answers instead of git.
    env: isolatedGitEnv({ PIPE_LOG: log, TMPDIR: tmp, PATH: `${EXEC_PATH}:${bin}:${process.env.PATH}`, ...extra }),
  });
  const worktrees = git(repo, 'worktree', 'list', '--porcelain').split('\n').filter((l) => l.startsWith('worktree ')).length;
  return { status: r.status, out: `${r.stdout}${r.stderr}`, calls: lines(log), npm: lines(npmLog), leftovers: readdirSync(tmp), worktrees, tmp };
}

const inPlace = (repo, v = 1) => `ARGS --tier=push FROM ${repo}/ci/pipeline.sh V ${v} NM present`;
const fromWorktree = (tmp, v = 1) => new RegExp(`^ARGS --tier=push FROM ${tmp}/crafty-prepush-\\w+/ci/pipeline\\.sh V ${v} NM present$`);

describe('pre-push — the push tier, on the pushed commit, and never the offline core', () => {
  it('the pushed commit is this clean checkout\'s HEAD: the push tier runs IN PLACE, once, with --tier=push', () => {
    const { repo, sha } = fixtureRepo();
    const r = runHook(repo, sha);
    expect(r.status, r.out).toBe(0);
    expect(r.calls, r.out).toEqual([inPlace(repo)]);
    expect(r.npm, 'the hook ran npm').toEqual([]);
    expect(r.worktrees, 'a worktree was added').toBe(1);
  });

  it('an UNTRACKED file in the checkout: the pushed commit runs from a detached worktree, removed afterwards', () => {
    const { repo, sha } = fixtureRepo();
    writeFileSync(join(repo, 'stray.txt'), 'not in the commit\n');
    const r = runHook(repo, sha);
    expect(r.status, r.out).toBe(0);
    expect(r.calls, r.out).toHaveLength(1);
    expect(r.calls[0], r.out).toMatch(fromWorktree(r.tmp));
    expect(r.leftovers, 'the worktree directory outlived the hook').toEqual([]);
    expect(r.worktrees, 'the worktree is still registered').toBe(1);
    expect(r.npm).toEqual([]);
  });

  it('a MODIFIED tracked file: the worktree runs the COMMIT\'s pipeline, not the edited copy on disk', () => {
    const { repo, sha } = fixtureRepo();
    writeFileSync(join(repo, 'ci/pipeline.sh'), stub(2));
    const r = runHook(repo, sha);
    expect(r.status, r.out).toBe(0);
    expect(r.calls, r.out).toHaveLength(1);
    expect(r.calls[0], r.out).toMatch(fromWorktree(r.tmp, 1));
  });

  it('the pushed commit is NOT HEAD: a worktree of THAT commit, and no install though its lockfile differs', () => {
    const { repo, sha: first } = fixtureRepo();
    writeFileSync(join(repo, 'ci/pipeline.sh'), stub(2));
    writeFileSync(join(repo, 'frontend/package-lock.json'), '{"lock":2}\n');
    git(repo, 'commit', '-q', '-am', 'second');
    expect(git(repo, 'rev-parse', 'HEAD'), 'the fixture: HEAD moved past the pushed commit').not.toBe(first);
    const r = runHook(repo, first);
    expect(r.status, r.out).toBe(0);
    expect(r.calls, r.out).toHaveLength(1);
    expect(r.calls[0], r.out).toMatch(fromWorktree(r.tmp, 1));
    expect(r.npm, 'the hook installed dependencies').toEqual([]);
  });

  it('control: the same second commit pushed while it IS the clean HEAD runs in place, version 2', () => {
    const { repo } = fixtureRepo();
    writeFileSync(join(repo, 'ci/pipeline.sh'), stub(2));
    git(repo, 'commit', '-q', '-am', 'second');
    const r = runHook(repo, git(repo, 'rev-parse', 'HEAD'));
    expect(r.calls, r.out).toEqual([inPlace(repo, 2)]);
  });

  it('a failing push tier REFUSES the push, in place', () => {
    const { repo, sha } = fixtureRepo();
    const r = runHook(repo, sha, { PIPE_EXIT: '1' });
    expect(r.calls, `presence: the pipeline ran\n${r.out}`).toEqual([inPlace(repo)]);
    expect(r.status, r.out).not.toBe(0);
    expect(r.out).not.toMatch(/every pushed commit passed/);
  });

  it('a failing push tier REFUSES the push from a worktree too, and the worktree is still removed', () => {
    const { repo, sha } = fixtureRepo();
    writeFileSync(join(repo, 'stray.txt'), 'x\n');
    const r = runHook(repo, sha, { PIPE_EXIT: '1' });
    expect(r.calls, `presence: the pipeline ran\n${r.out}`).toHaveLength(1);
    expect(r.calls[0]).toMatch(fromWorktree(r.tmp));
    expect(r.status, r.out).not.toBe(0);
    expect(r.leftovers, 'the worktree directory outlived a refused push').toEqual([]);
    expect(r.worktrees).toBe(1);
  });
});

describe('ci/pipeline.sh --tier=push — opsec-scan and the commit-range gates, and nothing else', () => {
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
    return { ...r, cmds: lines(log) };
  }

  it('runs exactly opsec-scan and the three commit-range gates, and prints what it skips', () => {
    const r = runPipeline(['--tier=push']);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.cmds).toEqual([
      'node scripts/ci/opsec-scan.mjs --all',
      'node scripts/ci/queue-ledger.mjs',
      'node scripts/ci/artifact-currency.mjs',
      'node scripts/ci/registry-append-only.mjs',
    ]);
    expect(r.stdout).toMatch(/skipped \(push tier\): doc-currency, eslint, gate-shape, cli-guard, the unit suite, build, bundle byte budget/);
  });

  it('control: the certify tier, under the same stubs, runs the offline core and no range gate', () => {
    const r = runPipeline(['--tier=certify']);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    for (const c of ['npm run --silent lint', 'npm run --silent test:unit', 'npm run --silent build', 'node scripts/ci/bundle-budget.mjs']) {
      expect(r.cmds, c).toContain(c);
    }
    expect(r.cmds).not.toContain('node scripts/ci/artifact-currency.mjs');
  });
});
