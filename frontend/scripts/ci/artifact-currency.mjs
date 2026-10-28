#!/usr/bin/env node
/**
 * ARTIFACT CURRENCY — the published page the operator READS is a deliverable, and it has now gone
 * stale THREE times with him having to ask.
 *
 * Each time the response was a promise to remember, and each time that failed:
 *   2026-08-05  9 days / 99 commits stale, headline stat "CI 0/88" — false for two days
 *   2026-08-05  4 commits stale again, hours after I said it was current
 *   2026-08-07  18 commits stale, still claiming "~154 closed · 19 untouched" against a measured 120/95
 *
 * A rule that has failed three times does not get better by being written a fourth. So this makes the
 * drift VISIBLE on every push, and a hard failure once it is indefensible.
 *
 * It deliberately does NOT try to publish anything — a hook cannot, and a check that pretends to do the
 * work it is only observing is exactly the class of defect this repo keeps finding.
 *
 * Also note WHY the source went missing: it lived only in a session-scoped tmp scratchpad and was wiped,
 * the same way scratchpad/findings.json was lost. The HTML is committed now
 * (docs/superpowers/era-review.html) so a cold start can rebuild the page instead of re-deriving it.
 *
 * SCOPE OF THE HARD LIMIT: MAIN (2026-10-27). The pages describe main — what landed, what is queued. The
 * drift is `rev-list syncedSha..HEAD`, so a long-lived lane branch counts its OWN commits, and republishing
 * from main cannot lower that count: feat/steady-cool (PR #24) was refused for a drift only main could
 * repair, and no republish could clear it. So the drift refusal fires only when the push moves
 * `refs/heads/main`, or when the pushed refs are UNKNOWN (a hand run, or any caller other than
 * `.githooks/pre-push`), which stays strict. A push that moves only other branches prints the drift and
 * passes; the push that moves main is the one judged against the pages. Same shape as e2e-freshness's
 * main-only red-base rule (f0e84766), reading the same `E2E_PUSH_REFS` through the same `mainMovesFrom`.
 * NOT scoped: a missing or unusable source and a falsified Queued pill refuse EVERY push — those are
 * defects in the committed tree, which any branch can fix.
 *
 * THE SERVER-SIDE MERGE (2026-10-28). Exempting branch pushes left one path to main unbounded: a merge made
 * by `gh pr merge` or GitHub's UI runs no local hook. So CI runs this gate too, on a PUSH TO MAIN ONLY
 * (ci/pipeline.sh's fast tier, with `E2E_PUSH_REFS=' refs/heads/main'`, from a full-history checkout).
 * Never on pull_request: a PR's merge ref carries the lane's own commits, which is the #24 deadlock again.
 * A drift that cannot be MEASURED — the recorded sha absent from this history, as in a shallow clone —
 * refuses on the same terms as one over the limit: a main move whose bound cannot be computed is unbounded.
 * A branch-only push still skips it, saying so.
 *
 * ERRS STRICT, known: the hook hands every pushed ref to each target it certifies, so a single push of
 * main AND a lane branch judges the branch's tip as a main move too.
 *
 * Mutation-Proof: in driftVerdict, `refuse: !ok && mainMoves !== false` -> `refuse: !ok` (refuse whatever
 * moves) turned the branch-only cases RED; -> `refuse: false` turned the main and unknown-refs cases RED;
 * -> `mainMoves === true` (unknown refs read as branch-only) turned the unknown-refs cases RED; in main(),
 * the E2E_PUSH_REFS read -> `null` turned the process spec's branch-only and main-push cases RED (the pure
 * spec cannot see it, and stayed green). Specs: tests/gates/artifact-currency-gates.test.js (pure) and
 * tests/scripts/artifact-currency-scope.test.js (this script run as a process in a fixture repo); an
 * identity mutant (a comment edit) survived both.
 * 2026-10-28: the unmeasured verdict `refuse: mainMoves !== false` -> `refuse: false` turned the pure unmeasured
 * test and the process main / unknown-refs cases RED; -> `refuse: true` turned the pure test and the process
 * branch-only case RED; deleting the `behind === null` guard turned both RED; dropping main()'s `failed = true`
 * in the unmeasured branch turned the process main / unknown cases RED. Wrapping the Queued failure loops in
 * `if (mainMoves !== false)` and adding `if (mainMoves === false) continue;` to the missing-source branch each
 * turned a branch-push process case RED. An identity comment edit survived.
 *
 *   node scripts/ci/artifact-currency.mjs          check (informational under the limit; over it, refuses a push
 *                                                  that moves main or names no refs, and prints for any other)
 *   node scripts/ci/artifact-currency.mjs --sync   record HEAD as the published sha (run AFTER publishing)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mainMovesFrom } from './e2e-freshness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const STATE = join(ROOT, 'docs/superpowers/.artifact-sync.json');

/** Commits behind before this stops being a nudge and starts being a defect. */
export const HARD_LIMIT = 30;

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

/** Pure: classify the drift so the threshold is testable without a repo. */
export function classify(behind, limit = HARD_LIMIT) {
  if (behind === 0) return { level: 'current', ok: true };
  if (behind <= limit) return { level: 'drifting', ok: true };
  return { level: 'stale', ok: false };
}

/**
 * PURE: does this drift REFUSE this push? Only a stale page on a push that moves main, or one whose refs are
 * unknown — see SCOPE in the header. `mainMoves` is `mainMovesFrom(E2E_PUSH_REFS)`: true, false, or null for
 * "the caller did not say", and null must stay strict or a hand run would silently stop checking anything.
 */
export function driftVerdict(behind, mainMoves, limit = HARD_LIMIT) {
  // `behind === null`: the drift could not be measured (the recorded sha is not in this history). Unmeasured
  // is not current — on a push that moves main, or one naming no refs, it refuses exactly as stale does.
  if (behind === null) return { level: 'unmeasured', refuse: mainMoves !== false };
  const { level, ok } = classify(behind, limit);
  return { level, refuse: !ok && mainMoves !== false };
}

export function readState() {
  if (!existsSync(STATE)) return null;
  try { return JSON.parse(readFileSync(STATE, 'utf8')); } catch { return null; }
}

/**
 * PURE: normalize the state file into a list of surfaces, so a second one costs a JSON entry.
 *
 * There are TWO kinds, and conflating them would manufacture a false failure:
 *
 *   kind 'artifact' — published to a URL. Drift is measured from the sha that was PUBLISHED, which git
 *                     cannot know, so it lives in the state file. `validateSource` applies: the committed
 *                     file must be the AUTHORED page, not a fetched copy of the publish wrapper.
 *   kind 'page'     — a committed page nobody publishes (`LOOP-PROGRESS.html`). Drift is measured from the
 *                     file's OWN last commit, which git knows, so it needs no recorded sha and cannot lie.
 *                     `validateSource` must NOT run on it — it rejects a doctype, because the Artifact shell
 *                     adds one at publish time, and a standalone page legitimately has its own.
 *
 * Accepts the old single-object shape so an existing state file keeps working.
 */
export function surfaces(state) {
  if (!state) return [];
  const list = Array.isArray(state.surfaces) ? state.surfaces : [state];
  return list
    .filter((s) => s && s.source)
    // Spread FIRST, then the computed fields with an explicit `s.x ||` fallback. The reverse order works
    // by accident — a trailing `...s` silently overrides whatever was computed above it — and reads exactly
    // backwards from what it does.
    .map((s) => ({ ...s, id: s.id || s.source, kind: s.kind || (s.url ? 'artifact' : 'page') }));
}

/**
 * PURE: is the committed page a usable SOURCE, or a saved copy of the published wrapper?
 *
 * The page was unrecoverable once because it lived only in a session-scoped tmp scratchpad and was
 * wiped — the same way scratchpad/findings.json was lost. Committing it fixes that only if what is
 * committed is the AUTHORED content: re-committing a fetched copy would republish the publish shell
 * inside itself. This check runs on every push rather than only in the test suite, because it guards
 * the input this script depends on.
 */
export function validateSource(html) {
  if (!html || !html.includes('<title>')) return 'missing a <title> — not the authored page';
  if (html.includes('__FRAME_PREAMBLE')) return 'contains the publish-shell runtime — this is a fetched copy, not the source';
  if (/<!doctype html>/i.test(html)) return 'contains a doctype — the shell adds that at publish time';
  return null;
}

/**
 * PURE: extract every row on a review page that claims to be QUEUED, with the artifact it says is absent.
 *
 * WHY. A "Queued" pill is a claim about the world — that this work has not shipped — and nothing checked
 * it. `d90a6b1` sat marked Queued for a day after shipping as `2e2da50`, and survived a republish whose
 * message promised "every stat re-measured". That was true and beside the point: the STATS were in the
 * denominator, the STATUS PILLS were not. Kevin caught it, having raised the general problem before.
 *
 * A rule that has failed repeatedly does not get better by being restated (AGENTS.md says exactly this).
 * So a queued row must declare `data-absent="<repo-relative path>"` — the artifact whose ABSENCE is the
 * reason it is still open. The moment that path exists, the claim is false. That turns a status pill from
 * narrative into something a machine can falsify, which is the only kind of claim this repo trusts.
 *
 * @param {string} html
 * @returns {{sha: string, path: string|null}[]}
 */
export function queuedClaims(html) {
  const out = [];
  // Anchored to the row's syntactic form — sha, then body, then the verdict pill — so it cannot be
  // satisfied by the word "queue" appearing in prose or a CSS rule elsewhere in the file.
  const ROW = /<div class="row"><div class="sha">([^<]+)<\/div><div class="body"([^>]*)>[\s\S]*?<span class="pill (\w+)"/g;
  for (const [, sha, attrs, pill] of html.matchAll(ROW)) {
    if (pill !== 'queue') continue;
    const m = /data-absent="([^"]+)"/.exec(attrs);
    out.push({ sha: sha.trim(), path: m ? m[1] : null });
  }
  return out;
}

/**
 * PURE: check each queued claim against the filesystem, via an injected `exists` so it is testable.
 *
 * Two ways to fail, deliberately. A claim whose artifact EXISTS is STALE — the work shipped and the page
 * still says otherwise. A claim that declares NOTHING is UNDECLARED — an unfalsifiable pill, which is the
 * original defect and would make this gate opt-in if it were allowed.
 *
 * `checked` is returned so the caller can print a denominator, including an honest zero.
 */
export function verifyQueued(claims, exists) {
  const stale = [];
  const undeclared = [];
  for (const c of claims) {
    if (!c.path) { undeclared.push(c.sha); continue; }
    if (exists(c.path)) stale.push({ sha: c.sha, path: c.path });
  }
  return { ok: stale.length === 0 && undeclared.length === 0, stale, undeclared, checked: claims.length };
}

function main() {
  const head = git('rev-parse', '--short', 'HEAD');
  const state = readState();
  const all = surfaces(state);

  if (process.argv.includes('--sync')) {
    // `--sync [id]` — only 'artifact' surfaces carry a recorded sha; a 'page' is tracked by its own commit.
    const which = process.argv[process.argv.indexOf('--sync') + 1];
    const targets = all.filter((s) => s.kind === 'artifact' && (!which || which.startsWith('-') || s.id === which));
    if (!targets.length) {
      console.error(`artifact-currency: no artifact surface matching ${which || '(any)'} — nothing to sync`);
      process.exit(1);
    }
    const next = JSON.parse(JSON.stringify(state));
    const list = Array.isArray(next.surfaces) ? next.surfaces : [next];
    for (const t of targets) {
      const row = list.find((r) => (r.id || r.source) === t.id);
      if (row) { row.syncedSha = head; row.syncedAt = new Date().toISOString().slice(0, 10); }
    }
    writeFileSync(STATE, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`artifact-currency: recorded ${head} as published for ${targets.map((t) => t.id).join(', ')}`);
    return;
  }

  if (!all.length) {
    console.log('artifact-currency: no surfaces configured — nothing to check');
    return;
  }

  let failed = false;
  // The refs this push moves, exported by .githooks/pre-push; absent (a hand run) is null and stays strict.
  const mainMoves = mainMovesFrom(process.env.E2E_PUSH_REFS);
  const scope = mainMoves === true ? 'this push moves main'
    : mainMoves === false ? 'this push moves only other branches: drift past the limit is informational'
      : 'pushed refs unknown: strict';
  // Report the DENOMINATOR: a clean tick over a list that silently shrank to zero is the defect this
  // project keeps shipping.
  console.log(`artifact-currency: ${all.length} surface(s) tracked (${scope})`);

  for (const s of all) {
    const src = join(ROOT, s.source);
    if (!existsSync(src)) {
      console.error(`\n✘ artifact-currency: ${s.source} is missing — the page source must be COMMITTED,`);
      console.error('  not left in a session scratchpad (that is how it was lost the first time).\n');
      failed = true;
      continue;
    }
    // Guard this script's own input before trusting the drift number — artifact sources only.
    if (s.kind === 'artifact') {
      const bad = validateSource(readFileSync(src, 'utf8'));
      if (bad) {
        console.error(`\n✘ artifact-currency: ${s.source} is ${bad}`);
        console.error('  A drift count over an unusable source would be a number about nothing.\n');
        failed = true;
        continue;
      }
    }

    // Verdict pills are checked BEFORE the drift number, because a page at HEAD that says "Queued" about
    // finished work is wrong in the way that actually reaches the operator — and a zero-drift page would
    // otherwise print `✓ at HEAD` and stop, which is how this was missed.
    const claims = queuedClaims(readFileSync(src, 'utf8'));
    const q = verifyQueued(claims, (p) => existsSync(join(ROOT, p)));
    console.log(`  · ${s.id}: ${q.checked} queued row(s) claiming unfinished work`);
    for (const { sha, path } of q.stale) {
      console.error(`\n✘ ${s.id}: row ${sha} is marked Queued, but ${path} EXISTS — the work shipped.`);
      console.error('  Mark it Done with what actually landed, or correct data-absent if it points at the wrong thing.');
      failed = true;
    }
    for (const sha of q.undeclared) {
      console.error(`\n✘ ${s.id}: row ${sha} is marked Queued but declares no data-absent="<path>".`);
      console.error('  A status pill nothing can falsify is the defect this check exists for.');
      failed = true;
    }

    // 'artifact' drifts from the sha that was PUBLISHED; 'page' from its own last commit.
    let from = s.syncedSha;
    if (s.kind === 'page') {
      from = git('log', '-1', '--format=%h', '--', s.source);
      if (!from) { console.log(`· ${s.id}: never committed — skipping`); continue; }
    }
    if (!from) {
      console.log(`· ${s.id}: no sync state — run with --sync ${s.id} after publishing`);
      continue;
    }

    let behind = null;
    try {
      behind = Number(git('rev-list', '--count', `${from}..HEAD`));
    } catch {
      // Left null: driftVerdict decides, so an unmeasurable drift cannot quietly read as a pass on main.
    }

    const { level, refuse } = driftVerdict(behind, mainMoves);
    if (level === 'unmeasured') {
      if (!refuse) {
        console.log(`· ${s.id}: recorded sha ${from} is not in this history — skipping: this push moves only other`);
        console.log('  branches, and a push that moves main at this state is refused');
        continue;
      }
      console.error(`\n✘ ${s.id}: recorded sha ${from} is not in this history, so the drift cannot be measured.`);
      console.error('  On a push that moves main (or names no refs) an unmeasured drift is an unbounded one. In CI this is a');
      console.error('  shallow checkout (the gates job needs fetch-depth: 0); locally, a publish sha rewritten out of history.');
      if (s.kind === 'artifact') {
        console.error(`  Fix: republish ${s.source} to the SAME url, then \`node scripts/ci/artifact-currency.mjs --sync ${s.id}\`.\n`);
      }
      failed = true;
      continue;
    }
    if (level === 'current') {
      console.log(`  ✓ ${s.id}: at HEAD (${head})`);
      continue;
    }
    const what = s.kind === 'artifact' ? 'the published page' : 'this page';
    const line = `${s.id}: ${what} is ${behind} commit(s) behind (${s.kind === 'artifact' ? `published ${from}` : `last touched ${from}`}, HEAD ${head})`;
    if (level === 'drifting') {
      console.log(`  · ${line} — refresh it at session close${s.url ? `: ${s.url}` : ''}`);
      continue;
    }
    if (!refuse) {
      console.log(`  · ${line} — over the ${HARD_LIMIT}-commit limit, but this push does not move main.`);
      console.log('    The pages describe main, and a branch cannot lower this count by republishing, so it is not refused');
      console.log(`    here; a push that moves main at this drift is. Republish before landing${s.url ? `: ${s.url}` : ''}`);
      continue;
    }
    console.error(`\n✘ ${line}`);
    console.error(`  Over the ${HARD_LIMIT}-commit limit. The operator reads this page; at this drift it is`);
    console.error('  reporting a state the project no longer has, which is the same defect as a gate');
    console.error('  passing over input it never examined.');
    if (s.kind === 'artifact') {
      console.error(`  Fix: update ${s.source}, republish to the SAME url, then`);
      console.error(`  \`node scripts/ci/artifact-currency.mjs --sync ${s.id}\`. Do NOT just bump the sha.\n`);
    } else {
      console.error(`  Fix: regenerate ${s.source} and commit it.\n`);
    }
    failed = true;
  }

  if (failed) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
