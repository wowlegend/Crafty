import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fixtureGit, isolatedGitEnv } from './_isolatedGit.js';

/**
 * THE RECEIPT MUST CERTIFY THE TREE THAT WAS TESTED (QUEUE R1.3).
 *
 * The commit-tier pipeline runs every step against the WORKING TREE, then wrote a receipt keyed on
 * `git write-tree` — the INDEX. With a partial stage those differ, and pre-push skipped the offline core for
 * a tree no gate had ever run against. The fix moved the write into ci/write-receipt.sh, which refuses when
 * the working tree differs from the index on any pipeline input.
 *
 * THIS DRIVES THE REAL SCRIPT in a real throwaway git repo — not a re-implementation of its condition —
 * because the defect lived in the seam between "what was tested" and "what was recorded", and only git
 * itself can say what those are.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh against ci/write-receipt.sh, each observed RED:
 *   M1 drop the unstaged check (`git diff --name-only` -> `true`)        -> partial-stage case RED
 *   M2 drop the untracked check (ls-files --others -> `true`)            -> untracked-input case RED
 *   M3 plausible-wrong: check the INDEX against HEAD (`git diff --cached`) instead of worktree vs index
 *                                                                           -> partial-stage case RED
 *   M-U4 plausible-wrong: re-add a `:(exclude).state` pathspec            -> "a modified TRACKED file anywhere" RED
 *        (until U4 the script carved `.state/` out and this line pinned the carve-out; harness state is now
 *         ignored and untracked, so nothing tracked is exempt)
 *   M5 remove `frontend` from INPUT_ROOTS                                 -> untracked-input case RED
 *   and against ci/pipeline.sh: M6 inline `git write-tree` back in        -> single-writer case RED
 *   fix round (tranche A review, item 3), via mutate-batch, identity SURVIVED, each -> "LINKED WORKTREE's hook" RED:
 *   M-R1 the toplevel found under the hook's GIT_DIR (unscrubbed rev-parse) · M-R2 no `cd "$ROOT"` · M-R3 helper not sourced
 *
 * BLIND SPOT: this proves the script refuses a dirty tree; it does not prove pre-push HONOURS only exact
 * matches — that is .githooks/pre-push's reader, gated separately by its tier comparison.
 */
const ROOT = resolve(__dirname, '../../..');
const SCRIPT = join(ROOT, 'ci/write-receipt.sh');

const git = fixtureGit; // never the caller's repository: tests/scripts/_isolatedGit.js
const run = (cwd, receipt) => spawnSync('sh', [SCRIPT, receipt], { cwd, encoding: 'utf8', env: isolatedGitEnv() });

let repo;
let receipt;
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'crafty-receipt-'));
  receipt = join(repo, '.git', 'crafty-pipeline-green-tree');
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.email', 'fixture@example.invalid');
  git(repo, 'config', 'user.name', 'fixture');
  mkdirSync(join(repo, 'frontend/src'), { recursive: true });
  mkdirSync(join(repo, '.state'), { recursive: true });
  writeFileSync(join(repo, 'frontend/src/a.js'), 'export const a = 1;\n');
  writeFileSync(join(repo, 'frontend/src/b.js'), 'export const b = 1;\n');
  writeFileSync(join(repo, '.state/events.jsonl'), '{}\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'base');
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('ci/write-receipt.sh — certify only what was tested', () => {
  it('positive control: a fully staged tree is certified with the exact index hash', () => {
    writeFileSync(join(repo, 'frontend/src/a.js'), 'export const a = 2;\n');
    git(repo, 'add', 'frontend/src/a.js');
    const r = run(repo, receipt);
    expect(r.status).toBe(0);
    expect(readFileSync(receipt, 'utf8').split(' ')[0]).toBe(git(repo, 'write-tree'));
  });

  it('a PARTIAL stage is refused — the tested tree carried an edit the commit does not', () => {
    writeFileSync(join(repo, 'frontend/src/a.js'), 'export const a = 2;\n');
    git(repo, 'add', 'frontend/src/a.js');
    writeFileSync(join(repo, 'frontend/src/b.js'), 'export const b = 2;\n'); // edited, NOT staged
    const r = run(repo, receipt);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/REFUSED/);
    expect(existsSync(receipt)).toBe(false);
  });

  it('a staged file edited again before commit is refused', () => {
    writeFileSync(join(repo, 'frontend/src/a.js'), 'export const a = 2;\n');
    git(repo, 'add', 'frontend/src/a.js');
    writeFileSync(join(repo, 'frontend/src/a.js'), 'export const a = 3;\n');
    expect(run(repo, receipt).status).toBe(1);
  });

  it('an UNTRACKED file under a pipeline input root is refused (vitest would run it; the commit lacks it)', () => {
    writeFileSync(join(repo, 'frontend/src/a.js'), 'export const a = 2;\n');
    git(repo, 'add', 'frontend/src/a.js');
    writeFileSync(join(repo, 'frontend/src/new.test.js'), 'it("x", () => {});\n');
    expect(run(repo, receipt).status).toBe(1);
  });

  it('a modified TRACKED file anywhere refuses the receipt (no carve-out)', () => {
    // The fixture tracks .state/events.jsonl, the path the script used to except. A tracked file that differs
    // from the index is a tree the commit does not carry, wherever it sits.
    writeFileSync(join(repo, 'frontend/src/a.js'), 'export const a = 2;\n');
    git(repo, 'add', 'frontend/src/a.js');
    writeFileSync(join(repo, '.state/events.jsonl'), '{"n":2}\n');
    const r = run(repo, receipt);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/REFUSED/);
  });

  it('the repo ignores .state/ — harness state is never a tracked input', () => {
    expect(() => git(ROOT, 'check-ignore', '-q', '.state/compaction-events.jsonl')).not.toThrow();
    expect(() => git(ROOT, 'check-ignore', '-q', 'frontend/src/a.js')).toThrow(); // the instrument can say no
  });

  it('untracked agent config at the root does not block — outside every input root', () => {
    writeFileSync(join(repo, 'frontend/src/a.js'), 'export const a = 2;\n');
    git(repo, 'add', 'frontend/src/a.js');
    writeFileSync(join(repo, '.mcp.json'), '{}\n');
    expect(run(repo, receipt).status).toBe(0);
  });
});

describe('ci/write-receipt.sh run from a LINKED WORKTREE\'s hook, the way ci/pipeline.sh runs it', () => {
  // THE DEFECT (tranche A review, 2026-10-27): every commit made in a lane worktree had its receipt refused,
  // "1255 path(s) differ, e.g. a tracked doc at the repo root". pipeline.sh cds into frontend/ and then runs this script; git hands
  // a linked worktree's hooks an ABSOLUTE GIT_DIR and no GIT_WORK_TREE, and with GIT_DIR set git takes the CURRENT
  // directory as the top of the work tree. So `git rev-parse --show-toplevel` answered frontend/, and every tracked
  // path outside it read as deleted. Fail-safe (no receipt, so pre-push certified in full), but every lane commit
  // paid the full push. This case makes a REAL commit in a linked worktree of a fixture repo, through a pre-commit
  // hook that does what pipeline.sh does, so git itself sets the environment the script sees.
  it('certifies the worktree\'s own index tree', () => {
    const outside = mkdtempSync(join(tmpdir(), 'crafty-receipt-lane-'));
    try {
      const wt = join(outside, 'lane');
      const hooks = join(outside, 'hooks');
      const log = join(outside, 'hook.log');
      const envLog = join(outside, 'hook.env');
      const laneReceipt = join(outside, 'receipt');
      mkdirSync(hooks);
      writeFileSync(
        join(hooks, 'pre-commit'),
        `#!/bin/sh\nenv > '${envLog}'\ncd frontend || exit 1\nsh '${SCRIPT}' '${laneReceipt}' > '${log}' 2>&1\necho "exit=$?" >> '${log}'\nexit 0\n`,
        { mode: 0o755 },
      );
      git(repo, 'config', 'core.hooksPath', hooks);
      // The operator's git shim refuses `worktree add` into a temp dir; this one lives for the length of the test, so
      // it takes the shim's explicit override (as mutate-batch.test.js does). CI has no shim and ignores the variable.
      process.env.AB_ALLOW_EPHEMERAL_WORKTREE = '1';
      try {
        git(repo, 'worktree', 'add', '-q', '-b', 'lane', wt);
      } finally {
        delete process.env.AB_ALLOW_EPHEMERAL_WORKTREE;
      }
      writeFileSync(join(wt, 'frontend/src/a.js'), 'export const a = 2;\n');
      git(wt, 'add', 'frontend/src/a.js');
      git(wt, 'commit', '-q', '-m', 'lane commit');

      const env = readFileSync(envLog, 'utf8');
      // The precondition of the defect, asserted rather than assumed: the hook really ran under an absolute GIT_DIR.
      expect(env, 'the hook did not see an absolute GIT_DIR — this case is not reproducing the lane context').toMatch(/^GIT_DIR=\//m);
      const out = readFileSync(log, 'utf8');
      expect(out, out).toMatch(/exit=0\s*$/);
      expect(readFileSync(laneReceipt, 'utf8').split(' ')[0], out).toBe(git(wt, 'rev-parse', 'HEAD^{tree}'));
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe('the pipeline has ONE receipt writer, and it is this script', () => {
  const strip = (s) => s.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  const pipeline = strip(readFileSync(join(ROOT, 'ci/pipeline.sh'), 'utf8'));

  it('pipeline.sh calls ci/write-receipt.sh and no longer derives a tree hash itself', () => {
    expect(pipeline).toMatch(/sh\s+"\$ROOT\/ci\/write-receipt\.sh"\s+"\$RECEIPT"/);
    expect(pipeline).not.toMatch(/git\s+write-tree/);
  });

  it('every tracked top-level directory is classified: a declared input root, or declared unread', () => {
    const src = readFileSync(SCRIPT, 'utf8');
    const roots = (src.match(/^INPUT_ROOTS="([^"]+)"/m) || [])[1];
    expect(roots, 'INPUT_ROOTS not found in write-receipt.sh').toBeTruthy();
    const inputs = new Set(roots.split(/\s+/));
    // Read by no pipeline step when UNTRACKED: .claude is agent config (opsec reads tracked files only;
    // doc-currency reads a fixed CANONICAL list); scripts/ holds one harness hook no pipeline step invokes.
    // (.state left this set when U4 untracked it, and the retired agent-instruction directory left INPUT_ROOTS when
    // CLAUDE.md became one real file: both gone from the tree.)
    const unread = new Set(['.claude', 'scripts']);
    // Read from the INDEX, not HEAD: a commit that removes a top-level directory runs this under pre-commit while HEAD
    // still has it, so a HEAD walk would redden the very commit that retires the directory (found moving CLAUDE.md,
    // 2026-10-28). The index is the tree being committed here, and a fresh CI checkout's index equals HEAD.
    const tracked = [...new Set(
      git(ROOT, 'ls-files').split('\n').filter((p) => p.includes('/')).map((p) => p.split('/')[0]),
    )];
    expect(tracked.length).toBeGreaterThan(3); // the walk reached a real tree
    // LICENSES holds licence texts no step reads; doc-currency only checks that the README's link to the folder resolves.
    unread.add('LICENSES');
    const unclassified = tracked.filter((d) => !inputs.has(d) && !unread.has(d));
    expect(unclassified, 'new top-level dir: add it to INPUT_ROOTS, or to `unread` with a reason').toEqual([]);
  });
});
