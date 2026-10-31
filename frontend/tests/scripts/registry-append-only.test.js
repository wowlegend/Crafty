import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fixtureGit, isolatedGitEnv } from './_isolatedGit.js';
import { ROOT, REGISTRY, harvest, compare, parseRegistry } from '../../scripts/ci/registry-harvest.mjs';
import { missingIds, pickRange, rowIds, changeFindings } from '../../scripts/ci/registry-append-only.mjs';

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
      return JSON.stringify({ ...JSON.parse(l), state: 'closed', resolution: 'done', closedBy: 'abc1234', updated: '2026-11-02' });
    }).join('\n');
    expect(missingIds(REAL, closed).missing).toEqual([]);
    expect(changeFindings(REAL, closed, { headDate: '2026-11-02' })).toEqual([]);
  });

  it('a registry gone at head loses every id', () => {
    expect(missingIds(REAL, null).missing).toHaveLength(total);
  });
});

describe('the range rules R2-R4, on fixtures where the answer is known', () => {
  const v2 = (o) => ({ id: 'K', key: 'K', title: 'a title', kind: 'debt', state: 'open', note: 'n', updated: '2026-10-20', ...o });
  const text = (...rows) => rows.map((r) => JSON.stringify(r)).join('\n');
  const rules = (base, head, headDate = '2026-10-31') => changeFindings(text(base), text(head), { headDate }).map((f) => f.rule);

  it('the same rows at both ends, and a v1 row given its first updated, find nothing', () => {
    expect(rules(v2(), v2())).toEqual([]);
    const { updated: _u, kind: _k, ...v1 } = v2();
    expect(rules(v1, v2({ updated: '2026-10-31' }))).toEqual([]);
  });

  it('R2: a row closed at the base and open at the head', () => {
    expect(rules(v2({ state: 'closed' }), v2({ state: 'open', updated: '2026-10-31' }))).toEqual(['R2']);
  });

  it('R3: text changed while updated stayed at an older date, or moved backwards, or is gone', () => {
    expect(rules(v2(), v2({ note: 'more' }))).toEqual(['R3']);
    expect(rules(v2(), v2({ note: 'more', updated: '2026-10-01' }))).toEqual(['R3']);
    expect(rules(v2(), v2({ note: 'more', updated: undefined }))).toEqual(['R3']);
  });

  it('R3: a second edit on the day the row was stamped keeps its date, and a moved date passes', () => {
    expect(rules(v2({ updated: '2026-10-31' }), v2({ note: 'more', updated: '2026-10-31' }))).toEqual([]);
    expect(rules(v2({ updated: '2026-10-30' }), v2({ note: 'more', updated: '2026-10-30' }))).toEqual([]);
    expect(rules(v2(), v2({ note: 'more', updated: '2026-10-31' }))).toEqual([]);
  });

  it('R4: a v2 row closed at the base may change its closure and note, not its title, severity or owner', () => {
    const closed = v2({ state: 'closed', resolution: 'done', closedBy: 'abc1234', severity: 'LOW', owner: 'command session' });
    expect(rules(closed, { ...closed, note: 'more', resolution: 'superseded', closedBy: 'superseded:X', updated: '2026-10-31' })).toEqual([]);
    expect(rules(closed, { ...closed, title: 'a new title', updated: '2026-10-31' })).toEqual(['R4']);
    expect(rules(closed, { ...closed, severity: 'MED', owner: 'Kevin', updated: '2026-10-31' })).toEqual(['R4']);
  });

  it('R4 exempts a row that was closed and v1 at the base, so the migration could shorten its title once', () => {
    const { kind: _k, updated: _u, ...v1closed } = v2({ state: 'closed', closedBy: 'abc1234', title: 'x'.repeat(200) });
    expect(rules(v1closed, { ...v1closed, kind: 'debt', resolution: 'done', title: 'a short title', updated: '2026-10-31' })).toEqual([]);
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

  const row = (id, extra = {}) => JSON.stringify({ id, title: `title of ${id}`, state: 'open', updated: '2026-10-01', ...extra });

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
      [row('K'), row('S/a'), row('S/b', { state: 'closed', closedBy: 'abc1234', updated: '2026-10-02' }), row('T')],
    ]);
    const green = run(repo2, `${shas2[0]}..${shas2[1]}`);
    expect(green.status, green.stdout + green.stderr).toBe(0);
    expect(green.stdout).toMatch(/3 row ids at base, 4 at head/);
  });

  it('a range that reopens a closed row fails and names R2', () => {
    const { repo, shas } = repoWith('reopens', [
      [row('K', { kind: 'debt', state: 'closed', closedBy: 'abc1234' })],
      [row('K', { kind: 'debt', state: 'open', updated: '2026-10-02' })],
    ]);
    const red = run(repo, `${shas[0]}..${shas[1]}`);
    expect(red.status, red.stdout + red.stderr).toBe(1);
    expect(red.stderr).toMatch(/• R2 K: closed at the base and open at the head/);
  });

  it('a range whose base is its head prints COULD NOT CHECK, never a pass over nothing', () => {
    const { repo, shas } = repoWith('self', [[row('K')]]);
    const r = run(repo, `${shas[0]}..${shas[0]}`);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/COULD NOT CHECK, no range: the base \(the range given\) is the head/);
    expect(r.stdout).not.toMatch(/✓/);
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

// The CI half of the range: the event's base must be in the clone, so the gates job (the one that runs the fast tier)
// checks out full history. A file-content check of ci.yml, comments stripped so the comment explaining it cannot pass.
describe('ci.yml gives registry-append-only its base', () => {
  it('the gates job runs the fast tier from a full-history checkout', () => {
    const yml = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
    const start = yml.indexOf('\n  gates:\n');
    const end = yml.indexOf('\n  e2e:\n');
    expect(start, 'the gates job').toBeGreaterThan(-1);
    expect(end, 'the job after it').toBeGreaterThan(start);
    const job = yml.slice(start, end).split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    expect(job).toMatch(/run: bash ci\/pipeline\.sh --tier=fast/);
    expect(job).toMatch(/- uses: actions\/checkout@v\d+\n\s+with:\n\s+fetch-depth: 0\n/);
  });
});
