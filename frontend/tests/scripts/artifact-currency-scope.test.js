/**
 * ARTIFACT-CURRENCY, DRIVEN AS PROCESSES, end to end, across three seams. Since DECISIONS 2026-10-28 item 12 the
 * drift is REPORTED and never refused, on any push and in CI, while a missing or unusable page source and a
 * falsified or undeclared Queued pill refuse on every push. The pure verdict is pinned in
 * tests/gates/artifact-currency-gates.test.js. This file pins what that pure test cannot see:
 *
 *   1. THE CONSUMER — main() turns the report into the exit code the hook acts on. Every drift (stale, drifting,
 *      unmeasured) exits 0 with the count and the page's URL printed; every tree defect exits 1. Each case runs
 *      under several E2E_PUSH_REFS spellings (main, a branch, both, unset, empty). The script no longer reads that
 *      variable, so the spellings are there to catch a push scope creeping back in: it would show as a case
 *      whose verdict changes with the refs.
 *   1b. --sync — main() writes the as-of stamp into the page itself and records HEAD, replaces the stamp on a
 *      re-sync rather than adding a second, and writes nothing at all when the page lacks a token the stamp names.
 *      The stamp's pure functions are pinned in the gates spec; this is the call site they cannot see.
 *   2. THE PRODUCER — the real .githooks/pre-push, run by a real `git push` from a fixture repo to a bare
 *      remote, with DISTINCT local and remote ref names (`feat/x:main`, `HEAD:refs/heads/main`) and with TWO
 *      refs in one push, main listed first and main listed last. The hook must build E2E_PUSH_REFS from the
 *      REMOTE ref, ACCUMULATE every pushed ref and EXPORT it. artifact-currency stopped reading that variable on
 *      2026-10-28, but e2e-freshness's main-only red-base rule still does, and nothing else in the suite drives
 *      the real hook's export, so these cases are kept. They also prove, through the real hook, that a push
 *      moving main far past the publish sha now LANDS, with the drift printed.
 *   3. THE CI CHECK — the real ci/pipeline.sh fast tier (node/npm stubbed) runs this gate on a push to main and on
 *      nothing else, and the gates job that runs that tier checks out full history, without which CI's drift
 *      line could only say "cannot be measured".
 *
 * How (1): the real script bytes are copied into a throwaway repo at `frontend/scripts/ci/` (its ROOT is derived
 * from its own location, so it then measures the fixture). The fixture's surface is published at its first commit
 * and HEAD is HARD_LIMIT + 5 commits on. Every run asserts the denominator line first, so a script that failed to
 * load cannot pass an exit-1 case. How (2): the fixture repo's committed ci/pipeline.sh is a stub that records
 * E2E_PUSH_REFS and runs the real copied artifact-currency.mjs; the expensive pipeline never runs. The trailer
 * gates the hook calls are empty stubs. E2E_PUSH_REFS is cleared from every inherited env: the pre-push hook
 * exports it, this suite runs under that hook, and an inherited exported value would hide a hook that forgot to
 * export.
 *
 * Sited in tests/scripts/: the subjects are a CI script, a git hook and the pipeline, driven as processes over
 * fixtures, plus one file-content check of ci.yml.
 *
 * Mutation-Proof: 2026-10-28 (item 12), each via scripts/dev/mutate.sh against this file, each RED observed. In
 * artifact-currency.mjs: A1 driftVerdict `refuse: false` -> `refuse: level === 'stale'` turned the stale case and all
 * five PRODUCER cases RED; A2 the unmeasured `refuse: false` -> `refuse: true` and A3 deleting the `behind === null`
 * guard each turned the unmeasured case RED; A4 main() `if (refuse)` -> `if (refuse || level === 'stale')` turned the
 * stale case RED; A7 the drift line's URL dropped turned the stale and drifting cases RED; A5, A6, Q1, Q2 (dropping
 * `failed = true` from the missing-source, unusable-source, Queued-EXISTS and undeclared-Queued branches) each turned
 * its own case RED; Q3 (the missing-source check skipped when E2E_PUSH_REFS names a feat/ branch) turned the
 * missing-source case RED. In .githooks/pre-push: P1 the list built from `$_local_ref`, P2 `export` dropped, P3 only
 * the LAST ref kept, P4 only the FIRST ref kept, each turned producer cases RED. In ci/pipeline.sh: C1 the guard
 * without its GITHUB_REF test, C2 without its GITHUB_EVENT_NAME test, C3 the step removed, each turned a CI case
 * RED; in ci.yml, Y1 `fetch-depth: 0` -> `1` turned the full-history case RED. Identity mutants (a comment edit in
 * artifact-currency.mjs, run in both batches, in pre-push and in pipeline.sh) survived. The receipts for the
 * pre-2026-10-28 main-only scope are in git history.
 * The --sync stamp (1b), each RED observed: --sync not writing the page; --sync skipping the token check; --sync
 * going on to record the sha after a failed stamp (its `process.exit(1)` dropped); a re-sync that keeps the old
 * stamp; the first stamp placed before the wrapper; the time printed to the hour; the currentStatus pointer
 * dropped. An identity comment edit survived.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, realpathSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { fixtureGit, isolatedGitEnv } from './_isolatedGit.js';
import { HARD_LIMIT, STAMP_BEGIN, STAMP_END } from '../../scripts/ci/artifact-currency.mjs';

const CI = resolve(dirname(fileURLToPath(import.meta.url)), '../../scripts/ci');
const REPO_ROOT = resolve(CI, '../../..');
const HOOK = join(REPO_ROOT, '.githooks/pre-push');
const PIPELINE = join(REPO_ROOT, 'ci/pipeline.sh');
const EXTRA = 5;
const OVER = HARD_LIMIT + EXTRA;
const PAGE = '<title>fixture</title><div>page</div>';
const URL = 'https://example.invalid/a';
/** A review-page row marked Queued, declaring the path whose ABSENCE is why it is still open (`null`: declaring none). */
const queuedPage = (absent) =>
  `<title>fixture</title><div class="row"><div class="sha">abc1234</div><div class="body"${absent === null ? '' : ` data-absent="${absent}"`}>not landed</div><span class="pill queue">Queued</span></div>`;
/** A sha no fixture commit has: the drift from it cannot be measured. */
const NOT_IN_HISTORY = 'abcdef0123456789abcdef0123456789abcdef01';

/**
 * Every E2E_PUSH_REFS spelling a caller can hand the script: main, a branch, both, unset (undefined: a hand run),
 * empty. The pre-2026-10-28 script judged these differently; the current one must not.
 */
const REFS = [' refs/heads/main', ' refs/heads/feat/steady-cool', ' refs/heads/feat/x refs/heads/main', undefined, ''];
const label = (refs) => (refs === undefined ? 'refs unset' : `refs ${JSON.stringify(refs)}`);

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
/** The drift line WITH the page's URL on it: the reader's link travels with the count. */
const behindWithUrl = (n) => new RegExp(`${behindLine(n).source}[^\\n]*${URL.replace(/[.]/g, '\\.')}`);

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
  copyFileSync(join(CI, 'artifact-currency.mjs'), join(root, 'frontend/scripts/ci/artifact-currency.mjs'));
});

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

const surface = (syncedSha, source = 'docs/superpowers/page.html') =>
  ({ id: 'fixture', kind: 'artifact', url: URL, source, syncedSha });

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

/** Run `fn(refs)` once per spelling in `list`, and assert the denominator: every spelling was judged. */
function eachRefs(list, fn) {
  let ran = 0;
  for (const refs of list) { fn(refs); ran++; }
  expect(ran, 'denominator: every refs spelling was run').toBe(list.length);
}

describe('artifact-currency: drift is REPORTED, never refused, on any push', () => {
  it(`${OVER} behind (stale): exit 0, the count and the page's URL printed, under every refs spelling`, () => {
    eachRefs(REFS, (refs) => {
      const { status, out } = run(refs, shas[0]);
      expect(out, label(refs)).toMatch(behindWithUrl(OVER));
      expect(out, label(refs)).toMatch(/stale, over \d+ commits; reported, not refused/);
      expect(out, label(refs)).not.toMatch(/✘/);
      expect(status, `${label(refs)}\n${out}`).toBe(0);
    });
  });

  it(`${EXTRA} behind (drifting): exit 0 with the nudge and the URL`, () => {
    eachRefs([' refs/heads/main', undefined], (refs) => {
      const { status, out } = run(refs, shas[OVER - EXTRA]);
      expect(out, label(refs)).toMatch(behindWithUrl(EXTRA));
      expect(out, label(refs)).toMatch(/refresh it at session close/);
      expect(status, `${label(refs)}\n${out}`).toBe(0);
    });
  });
});

describe('the tree defects refuse on EVERY push', () => {
  // Every case is at HEAD (syncedSha = shas[OVER]), so the drift cannot be what fails it. Each runs under a main
  // push, a branch push and unset refs: a defect in the committed tree is wrong whichever ref carries it.
  const SPELLINGS = [' refs/heads/main', ' refs/heads/feat/x', undefined];

  it('an unusable page source (a doctype: a fetched copy) exits 1', () => {
    eachRefs(SPELLINGS, (refs) => {
      const { status, out } = run(refs, shas[OVER], '<!doctype html><title>fixture</title>');
      expect(out, label(refs)).toMatch(/✘ artifact-currency: docs\/superpowers\/page\.html is contains a doctype/);
      expect(status, `${label(refs)}\n${out}`).toBe(1);
    });
  });

  it('a MISSING page source exits 1', () => {
    eachRefs(SPELLINGS, (refs) => {
      const { status, out } = runScript({ refs, surfaces: [surface(shas[OVER], 'docs/superpowers/absent.html')] });
      expect(out, label(refs)).toMatch(/✘ artifact-currency: docs\/superpowers\/absent\.html is missing/);
      expect(status, `${label(refs)}\n${out}`).toBe(1);
    });
  });

  it('a Queued row whose data-absent path EXISTS (a falsified pill) exits 1', () => {
    const shipped = join(root, 'docs/shipped.txt');
    writeFileSync(shipped, 'landed\n');
    try {
      eachRefs(SPELLINGS, (refs) => {
        const { status, out } = run(refs, shas[OVER], queuedPage('docs/shipped.txt'));
        expect(out, 'presence: the row was parsed').toMatch(/fixture: 1 queued row\(s\) claiming unfinished work/);
        expect(out, label(refs)).toMatch(/✘ fixture: row abc1234 is marked Queued, but docs\/shipped\.txt EXISTS/);
        expect(status, `${label(refs)}\n${out}`).toBe(1);
      });
    } finally {
      rmSync(shipped, { force: true });
    }
  });

  it('a Queued row that declares NO data-absent (an unfalsifiable pill) exits 1', () => {
    eachRefs(SPELLINGS, (refs) => {
      const { status, out } = run(refs, shas[OVER], queuedPage(null));
      expect(out, 'presence: the row was parsed').toMatch(/fixture: 1 queued row\(s\) claiming unfinished work/);
      expect(out, label(refs)).toMatch(/✘ fixture: row abc1234 is marked Queued but declares no data-absent/);
      expect(status, `${label(refs)}\n${out}`).toBe(1);
    });
  });

  it('control: the same Queued row whose path is truly ABSENT, at HEAD, exits 0', () => {
    const { status, out } = run(' refs/heads/feat/x', shas[OVER], queuedPage('docs/not-landed.txt'));
    expect(out).toMatch(/fixture: 1 queued row\(s\) claiming unfinished work/);
    expect(out).toMatch(/✓ fixture: at HEAD/);
    expect(out).not.toMatch(/✘/);
    expect(status, out).toBe(0);
  });
});

describe('a drift that cannot be MEASURED (the recorded sha is not in this history)', () => {
  const notInHistory = /fixture: recorded sha abcdef0123456789abcdef0123456789abcdef01 is not in this history/;

  it('exit 0 under every refs spelling — reported, not refused — and the message names BOTH causes', () => {
    eachRefs(REFS, (refs) => {
      const { status, out } = run(refs, NOT_IN_HISTORY);
      expect(out, label(refs)).toMatch(notInHistory);
      expect(out, label(refs)).toMatch(/cannot be measured — reported, not refused/);
      // The two ways a recorded sha is absent from the history CI sees. A message that names only the first sent the
      // operator to fetch-depth when the real cause was a lane commit squash-merged on GitHub and its branch deleted.
      expect(out, label(refs)).toMatch(/a shallow checkout/);
      expect(out, label(refs)).toMatch(/squash-merged and deleted/);
      expect(out, label(refs)).toMatch(/republish from main and --sync fixture/);
      expect(out, label(refs)).not.toMatch(/✘/);
      expect(status, `${label(refs)}\n${out}`).toBe(0);
    });
  });
});

// ── 1b. --sync WRITES THE STAMP ─────────────────────────────────────────────────────────────────────────────
// The pure stamp functions are pinned in tests/gates/artifact-currency-gates.test.js; these prove main() CALLS them:
// that `--sync` writes the stamp into the page itself, records HEAD, and writes nothing when it cannot stamp.

describe('--sync: the page gets its as-of stamp and the state file gets HEAD', () => {
  const tokens = { text: '--t-x', rule: '--r-x', link: '--l-x', font: '--f-x' };
  const status = { label: 'the Command Record', url: 'https://example.invalid/status' };
  const STAMP_PAGE = '<title>fixture</title><style>:root{--t-x:#111;--r-x:#222;--l-x:#333;--f-x:ui-monospace}</style>\n<div class="wrap">\n<p>body</p>\n</div>\n';
  const pagePath = () => join(root, 'docs/superpowers/page.html');
  const statePath = () => join(root, 'docs/superpowers/.artifact-sync.json');

  /** `--sync fixture` over `html`, the surface published at shas[0] with `extra` fields. */
  function sync(extra, html = STAMP_PAGE) {
    writeFileSync(pagePath(), html);
    writeFileSync(statePath(), JSON.stringify({ surfaces: [{ ...surface(shas[0]), stampTokens: tokens, ...extra }] }));
    const r = spawnSync('node', [join(root, 'frontend/scripts/ci/artifact-currency.mjs'), '--sync', 'fixture'], { cwd: root, env: cleanEnv(), encoding: 'utf8' });
    return {
      status: r.status,
      out: `${r.stdout}${r.stderr}`,
      page: readFileSync(pagePath(), 'utf8'),
      synced: JSON.parse(readFileSync(statePath(), 'utf8')).surfaces[0].syncedSha,
    };
  }
  const count = (s, needle) => s.split(needle).length - 1;

  it('writes the stamp at the top of the content, records HEAD, and leaves the rest of the page byte-identical', () => {
    const head = fixtureGit(root, 'rev-parse', '--short', 'HEAD');
    const r = sync({ currentStatus: status });
    expect(r.status, r.out).toBe(0);
    expect(r.synced).toBe(head);
    expect(r.page).toMatch(new RegExp(`<div class="wrap">\\n${STAMP_BEGIN}<p [^>]*>As of commit ${head}, \\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2} UTC\\. Most of this page is history; current status: <a href="https://example\\.invalid/status"`));
    const b = r.page.indexOf(STAMP_BEGIN);
    const e = r.page.indexOf(STAMP_END) + STAMP_END.length;
    expect(b, 'presence: the stamp was written').toBeGreaterThan(-1);
    expect(`${r.page.slice(0, b)}${r.page.slice(e)}`).toBe(STAMP_PAGE.replace('<div class="wrap">', '<div class="wrap">\n'));
  });

  it('a second --sync replaces the stamp: still exactly one, and nothing else moved', () => {
    const first = sync({}).page;
    const second = sync({}, first).page;
    expect(count(first, STAMP_BEGIN), 'presence: the first sync stamped').toBe(1);
    expect(count(second, STAMP_BEGIN)).toBe(1);
    expect(count(second, STAMP_END)).toBe(1);
    expect(second.replace(/<!-- asof:begin -->[\s\S]*<!-- asof:end -->/, '')).toBe(first.replace(/<!-- asof:begin -->[\s\S]*<!-- asof:end -->/, ''));
  });

  it('a page that does not declare a named token: exit 1, and NOTHING is written — not the stamp, not the sha', () => {
    const r = sync({ stampTokens: { ...tokens, link: '--not-declared' } });
    expect(r.status, r.out).toBe(1);
    expect(r.out).toMatch(/stampTokens in \.artifact-sync\.json must name a token .* for: link/);
    expect(r.out).toMatch(/Nothing was written/);
    expect(r.page).toBe(STAMP_PAGE);
    expect(r.synced).toBe(shas[0]);
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
    copyFileSync(join(CI, 'artifact-currency.mjs'), join(repo, 'frontend/scripts/ci/artifact-currency.mjs'));
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

  /**
   * `git push origin <refspecs...>` through the real hook, from a remote reset to main at `base` and no other
   * branch, except those named in `seed`, which start at `base` too (so a push to one is a fast-forward of an
   * EXISTING remote ref, which git lists before a ref that is new on the remote).
   */
  function push(refspecs, seed = []) {
    for (const ref of fixtureGit(remote, 'for-each-ref', '--format=%(refname)', 'refs/heads/').split('\n')) {
      if (ref && ref !== 'refs/heads/main') fixtureGit(remote, 'update-ref', '-d', ref);
    }
    fixtureGit(remote, 'update-ref', 'refs/heads/main', base);
    for (const name of seed) fixtureGit(remote, 'update-ref', `refs/heads/${name}`, base);
    const log = join(hdir, `pipe-${++calls}.log`);
    const r = spawnSync('git', ['push', 'origin', ...[].concat(refspecs)], {
      cwd: repo, encoding: 'utf8', env: cleanEnv({ PIPE_LOG: log, TMPDIR: join(hdir, 'tmp') }),
    });
    return {
      status: r.status,
      out: `${r.stdout}${r.stderr}`,
      refs: existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [],
      remoteMain: fixtureGit(remote, 'rev-parse', 'refs/heads/main'),
    };
  }

  /** The real gate ran in the hook, printed the drift past the limit, and refused nothing. */
  function expectDriftReported(r) {
    expect(r.out).toMatch(new RegExp(`fixture: the published page is ${OVER + 1} commit\\(s\\) behind[^\\n]*reported, not refused`));
    expect(r.out).not.toMatch(/✘/);
  }

  it('a plain branch push (`feat/x`), over the limit: the hook names feat/x, and the push lands', () => {
    const r = push('feat/x');
    expect(r.refs, r.out).toEqual(['REFS[ refs/heads/feat/x]']);
    expectDriftReported(r);
    expect(r.status, r.out).toBe(0);
    expect(fixtureGit(remote, 'rev-parse', 'refs/heads/feat/x')).toBe(tip);
  });

  it('`feat/x:main` — a LOCAL branch name, a REMOTE main — the hook names main, and main moves past the limit', () => {
    const r = push('feat/x:main');
    expect(r.refs, r.out).toEqual(['REFS[ refs/heads/main]']);
    expectDriftReported(r);
    expect(r.status, r.out).toBe(0);
    expect(r.remoteMain, 'the push did not land').toBe(tip);
  });

  it('`HEAD:refs/heads/main` — git hands the hook the literal local ref HEAD — the hook names main, and it lands', () => {
    const r = push('HEAD:refs/heads/main');
    expect(r.refs, r.out).toEqual(['REFS[ refs/heads/main]']);
    expectDriftReported(r);
    expect(r.status, r.out).toBe(0);
    expect(r.remoteMain, 'the push did not land').toBe(tip);
  });

  // The hook ACCUMULATES one ref per stdin line. The cases above push ONE refspec each, so an edit that keeps only
  // the last ref (`PUSH_REFS=" $_remote_ref"`) or only the first (`PUSH_REFS="${PUSH_REFS:- $_remote_ref}"`) passed
  // every one of them. Git hands the hook the refs that EXIST on the remote first, in the order the remote
  // advertises them (alphabetical), then the refs that are NEW there in refspec order; so main is first when main
  // exists and the other branch is new, and last when both exist and the other branch sorts before main. Each case
  // asserts that order too: a setup that stopped producing the order it names would otherwise quietly cover only
  // one of the two mutants.
  //
  // Per target the hook runs the pipeline once, and both refs point at the same commit, so a push logs the same line
  // twice; the Set collapses that, and what is compared is the one list the hook exported.
  const seen = (r) => [...new Set(r.refs)];

  it('TWO refs, main listed FIRST (`feat/x:main feat/x:feat/y`, feat/y new): the list names both, and the push lands', () => {
    const r = push(['feat/x:main', 'feat/x:feat/y']);
    expect(seen(r), r.out).toEqual(['REFS[ refs/heads/main refs/heads/feat/y]']);
    expectDriftReported(r);
    expect(r.status, r.out).toBe(0);
    expect(r.remoteMain, 'the push did not land').toBe(tip);
  });

  it('TWO refs, main listed LAST (`feat/x:feat/y feat/x:main`, feat/y already on the remote): the list names both, and the push lands', () => {
    const r = push(['feat/x:feat/y', 'feat/x:main'], ['feat/y']);
    expect(seen(r), r.out).toEqual(['REFS[ refs/heads/feat/y refs/heads/main]']);
    expectDriftReported(r);
    expect(r.status, r.out).toBe(0);
    expect(r.remoteMain, 'the push did not land').toBe(tip);
  });
});

// ── 3. THE CI CHECK ─────────────────────────────────────────────────────────────────────────────────────────

describe('the CI check: ci/pipeline.sh --tier=fast runs artifact-currency on a push to main, and nowhere else', () => {
  let bdir;
  beforeAll(() => { bdir = mkdtempSync(join(tmpdir(), 'artifact-scope-ci-')); });
  afterAll(() => { if (bdir) rmSync(bdir, { recursive: true, force: true }); });

  let n = 0;
  /** The REAL pipeline, fast tier, with recording node/npm stubs first on PATH; undefined = the var is unset. */
  function runFast(event, ref) {
    const bin = join(bdir, `bin-${++n}`);
    const log = join(bdir, `cmd-${n}.log`);
    mkdirSync(bin);
    writeFileSync(join(bin, 'node'), `#!/bin/sh\necho "node $*" >> "${log}"\nexit 0\n`);
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

  it('a push to main: runs it once', () => {
    const r = runFast('push', 'refs/heads/main');
    expect(r.gate).toEqual(['node scripts/ci/artifact-currency.mjs']);
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });

  it('a push to a branch, a pull_request, a dispatch ON main, and a hand run: it does not run, and says so', () => {
    const cases = [
      ['push', 'refs/heads/feat/x'],
      ['pull_request', 'refs/pull/24/merge'],
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
