#!/usr/bin/env node
/**
 * change-scope.mjs — may this CI run skip the browser jobs (the e2e matrix and prod-smoke), or, on a push to main, the
 * heavy work altogether?
 *
 * WHY (DECISIONS 2026-10-28 item 13(b)). main gets ONE required status check, `ci ok`, and a docs-only commit
 * should not wait twenty minutes for eight e2e shards that cannot see what it changed. A skipped job counts as
 * passing, so the skip is a CLAIM: "this sha's app is byte-identical to a commit whose app CI already passed".
 * This script decides whether that claim is true, and it fails SAFE — on anything it cannot establish it says
 * code=true and everything runs. That covers the script's own decision only: if the JOB running it fails or is
 * cancelled there is no output, GitHub skips the jobs that need it (gates and e2e), and `ci ok` fails on the result.
 *
 * THE RULE. code=false only when ALL of these hold:
 *   1. a BASE exists for the event —
 *        push               github.event.before, the branch's previous tip (a forced push has none: everything runs);
 *                           a NEW branch (before is all zeros, or the event payload is unreadable) uses its merge-base
 *                           with origin/main
 *        pull_request       the pull request's base sha
 *        workflow_dispatch  the merge-base with origin/main
 *        anything else      no base: everything runs
 *   2. the base is an ANCESTOR of HEAD in this clone (a force push, or history not fetched, fails this);
 *   3. at least one path changed, and EVERY changed path is docs (see isDocsPath). The diff is taken with
 *      --no-renames, so a file moved out of frontend/ into docs/ shows its frontend/ side and counts as code;
 *   4. the base is CERTIFIED: its NEWEST `ci ok` check run completed with `success`.
 *
 * WHY RULE 4, which the brief did not ask for. Without it the skip borrows the base's verdict without reading it.
 * Measured shape: on a land/** branch, push A (code) then B (docs) before A's run ends; concurrency cancels A's
 * run, B's diff against `before` = A is docs-only, B skips e2e and `ci ok` passes on B — a sha whose code CI never
 * ran green, through the required check. (PR #28 was parked on the same class: a docs commit borrowing an
 * ancestor's verdict without proving the ancestor's verdict was green.) A cancelled run's `ci ok` concludes
 * failure (it runs under `if: always()`), so the newest-check rule refuses exactly that base. Induction makes it
 * sound for push and workflow_dispatch runs, which check out the sha they name: a `ci ok` success on that sha means
 * its app was e2e-tested green there, or on a certified base it equals. A pull_request run checks out the MERGE
 * commit while GitHub attaches its check runs to the PR's head sha, so its `ci ok` vouches for a tree the head may
 * not equal, and certified() cannot tell it from a push's. Main is not exposed: a head that differs from the tested
 * merge is behind main and cannot be fast-forwarded onto it.
 *
 * A PUSH TO MAIN OF A SHA THAT ALREADY PASSED (command session, 2026-10-28 18:35Z; DECISIONS 2026-10-28 item 23).
 * main moves only on a sha whose `ci ok` passed, on its land/** push or its pull request, so the run main's push starts
 * re-tests a sha with a verdict. certified=true when the event is a push to refs/heads/main and the sha's NEWEST `ci ok`
 * check run from ANOTHER workflow run (its run id, read from the check run's URL, is not GITHUB_RUN_ID) completed with
 * success. Then the e2e matrix is skipped and the gates job runs only its quick steps (pipeline.sh --sha-certified=true),
 * and `ci ok` passes on the verdict, naming the run. A check run whose run id cannot be read, a missing GITHUB_RUN_ID or
 * an API error certifies nothing, and everything runs. A pull_request run's `ci ok` lands on the head sha but tested
 * the merge with its base; when main fast-forwards to that head, the base was an ancestor of it, so the merge's tree
 * IS the head's.
 *
 * WHAT IT DOES NOT CHECK (R9). Whether a docs file can break the GATES job — it cannot skip that job, which always
 * runs (doc-currency, opsec-scan and the unit suite read docs). Whether the newest `ci ok` on the base was a
 * FLAKE-green: one green verdict is what the required check itself accepts. Which workflow produced a `ci ok`: the
 * name and the GitHub Actions app are all branch protection trusts too.
 *
 * Mutation-Proof: tests/scripts/ci-required-check.test.js, each observed RED with scripts/dev/mutate.sh:
 *   C1 isDocsPath accepts a frontend/ Markdown file          -> the frontend-md case
 *   C2 an empty diff reads as docs-only                       -> the empty-diff case
 *   C3 `--no-renames` dropped                                 -> the rename-out-of-frontend fixture case
 *   C4 certification skipped (any base trusted)               -> the uncertified-base case
 *   C5 plausible-wrong: the OLDEST ci ok decides, not the newest -> the newer-red case
 *   C6 the ancestry check skipped                             -> the not-an-ancestor fixture case
 *   C7 a forced push trusts `before`                          -> the forced-push case
 *   C8 a thrown error reads as docs-only                      -> the could-not-classify case
 *   identity (a comment edit) SURVIVED in the same batch.
 *
 *   node scripts/ci/change-scope.mjs     in CI: reads GITHUB_EVENT_NAME / GITHUB_EVENT_PATH / GITHUB_REPOSITORY /
 *                                        GITHUB_REF / GITHUB_RUN_ID, writes `code=true|false`, `certified=true|false`
 *                                        and `certified_by=<run url>` to GITHUB_OUTPUT, prints why. Exit 0 always —
 *                                        the decision is the output; only a broken output file exits non-zero.
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The one required status check on main. ci-ok.mjs's job carries exactly this name. */
export const REQUIRED_CHECK = 'ci ok';

const ZERO_SHA = /^0+$/;
export const MAIN_REF = 'refs/heads/main';
const RUN_URL = /\/actions\/runs\/(\d+)\/job\//;

/**
 * PURE. A path that cannot affect the app, its build, its browser jobs, or how CI runs them. Anything not
 * positively recognised is code — an unknown path runs everything (fail SAFE). frontend/, ci/, .github/ and
 * .githooks/ are code whatever the extension: a Markdown file under frontend/ can be imported with ?raw.
 */
export function isDocsPath(p) {
  if (/^(frontend|ci|\.github|\.githooks)\//.test(p)) return false;
  if (/^(docs|memory)\//.test(p)) return true;
  return /\.md$/.test(p);
}

/** PURE. code=true unless at least one path changed and every one is docs. */
export function classify(paths) {
  if (paths.length === 0) return { code: true, why: 'no path differs from the base, so there is nothing to classify — a run with no change is a request for a verdict' };
  const first = paths.find((p) => !isDocsPath(p));
  if (first) return { code: true, why: `${paths.length} path(s) changed; ${first} can affect the app or its checks` };
  return { code: false, why: `${paths.length} path(s) changed, every one docs or Markdown` };
}

/** PURE (mergeBase is injected). The commit to compare against for this event, or `base: null` and why. */
export function candidateBase({ event, payload = {}, mergeBase }) {
  if (event === 'push') {
    if (payload.forced) return { base: null, why: 'a forced push: the previous tip is no ancestor to compare against' };
    if (payload.before && !ZERO_SHA.test(payload.before)) return { base: payload.before, from: 'the branch\'s previous tip (github.event.before)' };
    return { base: mergeBase(), from: 'a new branch: its merge-base with origin/main' };
  }
  if (event === 'pull_request') {
    const sha = payload.pull_request && payload.pull_request.base && payload.pull_request.base.sha;
    return sha ? { base: sha, from: 'the pull request\'s base sha' } : { base: null, why: 'the pull_request payload carries no base sha' };
  }
  if (event === 'workflow_dispatch') return { base: mergeBase(), from: 'the merge-base with origin/main' };
  return { base: null, why: `event "${event || '(none)'}" has no defined base` };
}

/** PURE. Is a sha certified — its NEWEST `ci ok` check run (highest id) from GitHub Actions completed with success? */
export function certified(checkRuns) {
  const mine = (checkRuns || []).filter((r) => r && r.name === REQUIRED_CHECK && r.app && r.app.slug === 'github-actions');
  if (mine.length === 0) return { ok: false, why: `it carries no "${REQUIRED_CHECK}" check run` };
  const newest = mine.reduce((a, b) => (Number(b.id) > Number(a.id) ? b : a));
  if (newest.status !== 'completed') return { ok: false, why: `its newest "${REQUIRED_CHECK}" (check run ${newest.id}) is ${newest.status}` };
  if (newest.conclusion !== 'success') return { ok: false, why: `its newest "${REQUIRED_CHECK}" (check run ${newest.id}) concluded ${newest.conclusion}` };
  return { ok: true, why: `its newest "${REQUIRED_CHECK}" (check run ${newest.id}, of ${mine.length}) passed` };
}

/**
 * PURE. Did ANOTHER workflow run pass this sha — the newest `ci ok` check run from the GitHub Actions app whose run id
 * is not `runId` completed with success? A check run whose URL names no run id certifies nothing, since it could be
 * this run's own.
 */
export function shaCertified(checkRuns, runId) {
  if (!runId) return { ok: false, why: 'GITHUB_RUN_ID is unset, so this run\'s own check runs cannot be told apart' };
  const named = (checkRuns || []).filter((r) => r && r.name === REQUIRED_CHECK && r.app && r.app.slug === 'github-actions');
  const runOf = (r) => (RUN_URL.exec(String(r.html_url || r.details_url || '')) || [])[1];
  const unread = named.find((r) => !runOf(r));
  if (unread) return { ok: false, why: `check run ${unread.id} names no workflow run, so it may be this run's own` };
  const others = named.filter((r) => runOf(r) !== String(runId));
  if (others.length === 0) return { ok: false, why: `no other workflow run left a "${REQUIRED_CHECK}" on it (${named.length} from this run)` };
  const newest = others.reduce((a, b) => (Number(b.id) > Number(a.id) ? b : a));
  const run = runOf(newest);
  if (newest.status !== 'completed') return { ok: false, why: `the newest "${REQUIRED_CHECK}" from another run (run ${run}) is ${newest.status}` };
  if (newest.conclusion !== 'success') return { ok: false, why: `the newest "${REQUIRED_CHECK}" from another run (run ${run}) concluded ${newest.conclusion}` };
  return { ok: true, run, url: newest.html_url || newest.details_url, why: `run ${run} passed "${REQUIRED_CHECK}" on it (check run ${newest.id}, the newest of ${others.length} from other runs)` };
}

/**
 * The decision. `git(args)` returns stdout and throws on a non-zero exit; `checkRuns(sha)` returns that sha's
 * check runs and may throw. Every throw lands in the catch and reads code=true, certified=false: an error is never a
 * skip.
 */
export function scope({ event, payload, git, checkRuns, ref = '', runId = '' }) {
  const lines = [];
  const full = (why) => ({ code: true, certified: false, certifiedBy: '', lines: [...lines, `change-scope: code=true — ${why}; everything runs`] });
  try {
    if (event === 'push' && ref === MAIN_REF) {
      const head = git(['rev-parse', 'HEAD']).trim();
      const cert = shaCertified(checkRuns(head), runId);
      if (cert.ok) {
        return { code: true, certified: true, certifiedBy: cert.url, lines: [...lines, `change-scope: certified=true — a push to main of ${head.slice(0, 12)}, which ${cert.why}: ${cert.url}; the e2e matrix and the gates' slow steps are skipped`] };
      }
      lines.push(`change-scope: a push to main of ${head.slice(0, 12)}, not certified by another run: ${cert.why}`);
    }
    const c = candidateBase({ event, payload, mergeBase: () => git(['merge-base', 'HEAD', 'origin/main']).trim() });
    if (!c.base) return full(c.why);
    const short = c.base.slice(0, 12);
    lines.push(`change-scope: event ${event}; base ${short}, ${c.from}`);
    try {
      git(['merge-base', '--is-ancestor', c.base, 'HEAD']);
    } catch {
      return full(`the base ${short} is not an ancestor of HEAD in this clone (a rewritten branch, or history not fetched)`);
    }
    const paths = git(['diff', '--no-renames', '--name-only', '-z', c.base, 'HEAD']).split('\0').filter(Boolean);
    const k = classify(paths);
    if (k.code) return full(k.why);
    lines.push(`change-scope: ${k.why}`);
    const cert = certified(checkRuns(c.base));
    if (!cert.ok) return full(`the base ${short} is not certified: ${cert.why}`);
    return { code: false, certified: false, certifiedBy: '', lines: [...lines, `change-scope: code=false — the base is certified: ${cert.why}; the e2e matrix and prod-smoke are skipped`] };
  } catch (e) {
    return full(`COULD NOT CLASSIFY (${String((e && e.message) || e).split('\n')[0]})`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const event = process.env.GITHUB_EVENT_NAME || '';
  let payload = {};
  try {
    payload = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH || '', 'utf8'));
  } catch {
    // An unreadable payload reads as {}: a push then takes the new-branch path (merge-base with origin/main) and loses
    // its `forced` bit; a pull_request has no base sha, so everything runs. The tree diff and the base's `ci ok` still decide.
    payload = {};
  }
  const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const repo = process.env.GITHUB_REPOSITORY || '';
  const checkRuns = (sha) => {
    if (!repo) throw new Error('GITHUB_REPOSITORY is unset, so no check run can be read');
    const out = execFileSync('gh', ['api', `repos/${repo}/commits/${sha}/check-runs?check_name=${encodeURIComponent(REQUIRED_CHECK)}&filter=all&per_page=100`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return JSON.parse(out).check_runs;
  };
  const r = scope({ event, payload, git, checkRuns, ref: process.env.GITHUB_REF || '', runId: process.env.GITHUB_RUN_ID || '' });
  for (const l of r.lines) console.log(l);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `code=${r.code}\ncertified=${r.certified}\ncertified_by=${r.certifiedBy}\n`);
  else console.log(`change-scope: no GITHUB_OUTPUT (a hand run) — the decision above was printed, not written`);
}
