import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureGit, fixtureGitWith, isolatedGitEnv } from './_isolatedGit.js';
import { collect, write, check, render, TARGET } from '../../scripts/ci/changelog.mjs';

/**
 * scripts/ci/changelog.mjs — memory/CHANGELOG.md is generated from git and the merged pull requests, and `--check`
 * refuses a file that is stale, hand-edited, or names a commit outside the history.
 *
 * Sited in tests/scripts: the subject is a file checked against a repository. Each case builds a throwaway repository
 * whose landings are known by construction (fixed commit dates, the merge subjects this repo uses), so the answer is
 * known without reading the script, and drives the exported check on it; the last cases run the CLI.
 *
 * BLIND SPOT, by design: a pull request's number and title are GitHub's, and `--check` runs offline, so a wrong title
 * on a PR line passes (the case "a PR line's title is not checked" pins that). So does a landing no later commit
 * merged in: git keeps no record of where main pointed.
 */
const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const roots = [];
afterAll(() => {
  for (const d of roots) rmSync(d, { recursive: true, force: true });
});

/** A throwaway repository; every git call gets the caller's environment with GIT_* removed, plus a fixed date. */
function repo() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'crafty-changelog-')));
  roots.push(root);
  let clock = Date.parse('2026-06-01T10:00:00Z') / 1000;
  const g = (...args) => fixtureGit(root, ...args);
  const at = (iso, ...args) => {
    clock = iso ? Date.parse(iso) / 1000 : clock + 60;
    const date = `${clock} +0000`;
    return fixtureGitWith(root, { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }, ...args);
  };
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 'fixture@example.invalid');
  g('config', 'user.name', 'fixture');
  g('config', 'commit.gpgsign', 'false');
  mkdirSync(join(root, 'memory'), { recursive: true });
  const commit = (msg, iso) => {
    writeFileSync(join(root, 'f.txt'), `${msg}\n`);
    at(iso, 'add', '-A');
    at(iso, 'commit', '-q', '-m', msg);
    return g('rev-parse', 'HEAD');
  };
  const merge = (branch, msg, iso) => {
    at(iso, 'merge', '-q', '--no-ff', '-X', 'theirs', '-m', msg, branch);
    return g('rev-parse', 'HEAD');
  };
  return { root, g, commit, merge };
}

/**
 * The history every case starts from, in this repo's two eras:
 *   June: a milestone branch merged INTO main ("Merge S1: ...").
 *   October: lanes land by fast-forward after taking main in ("merge main (...) into feat/a"), so the main tip a
 *   lane took in is the merge's second parent, and nothing else in git says main pointed there.
 */
function history() {
  const r = repo();
  r.commit('init', '2026-06-01T10:00:00Z');
  r.g('checkout', '-q', '-b', 'feat/s1');
  r.commit('s1 work', '2026-06-02T09:00:00Z');
  r.g('checkout', '-q', 'main');
  const milestone = r.merge('feat/s1', 'Merge S1: the first milestone', '2026-06-02T12:00:00Z');
  const base = r.commit('docs: a direct commit on main', '2026-10-20T08:00:00Z');
  r.g('checkout', '-q', '-b', 'feat/a');
  r.commit('feat(a): the a lane', '2026-10-21T08:00:00Z');
  r.g('checkout', '-q', 'main');
  const tipB = r.commit('fix(b): another lane landed first', '2026-10-21T09:00:00Z');
  r.g('checkout', '-q', 'feat/a');
  const laneA = r.merge('main', 'merge main (fix b) into feat/a', '2026-10-21T10:00:00Z');
  r.g('checkout', '-q', 'main');
  r.g('merge', '-q', '--ff-only', 'feat/a'); // lane a lands by fast-forward
  return { ...r, milestone, base, tipB, laneA };
}

const fileOf = (r) => readFileSync(join(r.root, TARGET), 'utf8');
const putFile = (r, text) => writeFileSync(join(r.root, TARGET), text);

describe('changelog: what git can prove', () => {
  let h;
  beforeAll(() => {
    h = history();
  });

  it('finds the June merge into main and the main tip a lane took in, and nothing else, as required landings', () => {
    const { required } = collect({ root: h.root });
    expect(required.map((e) => e.sha).sort()).toEqual([h.milestone, h.tipB].sort());
  });

  it('writes one line per landing, newest first, under the UTC day of the landed commit; a PR line takes its title', () => {
    write({ root: h.root, prs: [{ number: 7, title: 'Lane B: another lane (with parentheses)', landed: h.tipB }] });
    const text = fileOf(h);
    const body = text.slice(text.indexOf('## '));
    expect(body).toBe(
      '## 2026-10-21\n\n' +
        `- Lane B: another lane (with parentheses) (#7, ${h.tipB.slice(0, 8)})\n\n` +
        '## 2026-06-02\n\n' +
        `- S1: the first milestone (${h.milestone.slice(0, 8)})\n`,
    );
    expect(check({ root: h.root })).toMatchObject({ errors: [], checked: { lines: 2, required: 2 } });
  });

  it('a PR line\'s title is not checked: GitHub holds it and --check is offline (the blind spot, pinned)', () => {
    write({ root: h.root, prs: [{ number: 7, title: 'Lane B', landed: h.tipB }] });
    putFile(h, fileOf(h).replace('Lane B (#7', 'A different title (#7'));
    expect(check({ root: h.root }).errors).toEqual([]);
  });
});

describe('changelog --check goes red on each way the file goes wrong', () => {
  it('stale: a lane takes in a main tip the file does not list', () => {
    const h = history();
    write({ root: h.root, prs: [] });
    expect(check({ root: h.root }).errors, 'presence: current before main moves').toEqual([]);
    h.g('checkout', '-q', '-b', 'feat/c', h.base);
    h.commit('feat(c): the c lane', '2026-10-22T08:00:00Z');
    const laneC = h.merge('main', 'merge main (lane a) into feat/c', '2026-10-22T09:00:00Z');
    const { errors } = check({ root: h.root });
    expect(errors.join('\n')).toMatch(new RegExp(`${h.laneA.slice(0, 8)}.*not listed`));
    expect(errors.join('\n')).toContain(laneC.slice(0, 8));
  });

  it('stale: the "merge origin/main" and remote-tracking spellings count as taking main in', () => {
    for (const subject of ['merge origin/main (lane a) into feat/d', "Merge remote-tracking branch 'origin/main' into feat/d"]) {
      const h = history();
      write({ root: h.root, prs: [] });
      h.g('checkout', '-q', '-b', 'feat/d', h.base);
      h.commit('feat(d): the d lane', '2026-10-22T08:00:00Z');
      h.merge('main', subject, '2026-10-22T09:00:00Z');
      expect(check({ root: h.root }).errors.join('\n'), subject).toMatch(new RegExp(`${h.laneA.slice(0, 8)}.*not listed`));
    }
  });

  it('a line naming a commit outside this history', () => {
    const h = history();
    h.g('checkout', '-q', '-b', 'feat/unlanded', h.base);
    const stray = h.commit('feat: never landed', '2026-10-23T08:00:00Z');
    h.g('checkout', '-q', 'main');
    write({ root: h.root, prs: [] });
    const text = fileOf(h);
    putFile(h, text.replace('## 2026-10-21\n\n', `## 2026-10-23\n\n- feat: never landed (${stray.slice(0, 8)})\n\n## 2026-10-21\n\n`));
    expect(check({ root: h.root }).errors.join('\n')).toMatch(new RegExp(`${stray.slice(0, 8)}.*not in this history`));
  });

  it('a hand-edited title on a line git derives', () => {
    const h = history();
    write({ root: h.root, prs: [] });
    putFile(h, fileOf(h).replace('S1: the first milestone', 'S1: a better milestone'));
    expect(check({ root: h.root }).errors.join('\n')).toMatch(/S1: a better milestone.*commit says "S1: the first milestone"/);
  });

  it('lines out of order, or under the wrong day', () => {
    const h = history();
    write({ root: h.root, prs: [] });
    const text = fileOf(h);
    const swapped = text.replace('## 2026-10-21', '## 2026-10-20');
    putFile(h, swapped);
    expect(check({ root: h.root }).errors.join('\n')).toMatch(/not in generated form/);
  });

  it('a history with no landing at all reads as a check that could not run, never as a pass', () => {
    const r = repo();
    r.commit('init', '2026-06-01T10:00:00Z');
    putFile(r, render([]));
    expect(check({ root: r.root }).errors.join('\n')).toMatch(/no landing/);
  });

  it('a pull request CI checkout (GitHub\'s synthetic "Merge <sha> into <sha>" at HEAD) needs nothing new', () => {
    const h = history();
    write({ root: h.root, prs: [] });
    const before = h.g('rev-parse', 'HEAD');
    h.g('checkout', '-q', '-b', 'pr', h.base);
    h.commit('feat(e): the e lane', '2026-10-24T08:00:00Z');
    h.merge('main', `Merge ${'a'.repeat(40)} into ${before}`, '2026-10-24T09:00:00Z');
    const { errors, checked } = check({ root: h.root });
    expect(checked.required, 'presence: the landings before the checkout are still required').toBe(2);
    expect(errors).toEqual([]);
  });
});

describe('changelog CLI', () => {
  const cli = (...args) => spawnSync(process.execPath, ['scripts/ci/changelog.mjs', ...args], { cwd: APP, encoding: 'utf8', env: isolatedGitEnv() });

  it('--check on a stale fixture root exits 1 and names the fix; on a current one exits 0 with its denominator', () => {
    const h = history();
    write({ root: h.root, prs: [] });
    const ok = cli('--check', `--root=${h.root}`);
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stdout).toMatch(/2 lines, 2 required landings/);
    putFile(h, fileOf(h).replace(/^- S1.*\n/m, ''));
    const red = cli('--check', `--root=${h.root}`);
    expect(red.status).toBe(1);
    expect(red.stderr).toMatch(/changelog\.mjs --write/);
  });
});
