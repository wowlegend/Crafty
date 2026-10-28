#!/usr/bin/env node
/**
 * ARTIFACT CURRENCY — reports how far each operator page is behind HEAD, and refuses only the defects a
 * committed tree can carry.
 *
 * WHAT IT DOES (DECISIONS 2026-10-28 item 12):
 *   - DRIFT IS REPORTED, NEVER REFUSED. Every surface prints how many commits its page is behind HEAD, with
 *     the page's URL, on every push and in CI. A drift this script cannot measure (the recorded sha is not in
 *     this history) prints as well, naming its two causes. Neither changes the exit code, on any push.
 *   - TWO TREE DEFECTS STILL REFUSE, on every push: a page source that is missing or unusable (a fetched copy
 *     of the publish wrapper rather than the authored page), and a row marked Queued whose declared
 *     `data-absent` path EXISTS, or that declares none. Both are wrong in the committed tree, and any branch
 *     can fix them.
 *
 * WHY THE DRIFT REFUSAL WENT. From 2026-08-07 (7d30ee27) a page more than HARD_LIMIT commits behind refused the
 * push; 2026-10-28 scoped that to a push moving main. It was built after three stale-page incidents, each one
 * caught by Kevin, and each time the response had been a promise to remember:
 *   2026-08-05  9 days / 99 commits stale, headline stat "CI 0/88" — false for two days
 *   2026-08-05  4 commits stale again, hours after I said it was current
 *   2026-08-07  18 commits stale, still claiming "~154 closed · 19 untouched" against a measured 120/95
 * Measured over its life: it refused 8 pushes, 5 of them correct lane work; it stopped no recorded false claim;
 * and it passed a false Queued pill on a page that was at HEAD (41c40c6d, which is why the Queued check exists).
 * It measured how far the WRITER was behind. Kevin's question was whether what he READS is current, and a page
 * answers that by printing its own commit and time. Lanes land as merge commits, so after the main-only scope a
 * landing still counted the lane's own commits into main's drift, and every landing needed a republish from
 * whichever claude.ai account owns the pages. Restoring the refusal is one expression in driftVerdict: main()
 * still routes the verdict's `refuse` into the exit code, so the door stays two-way.
 *
 * It deliberately does NOT publish anything. A hook cannot, and a check that pretends to do the work it only
 * observes is exactly the class of defect this repo keeps finding.
 *
 * WHY THE SOURCE IS COMMITTED: the era-review page once lived only in a session-scoped tmp scratchpad and was
 * wiped, the same way scratchpad/findings.json was lost. The HTML is committed now
 * (docs/superpowers/era-review.html) so a cold start can rebuild the page instead of re-deriving it.
 *
 * IN CI the fast tier runs this on a push to main (ci/pipeline.sh), from a full-history checkout so the drift can
 * be counted. There it prints main's drift after a merge GitHub made (which runs no local hook), and refuses the
 * two tree defects if a merge brought one in.
 *
 * Mutation-Proof: 2026-10-28 (item 12), each via scripts/dev/mutate.sh against both specs below. Restoring a
 * drift refusal in driftVerdict (`refuse: false` -> `refuse: level === 'stale'`) turned the pure verdict test
 * and the process over-limit cases RED; the unmeasured `refuse: false` -> `refuse: true` turned the pure test and
 * the process unmeasured cases RED; main() refusing a stale drift whatever the verdict (`if (refuse)` ->
 * `if (refuse || level === 'stale')`) turned the process over-limit cases RED (the pure test cannot see it).
 * Dropping `failed = true` from the missing-source, unusable-source, Queued-EXISTS and undeclared-Queued
 * branches each turned its process case RED, and skipping the missing-source check when the push names a
 * feat/ branch turned that case RED. Dropping the URL from the drift line turned the URL assertions RED. An
 * identity comment edit survived both specs. Specs: tests/gates/artifact-currency-gates.test.js (pure) and
 * tests/scripts/artifact-currency-scope.test.js (this script run as a process, through the real pre-push hook
 * and the real pipeline). The receipts for the earlier main-only scope (2026-10-27/28) are in git history.
 *
 *   node scripts/ci/artifact-currency.mjs          check: report every surface's drift; refuse the tree defects
 *   node scripts/ci/artifact-currency.mjs --sync   record HEAD as the published sha (run AFTER publishing)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const STATE = join(ROOT, 'docs/superpowers/.artifact-sync.json');

/**
 * Commits behind before the report calls a page STALE rather than drifting. It sets the wording only: since
 * DECISIONS 2026-10-28 item 12 no drift refuses a push (see driftVerdict).
 */
export const HARD_LIMIT = 30;

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

/** Pure: classify the drift so the threshold is testable without a repo. */
export function classify(behind, limit = HARD_LIMIT) {
  if (behind === 0) return { level: 'current', ok: true };
  if (behind <= limit) return { level: 'drifting', ok: true };
  return { level: 'stale', ok: false };
}

/**
 * PURE: what level is this drift, and does it REFUSE the push? It refuses nothing, at any drift, on any push:
 * DECISIONS 2026-10-28 item 12 (see the header). `refuse` stays in the verdict because main() routes it into
 * the exit code, so restoring a refusal is one expression here rather than new wiring.
 */
export function driftVerdict(behind, limit = HARD_LIMIT) {
  // `behind === null`: the drift could not be measured (the recorded sha is not in this history). That is not
  // "current", and the report says so, naming the causes; it refuses nothing, like any other drift.
  if (behind === null) return { level: 'unmeasured', refuse: false };
  const { level } = classify(behind, limit);
  return { level, refuse: false };
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
  // Report the DENOMINATOR: a clean tick over a list that silently shrank to zero is the defect this
  // project keeps shipping. The same on every push: nothing below reads which refs a push moves.
  console.log(`artifact-currency: ${all.length} surface(s) tracked (drift is reported, never refused; a missing or unusable source and a false Queued pill refuse)`);

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
      // Left null: driftVerdict names it 'unmeasured', so it reads as unknown in the report, never as current.
    }

    const { level, refuse } = driftVerdict(behind);
    const at = s.url ? `: ${s.url}` : '';
    let report;
    if (level === 'unmeasured') {
      report = [
        `${s.id}: recorded sha ${from} is not in this history, so the drift cannot be measured — reported, not refused.`,
        '  Two causes: a shallow checkout (the CI gates job needs fetch-depth: 0), or a recorded sha that only a lane',
        `  branch held, and that branch was squash-merged and deleted. For the second, republish from main and --sync ${s.id}${at}`,
      ];
    } else if (level === 'current') {
      report = [`✓ ${s.id}: at HEAD (${head})${at}`];
    } else {
      const what = s.kind === 'artifact' ? 'the published page' : 'this page';
      const line = `${s.id}: ${what} is ${behind} commit(s) behind (${s.kind === 'artifact' ? `published ${from}` : `last touched ${from}`}, HEAD ${head})`;
      report = level === 'drifting'
        ? [`${line} — refresh it at session close${at}`]
        : [`${line} — stale, over ${HARD_LIMIT} commits; reported, not refused (DECISIONS 2026-10-28 item 12)${at}`];
    }
    // One decision point: the verdict's `refuse` is the ONLY thing that turns a drift into a failure.
    if (refuse) {
      console.error(`\n✘ ${report.join('\n')}\n`);
      failed = true;
    } else {
      console.log(`  ${level === 'current' ? '' : '· '}${report.join('\n')}`);
    }
  }

  if (failed) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
