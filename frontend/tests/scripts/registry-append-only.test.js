import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fixtureGit, isolatedGitEnv } from './_isolatedGit.js';
import { ROOT, REGISTRY, harvest, compare, parseRegistry } from '../../scripts/ci/registry-harvest.mjs';
import { missingIds, pickRange, rowIds } from '../../scripts/ci/registry-append-only.mjs';

// Sited in tests/scripts/: the subject is the registry file, and the script driven as a process in a throwaway repo.

const SCRIPT = resolve(__dirname, '../../scripts/ci/registry-append-only.mjs');
const REAL = readFileSync(join(ROOT, REGISTRY), 'utf8');
const without = (text, id) => text.split('\n').filter((l) => !l.includes(`"id": "${id}"`)).join('\n');

describe('missingIds, on the real registry', () => {
  const total = REAL.split('\n').filter((l) => l.trim()).length;

  it('the same registry at both ends loses nothing, and every line is counted', () => {
    const r = missingIds(REAL, REAL);
    expect(r.baseCount).toBe(total);
    expect(r.badBaseLines).toEqual([]);
    expect(r.missing).toEqual([]);
  });

  it('deleting /b of a split key is red here, while the harvest comparison alone stays green', () => {
    const victim = 'ACTIVE_PLAN:owed:w3-d-row/b';
    expect(rowIds(REAL).ids.has(victim)).toBe(true);
    expect(rowIds(REAL).ids.has('ACTIVE_PLAN:owed:w3-d-row/a')).toBe(true);
    expect(missingIds(REAL, without(REAL, victim)).missing.map((m) => m.id)).toEqual([victim]);
    const harvestView = compare(harvest().extracted, parseRegistry(without(REAL, victim)).rows);
    expect(harvestView.perSource.flatMap((s) => s.missing)).toEqual([]);
  });

  it('closing that row instead of deleting it passes', () => {
    const victim = 'ACTIVE_PLAN:owed:w3-d-row/b';
    const closed = REAL.split('\n').map((l) => {
      if (!l.includes(`"id": "${victim}"`)) return l;
      return JSON.stringify({ ...JSON.parse(l), state: 'closed', closedBy: 'abc1234' });
    }).join('\n');
    expect(missingIds(REAL, closed).missing).toEqual([]);
  });

  it('a registry gone at head loses every id', () => {
    expect(missingIds(REAL, null).missing).toHaveLength(total);
  });
});

describe('pickRange', () => {
  /** A git stub answering only the commands it is given; anything else throws, as a failing git would. */
  const stub = (answers) => (args) => {
    const k = args.join(' ');
    if (Object.hasOwn(answers, k)) return answers[k];
    throw new Error(`no answer for git ${k}`);
  };

  it('an argument range wins over every other source', () => {
    expect(pickRange({ argv: ['aaa..bbb'], env: { PUSH_RANGES: 'x..y', GITHUB_EVENT_NAME: 'push' }, git: stub({}) }))
      .toEqual({ base: 'aaa', head: 'bbb', from: 'the range given' });
  });

  it('pre-push: the pushed range whose head is HEAD, not the first one listed', () => {
    const git = stub({ 'rev-parse HEAD': 'L2\n', 'rev-parse l1': 'L1\n', 'rev-parse l2': 'L2\n' });
    expect(pickRange({ env: { PUSH_RANGES: 'r1..l1 r2..l2' }, git })).toMatchObject({ base: 'r2', head: 'HEAD' });
  });

  it('pre-push of a new branch (no range for HEAD) measures from the merge-base with origin/main', () => {
    const git = stub({ 'rev-parse HEAD': 'L9\n', 'rev-parse l1': 'L1\n', 'merge-base HEAD origin/main': 'MB\n' });
    expect(pickRange({ env: { PUSH_RANGES: 'r1..l1' }, git })).toMatchObject({ base: 'MB', from: 'the merge-base with origin/main' });
  });

  it('CI: a push compares against before, a pull request against its base, a forced push against the merge-base', () => {
    const git = stub({ 'merge-base HEAD origin/main': 'MB\n' });
    expect(pickRange({ env: { GITHUB_EVENT_NAME: 'push' }, git, readPayload: () => ({ before: 'B4' }) })).toMatchObject({ base: 'B4' });
    expect(pickRange({ env: { GITHUB_EVENT_NAME: 'pull_request' }, git, readPayload: () => ({ pull_request: { base: { sha: 'PRB' } } }) }))
      .toMatchObject({ base: 'PRB' });
    expect(pickRange({ env: { GITHUB_EVENT_NAME: 'push' }, git, readPayload: () => ({ forced: true, before: 'B4' }) })).toMatchObject({ base: 'MB' });
  });

  it('with nothing to measure from, the base is null and says why', () => {
    expect(pickRange({ git: stub({}) })).toMatchObject({ base: null });
  });
});

describe('the CLI, in a throwaway repo', () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'crafty-registry-append-')); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const row = (id, extra = {}) => JSON.stringify({ id, title: `title of ${id}`, state: 'open', ...extra });

  function repoWith(name, versions) {
    const repo = join(dir, name);
    mkdirSync(join(repo, 'memory'), { recursive: true });
    fixtureGit(repo, 'init', '-q');
    fixtureGit(repo, 'config', 'user.email', 'fixture@example.invalid');
    fixtureGit(repo, 'config', 'user.name', 'fixture');
    const shas = versions.map((rows, i) => {
      if (rows === null) writeFileSync(join(repo, 'README'), `v${i}\n`);
      else writeFileSync(join(repo, REGISTRY), `${rows.join('\n')}\n`);
      fixtureGit(repo, 'add', '-A');
      fixtureGit(repo, 'commit', '-q', '-m', `v${i}`);
      return fixtureGit(repo, 'rev-parse', 'HEAD');
    });
    return { repo, shas };
  }

  const run = (repo, range) => spawnSync('node', [SCRIPT, range], { cwd: repo, encoding: 'utf8', env: isolatedGitEnv() });

  it('a range that deletes a split part fails and names it; one that closes it passes', () => {
    const { repo, shas } = repoWith('deletes', [
      [row('K'), row('S/a'), row('S/b')],
      [row('K'), row('S/a')],
    ]);
    const red = run(repo, `${shas[0]}..${shas[1]}`);
    expect(red.status, red.stdout + red.stderr).toBe(1);
    expect(red.stderr).toMatch(/1 of 3 row id\(s\) at base are gone at head/);
    expect(red.stderr).toMatch(/• S\/b {2}title of S\/b/);
    const { repo: repo2, shas: shas2 } = repoWith('closes', [
      [row('K'), row('S/a'), row('S/b')],
      [row('K'), row('S/a'), row('S/b', { state: 'closed', closedBy: 'abc1234' }), row('T')],
    ]);
    const green = run(repo2, `${shas2[0]}..${shas2[1]}`);
    expect(green.status, green.stdout + green.stderr).toBe(0);
    expect(green.stdout).toMatch(/3 row ids at base, 4 at head/);
  });

  it('a base with no registry has 0 ids to carry and says so', () => {
    const { repo, shas } = repoWith('no-base-registry', [null, [row('K')]]);
    const r = run(repo, `${shas[0]}..${shas[1]}`);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/0 row ids at base; memory\/registry\.jsonl did not exist at/);
  });

  it('a base git cannot resolve prints COULD NOT CHECK rather than a pass', () => {
    const { repo, shas } = repoWith('unresolvable', [[row('K')]]);
    const r = run(repo, `${'d'.repeat(40)}..${shas[0]}`);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/COULD NOT CHECK, 0 row ids compared/);
    expect(r.stdout).not.toMatch(/✓/);
  });
});
