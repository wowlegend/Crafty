import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { isolatedGitEnv } from './_isolatedGit.js';

/**
 * NO PIPELINE STEP AND NO TEST CAN REACH THE CALLER'S REPOSITORY (plan U8, amended F16).
 *
 * Git exports GIT_DIR, GIT_INDEX_FILE and friends to every hook, and the hooks run ci/pipeline.sh. In a linked
 * worktree GIT_DIR is absolute, so any git a step (or a test inside the unit step) ran without scrubbing went to the
 * REAL repository: on 2026-10-27 a fixture suite re-initialised the main checkout `core.bare = true`.
 * Two guards, one per door:
 *   - ci/git-env.sh `run_scrubbed` runs a command with every GIT_* variable removed, and pipeline.sh's `step()`
 *     runs each step through it (write-receipt.sh stays outside: it needs git's GIT_INDEX_FILE);
 *   - an ESLint `no-restricted-syntax` block forbids raw git in tests, so a new test cannot reintroduce it.
 *
 * Sited in tests/scripts: the subjects are a shell helper, a shell file's text and a lint config. The `step()` case is
 * a FILE-CONTENT check on ci/pipeline.sh (comment lines dropped, sliced to the function body); the others execute the
 * helper or the real ESLint config.
 *
 * Mutation-Proof: via scripts/dev/mutate-batch.mjs (12 tests); identity mutants on ci/git-env.sh, eslint.config.js and
 * ci/pipeline.sh all SURVIVED, then each observed RED:
 *   M-U8a run_scrubbed's unset loop does nothing          -> "run_scrubbed removes every GIT_* variable"
 *   M-U8b drop the bare-callee TemplateLiteral selector  -> "a template literal is an error"
 *   M-U8c drop the member-call selector                   -> "a member call is an error"
 *   M-U8d drop the member-call TemplateLiteral selector   -> "a member call with a template literal is an error"
 *   M-U8e step() runs `if "$@"` again (unscrubbed)          -> "step() runs its command through run_scrubbed"
 * Fix round (tranche A review, item 4: only two of the rule's six callees were driven), via mutate-batch (18 tests),
 * identity SURVIVED, then 7 of 7 RED in the six-callee cases: each of execFileSync, execSync, spawnSync, spawn,
 * execFile, exec dropped from the rule's list (M-E1..6), and spawnSync misspelled in it (M-E7).
 *
 * BLIND SPOT: a test that shells out through some other spelling (`git` built by concatenation, a variable holding
 * 'git', a helper outside tests/) is not seen by the lint; only the three call shapes below are.
 */
const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ROOT = resolve(APP, '..');

describe('ci/git-env.sh run_scrubbed', () => {
  const env = isolatedGitEnv({ GIT_DIR: '/nonexistent/.git', GIT_INDEX_FILE: '/nonexistent/index', GIT_FOO: 'x', KEEP: '1' });
  const sh = (body) => spawnSync('bash', ['-c', `. ci/git-env.sh; ${body}`], { cwd: ROOT, encoding: 'utf8', env });

  it('control: without the helper the GIT_* variables do reach the child', () => {
    const out = sh('env').stdout;
    expect(out).toMatch(/^GIT_FOO=x$/m);
    expect(out).toMatch(/^GIT_DIR=/m);
  });

  it('run_scrubbed removes every GIT_* variable', () => {
    const out = sh('run_scrubbed env').stdout;
    expect(out).toMatch(/^KEEP=1$/m); // presence first: the child ran and printed its environment
    expect(out).not.toMatch(/^GIT_/m);
  });

  it('run_scrubbed returns the command\'s own exit status', () => {
    expect(sh('run_scrubbed false').status).toBe(1);
    expect(sh('run_scrubbed true').status).toBe(0);
  });
});

describe('ci/pipeline.sh step() runs its command through run_scrubbed', () => {
  // File-content check (sited here because the subject is a file): comment lines are dropped first, so a comment
  // naming run_scrubbed cannot satisfy it, and the match is confined to the body of step().
  const code = readFileSync(join(ROOT, 'ci/pipeline.sh'), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');

  it('step() runs its command through run_scrubbed', () => {
    const start = code.indexOf('step() {');
    expect(start, 'step() not found').toBeGreaterThan(-1);
    const end = code.indexOf('\n}', start);
    const body = code.slice(start, end);
    expect(body).toMatch(/run_scrubbed "\$@"/);
    expect(body).not.toMatch(/if "\$@"/);
  });

  it('pipeline.sh sources the helper before the first step', () => {
    const src = code.search(/^\. "\$ROOT\/ci\/git-env\.sh"$/m);
    expect(src).toBeGreaterThan(-1);
    expect(src).toBeLessThan(code.indexOf('\nstep "'));
  });
});

describe('ESLint forbids raw git in tests', () => {
  const eslint = new ESLint({ cwd: APP });
  const errors = async (code, rel = 'tests/scripts/x.test.js') => {
    const [r] = await eslint.lintText(code, { filePath: join(APP, rel) });
    return r.messages.filter((m) => m.ruleId === 'no-restricted-syntax').length;
  };

  it('a bare literal call is an error', async () => {
    expect(await errors("import { execFileSync } from 'node:child_process';\nexecFileSync('git', ['status']);\n")).toBe(1);
  });

  it('a member call is an error', async () => {
    expect(await errors("import cp from 'node:child_process';\ncp.execFileSync('git', ['status']);\n")).toBe(1);
  });

  it('a template literal is an error', async () => {
    expect(await errors("import { execSync } from 'node:child_process';\nexecSync(`git status`);\n")).toBe(1);
  });

  it('a member call with a template literal is an error', async () => {
    expect(await errors("import cp from 'node:child_process';\ncp.execSync(`git status`);\n")).toBe(1);
  });

  // The rule names six callees; the cases above drive two. Each of the six, in both callee shapes, is driven here, so
  // a callee dropped from the rule's list (or misspelled in it) goes red (tranche A review, item 4).
  const CALLEES = ['execFileSync', 'execSync', 'spawnSync', 'spawn', 'execFile', 'exec'];
  it.each(CALLEES)('%s(\'git\', …) is an error, bare and as a member call', async (fn) => {
    expect(await errors(`import { ${fn} } from 'node:child_process';\n${fn}('git', ['status']);\n`)).toBe(1);
    expect(await errors(`import cp from 'node:child_process';\ncp.${fn}('git', ['status']);\n`)).toBe(1);
  });

  it('allow case, one token from a deny: node instead of git', async () => {
    expect(await errors("import { execFileSync } from 'node:child_process';\nexecFileSync('node', ['-v']);\n")).toBe(0);
  });

  it('the same bare literal inside tests/scripts/_isolatedGit.js is allowed (the one sanctioned site)', async () => {
    expect(await errors("import { execFileSync } from 'node:child_process';\nexecFileSync('git', ['status']);\n", 'tests/scripts/_isolatedGit.js')).toBe(0);
  });

  it('a colocated src test is covered too', async () => {
    expect(await errors("import { execFileSync } from 'node:child_process';\nexecFileSync('git', ['status']);\n", 'src/game/x.test.js')).toBe(1);
  });
});
