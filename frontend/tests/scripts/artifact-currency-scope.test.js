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
 *   1b. --stamp and --sync, the two steps with the publish between them. --stamp writes the as-of stamp into the page
 *      (the --as-of commit, default HEAD, at that commit's COMMITTER time), replaces it on a re-stamp rather than
 *      adding a second, never touches the state file, and writes nothing at all when the page lacks a token the stamp
 *      names or --as-of is not a commit. --sync records the commit the stamp names, never touches the page, and
 *      records nothing unless the stamp names the --as-of commit. The stamp's pure functions are pinned in the gates
 *      spec; this is the call site they cannot see.
 *   2. THE PRODUCER — the real .githooks/pre-push, run by a real `git push` from a fixture repo to a bare
 *      remote, with DISTINCT local and remote ref names (`feat/x:main`, `HEAD:refs/heads/main`) and with TWO
 *      refs in one push, main listed first and main listed last. The hook must build E2E_PUSH_REFS from the
 *      REMOTE ref, ACCUMULATE every pushed ref and EXPORT it. artifact-currency stopped reading that variable on
 *      2026-10-28, but e2e-freshness's main-only red-base rule still does, and nothing else in the suite drives
 *      the real hook's export, so these cases are kept. They also prove, through the real hook, that a push
 *      moving main far past the publish sha now LANDS, with the drift printed, and that a push whose commit carries a
 *      tree defect is REFUSED, to main or to a branch, with no remote ref moved: the gate's exit 1 is only a
 *      refusal if the hook acts on it.
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
 * missing-source case RED. The stamp check (round-1 review), each RED observed: C1 skipped; C2 its `failed = true`
 * dropped; C3 run on every artifact surface, not only those declaring stampTokens; C4 its mismatch branch dropped; C5
 * a page with no publish recorded refused. In .githooks/pre-push: P1 the list built from `$_local_ref`, P2 `export` dropped, P3 only
 * the LAST ref kept, P4 only the FIRST ref kept, each turned producer cases RED; H1 the pipeline call's exit ignored
 * (`|| true`) and H2 `set -e` -> `set +e` each turned BOTH refusal cases RED, and only those (round-1 review: before
 * them, every case that drove the hook asserted a push that lands). In ci/pipeline.sh: C1 the guard
 * without its GITHUB_REF test, C2 without its GITHUB_EVENT_NAME test, C3 the step removed, each turned a CI case
 * RED; in ci.yml, Y1 `fetch-depth: 0` -> `1` turned the full-history case RED. Identity mutants (a comment edit in
 * artifact-currency.mjs, run in both batches, in pre-push and in pipeline.sh) survived. The receipts for the
 * pre-2026-10-28 main-only scope are in git history.
 * The two steps (1b), 2026-10-28, each RED observed: S1 --stamp also recording the sha (the old one-step --sync); S2
 * the stamp's time from the wall clock; S3 from the AUTHOR time (`%ct` -> `%at`); S4 --as-of ignored (HEAD stamped);
 * S5 the token check skipped; S6 an --as-of that is not a commit accepted; Y1 --sync recording a commit the stamp
 * does not name; Y2 --sync recording HEAD rather than the stamp's commit; Y3 --sync accepting a page with no stamp;
 * Y4 --sync writing the state despite a refusal; B1 --stamp and --sync accepted together; S7 each page written as soon
 * as it stamps rather than after every target has (killed only by the two-surface case). An identity comment edit
 * survived. (The earlier one-step --sync receipts are in git history.)
 * Round-2 review (2026-10-28), via scripts/dev/mutate.sh from a script file, each RED observed against this file, the
 * batch run sequentially with an identity mutant beside it: MG the stamp's commit pattern loosened from hex to anything
 * (`([0-9a-f]{4,40})` -> `(\S+)`) turned the check-mode REF case and the --sync REF case RED, and MG2 (`[0-9a-f]` ->
 * `[0-9a-z]`) turned the --sync REF case RED; ML `--as-of` with no value falling back to HEAD
 * (`const ref = argAfter('--as-of') || 'HEAD'`) turned the value-less --as-of case RED; MA --sync recording the passing
 * targets and dropping the failing ones' refusal (`if (problems.length)` -> `if (problems.length && !recorded.length)`)
 * turned the two-surface --sync case RED. ML and MA both SURVIVE the pure gates spec, which cannot see main()'s argument
 * handling or its recording, so they are killed here and only here. An identity comment edit survived this file and the
 * gates spec. NOT pinned, and said so: a real ci/pipeline.sh that swallowed a failing step (its `fail=1` dropped). No spec
 * runs the real pipeline over a failing step: the hook cases use a stub pipeline, and the fast-tier cases stub node to
 * exit 0.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, realpathSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import { fixtureGit, isolatedGitEnv } from './_isolatedGit.js';
import { HARD_LIMIT, STAMP_BEGIN, STAMP_END, stampBlock } from '../../scripts/ci/artifact-currency.mjs';

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
/** The consumer fixture's published commit's COMMITTER date, and how a stamp prints it (its author date is 2025-06-07). */
const PUBLISHED_COMMITTED = '2026-01-02T03:04:05Z';
const PUBLISHED_AT = '2026-01-02 03:04 UTC';

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
  // The published commit carries FIXED dates, months apart and both far from now, so a stamp's time can be told
  // apart from the author time and from the wall clock (see PUBLISHED_AT). Raw git because fixtureGit cannot pass the
  // date variables; it is isolated all the same (cwd is the fixture repo, env is isolatedGitEnv).
  // eslint-disable-next-line no-restricted-syntax
  execFileSync('git', ['commit', '-q', '-m', 'published'], {
    cwd: root, encoding: 'utf8', env: isolatedGitEnv({ GIT_AUTHOR_DATE: '2025-06-07T08:09:10Z', GIT_COMMITTER_DATE: PUBLISHED_COMMITTED }),
  });
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

  // THE STAMP, read on every push for a surface that declares stampTokens: exactly one, naming the recorded publish.
  // A page whose stamp disagrees with syncedSha is the hand-bumped-sha lie, and it is wrong in the tree.
  describe('the as-of stamp: present once, and naming the recorded publish', () => {
    const tokens = { text: '--t-x', rule: '--r-x', link: '--l-x', font: '--f-x' };
    const when = new Date(Date.UTC(2026, 9, 28, 6, 5, 59));
    const stamped = (...shaList) => `<title>fixture</title><div class="wrap">\n${shaList.map((sha) => stampBlock({ sha, when, tokens })).join('')}<p>body</p></div>`;
    const stampSurface = (syncedSha, extra = {}) => ({ ...surface(syncedSha), stampTokens: tokens, ...extra });
    const runStamped = (refs, html, s) => runScript({ refs, surfaces: [s], html });

    it('control: the stamp names the recorded publish — exit 0, and the report says so', () => {
      eachRefs(SPELLINGS, (refs) => {
        const { status, out } = runStamped(refs, stamped(shas[OVER]), stampSurface(shas[OVER]));
        expect(out, label(refs)).toMatch(new RegExp(`fixture: stamped as of ${shas[OVER]}, the recorded publish`));
        expect(out, label(refs)).not.toMatch(/✘/);
        expect(status, `${label(refs)}\n${out}`).toBe(0);
      });
    });

    it('a stamp naming a DIFFERENT commit from the recorded publish exits 1, naming both', () => {
      eachRefs(SPELLINGS, (refs) => {
        const { status, out } = runStamped(refs, stamped(shas[0]), stampSurface(shas[OVER]));
        expect(out, label(refs)).toMatch(new RegExp(`✘ fixture: docs/superpowers/page\\.html has a stamp naming ${shas[0]}, but \\.artifact-sync\\.json records ${shas[OVER]} as published`));
        expect(status, `${label(refs)}\n${out}`).toBe(1);
      });
    });

    it('a page with NO stamp, or with TWO, exits 1', () => {
      eachRefs(SPELLINGS, (refs) => {
        const none = runStamped(refs, PAGE, stampSurface(shas[OVER]));
        expect(none.out, label(refs)).toMatch(/✘ fixture: docs\/superpowers\/page\.html has no as-of stamp/);
        expect(none.status, `${label(refs)}\n${none.out}`).toBe(1);
        const two = runStamped(refs, stamped(shas[OVER], shas[OVER]), stampSurface(shas[OVER]));
        expect(two.out, label(refs)).toMatch(/✘ fixture: docs\/superpowers\/page\.html has 2 <!-- asof:begin --> and 2 <!-- asof:end --> markers/);
        expect(two.status, `${label(refs)}\n${two.out}`).toBe(1);
      });
    });

    it('a stamp that names a REF (HEAD), not a commit, exits 1 even when the record holds the same name', () => {
      // The page and the record AGREE here, as text, and git resolves the name to HEAD, whose drift is zero: only the
      // stamp reader's hex-only pattern separates this from a page honestly at HEAD (round-2 review).
      const { status, out } = runStamped(undefined, stamped('HEAD'), stampSurface('HEAD'));
      expect(out).toMatch(/✘ fixture: docs\/superpowers\/page\.html has an as-of stamp that names no commit/);
      expect(out).not.toMatch(/stamped as of HEAD/);
      expect(status, out).toBe(1);
    });

    it('no publish recorded yet: only the presence of one stamp is required — exit 0, and the report says none is recorded', () => {
      const s = stampSurface(undefined);
      delete s.syncedSha;
      const { status, out } = runStamped(undefined, stamped(shas[0]), s);
      expect(out).toMatch(new RegExp(`fixture: stamped as of ${shas[0]}; no publish recorded yet`));
      expect(out).toMatch(/fixture: no publish recorded — --stamp fixture, publish the stamped source, then --sync fixture/);
      expect(status, out).toBe(0);
      const none = runStamped(undefined, PAGE, s);
      expect(none.out, 'still refused without a stamp').toMatch(/✘ fixture: docs\/superpowers\/page\.html has no as-of stamp/);
      expect(none.status, none.out).toBe(1);
    });

    it('control: a surface that declares NO stampTokens is not stamp-checked (an unstamped page at HEAD exits 0)', () => {
      const { status, out } = run(undefined, shas[OVER]);
      expect(out).toMatch(/✓ fixture: at HEAD/);
      expect(out).not.toMatch(/stamped as of|as-of stamp/);
      expect(status, out).toBe(0);
    });
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
      expect(out, label(refs)).toMatch(/from main: --stamp fixture, republish, then --sync fixture/);
      expect(out, label(refs)).not.toMatch(/✘/);
      expect(status, `${label(refs)}\n${out}`).toBe(0);
    });
  });
});

// ── 1b. --stamp WRITES THE PAGE; --sync RECORDS THE PUBLISH ──────────────────────────────────────────────────
// The pure stamp functions are pinned in tests/gates/artifact-currency-gates.test.js; these prove main() CALLS them,
// and that the two steps stay apart: --stamp writes the page and never the state file, --sync writes the state file
// and never the page, and --sync refuses unless the page's stamp names the commit it is asked to record.

describe('--stamp and --sync: two steps, with the publish between them', () => {
  const tokens = { text: '--t-x', rule: '--r-x', link: '--l-x', font: '--f-x' };
  const status = { label: 'the Command Record', url: 'https://example.invalid/status' };
  const STAMP_PAGE = '<title>fixture</title><style>:root{--t-x:#111;--r-x:#222;--l-x:#333;--f-x:ui-monospace}</style>\n<div class="wrap">\n<p>body</p>\n</div>\n';
  const pagePath = () => join(root, 'docs/superpowers/page.html');
  const statePath = () => join(root, 'docs/superpowers/.artifact-sync.json');
  const count = (s, needle) => s.split(needle).length - 1;
  /** How a stamp prints a fixture commit's COMMITTER time. */
  const committedAt = (sha) => {
    const iso = new Date(Number(fixtureGit(root, 'log', '-1', '--format=%ct', sha)) * 1000).toISOString();
    return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
  };

  /**
   * Write the page and the state file: one surface, recorded as published at `synced` (by default a sha that is
   * neither HEAD nor shas[0], so a refused --sync and a --sync of either is told apart), with `extra` fields.
   */
  function prepare({ html = STAMP_PAGE, synced = shas[OVER - EXTRA], extra = {} } = {}) {
    writeFileSync(pagePath(), html);
    writeFileSync(statePath(), JSON.stringify({ surfaces: [{ ...surface(synced), stampTokens: tokens, ...extra }] }));
  }

  /** `node artifact-currency.mjs ...args` in the fixture, then what it left on disk. */
  function cli(...args) {
    const before = readFileSync(statePath(), 'utf8');
    const r = spawnSync('node', [join(root, 'frontend/scripts/ci/artifact-currency.mjs'), ...args], { cwd: root, env: cleanEnv(), encoding: 'utf8' });
    const state = readFileSync(statePath(), 'utf8');
    const row = JSON.parse(state).surfaces[0];
    return { status: r.status, out: `${r.stdout}${r.stderr}`, page: readFileSync(pagePath(), 'utf8'), stateChanged: state !== before, synced: row.syncedSha, syncedAt: row.syncedAt };
  }

  it('--stamp writes the stamp at the top of the content, naming HEAD at ITS commit time; the page is otherwise byte-identical and the state file untouched', () => {
    const head = fixtureGit(root, 'rev-parse', '--short', 'HEAD');
    prepare({ extra: { currentStatus: status } });
    const r = cli('--stamp', 'fixture');
    expect(r.status, r.out).toBe(0);
    expect(r.page).toMatch(new RegExp(`<div class="wrap">\\n${STAMP_BEGIN}<p [^>]*>As of commit ${head}, ${committedAt('HEAD')}\\. Most of this page is history; current status: <a href="https://example\\.invalid/status"`));
    const b = r.page.indexOf(STAMP_BEGIN);
    const e = r.page.indexOf(STAMP_END) + STAMP_END.length;
    expect(b, 'presence: the stamp was written').toBeGreaterThan(-1);
    expect(`${r.page.slice(0, b)}${r.page.slice(e)}`).toBe(STAMP_PAGE.replace('<div class="wrap">', '<div class="wrap">\n'));
    expect(r.stateChanged, 'a stamp records nothing: the publish has not happened yet').toBe(false);
    expect(r.out).toMatch(/then run --sync fixture, then commit/);
  });

  it(`--stamp --as-of <sha> names THAT commit at its COMMITTER time (${PUBLISHED_AT}: not its author time, not the wall clock), and a re-run writes the same bytes`, () => {
    prepare();
    const first = cli('--stamp', 'fixture', '--as-of', shas[0]);
    expect(first.status, first.out).toBe(0);
    expect(first.page).toContain(`As of commit ${shas[0]}, ${PUBLISHED_AT}.`);
    expect(first.out).toMatch(new RegExp(`then run --sync fixture --as-of ${shas[0]}, then commit`));
    const again = cli('--stamp', 'fixture', '--as-of', shas[0]);
    expect(again.status, again.out).toBe(0);
    expect(again.page, 'reproducible: the same commit stamps the same bytes').toBe(first.page);
  });

  it('a second --stamp replaces the stamp: still exactly one, and nothing else moved', () => {
    prepare();
    const first = cli('--stamp', 'fixture').page;
    prepare({ html: first });
    const second = cli('--stamp', 'fixture', '--as-of', shas[0]).page;
    expect(count(first, STAMP_BEGIN), 'presence: the first --stamp stamped').toBe(1);
    expect(count(second, STAMP_BEGIN)).toBe(1);
    expect(count(second, STAMP_END)).toBe(1);
    expect(second).toContain(`As of commit ${shas[0]},`);
    expect(second.replace(/<!-- asof:begin -->[\s\S]*<!-- asof:end -->/, '')).toBe(first.replace(/<!-- asof:begin -->[\s\S]*<!-- asof:end -->/, ''));
  });

  it('--stamp on a page that does not declare a named token, or --as-of a sha that is not a commit: exit 1, and NOTHING is written', () => {
    prepare({ extra: { stampTokens: { ...tokens, link: '--not-declared' } } });
    const r = cli('--stamp', 'fixture');
    expect(r.status, r.out).toBe(1);
    expect(r.out).toMatch(/stampTokens in \.artifact-sync\.json must name a token .* for: link/);
    expect(r.out).toMatch(/Nothing was written/);
    expect(r.page).toBe(STAMP_PAGE);
    expect(r.stateChanged).toBe(false);

    prepare();
    const bad = cli('--stamp', 'fixture', '--as-of', NOT_IN_HISTORY);
    expect(bad.status, bad.out).toBe(1);
    expect(bad.out).toMatch(new RegExp(`--as-of ${NOT_IN_HISTORY} is not a commit in this history`));
    expect(bad.page).toBe(STAMP_PAGE);
    expect(bad.stateChanged).toBe(false);
  });

  it('--stamp over TWO surfaces is all-or-nothing: the second page lacks a token, so the FIRST page is byte-unchanged too', () => {
    // Every other --stamp case has one surface, where "nothing written" holds whether or not the pages wait for each
    // other (round-1 review). The first surface here CAN stamp; it must not be written because the second cannot.
    const second = join(root, 'docs/superpowers/page2.html');
    const two = (link2) => JSON.stringify({ surfaces: [
      { ...surface(shas[OVER - EXTRA]), stampTokens: tokens },
      { ...surface(shas[OVER - EXTRA], 'docs/superpowers/page2.html'), id: 'fixture2', stampTokens: { ...tokens, link: link2 } },
    ] });
    try {
      writeFileSync(pagePath(), STAMP_PAGE);
      writeFileSync(second, STAMP_PAGE);
      writeFileSync(statePath(), two('--not-declared'));
      const r = cli('--stamp'); // no id: every artifact surface
      expect(r.status, r.out).toBe(1);
      expect(r.out).toMatch(/fixture2: stampTokens in \.artifact-sync\.json must name a token .* for: link/);
      expect(r.page, 'the first page, which could stamp, was written anyway').toBe(STAMP_PAGE);
      expect(readFileSync(second, 'utf8')).toBe(STAMP_PAGE);
      expect(r.stateChanged).toBe(false);

      // Control: with both pages stampable, both are stamped, so the refusal above is the second page's doing.
      writeFileSync(statePath(), two('--l-x'));
      const ok = cli('--stamp');
      expect(ok.status, ok.out).toBe(0);
      expect(count(ok.page, STAMP_BEGIN)).toBe(1);
      expect(count(readFileSync(second, 'utf8'), STAMP_BEGIN)).toBe(1);
    } finally {
      rmSync(second, { force: true });
    }
  });

  it('--sync after a publish records the commit the stamp names, and does not touch the page', () => {
    const head = fixtureGit(root, 'rev-parse', '--short', 'HEAD');
    prepare();
    const stamped = cli('--stamp', 'fixture').page;
    const r = cli('--sync', 'fixture');
    expect(r.status, r.out).toBe(0);
    expect(r.synced).toBe(head);
    expect(r.syncedAt).toBe(new Date().toISOString().slice(0, 10));
    expect(r.page, '--sync writes no page').toBe(stamped);

    // A page written against an older commit is recorded at THAT commit when --as-of names it.
    prepare();
    cli('--stamp', 'fixture', '--as-of', shas[0]);
    const old = cli('--sync', 'fixture', '--as-of', shas[0]);
    expect(old.status, old.out).toBe(0);
    expect(old.synced).toBe(shas[0]);
  });

  it('--sync REFUSES, recording nothing, when the stamp names another commit, when there is no stamp, or when run together with --stamp', () => {
    prepare();
    cli('--stamp', 'fixture', '--as-of', shas[0]);
    const other = cli('--sync', 'fixture'); // asked to record HEAD; the page says shas[0]
    expect(other.status, other.out).toBe(1);
    expect(other.out).toMatch(new RegExp(`the page's stamp names ${shas[0]}, not ${fixtureGit(root, 'rev-parse', '--short', 'HEAD')}`));
    expect(other.out).toMatch(/Nothing was recorded/);
    expect(other.stateChanged).toBe(false);
    expect(other.synced).toBe(shas[OVER - EXTRA]);

    prepare();
    const none = cli('--sync', 'fixture');
    expect(none.status, none.out).toBe(1);
    expect(none.out).toMatch(/has no as-of stamp\. Run --stamp fixture/);
    expect(none.stateChanged).toBe(false);

    prepare();
    const both = cli('--stamp', 'fixture', '--sync', 'fixture');
    expect(both.status, both.out).toBe(1);
    expect(both.out).toMatch(/separate steps/);
    expect(both.page).toBe(STAMP_PAGE);
    expect(both.stateChanged).toBe(false);
  });

  // ROUND-2 REVIEW (2026-10-28): three properties no case pinned, each shown to survive the whole suite as a mutant.

  it('--sync REFUSES a stamp that names a REF, not a commit (HEAD, main): git would resolve the name, so only the stamp reader stops it', () => {
    // resolveCommit() takes any ref, so --sync's own comparison with --as-of passes `HEAD` at HEAD and `main` at main's
    // tip. Were the name recorded, syncedSha would be "HEAD" and every later check would print the page as current,
    // whatever it had been published at. readStamp's hex-only pattern is the one thing that refuses it.
    const names = ['HEAD', 'main'];
    let refused = 0;
    for (const name of names) {
      // Presence: the name resolves to the very commit --sync is asked to record, so the refusal below is the stamp's
      // shape and not an unresolvable name.
      expect(fixtureGit(root, 'rev-parse', '--verify', `${name}^{commit}`), name).toBe(fixtureGit(root, 'rev-parse', 'HEAD'));
      prepare({ html: STAMP_PAGE.replace('<div class="wrap">', `<div class="wrap">\n${STAMP_BEGIN}<p data-asof>As of commit ${name}, 2026-10-28 06:05 UTC.</p>${STAMP_END}`) });
      const r = cli('--sync', 'fixture');
      expect(r.status, `${name}\n${r.out}`).toBe(1);
      expect(r.out, name).toMatch(/has an as-of stamp that names no commit\. Run --stamp fixture/);
      expect(r.out, name).toMatch(/Nothing was recorded/);
      expect(r.stateChanged, name).toBe(false);
      expect(r.synced, name).toBe(shas[OVER - EXTRA]);
      refused++;
    }
    expect(refused, 'denominator: every ref name was run').toBe(names.length);
  });

  it('--as-of with NO value is refused, never read as HEAD: nothing is stamped and nothing is recorded', () => {
    // A forgotten value must not stamp HEAD: that would claim a page written against an older commit is current.
    const noValue = /--as-of \(no value\) is not a commit in this history/;
    let refused = 0;
    prepare();
    for (const args of [['--stamp', 'fixture', '--as-of'], ['--stamp', 'fixture', '--as-of', '--x']]) {
      const r = cli(...args);
      expect(r.status, `${args.join(' ')}\n${r.out}`).toBe(1);
      expect(r.out, args.join(' ')).toMatch(noValue);
      expect(r.out, args.join(' ')).toMatch(/Nothing was written/);
      expect(r.page, args.join(' ')).toBe(STAMP_PAGE);
      expect(r.stateChanged, args.join(' ')).toBe(false);
      refused++;
    }
    // --sync takes the same --as-of: on a page stamped at HEAD, a value-less --as-of must not fall back to recording HEAD.
    const stamped = cli('--stamp', 'fixture').page;
    expect(stamped, 'presence: the page is stamped at HEAD, which a fallback to HEAD would happily record').toContain(STAMP_BEGIN);
    const s = cli('--sync', 'fixture', '--as-of');
    expect(s.status, s.out).toBe(1);
    expect(s.out).toMatch(noValue);
    expect(s.stateChanged).toBe(false);
    expect(s.page).toBe(stamped);
    refused++;
    expect(refused, 'denominator: every value-less --as-of spelling was run').toBe(3);
    // Control: the same --sync WITH its value records, so the refusal above is the missing value's doing.
    const ok = cli('--sync', 'fixture', '--as-of', fixtureGit(root, 'rev-parse', '--short', 'HEAD'));
    expect(ok.status, ok.out).toBe(0);
    expect(ok.synced).toBe(fixtureGit(root, 'rev-parse', '--short', 'HEAD'));
  });

  it('--sync over TWO surfaces is all-or-nothing: the second page names another commit, so the FIRST is not recorded either', () => {
    // The --stamp half has a two-surface case; --sync did not (round-2 review). The first page here CAN be recorded; it
    // must not be because the second cannot, or the state file would say one page was published and stay silent about
    // the other's refusal.
    const second = join(root, 'docs/superpowers/page2.html');
    const head = fixtureGit(root, 'rev-parse', '--short', 'HEAD');
    const before = shas[OVER - EXTRA];
    const rows = () => JSON.parse(readFileSync(statePath(), 'utf8')).surfaces.map((r) => r.syncedSha);
    try {
      writeFileSync(pagePath(), STAMP_PAGE);
      writeFileSync(second, STAMP_PAGE);
      writeFileSync(statePath(), JSON.stringify({ surfaces: [
        { ...surface(before), stampTokens: tokens },
        { ...surface(before, 'docs/superpowers/page2.html'), id: 'fixture2', stampTokens: tokens },
      ] }));
      const all = cli('--stamp'); // no id: both pages stamped at HEAD
      expect(all.status, all.out).toBe(0);
      const old = cli('--stamp', 'fixture2', '--as-of', shas[0]); // the second page now names an older commit
      expect(old.status, old.out).toBe(0);
      expect(readFileSync(pagePath(), 'utf8'), 'presence: the first page names HEAD').toContain(`As of commit ${head},`);
      expect(readFileSync(second, 'utf8'), 'presence: the second names shas[0]').toContain(`As of commit ${shas[0]},`);

      const r = cli('--sync'); // no id: every artifact surface, --as-of HEAD
      expect(r.status, r.out).toBe(1);
      expect(r.out).toMatch(new RegExp(`fixture2: the page's stamp names ${shas[0]}, not ${head}`));
      expect(r.out).toMatch(/Nothing was recorded/);
      expect(r.stateChanged, 'the first page, which could be recorded, was recorded anyway').toBe(false);
      expect(rows()).toEqual([before, before]);

      // Control: with the second page re-stamped at HEAD both are recorded, so the refusal above is the second page's doing.
      expect(cli('--stamp', 'fixture2').status).toBe(0);
      const ok = cli('--sync');
      expect(ok.status, ok.out).toBe(0);
      expect(rows()).toEqual([head, head]);
    } finally {
      rmSync(second, { force: true });
    }
  });
});

// ── 2. THE PRODUCER ─────────────────────────────────────────────────────────────────────────────────────────

describe('the PRODUCER: .githooks/pre-push builds E2E_PUSH_REFS from the REMOTE ref and exports it', () => {
  let hdir;
  let repo;
  let remote;
  let base; // main on the remote, before any case pushes
  let tip; // feat/x, OVER + 1 commits past the publish sha
  let bad; // feat/bad, one commit on `base` whose page carries a tree defect
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
    writeFileSync(join(repo, 'frontend/scripts/ci/mutation-proof-trailer.mjs'), '// fixture stub: the trailer gate is not this spec\'s subject\n');
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
    // A lane commit carrying a TREE DEFECT the gate refuses on any push: a Queued row whose data-absent path EXISTS.
    fixtureGit(repo, 'checkout', '-q', '-b', 'feat/bad', base);
    writeFileSync(join(repo, 'docs/superpowers/page.html'), queuedPage('docs/shipped.txt'));
    writeFileSync(join(repo, 'docs/shipped.txt'), 'landed\n');
    fixtureGit(repo, 'add', '-A');
    fixtureGit(repo, 'commit', '-q', '-m', 'a falsified Queued pill');
    bad = fixtureGit(repo, 'rev-parse', 'HEAD');
    fixtureGit(repo, 'checkout', '-q', 'feat/x'); // HEAD is the lane tip again: `HEAD:refs/heads/main` pushes `tip`
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
    // Isolated already: cwd is the fixture repo and cleanEnv is isolatedGitEnv. fixtureGit cannot be used because it
    // throws on a non-zero exit, and these cases need the status and output of a push the hook REFUSES.
    // eslint-disable-next-line no-restricted-syntax
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

  // THE REFUSAL, through the real hook. Every case above is a push that LANDS, and the stub pipeline in
  // prepush-range-gates.test.js always exits 0, so a hook that ignored the pipeline's exit status (`|| true` on the
  // call, or `set -e` dropped) passed the whole suite. Here the pipeline FAILS, on a tree defect, and the push must not
  // land: the gate's refusal is only real if the hook acts on it.
  /** The real gate ran in the hook on the pushed commit, refused the falsified pill, and git refused the push. */
  function expectRefused(r) {
    expect(r.out).toMatch(/✘ fixture: row abc1234 is marked Queued, but docs\/shipped\.txt EXISTS/);
    expect(r.out).toMatch(/failed to push some refs/);
    expect(r.status, r.out).not.toBe(0);
  }

  it('a TREE DEFECT pushed to main (`feat/bad:main`) is REFUSED by the real hook, and main does not move', () => {
    const r = push('feat/bad:main');
    expect(r.refs, `presence: the hook ran the pipeline\n${r.out}`).toEqual(['REFS[ refs/heads/main]']);
    expectRefused(r);
    expect(r.remoteMain, 'the refused push moved main anyway').toBe(base);
    expect(r.remoteMain, 'the fixture: the defect commit is not main').not.toBe(bad);
  });

  it('the same defect on a BRANCH push (`feat/bad`) is refused too, and the branch is never created on the remote', () => {
    const r = push('feat/bad');
    expect(r.refs, `presence: the hook ran the pipeline\n${r.out}`).toEqual(['REFS[ refs/heads/feat/bad]']);
    expectRefused(r);
    expect(fixtureGit(remote, 'for-each-ref', '--format=%(refname)', 'refs/heads/feat/bad'), 'the refused push created the branch anyway').toBe('');
    expect(r.remoteMain).toBe(base);
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
