/**
 * ARTIFACT-CURRENCY'S DRIFT REFUSAL GUARDS MAIN — driven as processes, end to end, across three seams.
 *
 * The pages describe main. A lane branch counts its own commits past the publish sha, which no republish
 * from main can lower, so refusing it was permanent (feat/steady-cool, PR #24). The fix scopes the drift
 * refusal to a push that moves `refs/heads/main`, or one whose refs are unknown. The pure half is pinned in
 * tests/gates/artifact-currency-gates.test.js. This file pins what that pure test cannot see:
 *
 *   1. THE CONSUMER — main() reads `E2E_PUSH_REFS` and turns the verdict into the exit code the hook acts on.
 *      E2E_PUSH_REFS is set BY HAND here, so these cases say nothing about who produces it. They also pin
 *      that a branch-only push is NOT excused the tree checks (a missing source, a falsified Queued pill),
 *      and that a drift the script cannot MEASURE refuses a main push instead of skipping it.
 *   2. THE PRODUCER — the real .githooks/pre-push, run by a real `git push` from a fixture repo to a bare
 *      remote, with DISTINCT local and remote ref names (`feat/x:main`, `HEAD:refs/heads/main`). The hook
 *      must build the list from the REMOTE ref and EXPORT it; nothing else in the suite drives that.
 *   3. THE CI BOUND — the real ci/pipeline.sh fast tier (node/npm stubbed) runs this gate on a push to main
 *      and on nothing else, naming main; and the gates job that runs that tier checks out full history.
 *
 * How (1): the real script bytes are copied into a throwaway repo at `frontend/scripts/ci/` (its ROOT is
 * derived from its own location, so it then measures the fixture), with the one sibling it imports. The
 * fixture's surface is published at its first commit and HEAD is HARD_LIMIT + 5 commits on. Every run
 * asserts the denominator line first, so a script that failed to load cannot pass an exit-1 case.
 * How (2): the fixture repo's committed ci/pipeline.sh is a stub that records E2E_PUSH_REFS and runs the
 * real copied artifact-currency.mjs — the expensive pipeline never runs. The trailer gates the hook calls
 * are empty stubs. E2E_PUSH_REFS is cleared from every inherited env: the pre-push hook exports it, this
 * suite runs under that hook, and an inherited exported value would hide a hook that forgot to export.
 *
 * Sited in tests/scripts/: the subjects are a CI script, a git hook and the pipeline, driven as processes
 * over fixtures, plus one file-content check of ci.yml.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, each observed RED in this file. In driftVerdict,
 * `refuse: !ok && mainMoves !== false` -> `refuse: !ok` turned the branch-only case RED; -> `refuse: false`
 * turned the main-push, mixed-push and unknown-refs cases RED; -> `mainMoves === true` turned the unknown-refs
 * case RED. Removing the mainMovesFrom read in main() (`mainMovesFrom(process.env.E2E_PUSH_REFS)` -> `null`)
 * turned the branch-only and main-push cases RED. 2026-10-28 round: M5a (the Queued failure loops wrapped in
 * `if (mainMoves !== false)`) -> the branch-push Queued-EXISTS case RED; M5b (`if (mainMoves === false) continue;`
 * in the missing-source branch) -> the branch-push missing-source case RED; the unmeasured verdict
 * `refuse: mainMoves !== false` -> `refuse: false` -> the unmeasured main and unknown cases RED; -> `refuse: true`
 * -> the unmeasured branch case RED; M13 (pre-push builds the list from `$_local_ref`) -> the `feat/x:main` and
 * `HEAD:refs/heads/main` producer cases RED; M14 (`export` dropped) -> the plain branch push producer case RED;
 * the pipeline guard without its GITHUB_REF test -> the push-to-a-branch CI case RED; without its
 * GITHUB_EVENT_NAME test -> the workflow_dispatch-on-main CI case RED; the step without `env E2E_PUSH_REFS=...`
 * -> the push-to-main CI case RED; ci.yml `fetch-depth: 0` -> `1` -> the full-history case RED. Identity
 * mutants (a comment edit in artifact-currency.mjs, in pre-push and in pipeline.sh) survived.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, realpathSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { fixtureGit, isolatedGitEnv } from './_isolatedGit.js';
import { HARD_LIMIT } from '../../scripts/ci/artifact-currency.mjs';

const CI = resolve(dirname(fileURLToPath(import.meta.url)), '../../scripts/ci');
const REPO_ROOT = resolve(CI, '../../..');
const HOOK = join(REPO_ROOT, '.githooks/pre-push');
const PIPELINE = join(REPO_ROOT, 'ci/pipeline.sh');
const EXTRA = 5;
const OVER = HARD_LIMIT + EXTRA;
const PAGE = '<title>fixture</title><div>page</div>';
/** A review-page row marked Queued, declaring the path whose ABSENCE is why it is still open. */
const queuedPage = (absent) =>
  `<title>fixture</title><div class="row"><div class="sha">abc1234</div><div class="body" data-absent="${absent}">not landed</div><span class="pill queue">Queued</span></div>`;
/** A sha no fixture commit has: the drift from it cannot be measured. */
const NOT_IN_HISTORY = 'abcdef0123456789abcdef0123456789abcdef01';

/** process.env for a fixture child: no GIT_*, and no inherited E2E_PUSH_REFS (see header). */
function cleanEnv(extra = {}) {
  const env = isolatedGitEnv(extra);
  delete env.E2E_PUSH_REFS;
  return env;
}

/** A fresh repo in `dir` on branch main, with a committer identity and no signing. */
function initRepo(dir) {
  fixtureGit(dir, 'init', '-q', '-b', 'main');
  fixtureGit(dir, 'config', 'user.email', 'fixture@example.invalid');
  fixtureGit(dir, 'config', 'user.name', 'fixture');
  fixtureGit(dir, 'config', 'commit.gpgsign', 'false');
}

const behindLine = (n) => new RegExp(`fixture: the published page is ${n} commit\\(s\\) behind`);

// ── 1. THE CONSUMER ─────────────────────────────────────────────────────────────────────────────────────────

let root;
let shas; // shas[0] is the published commit; HEAD is shas[OVER]

beforeAll(() => {
  // realpath: the script runs main() only when argv[1] equals its own resolved URL, and macOS's tmpdir is a
  // symlink (/var -> /private/var), so an unresolved path would load the module and silently do nothing.
  root = realpathSync(mkdtempSync(join(tmpdir(), 'artifact-scope-')));
  initRepo(root);
  mkdirSync(join(root, 'docs/superpowers'), { recursive: true });
  writeFileSync(join(root, 'docs/superpowers/page.html'), PAGE);
  fixtureGit(root, 'add', '-A');
  fixtureGit(root, 'commit', '-q', '-m', 'published');
  shas = [fixtureGit(root, 'rev-parse', '--short', 'HEAD')];
  for (let i = 1; i <= OVER; i++) {
    fixtureGit(root, 'commit', '-q', '--allow-empty', '-m', `c${i}`);
    shas.push(fixtureGit(root, 'rev-parse', '--short', 'HEAD'));
  }
  // Copied now, not cached: the mutation harness rewrites the real file before this suite runs.
  mkdirSync(join(root, 'frontend/scripts/ci'), { recursive: true });
  for (const f of ['artifact-currency.mjs', 'e2e-freshness.mjs']) copyFileSync(join(CI, f), join(root, 'frontend/scripts/ci', f));
});

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

const surface = (syncedSha, source = 'docs/superpowers/page.html') =>
  ({ id: 'fixture', kind: 'artifact', url: 'https://example.invalid/a', source, syncedSha });

/** Run the copied script over `surfaces`; `refs` undefined = the var is unset. */
function runScript({ refs, surfaces, html = PAGE }) {
  writeFileSync(join(root, 'docs/superpowers/page.html'), html);
  writeFileSync(join(root, 'docs/superpowers/.artifact-sync.json'), JSON.stringify({ surfaces }));
  const env = cleanEnv();
  if (refs !== undefined) env.E2E_PUSH_REFS = refs;
  const r = spawnSync('node', [join(root, 'frontend/scripts/ci/artifact-currency.mjs')], { cwd: root, env, encoding: 'utf8' });
  const out = `${r.stdout}${r.stderr}`;
  // The denominator, before any verdict is read: a script that never loaded must not satisfy an exit-1 case.
  expect(out, out).toMatch(/artifact-currency: 1 surface\(s\) tracked/);
  return { status: r.status, out };
}

/** The common case: the fixture page, published at `syncedSha`. */
const run = (refs, syncedSha, html = PAGE) => runScript({ refs, surfaces: [surface(syncedSha)], html });

describe('artifact-currency: the drift refusal guards main', () => {
  it(`a push that moves ONLY other branches, ${OVER} behind: exit 0, the drift printed, not refused`, () => {
    const { status, out } = run(' refs/heads/feat/steady-cool', shas[0]);
    expect(out).toMatch(/this push moves only other branches/);
    expect(out).toMatch(behindLine(OVER));
    expect(out).toMatch(/over the \d+-commit limit, but this push does not move main/);
    expect(out).not.toMatch(/✘/);
    expect(status, out).toBe(0);
  });

  it(`a push that moves main, ${OVER} behind: exit 1`, () => {
    const { status, out } = run(' refs/heads/main', shas[0]);
    expect(out).toMatch(/this push moves main/);
    expect(out).toMatch(new RegExp(`✘ ${behindLine(OVER).source}`));
    expect(status, out).toBe(1);
  });

  it(`a push that moves main AND a branch, ${OVER} behind: exit 1 — one main ref is enough`, () => {
    const { status, out } = run(' refs/heads/feat/x refs/heads/main', shas[0]);
    expect(out).toMatch(new RegExp(`✘ ${behindLine(OVER).source}`));
    expect(status, out).toBe(1);
  });

  it(`UNKNOWN refs, ${OVER} behind: exit 1 — unset and empty both stay strict`, () => {
    const cases = [undefined, ''];
    let ran = 0;
    for (const refs of cases) {
      const { status, out } = run(refs, shas[0]);
      expect(out).toMatch(/pushed refs unknown: strict/);
      expect(out).toMatch(new RegExp(`✘ ${behindLine(OVER).source}`));
      expect(status, out).toBe(1);
      ran++;
    }
    expect(ran, 'denominator: both unknown-refs spellings were run').toBe(2);
  });

  it(`a push that moves main, ${EXTRA} behind: exit 0 with the nudge`, () => {
    const { status, out } = run(' refs/heads/main', shas[OVER - EXTRA]);
    expect(out).toMatch(behindLine(EXTRA));
    expect(out).toMatch(/refresh it at session close/);
    expect(status, out).toBe(0);
  });
});

describe('a branch-only push is NOT excused the checks on the committed tree', () => {
  // Every case is at HEAD (syncedSha = shas[OVER]), so the drift cannot be what fails it.
  const BRANCH = ' refs/heads/feat/x';

  it('an unusable page source (a doctype: a fetched copy) still exits 1', () => {
    const { status, out } = run(BRANCH, shas[OVER], '<!doctype html><title>fixture</title>');
    expect(out).toMatch(/✘ artifact-currency: docs\/superpowers\/page\.html is contains a doctype/);
    expect(status, out).toBe(1);
  });

  it('a MISSING page source still exits 1', () => {
    const { status, out } = runScript({ refs: BRANCH, surfaces: [surface(shas[OVER], 'docs/superpowers/absent.html')] });
    expect(out).toMatch(/✘ artifact-currency: docs\/superpowers\/absent\.html is missing/);
    expect(status, out).toBe(1);
  });

  it('a Queued row whose data-absent path EXISTS (a falsified pill) still exits 1', () => {
    const shipped = join(root, 'docs/shipped.txt');
    writeFileSync(shipped, 'landed\n');
    try {
      const { status, out } = run(BRANCH, shas[OVER], queuedPage('docs/shipped.txt'));
      expect(out, 'presence: the row was parsed').toMatch(/fixture: 1 queued row\(s\) claiming unfinished work/);
      expect(out).toMatch(/✘ fixture: row abc1234 is marked Queued, but docs\/shipped\.txt EXISTS/);
      expect(status, out).toBe(1);
    } finally {
      rmSync(shipped, { force: true });
    }
  });

  it('control: the same Queued row whose path is truly ABSENT, at HEAD, exits 0', () => {
    const { status, out } = run(BRANCH, shas[OVER], queuedPage('docs/not-landed.txt'));
    expect(out).toMatch(/fixture: 1 queued row\(s\) claiming unfinished work/);
    expect(out).toMatch(/✓ fixture: at HEAD/);
    expect(out).not.toMatch(/✘/);
    expect(status, out).toBe(0);
  });
});

describe('a drift that cannot be MEASURED (the recorded sha is not in this history)', () => {
  const notInHistory = /fixture: recorded sha abcdef0123456789abcdef0123456789abcdef01 is not in this history/;

  it('on a push that moves main: exit 1 — a main move whose bound cannot be computed is unbounded', () => {
    const { status, out } = run(' refs/heads/main', NOT_IN_HISTORY);
    expect(out).toMatch(notInHistory);
    expect(out).toMatch(/✘ fixture: recorded sha/);
    expect(status, out).toBe(1);
  });

  it('with UNKNOWN refs: exit 1 — strict, like the drift itself', () => {
    const { status, out } = run(undefined, NOT_IN_HISTORY);
    expect(out).toMatch(notInHistory);
    expect(status, out).toBe(1);
  });

  it('on a branch-only push: exit 0, skipped, and the message says why', () => {
    const { status, out } = run(' refs/heads/feat/x', NOT_IN_HISTORY);
    expect(out).toMatch(notInHistory);
    expect(out).toMatch(/skipping: this push moves only other\s+branches/);
    expect(out).not.toMatch(/✘/);
    expect(status, out).toBe(0);
  });
});

// ── 2. THE PRODUCER ─────────────────────────────────────────────────────────────────────────────────────────

describe('the PRODUCER: .githooks/pre-push builds E2E_PUSH_REFS from the REMOTE ref and exports it', () => {
  let hdir;
  let repo;
  let remote;
  let base; // main on the remote, before any case pushes
  let tip; // feat/x, OVER + 1 commits past the publish sha
  let calls = 0;

  beforeAll(() => {
    hdir = realpathSync(mkdtempSync(join(tmpdir(), 'artifact-scope-hook-')));
    repo = join(hdir, 'repo');
    remote = join(hdir, 'remote.git');
    const hooks = join(hdir, 'hooks'); // empty until the setup pushes are done: no hook runs on setup
    for (const d of [hooks, join(hdir, 'tmp'), join(repo, 'ci'), join(repo, 'frontend/scripts/ci'), join(repo, 'docs/superpowers')]) {
      mkdirSync(d, { recursive: true });
    }
    // The stub pipeline: record what the hook exported, then run the ONE real gate this spec is about.
    writeFileSync(join(repo, 'ci/pipeline.sh'), 'echo "REFS[$E2E_PUSH_REFS]" >> "$PIPE_LOG"\nexec node scripts/ci/artifact-currency.mjs\n');
    for (const f of ['artifact-currency.mjs', 'e2e-freshness.mjs']) copyFileSync(join(CI, f), join(repo, 'frontend/scripts/ci', f));
    for (const f of ['mutation-proof-trailer.mjs', 'baseline-trailer.mjs']) {
      writeFileSync(join(repo, 'frontend/scripts/ci', f), '// fixture stub: the trailer gates are not this spec\'s subject\n');
    }
    writeFileSync(join(repo, 'frontend/package-lock.json'), '{}\n');
    writeFileSync(join(repo, '.gitignore'), 'node_modules/\n');
    writeFileSync(join(repo, 'docs/superpowers/page.html'), PAGE);
    initRepo(repo);
    fixtureGit(repo, 'config', 'core.hooksPath', hooks);
    fixtureGit(repo, 'add', '-A');
    fixtureGit(repo, 'commit', '-q', '-m', 'published');
    const published = fixtureGit(repo, 'rev-parse', '--short', 'HEAD');
    writeFileSync(join(repo, 'docs/superpowers/.artifact-sync.json'), JSON.stringify({ surfaces: [surface(published)] }));
    fixtureGit(repo, 'add', '-A');
    fixtureGit(repo, 'commit', '-q', '-m', 'synced');
    fixtureGit(hdir, 'init', '-q', '--bare', remote);
    fixtureGit(repo, 'remote', 'add', 'origin', remote);
    fixtureGit(repo, 'push', '-q', 'origin', 'main');
    base = fixtureGit(repo, 'rev-parse', 'HEAD');
    fixtureGit(repo, 'checkout', '-q', '-b', 'feat/x');
    for (let i = 1; i <= OVER; i++) fixtureGit(repo, 'commit', '-q', '--allow-empty', '-m', `lane ${i}`);
    tip = fixtureGit(repo, 'rev-parse', 'HEAD');
    mkdirSync(join(repo, 'frontend/node_modules')); // the hook symlinks it: no install in its worktree
    // Copied now, not cached: the mutation harness rewrites the real hook before this suite runs.
    copyFileSync(HOOK, join(hooks, 'pre-push'));
    chmodSync(join(hooks, 'pre-push'), 0o755);
  });

  afterAll(() => {
    if (hdir) rmSync(hdir, { recursive: true, force: true });
  });

  /** `git push origin <refspec>` through the real hook, from a remote reset to main at `base` and no feat/x. */
  function push(refspec) {
    fixtureGit(remote, 'update-ref', 'refs/heads/main', base);
    if (spawnSync('git', ['rev-parse', '--verify', '-q', 'refs/heads/feat/x'], { cwd: remote, env: cleanEnv() }).status === 0) {
      fixtureGit(remote, 'update-ref', '-d', 'refs/heads/feat/x');
    }
    const log = join(hdir, `pipe-${++calls}.log`);
    const r = spawnSync('git', ['push', 'origin', refspec], {
      cwd: repo, encoding: 'utf8', env: cleanEnv({ PIPE_LOG: log, TMPDIR: join(hdir, 'tmp') }),
    });
    return {
      status: r.status,
      out: `${r.stdout}${r.stderr}`,
      refs: existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [],
      remoteMain: fixtureGit(remote, 'rev-parse', 'refs/heads/main'),
    };
  }

  const overLine = new RegExp(`✘ fixture: the published page is ${OVER + 1} commit\\(s\\) behind`);

  it('a plain branch push (`feat/x`), over the limit: the hook names feat/x, and the push lands', () => {
    const r = push('feat/x');
    expect(r.refs, r.out).toEqual(['REFS[ refs/heads/feat/x]']);
    expect(r.out).toMatch(/this push moves only other branches/);
    expect(r.out).toMatch(/over the \d+-commit limit, but this push does not move main/);
    expect(r.status, r.out).toBe(0);
    expect(fixtureGit(remote, 'rev-parse', 'refs/heads/feat/x')).toBe(tip);
  });

  it('`feat/x:main` — a LOCAL branch name, a REMOTE main — over the limit: refused, main not moved', () => {
    const r = push('feat/x:main');
    expect(r.refs, r.out).toEqual(['REFS[ refs/heads/main]']);
    expect(r.out).toMatch(overLine);
    expect(r.status, r.out).not.toBe(0);
    expect(r.remoteMain, 'the refused push moved main anyway').toBe(base);
  });

  it('`HEAD:refs/heads/main` — git hands the hook the literal local ref HEAD — over the limit: refused', () => {
    const r = push('HEAD:refs/heads/main');
    expect(r.refs, r.out).toEqual(['REFS[ refs/heads/main]']);
    expect(r.out).toMatch(overLine);
    expect(r.status, r.out).not.toBe(0);
    expect(r.remoteMain, 'the refused push moved main anyway').toBe(base);
  });
});

// ── 3. THE CI BOUND ─────────────────────────────────────────────────────────────────────────────────────────

describe('the CI bound: ci/pipeline.sh --tier=fast runs artifact-currency on a push to main, and nowhere else', () => {
  let bdir;
  beforeAll(() => { bdir = mkdtempSync(join(tmpdir(), 'artifact-scope-ci-')); });
  afterAll(() => { if (bdir) rmSync(bdir, { recursive: true, force: true }); });

  let n = 0;
  /** The REAL pipeline, fast tier, with recording node/npm stubs first on PATH; undefined = the var is unset. */
  function runFast(event, ref) {
    const bin = join(bdir, `bin-${++n}`);
    const log = join(bdir, `cmd-${n}.log`);
    mkdirSync(bin);
    writeFileSync(join(bin, 'node'), `#!/bin/sh\necho "node $* E2E_PUSH_REFS=[\${E2E_PUSH_REFS-unset}]" >> "${log}"\nexit 0\n`);
    writeFileSync(join(bin, 'npm'), `#!/bin/sh\necho "npm $*" >> "${log}"\nexit 0\n`);
    for (const t of ['node', 'npm']) chmodSync(join(bin, t), 0o755);
    // The suite itself runs in CI on a push to main, so the GITHUB_* pair is set or removed on EVERY case.
    const env = cleanEnv({ PATH: `${bin}:${process.env.PATH}` });
    delete env.GITHUB_EVENT_NAME;
    delete env.GITHUB_REF;
    if (event !== undefined) env.GITHUB_EVENT_NAME = event;
    if (ref !== undefined) env.GITHUB_REF = ref;
    const r = spawnSync('bash', [PIPELINE, '--tier=fast'], { encoding: 'utf8', env });
    const cmds = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
    // Presence: the fast tier's own CI-only steps ran, so an absent artifact-currency line is a real absence.
    expect(cmds.some((c) => c.startsWith('node scripts/ci/prod-smoke.mjs')), `${r.stdout}${r.stderr}`).toBe(true);
    return { ...r, gate: cmds.filter((c) => c.startsWith('node scripts/ci/artifact-currency.mjs')) };
  }

  it('a push to main: runs it once, naming main, so the strict rule applies', () => {
    const r = runFast('push', 'refs/heads/main');
    expect(r.gate).toEqual(['node scripts/ci/artifact-currency.mjs E2E_PUSH_REFS=[ refs/heads/main]']);
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });

  it('a push to a branch, a pull_request, a dispatch ON main, and a hand run: it does not run, and says so', () => {
    const cases = [
      ['push', 'refs/heads/feat/x'],
      ['pull_request', 'refs/pull/24/merge'], // the merge ref carries the lane's own commits: the #24 deadlock
      ['workflow_dispatch', 'refs/heads/main'], // on main, but it moves nothing
      [undefined, undefined],
    ];
    let ran = 0;
    for (const [event, ref] of cases) {
      const r = runFast(event, ref);
      expect(r.gate, `${event} ${ref}`).toEqual([]);
      expect(r.stdout).toMatch(/skipped \(fast tier\): artifact-currency — CI runs it on a push to main only/);
      ran++;
    }
    expect(ran, 'denominator: every non-main-push case was run').toBe(4);
  });

  it('the gates job — the one that runs the fast tier — checks out FULL history, or the drift cannot be counted', () => {
    const yml = readFileSync(join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8');
    const start = yml.indexOf('\n  gates:\n');
    const end = yml.indexOf('\n  e2e:\n');
    expect(start, 'the gates job').toBeGreaterThan(-1);
    expect(end, 'the job after it').toBeGreaterThan(start);
    // Comments stripped: the comment explaining fetch-depth must not be what satisfies this.
    const job = yml.slice(start, end).split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    expect(job).toMatch(/run: bash ci\/pipeline\.sh --tier=fast/);
    expect(job).toMatch(/- uses: actions\/checkout@v\d+\n\s+with:\n\s+fetch-depth: 0\n/);
  });
});
