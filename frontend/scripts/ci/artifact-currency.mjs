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
 *   node scripts/ci/artifact-currency.mjs          check (informational under the limit, fails over it)
 *   node scripts/ci/artifact-currency.mjs --sync   record HEAD as the published sha (run AFTER publishing)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  // project keeps shipping.
  console.log(`artifact-currency: ${all.length} surface(s) tracked`);

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

    let behind;
    try {
      behind = Number(git('rev-list', '--count', `${from}..HEAD`));
    } catch {
      console.log(`· ${s.id}: recorded sha ${from} is not in this history — skipping`);
      continue;
    }

    const { level, ok } = classify(behind);
    if (level === 'current') {
      console.log(`  ✓ ${s.id}: at HEAD (${head})`);
      continue;
    }
    const what = s.kind === 'artifact' ? 'the published page' : 'this page';
    const line = `${s.id}: ${what} is ${behind} commit(s) behind (${s.kind === 'artifact' ? `published ${from}` : `last touched ${from}`}, HEAD ${head})`;
    if (ok) {
      console.log(`  · ${line} — refresh it at session close${s.url ? `: ${s.url}` : ''}`);
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
