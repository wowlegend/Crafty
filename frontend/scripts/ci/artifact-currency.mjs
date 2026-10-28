#!/usr/bin/env node
/**
 * ARTIFACT CURRENCY — reports how far each operator page is behind HEAD, and refuses only the defects a
 * committed tree can carry.
 *
 * WHAT IT DOES (DECISIONS 2026-10-28 item 12):
 *   - DRIFT IS REPORTED, NEVER REFUSED. Every surface prints how many commits its page is behind HEAD, with
 *     the page's URL, on every push. A drift this script cannot measure (the recorded sha is not in
 *     this history) prints as well, naming its two causes. Neither changes the exit code, on any push.
 *   - THREE TREE DEFECTS STILL REFUSE, on every push: a page source that is missing or unusable (a fetched copy
 *     of the publish wrapper rather than the authored page); a row marked Queued whose declared `data-absent`
 *     path EXISTS, or that declares none; and, for a page that declares `stampTokens`, an as-of stamp that is
 *     missing, duplicated, or names a different commit from the recorded publish (`syncedSha`). All three are
 *     wrong in the committed tree, and any branch can fix them.
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
 * WHERE IT RUNS: the push tier of ci/pipeline.sh, which pre-push runs on every local push. CI does not run it: a
 * landing is a local merge pushed through that hook. A merge made on GitHub runs no hook, so nothing checks the pages
 * it brings in.
 *
 * Mutation-Proof: 2026-10-28 (item 12), each via scripts/dev/mutate.sh against both specs below. Restoring a
 * drift refusal in driftVerdict (`refuse: false` -> `refuse: level === 'stale'`) turned the pure verdict test
 * and the process over-limit cases RED; the unmeasured `refuse: false` -> `refuse: true` turned the pure test and
 * the process unmeasured cases RED; main() refusing a stale drift whatever the verdict (`if (refuse)` ->
 * `if (refuse || level === 'stale')`) turned the process over-limit cases RED (the pure test cannot see it).
 * Dropping `failed = true` from the missing-source, unusable-source, Queued-EXISTS and undeclared-Queued
 * branches each turned its process case RED, and skipping the missing-source check when the push names a
 * feat/ branch turned that case RED. Dropping the URL from the drift line turned the URL assertions RED. An
 * identity comment edit survived both specs. The stamp check (2026-10-28, round-1 review): skipping it, dropping its
 * `failed = true`, running it on every artifact rather than those declaring stampTokens, dropping its mismatch branch,
 * and refusing a page with no publish recorded each turned process cases RED; the mismatch branch dropped, the
 * no-publish relaxation dropped, a prefix match for equality and a stampless page accepted each turned the pure
 * stampVerdict cases RED. Specs: tests/gates/artifact-currency-gates.test.js (pure) and
 * tests/scripts/artifact-currency-scope.test.js (this script run as a process). What its process cases do and do not
 * reach: a tree defect is pushed through the real pre-push hook over a STUB pipeline that runs only this script, and
 * the real ci/pipeline.sh is run only with node and npm stubbed to exit 0, so which push runs this step is pinned but
 * a pipeline that swallowed this step's failure is not (no spec runs the real pipeline over a failing step). The
 * receipts for the earlier main-only scope (2026-10-27/28) are in git history.
 *
 * THE PAGES STATE THEIR OWN AGE (item 12, the reader's half). `--stamp` writes one generated line at the top of each
 * page's visible content, between `<!-- asof:begin -->` and `<!-- asof:end -->`: "As of commit <sha>, <YYYY-MM-DD
 * HH:MM> UTC.", plus, for a surface that declares `currentStatus`, a pointer to the page that carries current status.
 * The sha is the commit the page's text was WRITTEN AGAINST (`--as-of <sha>`, default HEAD), and the time is that
 * commit's COMMITTER time, never the wall clock, so stamping the same commit twice writes the same bytes. The line is
 * styled only with the page's own tokens, named per surface in `stampTokens`, and refused if the page does not
 * declare them. Re-stamping replaces the line and never duplicates it; the rest of the page stays byte-identical.
 *
 * TWO STEPS, because publishing happens between them and can wait (a page owned by another claude.ai account waits
 * until that account is active). `--stamp` writes the page and nothing else. `--sync` runs AFTER the publish and
 * records the sha as published. WHAT IT CAN SEE: the stamp in the COMMITTED SOURCE, never the published page (no
 * hook can read a claude.ai page). It refuses unless that stamp names the `--as-of` commit, so the record is honest
 * ONLY IF the documented order was followed. Nothing here sees whether the stamped source was ever published:
 * `--stamp` then `--sync` with no publish between them records a sha the published page does not carry, and the
 * push-time check then passes it, because the record and the source's stamp agree by construction. What that check
 * does catch is narrower: a `syncedSha` edited by hand without its page, or a page edited without its record.
 * Recording before publishing would make every later drift line understate how old the page the operator reads is.
 * So the ORDER is: refresh the source, `--stamp <id>`, publish the stamped source to the SAME url, `--sync <id>`,
 * commit the source with the state file. The stamp travels with the content, so even a copy left stale says how old
 * it is. While a publish waits, do not commit a re-stamped page: a stamp that is ahead of the record refuses every
 * push until `--sync` runs (stampVerdict). Hold the refresh uncommitted, or commit it still carrying the recorded
 * stamp and `--stamp` again just before publishing.
 *
 * Mutation-Proof (the stamp and the two steps, 2026-10-28): listed in tests/gates/artifact-currency-gates.test.js
 * (pure) and tests/scripts/artifact-currency-scope.test.js (the --stamp and --sync process cases).
 *
 *   node scripts/ci/artifact-currency.mjs                               check: report every surface's drift; refuse
 *                                                                       the tree defects
 *   node scripts/ci/artifact-currency.mjs --stamp [id] [--as-of <sha>]  write the as-of stamp into the page(s); the
 *                                                                       state file is not touched
 *   node scripts/ci/artifact-currency.mjs --sync [id] [--as-of <sha>]   AFTER publishing: record the sha as published,
 *                                                                       only if the page's stamp names it
 * With no id, every artifact surface; `--as-of` defaults to HEAD.
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
 *   kind 'page'     — a committed page nobody publishes (none is tracked since LOOP-PROGRESS.html was archived
 *                     on 2026-10-28; the kind stays supported, and pinned by the gates spec). Drift is measured from the
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
 * A rule that has failed repeatedly does not get better by being restated (CLAUDE.md says exactly this).
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

/**
 * THE READER-SIDE STAMP (DECISIONS 2026-10-28 item 12). The question the operator asked about these pages was
 * whether what he READS is current, so each page states its own age at the top of its visible content, in one
 * generated line between two marker comments. `--stamp` writes it; nothing else does, and nobody types it.
 */
export const STAMP_BEGIN = '<!-- asof:begin -->';
export const STAMP_END = '<!-- asof:end -->';
/** The four roles the stamp is styled by. Each surface names, in `stampTokens`, which of ITS OWN tokens fills each. */
export const STAMP_ROLES = ['text', 'rule', 'link', 'font'];

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * PURE: the stamp block, markers included. `when` is a Date, printed in UTC to the minute. `currentStatus`
 * ({label, url}) is for a page that is mostly history: it adds the pointer to the page that carries current status.
 * Styled only through `var(<the page's token>)`, so it follows the page's theme, dark mode included.
 */
export function stampBlock({ sha, when, tokens, currentStatus }) {
  const iso = when.toISOString();
  const at = `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
  let text = `As of commit ${escapeHtml(sha)}, ${at} UTC.`;
  if (currentStatus) {
    text += ` Most of this page is history; current status: <a href="${escapeHtml(currentStatus.url)}" style="color:var(${tokens.link})">${escapeHtml(currentStatus.label)}</a>.`;
  }
  const style = `margin:0 0 14px;padding:6px 0;border-bottom:1px solid var(${tokens.rule});`
    + `color:var(${tokens.text});font-family:var(${tokens.font});font-size:12px;line-height:1.5`;
  return `${STAMP_BEGIN}<p data-asof style="${style}">${text}</p>${STAMP_END}`;
}

/**
 * PURE: which of the stamp's roles name a token the page does not DECLARE (`--name:` in its CSS). A stamp styled
 * with a token the page lacks renders in browser defaults, which is the failure "styled with the page's tokens"
 * exists to rule out; so a missing or undeclared role refuses the sync rather than shipping an unstyled line.
 */
export function missingTokens(html, tokens) {
  return STAMP_ROLES.filter((role) => {
    const t = tokens && tokens[role];
    if (typeof t !== 'string' || !/^--[\w-]+$/.test(t)) return true;
    // Bounded on the left, so `--a--x:` does not declare `--x`; the colon bounds it on the right (`--t-x:` is not `--t`).
    return !new RegExp(`(?<![\\w-])${t}\\s*:`).test(html);
  });
}

/**
 * PURE: put `block` at the top of the page's visible content, or replace the stamp already there. Everything outside
 * the markers stays byte-identical. The first stamp goes right after the content wrapper's opening tag
 * (`<div class="wrap">`, which every operator page opens with; `<body>` only for a page with no wrapper), on its own
 * line.
 * @returns {{html: string} | {error: string}}
 */
export function applyStamp(html, block) {
  const b = html.indexOf(STAMP_BEGIN);
  if (b !== -1) {
    if (html.indexOf(STAMP_BEGIN, b + STAMP_BEGIN.length) !== -1) return { error: `more than one ${STAMP_BEGIN} marker` };
    const e = html.indexOf(STAMP_END, b);
    if (e === -1) return { error: `a ${STAMP_BEGIN} marker with no ${STAMP_END}` };
    return { html: html.slice(0, b) + block + html.slice(e + STAMP_END.length) };
  }
  if (html.includes(STAMP_END)) return { error: `a ${STAMP_END} marker with no ${STAMP_BEGIN}` };
  // The wrapper FIRST, wherever it sits, and `<body>` only when there is none: one alternation would take whichever
  // comes first in the file, and a page that opens `<body>` and then its wrapper would get the stamp outside the
  // content column.
  const m = /<div class="wrap"[^>]*>/.exec(html) || /<body[^>]*>/.exec(html);
  if (!m) return { error: 'no content wrapper (<div class="wrap"> or <body>) to put the stamp under' };
  const at = m.index + m[0].length;
  return { html: `${html.slice(0, at)}\n${block}${html.slice(at)}` };
}

/**
 * PURE: the commit a page's stamp names. Exactly one begin marker, exactly one end marker after it, and a commit in
 * between; anything else is an error, never a guess, because `--sync` and the push-time check both trust this value.
 * @returns {{sha: string} | {error: string}}
 */
export function readStamp(html) {
  const begins = html.split(STAMP_BEGIN).length - 1;
  const ends = html.split(STAMP_END).length - 1;
  if (begins === 0 && ends === 0) return { error: 'has no as-of stamp' };
  if (begins !== 1 || ends !== 1) return { error: `has ${begins} ${STAMP_BEGIN} and ${ends} ${STAMP_END} markers, not one of each` };
  const b = html.indexOf(STAMP_BEGIN);
  const e = html.indexOf(STAMP_END);
  if (e < b) return { error: `has its ${STAMP_END} marker before its ${STAMP_BEGIN}` };
  const m = /As of commit ([0-9a-f]{4,40}),/.exec(html.slice(b, e));
  if (!m) return { error: 'has an as-of stamp that names no commit' };
  return { sha: m[1] };
}

/**
 * PURE: does the page's stamp agree with the recorded publish? Checked on every push for a surface that declares
 * `stampTokens`: exactly one stamp, and, once a publish is recorded, a stamp naming that same sha. Compared as TEXT,
 * because `--sync` records the stamp's own text, so an honest sync makes them equal by construction. A mismatch is a
 * tree defect in the class of the falsified Queued pill: the page and the record disagree about what was published,
 * which is how a hand-bumped sha used to lie. With no publish recorded yet there is nothing for the stamp to
 * contradict, so only its presence is required (the report says no publish is recorded).
 * @returns {{ok: true, sha: string} | {ok: false, problem: string, fix: string}}
 */
export function stampVerdict(html, syncedSha) {
  const st = readStamp(html);
  if (st.error) return { ok: false, problem: st.error, fix: 'A page that declares stampTokens carries exactly one: run --stamp <id> --as-of <the commit it was written against>.' };
  if (syncedSha && st.sha !== syncedSha) {
    return {
      ok: false,
      problem: `has a stamp naming ${st.sha}, but .artifact-sync.json records ${syncedSha} as published`,
      fix: `If the page stamped ${st.sha} was published, record it: --sync <id> --as-of ${st.sha}. If the record is right, re-stamp: --stamp <id> --as-of ${syncedSha}.`,
    };
  }
  return { ok: true, sha: st.sha };
}

/** The value after `flag` on the command line; undefined when the flag is absent or the next word is another flag. */
function argAfter(flag) {
  const i = process.argv.indexOf(flag);
  const v = i === -1 ? undefined : process.argv[i + 1];
  return v && !v.startsWith('-') ? v : undefined;
}

/** `ref` as a commit in this history, {full, short}; null when it is not one. */
function resolveCommit(ref) {
  try {
    const full = execFileSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return full ? { full, short: git('rev-parse', '--short', full) } : null;
  } catch {
    return null;
  }
}

/** The commit's COMMITTER time, so a stamp of the same commit is the same bytes on every run. */
const committedAt = (full) => new Date(Number(git('log', '-1', '--format=%ct', full)) * 1000);

function fail(mode, problems, consequence) {
  for (const p of problems) console.error(`✘ artifact-currency ${mode}: ${p}`);
  console.error(`  ${consequence}`);
  process.exit(1);
}

/** The artifact surfaces `--stamp [id]` / `--sync [id]` act on, and the `--as-of` commit (default HEAD). */
function writeTargets(mode, all) {
  // Only 'artifact' surfaces are published, so only they carry a stamp and a recorded sha.
  const which = argAfter(mode);
  const targets = all.filter((s) => s.kind === 'artifact' && (!which || s.id === which));
  if (!targets.length) fail(mode, [`no artifact surface matching ${which || '(any)'}`], 'Nothing was written.');
  const ref = process.argv.includes('--as-of') ? argAfter('--as-of') : 'HEAD';
  const asOf = ref && resolveCommit(ref);
  if (!asOf) fail(mode, [`--as-of ${ref || '(no value)'} is not a commit in this history`], 'Nothing was written.');
  return { targets, asOf, head: resolveCommit('HEAD') };
}

/**
 * `--stamp`: write each target page's as-of stamp, and nothing else. Every target is stamped in memory FIRST and
 * nothing is written unless all of them stamp: a run that stamped one page and failed on the next would leave the
 * pages telling different stories about one publish.
 */
function stampPages(all) {
  const { targets, asOf, head } = writeTargets('--stamp', all);
  const when = committedAt(asOf.full);
  const stamped = [];
  const problems = [];
  for (const t of targets) {
    const src = join(ROOT, t.source);
    if (!existsSync(src)) { problems.push(`${t.id}: ${t.source} is missing`); continue; }
    const html = readFileSync(src, 'utf8');
    const missing = missingTokens(html, t.stampTokens);
    if (missing.length) {
      problems.push(`${t.id}: stampTokens in .artifact-sync.json must name a token ${t.source} declares, for: ${missing.join(', ')}`);
      continue;
    }
    const r = applyStamp(html, stampBlock({ sha: asOf.short, when, tokens: t.stampTokens, currentStatus: t.currentStatus }));
    if (r.error) { problems.push(`${t.id}: ${t.source} has ${r.error}`); continue; }
    stamped.push({ src, html: r.html });
  }
  if (problems.length) fail('--stamp', problems, 'Nothing was written: no page stamped.');
  for (const { src, html } of stamped) writeFileSync(src, html);
  const ids = targets.map((t) => t.id);
  const asOfFlag = asOf.full === head.full ? '' : ` --as-of ${asOf.short}`;
  console.log(`artifact-currency: stamped ${ids.join(', ')} as of ${asOf.short} (that commit's time). The state file is unchanged.`);
  console.log(`  Next: publish each stamped source to its SAME url, then run --sync ${ids.length === 1 ? ids[0] : '<id>'}${asOfFlag}, then commit the sources with the state file.`);
}

/**
 * `--sync`: AFTER a publish, record the sha as published. It refuses unless each page's stamp names the `--as-of`
 * commit, so the state file records what the committed source's stamp says; it cannot read the published page, so
 * that this is also what was published rests on the operator having published that source first (see the header).
 * Like `--stamp`, it records nothing unless every target passes. The recorded sha is the stamp's own text, which is
 * what the push-time check compares it with.
 */
function syncPublished(state, all) {
  const { targets, asOf } = writeTargets('--sync', all);
  const recorded = [];
  const problems = [];
  for (const t of targets) {
    const src = join(ROOT, t.source);
    if (!existsSync(src)) { problems.push(`${t.id}: ${t.source} is missing`); continue; }
    const st = readStamp(readFileSync(src, 'utf8'));
    if (st.error) { problems.push(`${t.id}: ${t.source} ${st.error}. Run --stamp ${t.id} and publish the stamped source first.`); continue; }
    const named = resolveCommit(st.sha);
    if (!named || named.full !== asOf.full) {
      problems.push(`${t.id}: the page's stamp names ${st.sha}, not ${asOf.short}. The source's stamp says it is as of ${st.sha}; `
        + `if that stamped source is what you published, record it (--as-of ${st.sha}); otherwise re-stamp at ${asOf.short}, publish, then --sync.`);
      continue;
    }
    recorded.push({ id: t.id, sha: st.sha });
  }
  if (problems.length) fail('--sync', problems, 'Nothing was recorded: the state file is unchanged.');
  const next = JSON.parse(JSON.stringify(state));
  const list = Array.isArray(next.surfaces) ? next.surfaces : [next];
  const today = new Date().toISOString().slice(0, 10);
  for (const { id, sha } of recorded) {
    const row = list.find((r) => (r.id || r.source) === id);
    if (row) { row.syncedSha = sha; row.syncedAt = today; }
  }
  writeFileSync(STATE, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`artifact-currency: recorded ${recorded.map((r) => `${r.id} as published at ${r.sha}`).join(', ')}`);
  console.log('  Now commit the sources with the state file.');
}

function main() {
  const state = readState();
  const all = surfaces(state);

  if (process.argv.includes('--stamp') && process.argv.includes('--sync')) {
    fail('--stamp/--sync', ['--stamp and --sync are separate steps, with the publish between them: run one at a time'], 'Nothing was written.');
  }
  if (process.argv.includes('--stamp')) return stampPages(all);
  if (process.argv.includes('--sync')) return syncPublished(state, all);

  const head = git('rev-parse', '--short', 'HEAD');

  if (!all.length) {
    console.log('artifact-currency: no surfaces configured — nothing to check');
    return;
  }

  let failed = false;
  // Report the DENOMINATOR: a clean tick over a list that silently shrank to zero is the defect this
  // project keeps shipping. The same on every push: nothing below reads which refs a push moves.
  console.log(`artifact-currency: ${all.length} surface(s) tracked (drift is reported, never refused; a missing or unusable source, a false Queued pill, and a missing stamp or one that disagrees with the recorded publish refuse)`);

  for (const s of all) {
    const src = join(ROOT, s.source);
    if (!existsSync(src)) {
      console.error(`\n✘ artifact-currency: ${s.source} is missing — the page source must be COMMITTED,`);
      console.error('  not left in a session scratchpad (that is how it was lost the first time).\n');
      failed = true;
      continue;
    }
    const html = readFileSync(src, 'utf8');
    // Guard this script's own input before trusting the drift number — artifact sources only.
    if (s.kind === 'artifact') {
      const bad = validateSource(html);
      if (bad) {
        console.error(`\n✘ artifact-currency: ${s.source} is ${bad}`);
        console.error('  A drift count over an unusable source would be a number about nothing.\n');
        failed = true;
        continue;
      }
    }

    // The as-of stamp, for a published page that declares stampTokens (see stampVerdict): the drift below is measured
    // from syncedSha, so a page whose stamp disagrees with it makes that number, and the record, a claim about a page
    // nobody published.
    if (s.kind === 'artifact' && s.stampTokens) {
      const v = stampVerdict(html, s.syncedSha);
      if (!v.ok) {
        console.error(`\n✘ ${s.id}: ${s.source} ${v.problem}.`);
        console.error(`  ${v.fix}`);
        failed = true;
      } else {
        console.log(`  · ${s.id}: stamped as of ${v.sha}${s.syncedSha ? ', the recorded publish' : '; no publish recorded yet'}`);
      }
    }

    // Verdict pills are checked BEFORE the drift number, because a page at HEAD that says "Queued" about
    // finished work is wrong in the way that actually reaches the operator — and a zero-drift page would
    // otherwise print `✓ at HEAD` and stop, which is how this was missed.
    const claims = queuedClaims(html);
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
      console.log(`· ${s.id}: no publish recorded — --stamp ${s.id}, publish the stamped source, then --sync ${s.id}`);
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
        '  Two causes: a shallow checkout (fetch the full history), or a recorded sha that only a lane',
        `  branch held, and that branch was squash-merged and deleted. For the second, from main: --stamp ${s.id}, republish, then --sync ${s.id}${at}`,
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
