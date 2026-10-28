// The fixture-git helper keeps a fixture's git out of the CALLER's repository (tests/scripts/_isolatedGit.js).
//
// 2026-10-27: the pre-commit hook, run from a linked worktree, exported an absolute GIT_DIR, and the write-receipt and
// pre-push fixtures re-initialised the REAL repository as bare, wrote a fixture identity into its config and committed
// fixtures onto the worktree's branch. This reproduces that environment against a DECOY repo and asserts the decoy is
// untouched. The CONTROL runs the same calls without the helper and must damage the decoy: if it ever stops doing so,
// this git no longer has the hazard and the assertion above it proves nothing.
//
// Mutation-Proof: via scripts/dev/mutate.sh, each RED: G1 the GIT_* filter removed (process.env copied whole);
// G2 plausible-wrong: only GIT_DIR removed (GIT_INDEX_FILE still inherited); G3 fixtureGit passes no env.
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixtureGit, isolatedGitEnv } from './_isolatedGit.js';

const dirs = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'crafty-isogit-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

/** A decoy repo with one commit, built with a clean environment. */
function decoy() {
  const d = tmp();
  fixtureGit(d, 'init', '-q');
  fixtureGit(d, 'config', 'user.email', 'decoy@example.invalid');
  fixtureGit(d, 'config', 'user.name', 'decoy');
  writeFileSync(join(d, 'a.txt'), 'a\n');
  fixtureGit(d, 'add', '.');
  fixtureGit(d, 'commit', '-q', '-m', 'decoy');
  return { dir: d, config: readFileSync(join(d, '.git/config'), 'utf8'), head: fixtureGit(d, 'rev-parse', 'HEAD') };
}

/** Run `fn` with the environment a git hook in a linked worktree hands its children: GIT_DIR and the index, absolute. */
function asHookChild(repo, fn) {
  const saved = { GIT_DIR: process.env.GIT_DIR, GIT_INDEX_FILE: process.env.GIT_INDEX_FILE };
  process.env.GIT_DIR = join(repo, '.git');
  process.env.GIT_INDEX_FILE = join(repo, '.git/index');
  try { return fn(); } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}

/** What a fixture does: a fresh repo in its own tmp dir, an identity, a commit. */
function fixtureRepo(run) {
  const t = tmp();
  run(t, 'init', '-q');
  run(t, 'config', 'user.email', 'fixture@example.invalid');
  run(t, 'config', 'user.name', 'fixture');
  writeFileSync(join(t, 'f.txt'), 'f\n');
  run(t, 'add', '.');
  run(t, 'commit', '-q', '-m', 'fixture');
  return t;
}

describe('a fixture repo never writes into the repository its caller is in', () => {
  it('with a hook-exported GIT_DIR and index, the helper builds its own repo and the caller\'s is untouched', () => {
    const d = decoy();
    const t = asHookChild(d.dir, () => fixtureRepo(fixtureGit));
    expect(readFileSync(join(d.dir, '.git/config'), 'utf8'), 'the caller\'s config was rewritten (bare, a fixture identity)').toBe(d.config);
    expect(fixtureGit(d.dir, 'rev-parse', 'HEAD'), 'a fixture commit landed on the caller\'s branch').toBe(d.head);
    expect(existsSync(join(t, '.git')), 'the fixture built no repo of its own').toBe(true);
    expect(fixtureGit(t, 'log', '--format=%s'), 'the fixture repo is missing its commit').toBe('fixture');
  });

  it('isolatedGitEnv drops EVERY GIT_* variable and keeps the rest', () => {
    const env = asHookChild(tmp(), () => isolatedGitEnv({ EXTRA: '1' }));
    expect(Object.keys(env).filter((k) => k.startsWith('GIT_'))).toEqual([]);
    expect(env.PATH).toBe(process.env.PATH);
    expect(env.EXTRA).toBe('1');
  });

  it('CONTROL: the same calls WITHOUT the helper damage the caller (the hazard is real on this git)', () => {
    const d = decoy();
    // eslint-disable-next-line no-restricted-syntax -- the deliberate hazard control
    const raw = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
    asHookChild(d.dir, () => fixtureRepo(raw));
    const damaged = readFileSync(join(d.dir, '.git/config'), 'utf8') !== d.config || fixtureGit(d.dir, 'rev-parse', 'HEAD') !== d.head;
    expect(damaged, 'an inherited GIT_DIR no longer reaches the caller — the guarded hazard is gone on this git').toBe(true);
  });
});
