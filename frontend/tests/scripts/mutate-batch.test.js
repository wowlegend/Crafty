import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureGit, isolatedGitEnv } from './_isolatedGit.js';
import { parseMutants, identityMutant, summarize, inLinkedWorktree } from '../../scripts/dev/mutate-batch.mjs';

/**
 * scripts/dev/mutate-batch.mjs — a LIST of mutants through mutate.sh, identity mutant first.
 *
 * Sited in tests/scripts because the subject is a dev tool that drives files, not game behaviour. The CLI case
 * EXECUTES the tool against a fixture repo; the rest drive its exported seams.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh against scripts/dev/mutate-batch.mjs (12 tests), each observed RED:
 *   M-U1a summarize ignores the identity outcome            -> "an identity mutant that goes RED voids the batch" RED
 *   M-U1b delete the `expect` check in parseMutants          -> "rejects a mutant without expect" RED
 *   M-U1c the .json branch appends a comment like the JS one -> "the JSON identity mutant stays valid JSON" RED
 *   M-U1d the CLI checks only its own tree, not the cwd      -> "refuses outside a linked worktree" RED
 *   identity: a trailing `// identity mutant` line           -> SURVIVED (the control holds)
 *
 * BLIND SPOT: no case here runs a real mutant through mutate.sh end to end — that would run vitest inside vitest
 * under the load this lane measured. The wrapping of mutate.sh's exit codes (0 RED, 1 SURVIVED, else 3) is read
 * by eye; every later unit's mutation receipt is its live exercise.
 */
const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CLI = join(APP, 'scripts/dev/mutate-batch.mjs');

const ok = { subject: 'scripts/ci/x.mjs', spec: 'tests/scripts/x.test.js', expect: 4, label: 'drop x', old: 'a', new: 'b' };
const dirs = [];
const fresh = (tag) => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), `crafty-mutate-batch-${tag}-`)));
  dirs.push(d);
  return d;
};
const repoWithCommit = (tag) => {
  const d = fresh(tag);
  fixtureGit(d, 'init', '-q');
  fixtureGit(d, 'config', 'user.email', 'fixture@example.invalid');
  fixtureGit(d, 'config', 'user.name', 'fixture');
  writeFileSync(join(d, 'a.txt'), 'a\n');
  fixtureGit(d, 'add', '.');
  fixtureGit(d, 'commit', '-q', '-m', 'base');
  return d;
};
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe('parseMutants', () => {
  it('accepts a complete mutant (presence before the refusals)', () => {
    expect(parseMutants(JSON.stringify([ok]))).toEqual([ok]);
  });

  it('rejects a mutant without expect', () => {
    const { expect: _drop, ...noExpect } = ok;
    expect(() => parseMutants(JSON.stringify([noExpect]))).toThrow(/expect/);
  });

  it('refuses a LIVE settings file as subject, and accepts a scratch copy one directory away', () => {
    expect(() => parseMutants(JSON.stringify([{ ...ok, subject: '../.claude/settings.json' }]))).toThrow(/LIVE harness file/);
    expect(() => parseMutants(JSON.stringify([{ ...ok, subject: '../.claude/settings.local.json' }]))).toThrow(/LIVE harness file/);
    const copy = { ...ok, subject: '/tmp/scratch/settings.json', env: { HARNESS_SETTINGS: '/tmp/scratch/settings.json' } };
    expect(parseMutants(JSON.stringify([copy]))).toEqual([copy]);
  });
});

describe('summarize', () => {
  const id = (code) => ({ label: 'identity', code, identity: true });
  const m = (label, code) => ({ label, code, identity: false, spec: 'tests/scripts/x.test.js' });

  it('an identity mutant that SURVIVES lets the kills count (the twin of the void case)', () => {
    const s = summarize([id(1), m('drop x', 0)]);
    expect(s.identitySurvived).toBe(true);
    expect(s.code).toBe(0);
  });

  it('an identity mutant that goes RED voids the batch', () => {
    const s = summarize([id(0), m('drop x', 0)]);
    expect(s.identitySurvived).toBe(false);
    expect(s.code).toBe(3);
  });

  it('the denominator line names all three outcomes', () => {
    const s = summarize([id(1), m('a', 0), m('b', 1), m('c', 3)]);
    expect(s.line).toMatch(/^\d+ mutants: \d+ RED · \d+ SURVIVED · \d+ COULD NOT CHECK$/);
    expect(s.line).toBe('3 mutants: 1 RED · 1 SURVIVED · 1 COULD NOT CHECK');
    expect(s.code).toBe(1); // a survivor is a hole whatever else happened
    expect(summarize([id(1), m('a', 0), m('c', 3)]).code).toBe(3);
    expect(summarize([id(1)]).code).toBe(3); // an empty denominator is never a pass
  });

  it('emits one Mutation-Proof line per RED mutant', () => {
    const s = summarize([id(1), m('drop the expect check', 0), m('flip the sign', 0), m('kept', 1)]);
    expect(s.trailer).toEqual([
      'Mutation-Proof: drop the expect check -> RED (tests/scripts/x.test.js); restored -> green',
      'Mutation-Proof: flip the sign -> RED (tests/scripts/x.test.js); restored -> green',
    ]);
  });
});

describe('identityMutant — bytes change, behaviour does not', () => {
  it('the JSON identity mutant stays valid JSON and differs in bytes', () => {
    const s = JSON.stringify({ permissions: { deny: ['Bash(x)'] }, hooks: { a: [1, 2] } }, null, 2) + '\n';
    const out = identityMutant('x.json', s);
    expect(out).not.toBe(s);
    expect(JSON.parse(out)).toEqual(JSON.parse(s));
    const three = JSON.stringify({ a: 1 }, null, 3) + '\n'; // already 3-indented: still a byte change
    expect(identityMutant('y.json', three)).not.toBe(three);
  });

  it('each code and text type gets a comment or a blank line', () => {
    expect(identityMutant('a.md', '# t\n')).toBe('# t\n\n');
    for (const f of ['a.js', 'a.mjs', 'a.jsx', 'a.cjs']) expect(identityMutant(f, 'x;\n')).toBe('x;\n// identity mutant\n');
    expect(identityMutant('a.sh', 'echo\n')).toBe('echo\n# identity mutant\n');
    expect(identityMutant('.githooks/pre-push', '#!/bin/sh\necho\n')).toBe('#!/bin/sh\necho\n# identity mutant\n');
    expect(identityMutant('ci/x', '#!/usr/bin/env bash\necho\n')).toBe('#!/usr/bin/env bash\necho\n# identity mutant\n');
  });

  it('an unknown file type is COULD NOT CHECK', () => {
    expect(identityMutant('a.png', 'PNG')).toBeNull();
    expect(identityMutant('LICENSE', 'MIT\n')).toBeNull(); // extensionless and not a shell script
  });
});

describe('the CLI refuses to mutate outside a linked worktree', () => {
  it('inLinkedWorktree: a main checkout is not one, a linked worktree is, a plain dir is not', () => {
    const repo = repoWithCommit('main');
    const wt = join(fresh('wt-parent'), 'lane');
    // The operator's machine puts a git shim on PATH that refuses `worktree add` into a temp dir (macOS deletes idle
    // tmp files, and a long-lived worktree there once lost its files). This one lives for the length of the test, so
    // it takes the shim's own explicit override. CI has no shim and ignores the variable.
    process.env.AB_ALLOW_EPHEMERAL_WORKTREE = '1';
    try {
      fixtureGit(repo, 'worktree', 'add', '-q', wt);
    } finally {
      delete process.env.AB_ALLOW_EPHEMERAL_WORKTREE;
    }
    expect(inLinkedWorktree(wt)).toBe(true); // presence first: the instrument can see a lane
    expect(inLinkedWorktree(repo)).toBe(false);
    expect(inLinkedWorktree(fresh('plain'))).toBe(false);
  });

  it('refuses outside a linked worktree', () => {
    const repo = repoWithCommit('cli');
    const list = join(repo, 'mutants.json');
    writeFileSync(list, JSON.stringify([ok]));
    const r = spawnSync('node', [CLI, list], { cwd: repo, encoding: 'utf8', env: isolatedGitEnv() });
    expect(r.status).toBe(3);
    expect(r.stderr).toMatch(/the current directory .* is not a linked worktree/);
  });
});
