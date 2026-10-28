/**
 * ARTIFACT-CURRENCY'S DRIFT REFUSAL GUARDS MAIN — driven as a process, end to end.
 *
 * The pages describe main. A lane branch counts its own commits past the publish sha, which no republish
 * from main can lower, so refusing it was permanent (feat/steady-cool, PR #24). The fix scopes the drift
 * refusal to a push that moves `refs/heads/main`, or one whose refs are unknown. The pure half is pinned in
 * tests/gates/artifact-currency-gates.test.js; this file pins the SEAM that pure test cannot see — that
 * main() reads `E2E_PUSH_REFS` (the producer, exported by .githooks/pre-push) and turns the verdict into
 * the exit code the hook acts on.
 *
 * How: the real script bytes are copied into a throwaway repo at `frontend/scripts/ci/` (its ROOT is
 * derived from its own location, so it then measures the fixture), with the one sibling it imports. The
 * fixture's surface is published at its first commit and HEAD is HARD_LIMIT + 5 commits on. Every run
 * asserts the denominator line first, so a script that failed to load cannot pass an exit-1 case.
 * E2E_PUSH_REFS is cleared from the inherited env on every run: the pre-push hook exports it, and this
 * suite runs under that hook.
 *
 * Sited in tests/scripts/: the subject is a CI script driven as a process over a fixture repo.
 *
 * Mutation-Proof: in driftVerdict, `refuse: !ok && mainMoves !== false` -> `refuse: !ok` turned the
 * branch-only case RED; -> `refuse: false` turned the main-push, mixed-push and unknown-refs cases RED;
 * -> `mainMoves === true` turned the unknown-refs case RED. Removing the mainMovesFrom read in main()
 * (`mainMovesFrom(process.env.E2E_PUSH_REFS)` -> `null`) turned the branch-only and main-push cases RED,
 * and survived the pure spec, which is why this file exists. Identity (a comment edit) survived both.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { fixtureGit, isolatedGitEnv } from './_isolatedGit.js';
import { HARD_LIMIT } from '../../scripts/ci/artifact-currency.mjs';

const CI = resolve(dirname(fileURLToPath(import.meta.url)), '../../scripts/ci');
const EXTRA = 5;
const OVER = HARD_LIMIT + EXTRA;

let root;
let shas; // shas[0] is the published commit; HEAD is shas[OVER]

beforeAll(() => {
  // realpath: the script runs main() only when argv[1] equals its own resolved URL, and macOS's tmpdir is a
  // symlink (/var -> /private/var), so an unresolved path would load the module and silently do nothing.
  root = realpathSync(mkdtempSync(join(tmpdir(), 'artifact-scope-')));
  fixtureGit(root, 'init', '-q', '-b', 'main');
  fixtureGit(root, 'config', 'user.email', 'fixture@example.invalid');
  fixtureGit(root, 'config', 'user.name', 'fixture');
  fixtureGit(root, 'config', 'commit.gpgsign', 'false');
  mkdirSync(join(root, 'docs/superpowers'), { recursive: true });
  writeFileSync(join(root, 'docs/superpowers/page.html'), '<title>fixture</title><div>page</div>');
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

/** Run the copied script with the surface published at `syncedSha`; `refs` undefined = the var is unset. */
function run(refs, syncedSha, html = '<title>fixture</title><div>page</div>') {
  writeFileSync(join(root, 'docs/superpowers/page.html'), html);
  writeFileSync(
    join(root, 'docs/superpowers/.artifact-sync.json'),
    JSON.stringify({ surfaces: [{ id: 'fixture', kind: 'artifact', url: 'https://example.invalid/a', source: 'docs/superpowers/page.html', syncedSha }] }),
  );
  const env = isolatedGitEnv();
  delete env.E2E_PUSH_REFS;
  if (refs !== undefined) env.E2E_PUSH_REFS = refs;
  const r = spawnSync('node', [join(root, 'frontend/scripts/ci/artifact-currency.mjs')], { cwd: root, env, encoding: 'utf8' });
  const out = `${r.stdout}${r.stderr}`;
  // The denominator, before any verdict is read: a script that never loaded must not satisfy an exit-1 case.
  expect(out, out).toMatch(/artifact-currency: 1 surface\(s\) tracked/);
  return { status: r.status, out };
}

const behindLine = (n) => new RegExp(`fixture: the published page is ${n} commit\\(s\\) behind`);

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
    for (const refs of [undefined, '']) {
      const { status, out } = run(refs, shas[0]);
      expect(out).toMatch(/pushed refs unknown: strict/);
      expect(out).toMatch(new RegExp(`✘ ${behindLine(OVER).source}`));
      expect(status, out).toBe(1);
    }
  });

  it(`a push that moves main, ${EXTRA} behind: exit 0 with the nudge`, () => {
    const { status, out } = run(' refs/heads/main', shas[OVER - EXTRA]);
    expect(out).toMatch(behindLine(EXTRA));
    expect(out).toMatch(/refresh it at session close/);
    expect(status, out).toBe(0);
  });

  it('a branch-only push is NOT excused the source checks: an unusable page source still exits 1', () => {
    // At HEAD, so the drift cannot be what fails it: the refusal comes from validateSource alone.
    const { status, out } = run(' refs/heads/feat/steady-cool', shas[OVER], '<!doctype html><title>fixture</title>');
    expect(out).toMatch(/✘ artifact-currency: docs\/superpowers\/page\.html is contains a doctype/);
    expect(status, out).toBe(1);
  });
});
