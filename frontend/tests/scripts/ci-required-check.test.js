import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, chmodSync, existsSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';
import { isDocsPath, classify, candidateBase, certified, shaCertified, scope, REQUIRED_CHECK, MAIN_REF } from '../../scripts/ci/change-scope.mjs';
import { jobIds, verdict, SELF, SCOPE_JOB, SKIPPABLE_ON_DOCS } from '../../scripts/ci/ci-ok.mjs';
import { isolatedGitEnv, fixtureGit } from './_isolatedGit.js';

/**
 * THE REQUIRED CHECK ON MAIN (DECISIONS 2026-10-28 item 13(b)): one aggregate job, `ci ok`, and a docs-only skip of the
 * browser jobs. Sited in tests/scripts because half its subject is a FILE (ci.yml's wiring); the other half EXECUTES
 * the two scripts — pure seams with injected git and check-run readers, real git in throwaway repos, and both CLIs
 * end to end with a stub `gh` — so the verdicts are driven, not read.
 *
 * What would still pass if the feature were deleted? Nothing here: every case drives change-scope.mjs, ci-ok.mjs or
 * pipeline.sh, and the ci.yml block pins the wiring that connects them.
 *
 * Mutation-Proof: each observed RED with scripts/dev/mutate.sh (run from a bash script file, one mutant at a time,
 * an identity mutant SURVIVING in the same batch). change-scope.mjs: C1-C8, listed in its own header; ci-ok.mjs:
 * K1-K6, listed in its header; pipeline.sh: P1 `= "false"` widened to any non-empty value -> the `true` and FALSE
 * cases; P2 the skip branch deleted -> the docs-only case (prod-smoke ran); ci.yml: Y1 the e2e `if:` compares
 * `== 'true'` (an unknown output would skip) -> the e2e-condition case; Y2 `ci ok` on `!cancelled()` -> the always()
 * case; Y3 a job dropped from ci-ok's needs -> the wiring case.
 */

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ROOT = resolve(APP, '..');
const CI_YML = join(ROOT, '.github/workflows/ci.yml');
const SHA = (c) => c.repeat(40);

describe('isDocsPath / classify — only a change every path of which is docs may skip', () => {
  it('docs, memory, and Markdown outside the code trees are docs', () => {
    const docs = ['docs/superpowers/DECISIONS.md', 'docs/superpowers/command-record.html', 'memory/STATUS.md', 'README.md', '.agent/AGENTS.md', '.claude/rules/gates-and-probes.md', 'SOTA-INITIATIVE.md'];
    for (const p of docs) expect(isDocsPath(p), p).toBe(true);
  });

  it('anything under frontend/, ci/, .github/ or .githooks/ is code, Markdown included; so is every unrecognised path', () => {
    const code = ['frontend/src/App.jsx', 'frontend/README.md', 'frontend/tests/e2e/x.md', 'ci/pipeline.sh', 'ci/NOTES.md', '.github/workflows/ci.yml', '.github/PULL_REQUEST_TEMPLATE.md', '.githooks/pre-push', '.state/compaction-events.jsonl', 'scripts/hooks/post-compact-rules.sh', '.gitignore', 'README.MD', 'docs', 'memoryX/a.txt'];
    for (const p of code) expect(isDocsPath(p), p).toBe(false);
  });

  it('an EMPTY change is not docs-only (C2): a run with nothing to compare is a request for a verdict', () => {
    expect(classify([]).code).toBe(true);
  });

  it('one code path among docs makes the whole change code, and the reason names it', () => {
    const k = classify(['docs/a.md', 'frontend/src/a.js', 'memory/b.md']);
    expect(k.code).toBe(true);
    expect(k.why).toMatch(/frontend\/src\/a\.js/);
    expect(classify(['docs/a.md', 'memory/b.md']).code).toBe(false);
  });
});

describe('candidateBase — the commit each event is compared against', () => {
  const mb = () => SHA('m');
  it('push: the previous tip; a new branch (all-zero before): the merge-base with origin/main', () => {
    expect(candidateBase({ event: 'push', payload: { before: SHA('b') }, mergeBase: mb }).base).toBe(SHA('b'));
    expect(candidateBase({ event: 'push', payload: { before: SHA('0') }, mergeBase: mb }).base).toBe(SHA('m'));
    expect(candidateBase({ event: 'push', payload: {}, mergeBase: mb }).base).toBe(SHA('m'));
  });
  it('push, FORCED (C7): no base — a rewritten branch has no ancestor to compare against', () => {
    expect(candidateBase({ event: 'push', payload: { before: SHA('b'), forced: true }, mergeBase: mb }).base).toBe(null);
  });
  it('pull_request: the base sha; none in the payload, no base', () => {
    expect(candidateBase({ event: 'pull_request', payload: { pull_request: { base: { sha: SHA('p') } } }, mergeBase: mb }).base).toBe(SHA('p'));
    expect(candidateBase({ event: 'pull_request', payload: {}, mergeBase: mb }).base).toBe(null);
  });
  it('workflow_dispatch: the merge-base with origin/main; any other event, no base', () => {
    expect(candidateBase({ event: 'workflow_dispatch', payload: {}, mergeBase: mb }).base).toBe(SHA('m'));
    expect(candidateBase({ event: 'schedule', payload: {}, mergeBase: mb }).base).toBe(null);
    expect(candidateBase({ event: '', payload: {}, mergeBase: mb }).base).toBe(null);
  });
});

describe('certified — the base\'s NEWEST `ci ok` decides', () => {
  const run = (id, status, conclusion, extra = {}) => ({ id, name: REQUIRED_CHECK, status, conclusion, app: { slug: 'github-actions' }, ...extra });
  it('newest completed success: certified; no check run at all: not', () => {
    expect(certified([run(7, 'completed', 'success')]).ok).toBe(true);
    expect(certified([]).ok).toBe(false);
    expect(certified(undefined).ok).toBe(false);
  });
  it('an older green under a NEWER red is not certified (C5), and an older red under a newer green is', () => {
    expect(certified([run(10, 'completed', 'success'), run(11, 'completed', 'failure')]).ok).toBe(false);
    expect(certified([run(11, 'completed', 'failure'), run(10, 'completed', 'success')]).ok).toBe(false);
    expect(certified([run(10, 'completed', 'failure'), run(11, 'completed', 'success')]).ok).toBe(true);
  });
  it('a newest run still in progress, or cancelled, is not certified', () => {
    expect(certified([run(10, 'completed', 'success'), run(11, 'in_progress', null)]).ok).toBe(false);
    expect(certified([run(11, 'completed', 'cancelled')]).ok).toBe(false);
  });
  it('only the Actions app\'s check of exactly that name counts', () => {
    expect(certified([run(12, 'completed', 'success', { app: { slug: 'some-bot' } })]).ok).toBe(false);
    expect(certified([run(12, 'completed', 'success', { name: 'ci ok 2' })]).ok).toBe(false);
  });
});

describe('scope — the decision, with git and the check runs injected', () => {
  const green = () => [{ id: 1, name: REQUIRED_CHECK, status: 'completed', conclusion: 'success', app: { slug: 'github-actions' } }];
  const fakeGit = (diff, { ancestor = true } = {}) => (args) => {
    if (args[0] === 'rev-parse' && args[1] === 'HEAD') return `${SHA('h')}\n`;
    if (args[0] === 'merge-base' && args[1] === '--is-ancestor') { if (!ancestor) throw new Error('exit 1'); return ''; }
    if (args[0] === 'merge-base') return `${SHA('m')}\n`;
    if (args[0] === 'diff') return diff.map((p) => `${p}\0`).join('');
    throw new Error(`unexpected git ${args.join(' ')}`);
  };
  const push = { before: SHA('b') };

  it('docs only, against a certified base: code=false — the one way to skip', () => {
    const r = scope({ event: 'push', payload: push, git: fakeGit(['docs/a.md']), checkRuns: green });
    expect(r.code, r.lines.join('\n')).toBe(false);
    expect(r.lines.at(-1)).toMatch(/code=false/);
  });
  it('docs only, against an UNCERTIFIED base (C4): everything runs', () => {
    const r = scope({ event: 'push', payload: push, git: fakeGit(['docs/a.md']), checkRuns: () => [] });
    expect(r.code).toBe(true);
    expect(r.lines.at(-1)).toMatch(/not certified/);
  });
  it('a code change: everything runs, and the check runs are never read', () => {
    let read = 0;
    const r = scope({ event: 'push', payload: push, git: fakeGit(['frontend/src/a.js']), checkRuns: () => { read++; return green(); } });
    expect(r.code).toBe(true);
    expect(read).toBe(0);
  });
  it('a base that is not an ancestor of HEAD (C6): everything runs', () => {
    expect(scope({ event: 'push', payload: push, git: fakeGit(['docs/a.md'], { ancestor: false }), checkRuns: green }).code).toBe(true);
  });
  it('any error — the check-run API down (C8) — reads code=true, never docs-only', () => {
    const r = scope({ event: 'push', payload: push, git: fakeGit(['docs/a.md']), checkRuns: () => { throw new Error('HTTP 403'); } });
    expect(r.code).toBe(true);
    expect(r.lines.at(-1)).toMatch(/COULD NOT CLASSIFY \(HTTP 403\)/);
  });
  it('the CERTIFIED base is the one compared: check runs are read for the base sha, not HEAD', () => {
    const asked = [];
    scope({ event: 'push', payload: push, git: fakeGit(['docs/a.md']), checkRuns: (sha) => { asked.push(sha); return green(); } });
    expect(asked).toEqual([SHA('b')]);
  });
});

// A push to main re-tests a sha that already passed on its land/** push or pull request. These drive the rule that lets
// it pass on that verdict, with the fixtures the command session named: certified elsewhere, only this run's own check,
// an API error, and a failed earlier `ci ok`.
const THIS_RUN = '4000';
const ciOk = (id, run, status = 'completed', conclusion = 'success', extra = {}) => ({
  id, name: REQUIRED_CHECK, status, conclusion, app: { slug: 'github-actions' },
  html_url: `https://github.com/owner/repo/actions/runs/${run}/job/${id}`, ...extra,
});

describe('shaCertified — did ANOTHER workflow run pass this exact sha?', () => {
  it('certified elsewhere: the newest `ci ok` from another run passed, and that run is named', () => {
    const c = shaCertified([ciOk(10, '3000'), ciOk(11, THIS_RUN, 'in_progress', null)], THIS_RUN);
    expect(c.ok, c.why).toBe(true);
    expect(c.run).toBe('3000');
    expect(c.url).toBe('https://github.com/owner/repo/actions/runs/3000/job/10');
  });
  it('only this run\'s own check, passed or pending: not certified', () => {
    expect(shaCertified([ciOk(11, THIS_RUN)], THIS_RUN).ok).toBe(false);
    expect(shaCertified([ciOk(11, THIS_RUN, 'queued', null)], THIS_RUN).ok).toBe(false);
    expect(shaCertified([], THIS_RUN).ok).toBe(false);
    expect(shaCertified(undefined, THIS_RUN).ok).toBe(false);
  });
  it('a failed earlier `ci ok` from another run: not certified; a newer red over an older green: not certified', () => {
    expect(shaCertified([ciOk(10, '3000', 'completed', 'failure')], THIS_RUN).ok).toBe(false);
    expect(shaCertified([ciOk(10, '3000'), ciOk(12, '3100', 'completed', 'failure')], THIS_RUN).ok).toBe(false);
    expect(shaCertified([ciOk(12, '3100', 'completed', 'failure'), ciOk(10, '3000')], THIS_RUN).ok).toBe(false);
    expect(shaCertified([ciOk(10, '3000', 'completed', 'cancelled')], THIS_RUN).ok).toBe(false);
    const later = shaCertified([ciOk(10, '3000', 'completed', 'failure'), ciOk(12, '3100')], THIS_RUN);
    expect(later.ok, 'control: an older red under a newer green from another run certifies').toBe(true);
    expect(later.run).toBe('3100');
  });
  it('a newest `ci ok` from another run still running: not certified', () => {
    expect(shaCertified([ciOk(10, '3000'), ciOk(12, '3100', 'in_progress', null)], THIS_RUN).ok).toBe(false);
  });
  it('no run id to compare against, or a check run whose URL names no run: not certified', () => {
    expect(shaCertified([ciOk(10, '3000')], '').ok).toBe(false);
    expect(shaCertified([ciOk(10, '3000')], undefined).ok).toBe(false);
    const anon = ciOk(12, '3100', 'completed', 'success', { html_url: 'https://example.invalid/x', details_url: '' });
    expect(shaCertified([ciOk(10, '3000'), anon], THIS_RUN).ok).toBe(false);
  });
  it('only the Actions app\'s check of exactly that name counts', () => {
    expect(shaCertified([ciOk(10, '3000', 'completed', 'success', { app: { slug: 'some-bot' } })], THIS_RUN).ok).toBe(false);
    expect(shaCertified([ciOk(10, '3000', 'completed', 'success', { name: 'ci ok 2' })], THIS_RUN).ok).toBe(false);
  });
});

describe('scope on a push to main — the certified verdict', () => {
  const fakeGit = (diff) => (args) => {
    if (args[0] === 'rev-parse' && args[1] === 'HEAD') return `${SHA('h')}\n`;
    if (args[0] === 'merge-base' && args[1] === '--is-ancestor') return '';
    if (args[0] === 'diff') return diff.map((p) => `${p}\0`).join('');
    throw new Error(`unexpected git ${args.join(' ')}`);
  };
  const push = { before: SHA('b') };
  const main = (checkRuns, { diff = ['frontend/src/a.js'], ref = MAIN_REF, event = 'push', runId = THIS_RUN } = {}) =>
    scope({ event, payload: push, git: fakeGit(diff), checkRuns, ref, runId });

  it('certified elsewhere: certified=true, code=true, the run named, and the check runs read are HEAD\'s', () => {
    const asked = [];
    const r = main((sha) => { asked.push(sha); return [ciOk(10, '3000')]; });
    expect(r.certified, r.lines.join('\n')).toBe(true);
    expect(r.code).toBe(true);
    expect(r.certifiedBy).toBe('https://github.com/owner/repo/actions/runs/3000/job/10');
    expect(r.lines.at(-1)).toMatch(/certified=true .*run 3000/);
    expect(asked).toEqual([SHA('h')]);
  });
  it('only this run\'s own check: certified=false, and a code change runs everything', () => {
    const r = main(() => [ciOk(11, THIS_RUN)]);
    expect(r.certified).toBe(false);
    expect(r.code).toBe(true);
    expect(r.lines.join('\n')).toMatch(/not certified by another run/);
  });
  it('an API error: certified=false, code=true — COULD NOT CLASSIFY, everything runs', () => {
    const r = main(() => { throw new Error('HTTP 502'); });
    expect(r.certified).toBe(false);
    expect(r.code).toBe(true);
    expect(r.lines.at(-1)).toMatch(/COULD NOT CLASSIFY \(HTTP 502\)/);
  });
  it('a failed earlier `ci ok` from another run: certified=false', () => {
    const r = main(() => [ciOk(10, '3000', 'completed', 'failure')]);
    expect(r.certified).toBe(false);
    expect(r.code).toBe(true);
  });
  it('the same certified sha pushed to a land/** branch, or reached by a dispatch or a pull request: no certification is read', () => {
    for (const [event, ref] of [['push', 'refs/heads/land/2026-10-28'], ['workflow_dispatch', MAIN_REF], ['pull_request', 'refs/pull/9/merge']]) {
      const asked = [];
      const r = main((sha) => { asked.push(sha); return [ciOk(10, '3000')]; }, { event, ref });
      expect(r.certified, `${event} ${ref}`).toBe(false);
      expect(asked, `${event} ${ref}`).not.toContain(SHA('h'));
    }
  });
  it('not certified, a docs-only push to main still takes the docs-only rule against its base', () => {
    const r = main((sha) => (sha === SHA('h') ? [] : [ciOk(9, '2000')]), { diff: ['docs/a.md'] });
    expect(r.certified).toBe(false);
    expect(r.code).toBe(false);
  });
});

// REAL GIT. The pure cases above cannot see what `git diff` actually prints; these can. Every git call in a fixture
// runs with every GIT_* variable stripped (_isolatedGit.js), so a hook-exported GIT_DIR cannot reach the real repo.
describe('scope against a real repository', () => {
  let dir;
  const git = (args) => {
    // Raw git because the diff cases need stdout untrimmed, which fixtureGit trims; isolated all the same.
    // eslint-disable-next-line no-restricted-syntax
    const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8', env: isolatedGitEnv() });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout;
  };
  const commit = (files, msg, rm = []) => {
    for (const [p, body] of Object.entries(files)) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), body); }
    for (const p of rm) rmSync(join(dir, p));
    fixtureGit(dir, 'add', '-A');
    fixtureGit(dir, 'commit', '-q', '-m', msg);
    return fixtureGit(dir, 'rev-parse', 'HEAD');
  };
  const green = () => [{ id: 1, name: REQUIRED_CHECK, status: 'completed', conclusion: 'success', app: { slug: 'github-actions' } }];
  let base;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'ci-scope-'));
    fixtureGit(dir, 'init', '-q', '-b', 'main');
    fixtureGit(dir, 'config', 'user.email', 'fixture@example.invalid');
    fixtureGit(dir, 'config', 'user.name', 'fixture');
    fixtureGit(dir, 'config', 'commit.gpgsign', 'false');
    fixtureGit(dir, 'config', 'diff.renames', 'true'); // the default, pinned: the rename case needs detection ON
    base = commit({ 'frontend/src/a.js': 'export const a = 1;\n'.repeat(20), 'docs/x.md': '# x\n' }, 'base');
    fixtureGit(dir, 'update-ref', 'refs/remotes/origin/main', base);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('a file MOVED from frontend/ into docs/ is code (C3: --no-renames shows the side it left)', () => {
    fixtureGit(dir, 'checkout', '-q', '-b', 'mv', base);
    mkdirSync(join(dir, 'docs'), { recursive: true });
    renameSync(join(dir, 'frontend/src/a.js'), join(dir, 'docs/a.js.md'));
    fixtureGit(dir, 'add', '-A');
    fixtureGit(dir, 'commit', '-q', '-m', 'move');
    // Presence control: with rename detection, git itself names only the docs side — the trap is real here.
    expect(git(['diff', '--name-only', base, 'HEAD']).trim()).toBe('docs/a.js.md');
    const r = scope({ event: 'push', payload: { before: base }, git, checkRuns: green });
    expect(r.code, r.lines.join('\n')).toBe(true);
    expect(r.lines.at(-1)).toMatch(/frontend\/src\/a\.js/);
  });

  it('a docs-only commit on a certified base: false; a new branch reaches the base through origin/main', () => {
    fixtureGit(dir, 'checkout', '-q', '-b', 'docs-only', base);
    commit({ 'docs/x.md': '# x, edited\n', 'memory/STATUS.md': 's\n' }, 'docs');
    expect(scope({ event: 'push', payload: { before: base }, git, checkRuns: green }).code).toBe(false);
    expect(scope({ event: 'push', payload: { before: SHA('0') }, git, checkRuns: green }).code).toBe(false);
    expect(scope({ event: 'workflow_dispatch', payload: {}, git, checkRuns: green }).code).toBe(false);
  });

  it('a before that is not HEAD\'s ancestor (C6, real): everything runs', () => {
    fixtureGit(dir, 'checkout', '-q', '-b', 'side', base);
    const side = commit({ 'docs/side.md': 's\n' }, 'side');
    fixtureGit(dir, 'checkout', '-q', 'docs-only');
    const r = scope({ event: 'push', payload: { before: side }, git, checkRuns: green });
    expect(r.code).toBe(true);
    expect(r.lines.at(-1)).toMatch(/not an ancestor/);
  });

  it('a dispatch AT origin/main: an empty diff runs everything', () => {
    fixtureGit(dir, 'checkout', '-q', base);
    expect(scope({ event: 'workflow_dispatch', payload: {}, git, checkRuns: green }).code).toBe(true);
  });

  it('the CLI end to end: reads the event payload, asks gh for the base sha\'s `ci ok`, writes code= to GITHUB_OUTPUT', () => {
    fixtureGit(dir, 'checkout', '-q', 'docs-only');
    const bin = join(dir, '.bin');
    mkdirSync(bin, { recursive: true });
    const ghLog = join(dir, '.gh-args');
    const runs = JSON.stringify({ total_count: 1, check_runs: green() });
    writeFileSync(join(bin, 'gh'), `#!/bin/sh\nprintf '%s\\n' "$*" >> "${ghLog}"\ncat <<'JSON'\n${runs}\nJSON\n`);
    chmodSync(join(bin, 'gh'), 0o755);
    const cli = (payload, name) => {
      const ev = join(dir, `.event-${name}.json`);
      const out = join(dir, `.output-${name}`);
      writeFileSync(ev, JSON.stringify(payload));
      writeFileSync(out, '');
      const r = spawnSync(process.execPath, [join(APP, 'scripts/ci/change-scope.mjs')], {
        cwd: dir,
        encoding: 'utf8',
        env: isolatedGitEnv({ PATH: `${bin}:${process.env.PATH}`, GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: ev, GITHUB_OUTPUT: out, GITHUB_REPOSITORY: 'owner/repo' }),
      });
      return { ...r, output: readFileSync(out, 'utf8') };
    };
    const docs = cli({ before: base }, 'docs');
    expect(docs.status, docs.stdout + docs.stderr).toBe(0);
    expect(docs.output).toBe('code=false\ncertified=false\ncertified_by=\n');
    expect(readFileSync(ghLog, 'utf8')).toContain(`api repos/owner/repo/commits/${base}/check-runs?check_name=ci%20ok&filter=all&per_page=100`);
    // Control: the same CLI on a code change writes true.
    fixtureGit(dir, 'checkout', '-q', '-b', 'code', base);
    commit({ 'frontend/src/b.js': 'export const b = 2;\n' }, 'code');
    expect(cli({ before: base }, 'code').output).toBe('code=true\ncertified=false\ncertified_by=\n');
    // And a forced push writes true without asking gh anything new.
    const asked = readFileSync(ghLog, 'utf8').split('\n').filter(Boolean).length;
    expect(cli({ before: base, forced: true }, 'forced').output).toBe('code=true\ncertified=false\ncertified_by=\n');
    expect(readFileSync(ghLog, 'utf8').split('\n').filter(Boolean).length).toBe(asked);
  });

  it('the CLI on a push to main: reads GITHUB_REF and GITHUB_RUN_ID, asks gh for HEAD\'s `ci ok`, writes certified= and the run', () => {
    fixtureGit(dir, 'checkout', '-q', 'code');
    const head = fixtureGit(dir, 'rev-parse', 'HEAD');
    const bin = join(dir, '.bin-main');
    mkdirSync(bin, { recursive: true });
    const ghLog = join(dir, '.gh-args-main');
    const runs = JSON.stringify({ total_count: 2, check_runs: [ciOk(10, '3000'), ciOk(11, THIS_RUN, 'queued', null)] });
    writeFileSync(join(bin, 'gh'), `#!/bin/sh\nprintf '%s\\n' "$*" >> "${ghLog}"\ncat <<'JSON'\n${runs}\nJSON\n`);
    chmodSync(join(bin, 'gh'), 0o755);
    const cli = (extra, name) => {
      const ev = join(dir, `.event-main-${name}.json`);
      const out = join(dir, `.output-main-${name}`);
      writeFileSync(ev, JSON.stringify({ before: base }));
      writeFileSync(out, '');
      const r = spawnSync(process.execPath, [join(APP, 'scripts/ci/change-scope.mjs')], {
        cwd: dir,
        encoding: 'utf8',
        env: isolatedGitEnv({ PATH: `${bin}:${process.env.PATH}`, GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: ev, GITHUB_OUTPUT: out, GITHUB_REPOSITORY: 'owner/repo', ...extra }),
      });
      return { ...r, output: readFileSync(out, 'utf8') };
    };
    const m = cli({ GITHUB_REF: MAIN_REF, GITHUB_RUN_ID: THIS_RUN }, 'certified');
    expect(m.status, m.stdout + m.stderr).toBe(0);
    expect(m.output).toBe('code=true\ncertified=true\ncertified_by=https://github.com/owner/repo/actions/runs/3000/job/10\n');
    expect(m.stdout).toMatch(/run 3000/);
    expect(readFileSync(ghLog, 'utf8')).toContain(`api repos/owner/repo/commits/${head}/check-runs?check_name=ci%20ok&filter=all&per_page=100`);
    // Controls: the same check runs, but this run IS run 3000; and no run id at all.
    expect(cli({ GITHUB_REF: MAIN_REF, GITHUB_RUN_ID: '3000' }, 'own').output).toMatch(/^code=true\ncertified=false\n/);
    expect(cli({ GITHUB_REF: MAIN_REF }, 'no-run-id').output).toMatch(/^code=true\ncertified=false\n/);
  });
});

describe('ci-ok verdict — the aggregate', () => {
  const JOBS = ['changes', 'gates', 'e2e', 'ci-ok'];
  const needs = (code, results = {}, cert = { certified: 'false', certified_by: '' }) => ({
    changes: { result: 'success', outputs: { code, ...cert } },
    gates: { result: 'success', outputs: {} },
    e2e: { result: 'success', outputs: {} },
    ...Object.fromEntries(Object.entries(results).map(([k, r]) => [k, typeof r === 'string' ? { result: r, outputs: {} } : r])),
  });

  it('every job green: ok, and the denominator is printed', () => {
    const v = verdict(needs('true'), JOBS);
    expect(v.ok, v.lines.join('\n')).toBe(true);
    expect(v.lines[0]).toMatch(/3 dependencies read, 3 other job\(s\) in ci\.yml/);
  });
  // A matrix job's `needs.<id>.result` is `failure` when any one of its shards failed, so this is one red shard.
  it('one red e2e shard (the matrix concludes failure) is not ok, on a code change and on a docs-only verdict alike', () => {
    for (const code of ['true', 'false']) {
      const v = verdict(needs(code, { e2e: 'failure' }), JOBS);
      expect(v.ok, `code=${code}\n${v.lines.join('\n')}`).toBe(false);
      expect(v.lines.join('\n')).toMatch(/e2e: failure {2}<- NOT OK/);
    }
  });
  it('e2e skipped on a docs-only verdict: ok', () => {
    expect(verdict(needs('false', { e2e: 'skipped' }), JOBS).ok).toBe(true);
  });
  it('e2e skipped WITHOUT a docs-only verdict (K1): not ok — a mis-wired `if` must not pass for ever', () => {
    const v = verdict(needs('true', { e2e: 'skipped' }), JOBS);
    expect(v.ok).toBe(false);
    expect(v.lines.join('\n')).toMatch(/e2e: skipped without a docs-only or certified verdict/);
  });
  it('only the jobs ci.yml makes conditional may skip: gates skipped on a docs-only verdict is not ok', () => {
    expect(verdict(needs('false', { gates: 'skipped' }), JOBS).ok).toBe(false);
  });
  it('a failed or CANCELLED dependency (K2) is not ok — a timed-out shard concludes cancelled', () => {
    expect(verdict(needs('true', { e2e: 'failure' }), JOBS).ok).toBe(false);
    expect(verdict(needs('true', { e2e: 'cancelled' }), JOBS).ok).toBe(false);
    expect(verdict(needs('false', { gates: 'cancelled', e2e: 'skipped' }), JOBS).ok).toBe(false);
  });
  it('a job in ci.yml missing from the needs list (K3) is not ok', () => {
    const v = verdict(needs('true'), [...JOBS, 'pages']);
    expect(v.ok).toBe(false);
    expect(v.lines.join('\n')).toMatch(/job "pages" is in ci\.yml but not in this job's needs/);
  });
  const BY = 'https://github.com/owner/repo/actions/runs/3000/job/10';
  const cert = { certified: 'true', certified_by: BY };
  it('e2e skipped on a certified verdict: ok, and the certifying run is printed', () => {
    const v = verdict(needs('true', { e2e: 'skipped' }, cert), JOBS);
    expect(v.ok, v.lines.join('\n')).toBe(true);
    expect(v.lines.join('\n')).toContain(`e2e: skipped — this exact sha passed \`ci ok\` in ${BY}`);
    expect(v.lines[0]).toContain(`certified by ${BY}`);
  });
  it('certified=true naming no run, or a certified word that is neither true nor false: not ok', () => {
    expect(verdict(needs('true', { e2e: 'skipped' }, { certified: 'true', certified_by: '' }), JOBS).ok).toBe(false);
    expect(verdict(needs('true', { e2e: 'skipped' }, { certified: 'TRUE', certified_by: BY }), JOBS).ok).toBe(false);
    expect(verdict(needs('true', {}, { certified_by: '' }), JOBS).ok, 'no certified output at all').toBe(false);
    expect(verdict(needs('true', {}, { certified: 'false', certified_by: '' }), JOBS).ok, 'control').toBe(true);
  });
  it('a certified verdict excuses only e2e: gates skipped is not ok, and a red e2e is not ok', () => {
    expect(verdict(needs('true', { gates: 'skipped', e2e: 'skipped' }, cert), JOBS).ok).toBe(false);
    expect(verdict(needs('true', { e2e: 'failure' }, cert), JOBS).ok).toBe(false);
    expect(verdict(needs('true', { e2e: 'skipped' }, { certified: 'true', certified_by: BY }), JOBS).ok, 'control').toBe(true);
  });
  it('a certified verdict from a failed scope job excuses nothing', () => {
    const n = needs('true', { e2e: 'skipped' }, cert);
    n.changes.result = 'failure';
    expect(verdict(n, JOBS).ok).toBe(false);
  });
  it('a change-scope output that is neither true nor false (K4), a failed scope job, or none: not ok', () => {
    expect(verdict(needs(''), JOBS).ok).toBe(false);
    expect(verdict(needs(undefined), JOBS).ok).toBe(false);
    expect(verdict(needs('false', { changes: { result: 'failure', outputs: {} } }), JOBS).ok).toBe(false);
    const { changes, ...rest } = needs('true');
    expect(changes.result).toBe('success');
    expect(verdict(rest, JOBS.filter((j) => j !== 'changes')).ok).toBe(false);
  });
  it('no dependency read at all (K5) is a control failure, not a pass; nor is a ci.yml with no jobs', () => {
    const empty = verdict({}, JOBS);
    expect(empty.ok).toBe(false);
    expect(empty.lines[0], 'named as a control failure, not as four missing jobs').toMatch(/COULD NOT CHECK — no dependency was read/);
    expect(verdict(needs('true'), []).ok).toBe(false);
  });
  it('jobIds (K6): the 2-space keys under `jobs:` only — never steps, never keys of a later top-level block', () => {
    const yml = 'on:\n  push:\njobs:\n  a:\n    steps:\n      - run: x\n    outputs:\n  b-c: # note\n  # comment:\n    x: 1\ndefaults:\n  run:\n';
    expect(jobIds(yml)).toEqual(['a', 'b-c']);
    expect(jobIds(yml.replace(/\n/g, '\r\n'))).toEqual(['a', 'b-c']);
  });
});

describe('ci.yml — the wiring that connects the two scripts', () => {
  const yml = readFileSync(CI_YML, 'utf8');
  /** One job's block, comments stripped, so no comment can satisfy an assertion. */
  const block = (id) => {
    const start = yml.indexOf(`\n  ${id}:\n`);
    expect(start, `job ${id}`).toBeGreaterThan(-1);
    const rest = yml.slice(start + 1);
    const next = rest.slice(1).search(/\n {2}[A-Za-z0-9_-]+:/);
    return (next < 0 ? rest : rest.slice(0, next + 1)).split('\n').filter((l) => !/^\s*#/.test(l)).map((l) => l.replace(/\s+#.*$/, '')).join('\n');
  };
  const ids = jobIds(yml);

  it('the change-scope job exists under the id ci-ok.mjs reads, and outputs its decision', () => {
    expect(ids).toContain(SCOPE_JOB);
    const c = block(SCOPE_JOB);
    expect(c).toMatch(/\n {6}code: \$\{\{ steps\.scope\.outputs\.code \}\}/);
    expect(c).toMatch(/\n {6}certified: \$\{\{ steps\.scope\.outputs\.certified \}\}/);
    expect(c).toMatch(/\n {6}certified_by: \$\{\{ steps\.scope\.outputs\.certified_by \}\}/);
    expect(c).toMatch(/\n {8}id: scope\n/);
    expect(c).toMatch(/run: node scripts\/ci\/change-scope\.mjs/);
    expect(c).toMatch(/checks: read/);
    expect(c).toMatch(/fetch-depth: 0/);
  });

  it('a job is conditional on the scope exactly when ci-ok.mjs may pass its skip, and the condition fails SAFE (Y1)', () => {
    const conditional = ids.filter((j) => /\n {4}if: .*needs\.changes\.outputs\.code/.test(block(j)));
    expect(conditional.sort()).toEqual([...SKIPPABLE_ON_DOCS].sort());
    for (const j of conditional) {
      // The browser job skips on exactly the scope condition. The job that merges its shards' reach (lane L12) skips on the
      // same condition and ALSO runs after a red or cancelled e2e (`always()`), so it names the shards the report lacks.
      if (j === 'runtime-reach') {
        expect(block(j)).toMatch(/\n {4}if: always\(\) && needs\.changes\.outputs\.code != 'false' && needs\.changes\.outputs\.certified != 'true'\n/);
        expect(block(j)).toMatch(/\n {4}needs: \[changes, e2e\]\n/);
      } else {
        expect(block(j)).toMatch(/\n {4}if: needs\.changes\.outputs\.code != 'false' && needs\.changes\.outputs\.certified != 'true'\n/);
        expect(block(j)).toMatch(/\n {4}needs: changes\n/);
      }
    }
  });

  it('CI runs on a push to land/** as well as main; the concurrency group is per event and ref; main is never cancelled', () => {
    expect(yml).toMatch(/\n {2}push:\n {4}branches: \[main, 'land\/\*\*'\]\n/);
    expect(yml).toMatch(/\n {2}group: ci-\$\{\{ github\.event_name \}\}-\$\{\{ github\.ref \}\}\n/);
    expect(yml).toMatch(/\n {2}cancel-in-progress: \$\{\{ github\.ref != 'refs\/heads\/main' \}\}\n/);
  });
});

// `ci ok` is computed by the commit it judges, from that commit's ci.yml, so a workflow edit that makes a red shard
// report success makes `ci ok` pass too. These read the real file as a YAML document, where a comment or a string
// cannot satisfy them, and pin what makes a judged job's result mean something.
describe('ci.yml — the jobs `ci ok` judges cannot quietly report success', () => {
  const yml = readFileSync(CI_YML, 'utf8');
  const doc = parseYaml(yml);
  const jobs = doc.jobs;
  const stepsOf = (id) => jobs[id].steps || [];
  /** Where a workflow lets a failing job or step read as success: the job id, or `id.steps[i]`. */
  const softened = (map) => Object.entries(map).flatMap(([id, j]) => [
    ...('continue-on-error' in j ? [id] : []),
    ...(j.steps || []).flatMap((s, i) => ('continue-on-error' in s ? [`${id}.steps[${i}]`] : [])),
  ]);

  it('the YAML reader and the text reader ci-ok.mjs uses find the same jobs, the ones that matter among them', () => {
    expect(Object.keys(jobs).sort()).toEqual(jobIds(yml).sort());
    expect(Object.keys(jobs)).toEqual(expect.arrayContaining([SCOPE_JOB, 'gates', 'e2e', SELF]));
  });

  it('no job and no step carries continue-on-error, which turns a red result into success: not the e2e job or step, the gates pipeline step, nor `ci ok` itself', () => {
    const control = softened({
      a: { 'continue-on-error': true, steps: [{ run: 'x' }, { run: 'y', 'continue-on-error': '${{ true }}' }] },
      b: { steps: [{ run: 'z' }] },
    });
    expect(control, 'the detector must see both spellings before its silence means anything').toEqual(['a', 'a.steps[1]']);
    const walked = Object.values(jobs).reduce((n, j) => n + (j.steps || []).length, 0);
    expect(walked, 'steps walked').toBeGreaterThanOrEqual(15);
    expect(softened(jobs)).toEqual([]);
  });

  it('the e2e step runs playwright for the shard the matrix hands it, unconditionally, and the matrix covers every shard the command divides by', () => {
    const e2e = stepsOf('e2e').filter((s) => s.name === 'E2E');
    expect(e2e, 'exactly one step named E2E').toHaveLength(1);
    const m = /^npm run test:e2e -- --shard=\$\{\{ matrix\.shard \}\}\/(\d+) --grep-invert="@local-only"$/.exec(e2e[0].run || '');
    expect(m, `the E2E step's run line: ${e2e[0].run}`).toBeTruthy();
    expect(e2e[0]).not.toHaveProperty('if');
    expect(jobs.e2e.strategy.matrix.shard, 'a shard the matrix never hands out is a slice of the suite that never runs')
      .toEqual(Array.from({ length: Number(m[1]) }, (_, i) => i + 1));
  });

  it('the gates job runs the fast-tier pipeline on every change with the scope as flags; CODE_CHANGED and SHA_CERTIFIED are exported beside them and decide nothing', () => {
    const p = stepsOf('gates').filter((s) => /^bash ci\/pipeline\.sh\b/.test(s.run || ''));
    expect(p, 'exactly one pipeline step').toHaveLength(1);
    expect(p[0].run).toBe('bash ci/pipeline.sh --tier=fast --code-changed="$CODE_CHANGED" --sha-certified="$SHA_CERTIFIED"');
    expect(p[0].env).toEqual({ CODE_CHANGED: '${{ needs.changes.outputs.code }}', SHA_CERTIFIED: '${{ needs.changes.outputs.certified }}' });
    expect(p[0]).not.toHaveProperty('if');
    expect(jobs.gates).not.toHaveProperty('if');
    expect(jobs.gates.needs).toBe('changes');
  });

  it(`the aggregate is named exactly "${REQUIRED_CHECK}", runs under always(), and needs every other job (Y2, Y3)`, () => {
    const ok = jobs[SELF];
    expect(ok.name).toBe(REQUIRED_CHECK);
    expect(ok.if, 'success() or !cancelled() skips this job on a cancelled run, and a skipped job passes branch protection').toBe('always()');
    const others = Object.keys(jobs).filter((j) => j !== SELF).sort();
    expect(others.length, 'jobs it must need').toBeGreaterThanOrEqual(3);
    expect([].concat(ok.needs).sort()).toEqual(others);
  });

  it('the `ci ok` verdict step runs ci-ok.mjs over the needs context, and no step of that job can be skipped', () => {
    const ok = jobs[SELF];
    const verdictStep = ok.steps.filter((s) => s.run === 'node scripts/ci/ci-ok.mjs');
    expect(verdictStep, 'exactly one verdict step').toHaveLength(1);
    expect(verdictStep[0].env).toEqual({ NEEDS_JSON: '${{ toJSON(needs) }}' });
    expect(ok.steps.filter((s) => 'if' in s), 'a skipped verdict step is a pass').toEqual([]);
  });
});

describe('pipeline.sh --code-changed — only the exact word `false` skips prod-smoke', () => {
  let dir;
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'ci-pipeline-')); });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  let n = 0;
  const runWith = (extraEnv, ...flags) => {
    const bin = join(dir, `bin-${++n}`);
    const log = join(dir, `cmd-${n}.log`);
    mkdirSync(bin);
    for (const t of ['node', 'npm']) {
      writeFileSync(join(bin, t), `#!/bin/sh\necho "${t} $*" >> "${log}"\nexit 0\n`);
      chmodSync(join(bin, t), 0o755);
    }
    const env = isolatedGitEnv({ PATH: `${bin}:${process.env.PATH}`, ...extraEnv });
    delete env.GITHUB_EVENT_NAME;
    delete env.GITHUB_REF;
    const r = spawnSync('bash', [join(ROOT, 'ci/pipeline.sh'), '--tier=fast', ...flags], { encoding: 'utf8', env });
    const cmds = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
    // Presence: the fast tier's other CI-only steps ran, so an absent prod-smoke is a real skip.
    expect(cmds.some((c) => c.startsWith('npm audit')), r.stdout + r.stderr).toBe(true);
    return { ...r, smoke: cmds.filter((c) => c.startsWith('node scripts/ci/prod-smoke.mjs')).length };
  };
  const run = (...flags) => runWith({}, ...flags);

  it('--code-changed=false: prod-smoke is skipped, and the skip is printed', () => {
    const r = run('--code-changed=false');
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.smoke).toBe(0);
    expect(r.stdout).toMatch(/skipped \(fast tier, --code-changed=false\): prod-smoke/);
  });

  it('true, empty, absent, or any other spelling: prod-smoke runs (fail SAFE)', () => {
    let ran = 0;
    for (const flags of [['--code-changed=true'], ['--code-changed='], [], ['--code-changed=FALSE'], ['--code-changed=no']]) {
      const r = run(...flags);
      expect(r.smoke, `${flags.join(' ') || '(no flag)'}\n${r.stdout}`).toBe(1);
      expect(r.stdout).not.toMatch(/--code-changed=false\): prod-smoke/);
      ran++;
    }
    expect(ran, 'denominator').toBe(5);
  });

  it('a CODE_CHANGED=false inherited from the environment, as the CI step exports one, does not skip prod-smoke: only the flag decides', () => {
    const inherited = runWith({ CODE_CHANGED: 'false' });
    expect(inherited.smoke, inherited.stdout).toBe(1);
    expect(inherited.stdout).not.toMatch(/--code-changed=false\): prod-smoke/);
    expect(runWith({ CODE_CHANGED: 'false' }, '--code-changed=false').smoke, 'the same environment with the flag does skip').toBe(0);
    expect(runWith({ CODE_CHANGED: 'false' }, '--code-changed=true').smoke).toBe(1);
  });
});

describe('pipeline.sh --sha-certified — only the exact word `true` skips the slow steps, and only in the fast tier', () => {
  let dir;
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'ci-certified-')); });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  let n = 0;
  const SLOW = ['npm run --silent test:unit', 'npm run --silent build', 'node scripts/ci/bundle-budget.mjs', 'npm run --silent knip', 'npm run --silent knip:production', 'npm audit --audit-level=high', 'node scripts/ci/prod-smoke.mjs'];
  const QUICK = ['node scripts/ci/opsec-scan.mjs --all', 'node scripts/ci/doc-currency.mjs', 'npm run --silent lint', 'node scripts/ci/gate-shape.mjs', 'node scripts/ci/registry-append-only.mjs'];
  const runWith = (extraEnv, ...args) => {
    const bin = join(dir, `bin-${++n}`);
    const log = join(dir, `cmd-${n}.log`);
    mkdirSync(bin);
    for (const t of ['node', 'npm']) {
      writeFileSync(join(bin, t), `#!/bin/sh\necho "${t} $*" >> "${log}"\nexit 0\n`);
      chmodSync(join(bin, t), 0o755);
    }
    const env = isolatedGitEnv({ PATH: `${bin}:${process.env.PATH}`, ...extraEnv });
    delete env.GITHUB_EVENT_NAME;
    delete env.GITHUB_REF;
    const r = spawnSync('bash', [join(ROOT, 'ci/pipeline.sh'), ...args], { encoding: 'utf8', env });
    const cmds = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
    return { ...r, cmds, slow: SLOW.filter((c) => cmds.includes(c)) };
  };

  it('--sha-certified=true: the seven slow steps are skipped and printed; the quick gates and registry-append-only run', () => {
    const r = runWith({}, '--tier=fast', '--code-changed=true', '--sha-certified=true');
    expect(r.status, r.stdout + r.stderr).toBe(0);
    for (const c of QUICK) expect(r.cmds, r.cmds.join('\n')).toContain(c);
    expect(r.slow).toEqual([]);
    expect(r.stdout).toMatch(/skipped \(--sha-certified=true\): unit \+ static gates, build, bundle byte budget/);
    expect(r.stdout).toMatch(/skipped \(--sha-certified=true\): knip, knip production, npm audit, prod-smoke/);
  });

  it('true is the only word: false, empty, absent, TRUE and yes all run the seven slow steps (fail SAFE)', () => {
    let ran = 0;
    for (const flags of [['--sha-certified=false'], ['--sha-certified='], [], ['--sha-certified=TRUE'], ['--sha-certified=yes']]) {
      const r = runWith({}, '--tier=fast', '--code-changed=true', ...flags);
      expect(r.slow, `${flags.join(' ') || '(no flag)'}\n${r.stdout}`).toEqual(SLOW);
      ran++;
    }
    expect(ran, 'denominator').toBe(5);
  });

  it('a SHA_CERTIFIED=true inherited from the environment, as the CI step exports one, skips nothing: only the flag decides', () => {
    expect(runWith({ SHA_CERTIFIED: 'true' }, '--tier=fast', '--code-changed=true').slow).toEqual(SLOW);
    expect(runWith({ SHA_CERTIFIED: 'true' }, '--tier=fast', '--code-changed=true', '--sha-certified=true').slow, 'the same environment with the flag does skip').toEqual([]);
  });

  it('outside the fast tier the flag is refused (exit 2) and nothing runs', () => {
    for (const tier of ['push', 'commit', 'certify']) {
      const r = runWith({}, `--tier=${tier}`, '--sha-certified=true');
      expect(r.status, `${tier}: ${r.stderr}`).toBe(2);
      expect(r.stderr).toMatch(/--sha-certified is only meaningful with --tier=fast/);
      expect(r.cmds).toEqual([]);
    }
  });
});
