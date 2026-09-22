import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

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
 *   M4 plausible-wrong: drop the `.state` exclusion                      -> harness-state case RED
 *   M5 remove `frontend` from INPUT_ROOTS                                 -> untracked-input case RED
 *   and against ci/pipeline.sh: M6 inline `git write-tree` back in        -> single-writer case RED
 *
 * BLIND SPOT: this proves the script refuses a dirty tree; it does not prove pre-push HONOURS only exact
 * matches — that is .githooks/pre-push's reader, gated separately by its tier comparison.
 */
const ROOT = resolve(__dirname, '../../..');
const SCRIPT = join(ROOT, 'ci/write-receipt.sh');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const run = (cwd, receipt) => spawnSync('sh', [SCRIPT, receipt], { cwd, encoding: 'utf8' });

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

  it('harness state under .state/ does not block — tracked, rewritten continuously, read by no step', () => {
    writeFileSync(join(repo, 'frontend/src/a.js'), 'export const a = 2;\n');
    git(repo, 'add', 'frontend/src/a.js');
    writeFileSync(join(repo, '.state/events.jsonl'), '{"n":2}\n');
    expect(run(repo, receipt).status).toBe(0);
  });

  it('untracked agent config at the root does not block — outside every input root', () => {
    writeFileSync(join(repo, 'frontend/src/a.js'), 'export const a = 2;\n');
    git(repo, 'add', 'frontend/src/a.js');
    writeFileSync(join(repo, '.mcp.json'), '{}\n');
    expect(run(repo, receipt).status).toBe(0);
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
    // Read by no pipeline step when UNTRACKED: .state is harness state; .claude is agent config
    // (opsec reads tracked files only; doc-currency reads a fixed CANONICAL list); scripts/ holds one
    // harness hook no pipeline step invokes.
    const unread = new Set(['.state', '.claude', 'scripts']);
    const tracked = execFileSync('git', ['ls-tree', '-d', '--name-only', 'HEAD'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n').filter(Boolean);
    expect(tracked.length).toBeGreaterThan(3); // the walk reached a real tree
    const unclassified = tracked.filter((d) => !inputs.has(d) && !unread.has(d));
    expect(unclassified, 'new top-level dir: add it to INPUT_ROOTS, or to `unread` with a reason').toEqual([]);
  });
});
