import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, realpathSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureGit, isolatedGitEnv } from './_isolatedGit.js';

/**
 * scripts/hooks/session-start-compact.sh — the post-compaction reminder, on the channel that delivers it.
 *
 * Sited in tests/scripts: the subject is a hook script and its fixtures are files. Each case RUNS a byte-identical
 * copy of the real script inside a throwaway repo, because the script finds its tree from its own location
 * (`git -C "$(dirname "$0")"`), so only a copy can be pointed at a fixture. The first case proves the copy is the
 * real thing; a mutation of the real script therefore reaches every case.
 *
 * Mutation-Proof: via scripts/dev/mutate-batch.mjs against scripts/hooks/session-start-compact.sh (10 tests),
 * identity mutant (trailing `# identity mutant`) SURVIVED, then each observed RED:
 *   M-U6a hookEventName back to PostCompact          -> "emits SessionStart, never PostCompact"
 *   M-U6b JSON built by printf interpolation again    -> "survives quotes and backslashes" (and every parse)
 *   M-U6c globs read by a single-line sed (old defect) -> "reads multi-line globs"
 *   M-U6d nonce-file write dropped                    -> "emits a nonce and records it"
 * Fix round (tranche A review, item 4), via mutate-batch (12 tests), identity SURVIVED, then RED:
 *   M-S1 the GIT_* unset loop deleted · M-S2 the loop matches no variable (GITX_) -> "an inherited GIT_DIR ..."
 *   M-S3 the nonce written under --git-dir · M-S4 the tree found from CLAUDE_PROJECT_DIR -> "run from a linked worktree"
 *
 * BLIND SPOT: whether Claude Code delivers this output to the model. That is a lived check (plan U6): after a real
 * /compact, the nonce must appear in the transcript after the compact boundary, in an entry that is not a tool
 * result.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SCRIPT = join(ROOT, 'scripts/hooks/session-start-compact.sh');
const HEADING = '## CURSOR "quoted" and back\\slash — U6';

let repo;
let copy;
const run = (extra = {}, script = copy) =>
  spawnSync('sh', [script], {
    input: '{"source":"compact"}',
    encoding: 'utf8',
    env: isolatedGitEnv({ CLAUDE_PROJECT_DIR: repo, ...extra }),
  });
const context = (extra, script) => {
  const r = run(extra, script);
  expect(r.status).toBe(0);
  return JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
};
const others = [];
afterEach(() => {
  for (const d of others.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = (tag) => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), `crafty-compact-${tag}-`)));
  others.push(d);
  return d;
};

beforeEach(() => {
  repo = realpathSync(mkdtempSync(join(tmpdir(), 'crafty-compact-hook-')));
  fixtureGit(repo, 'init', '-q');
  mkdirSync(join(repo, 'scripts/hooks'), { recursive: true });
  mkdirSync(join(repo, '.claude/rules'), { recursive: true });
  mkdirSync(join(repo, 'memory'), { recursive: true });
  copy = join(repo, 'scripts/hooks/session-start-compact.sh');
  copyFileSync(SCRIPT, copy);
  writeFileSync(join(repo, '.claude/rules/a.md'), '---\npaths:\n  - "frontend/x/**"\n  - "frontend/y.js"\n---\n# a\n');
  writeFileSync(join(repo, '.claude/rules/b.md'), '# b, no frontmatter\n');
  writeFileSync(join(repo, 'memory/ACTIVE_PLAN.md'), `# plan\n\nintro\n\n${HEADING}\n\n## later heading\n`);
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('scripts/hooks/session-start-compact.sh', () => {
  it('the copy is the real script', () => {
    expect(readFileSync(copy).equals(readFileSync(SCRIPT))).toBe(true);
  });

  it('emits a nonce and records it', () => {
    const ctx = context();
    const m = ctx.match(/^compact-context nonce ([0-9a-f]{16})\n/);
    expect(m, ctx.slice(0, 80)).toBeTruthy();
    expect(readFileSync(join(repo, '.git/crafty-compact-nonce'), 'utf8').trim()).toBe(m[1]);
  });

  it('emits SessionStart, never PostCompact', () => {
    const r = run();
    expect(JSON.parse(r.stdout).hookSpecificOutput.hookEventName).toBe('SessionStart');
  });

  it('survives quotes and backslashes', () => {
    const r = run();
    expect(() => JSON.parse(r.stdout)).not.toThrow();
    expect(JSON.parse(r.stdout).hookSpecificOutput.additionalContext).toContain(HEADING);
  });

  it('reads multi-line globs', () => {
    expect(context()).toContain('a.md -> frontend/x/** frontend/y.js');
  });

  it('one line per rule file', () => {
    const ctx = context();
    const files = 2; // a.md and b.md, written above
    expect(ctx.split('-> ').length - 1).toBe(files);
    expect(ctx).toContain('b.md -> unscoped');
  });

  it('warns when hooksPath is unset', () => {
    expect(context()).toContain('local gates are OFF');
  });

  it('names the foreign hooks dir when hooksPath is absolute', () => {
    fixtureGit(repo, 'config', 'core.hooksPath', '/elsewhere/.githooks');
    const ctx = context();
    expect(ctx).toContain('this tree runs the hooks at /elsewhere/.githooks, not its own');
    expect(ctx).not.toContain('local gates are OFF');
  });

  it('allow twin: a relative .githooks is this tree\'s own, with no warning', () => {
    fixtureGit(repo, 'config', 'core.hooksPath', '.githooks');
    const ctx = context();
    expect(ctx).toContain("hooks: this tree's own .githooks");
    expect(ctx).not.toMatch(/local gates are OFF|not its own/);
  });

  // Two U6 claims no case drove (tranche A review, item 4): the GIT_* unset loop, and the nonce written to the COMMON
  // git dir when the hook runs from a linked worktree.
  it('an inherited GIT_DIR naming another repo is dropped: the hook reads its own tree and records the nonce there', () => {
    const decoy = tmp('decoy');
    fixtureGit(decoy, 'init', '-q');
    const ctx = context({ GIT_DIR: join(decoy, '.git'), GIT_WORK_TREE: decoy });
    expect(ctx).toContain(`tree: ${repo} (branch `);
    const nonce = ctx.match(/^compact-context nonce ([0-9a-f]{16})\n/)[1];
    expect(readFileSync(join(repo, '.git/crafty-compact-nonce'), 'utf8').trim()).toBe(nonce);
    expect(existsSync(join(decoy, '.git/crafty-compact-nonce')), 'the nonce went to the inherited GIT_DIR').toBe(false);
  });

  it('run from a linked worktree, it reads the worktree and writes the nonce to the COMMON git dir', () => {
    fixtureGit(repo, 'config', 'user.email', 'fixture@example.invalid');
    fixtureGit(repo, 'config', 'user.name', 'fixture');
    fixtureGit(repo, 'add', '-A');
    fixtureGit(repo, 'commit', '-q', '-m', 'base');
    const wt = join(tmp('lane'), 'lane');
    // The operator's git shim refuses `worktree add` into a temp dir; this one lives for the length of the test, so it
    // takes the shim's explicit override (as mutate-batch.test.js does). CI has no shim and ignores the variable.
    process.env.AB_ALLOW_EPHEMERAL_WORKTREE = '1';
    try {
      fixtureGit(repo, 'worktree', 'add', '-q', '-b', 'lane', wt);
    } finally {
      delete process.env.AB_ALLOW_EPHEMERAL_WORKTREE;
    }
    const laneGitDir = fixtureGit(wt, 'rev-parse', '--path-format=absolute', '--git-dir');
    expect(laneGitDir, 'presence: the lane has its own git dir, apart from the common one').not.toBe(join(repo, '.git'));
    const ctx = context({}, join(wt, 'scripts/hooks/session-start-compact.sh'));
    expect(ctx).toContain(`tree: ${wt} (branch lane)`);
    const nonce = ctx.match(/^compact-context nonce ([0-9a-f]{16})\n/)[1];
    expect(readFileSync(join(repo, '.git/crafty-compact-nonce'), 'utf8').trim()).toBe(nonce);
    expect(existsSync(join(laneGitDir, 'crafty-compact-nonce')), 'the nonce went to the lane\'s own git dir').toBe(false);
  });

  it('missing rules dir prints {} and exits 0', () => {
    rmSync(join(repo, '.claude'), { recursive: true, force: true });
    const r = run();
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('{}');
  });
});
