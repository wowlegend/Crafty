import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, realpathSync } from 'node:fs';
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
const run = () =>
  spawnSync('sh', [copy], {
    input: '{"source":"compact"}',
    encoding: 'utf8',
    env: isolatedGitEnv({ CLAUDE_PROJECT_DIR: repo }),
  });
const context = () => {
  const r = run();
  expect(r.status).toBe(0);
  return JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
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

  it('missing rules dir prints {} and exits 0', () => {
    rmSync(join(repo, '.claude'), { recursive: true, force: true });
    const r = run();
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('{}');
  });
});
