#!/usr/bin/env node
/**
 * REGISTRY APPEND-ONLY — a row in `memory/registry.jsonl` is closed, never deleted, and closed is final.
 *
 * `registry-harvest.mjs` checks a tree: every open item the old sources hold has at least one row. It cannot see a row
 * deleted while its key keeps another row (`ACTIVE_PLAN:owed:w3-d-row/b` gone, `/a` still there), and once the old
 * sources leave HEAD (plan row 32) it sees nothing at all. Deletion is a property of a change, so this reads the
 * change. Between the range's BASE and HEAD (the range rules of schema v2, DECISIONS 2026-10-31 (registry v2) item 364):
 *   R1  every row id at the base is still a row id at the head;
 *   R2  a row closed at the base is closed at the head (a regression is a new row with `reopens`);
 *   R3  a row whose content changed moved its `updated`: it fails when the date moved backwards, or stayed where it was
 *       while more than a day older than the head commit's date (a date cannot move twice in a day, item 365);
 *   R4  a row closed at the base that was already v2 there (it has a `kind`) changes nothing but its closure, note,
 *       updated, kind, area, lane and acceptance. A v1 row closed at the base is exempt, so the one migration could
 *       shorten its title to the 160-character cap once (item 365).
 *
 * THE RANGE, in this order:
 *   an argument          `<base>..<head>`, for a hand run
 *   PUSH_RANGES          pre-push exports `<remote sha>..<local sha>` per pushed ref; the one whose head is HEAD
 *   GitHub Actions       change-scope's base for the event: a push's `before`, a pull request's base sha, else the
 *                        merge-base with origin/main
 *   otherwise            the merge-base of HEAD with origin/main (a new branch, which pre-push sends no range for)
 * A base git cannot resolve, or a base that is the head itself (a range of nothing), is printed as COULD NOT CHECK and
 * exits 0, as the trailer checks do: the harvest gate still runs in every unit run, and a push is not blocked over a
 * ref this clone lacks.
 *
 * BLIND SPOTS: only the range's two ends are compared, so a row deleted and restored, or reopened and closed again,
 * inside the range passes; an open row's content may change freely as long as its `updated` moves; a registry absent at
 * the base has no ids to carry, which is printed with its 0.
 *
 *   node scripts/ci/registry-append-only.mjs [<base>..<head>]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { REGISTRY, deepEqual, dayNumber } from './registry-harvest.mjs';
import { candidateBase } from './change-scope.mjs';

/** PURE. Row ids in a registry's text, each with its title. A line that is not JSON with an id is reported, never skipped. */
export function rowIds(text) {
  const ids = new Map();
  const bad = [];
  text.split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    try {
      const row = JSON.parse(line);
      if (typeof row.id === 'string' && row.id) ids.set(row.id, row.title || '');
      else bad.push(i + 1);
    } catch {
      bad.push(i + 1);
    }
  });
  return { ids, bad };
}

/** PURE. The ids at base that HEAD no longer has. `headText` null means the registry is gone at HEAD. */
export function missingIds(baseText, headText) {
  const base = rowIds(baseText);
  const head = rowIds(headText ?? '');
  return {
    baseCount: base.ids.size,
    headCount: head.ids.size,
    badBaseLines: base.bad,
    missing: [...base.ids].filter(([id]) => !head.ids.has(id)).map(([id, title]) => ({ id, title })),
  };
}

/** The fields a v2 row closed at the base may still change: its closure, and what routes or explains it (R4). */
export const CLOSED_MUTABLE = Object.freeze(['resolution', 'closedBy', 'note', 'updated', 'kind', 'area', 'lane', 'acceptance']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function rowsById(text) {
  const rows = new Map();
  for (const line of String(text ?? '').split('\n')) {
    try {
      const row = line.trim() ? JSON.parse(line) : null;
      if (row && typeof row.id === 'string' && row.id) rows.set(row.id, row);
    } catch {
      // rowIds reports the line; this map only compares the rows that parse.
    }
  }
  return rows;
}

/**
 * PURE. R2, R3 and R4 between the registry at a range's two ends. `headDate` is the head commit's YYYY-MM-DD.
 * @returns {{rule: string, id: string, text: string}[]}
 */
export function changeFindings(baseText, headText, { headDate }) {
  if (!DATE.test(String(headDate))) throw new Error('changeFindings needs the head commit\'s YYYY-MM-DD date');
  const head = rowsById(headText);
  const findings = [];
  for (const [id, b] of rowsById(baseText)) {
    const h = head.get(id);
    if (!h) continue;
    const add = (rule, text) => findings.push({ rule, id, text });
    if (b.state === 'closed' && h.state !== 'closed') add('R2', `closed at the base and ${h.state ?? 'stateless'} at the head; closed is final, so a regression is a new row with "reopens": "${id}"`);
    if (deepEqual(b, h)) continue;
    if (!DATE.test(String(h.updated))) add('R3', 'its content changed and it has no YYYY-MM-DD updated');
    else if (DATE.test(String(b.updated)) && h.updated < b.updated) add('R3', `its content changed and updated moved backwards, ${b.updated} to ${h.updated}`);
    else if (h.updated === b.updated && dayNumber(headDate) - dayNumber(h.updated) > 1) add('R3', `its content changed and updated stayed ${h.updated}, more than a day before the head commit's ${headDate}`);
    if (b.state === 'closed' && b.kind !== undefined) {
      // `state` is R2's: a reopen is reported once, as a reopen.
      const frozen = [...new Set([...Object.keys(b), ...Object.keys(h)])].filter((k) => k !== 'state' && !CLOSED_MUTABLE.includes(k) && !deepEqual(b[k], h[k]));
      if (frozen.length) add('R4', `closed at the base, and changed ${frozen.join(', ')}; a closed row changes only ${CLOSED_MUTABLE.join(', ')}`);
    }
  }
  return findings;
}

/**
 * PURE (git is injected: it returns stdout and throws on a non-zero exit). Which base..head this run compares.
 * @returns {{base: string|null, head: string, from: string}}
 */
export function pickRange({ argv = [], env = {}, git, readPayload = () => ({}) }) {
  const mergeBase = () => git(['merge-base', 'HEAD', 'origin/main']).trim();
  const arg = argv.find((a) => a.includes('..'));
  if (arg) {
    const [base, head] = arg.split('..');
    return { base, head: head || 'HEAD', from: 'the range given' };
  }
  if (env.PUSH_RANGES && env.PUSH_RANGES.trim()) {
    const headSha = git(['rev-parse', 'HEAD']).trim();
    for (const r of env.PUSH_RANGES.trim().split(/\s+/)) {
      const [base, head] = r.split('..');
      let sha = '';
      try {
        sha = git(['rev-parse', head]).trim();
      } catch {
        continue;
      }
      if (sha === headSha) return { base, head: 'HEAD', from: 'the pushed range (pre-push)' };
    }
  }
  if (env.GITHUB_EVENT_NAME) {
    const c = candidateBase({ event: env.GITHUB_EVENT_NAME, payload: readPayload(), mergeBase });
    if (c.base) return { base: c.base, head: 'HEAD', from: c.from };
  }
  try {
    return { base: mergeBase(), head: 'HEAD', from: 'the merge-base with origin/main' };
  } catch {
    return { base: null, head: 'HEAD', from: 'no base: no range, no push range, and no origin/main to measure from' };
  }
}

/** The registry's text at a commit, or null when the file does not exist there. */
function registryAt(git, rev) {
  try {
    git(['cat-file', '-e', `${rev}:${REGISTRY}`]);
  } catch {
    return null;
  }
  return git(['show', `${rev}:${REGISTRY}`]);
}

function main() {
  const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 });
  const readPayload = () => {
    try {
      return JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH || '', 'utf8'));
    } catch {
      return {};
    }
  };
  const range = pickRange({ argv: process.argv.slice(2), env: process.env, git, readPayload });
  let baseSha;
  let headSha;
  try {
    if (!range.base) throw new Error(range.from);
    baseSha = git(['rev-parse', '--verify', `${range.base}^{commit}`]).trim();
    headSha = git(['rev-parse', '--verify', `${range.head}^{commit}`]).trim();
  } catch (e) {
    console.log(`registry-append-only: COULD NOT CHECK, 0 row ids compared (${String(e.message || e).split('\n')[0]})`);
    return;
  }
  if (baseSha === headSha) {
    console.log(`registry-append-only: COULD NOT CHECK, no range: the base (${range.from}) is the head ${headSha.slice(0, 8)}, so 0 row ids compared`);
    return;
  }
  console.log(`registry-append-only: base ${baseSha.slice(0, 8)} (${range.from}) .. head ${headSha.slice(0, 8)}`);
  const baseText = registryAt(git, baseSha);
  if (baseText === null) {
    console.log(`✓ registry-append-only: 0 row ids at base; ${REGISTRY} did not exist at ${baseSha.slice(0, 8)}, so no row can have been deleted`);
    return;
  }
  const headText = registryAt(git, headSha);
  const r = missingIds(baseText, headText);
  console.log(`  ${r.baseCount} row ids at base, ${r.headCount} at head`);
  if (r.badBaseLines.length) {
    console.error(`✖ registry-append-only: ${REGISTRY} at base has lines with no readable id (${r.badBaseLines.join(', ')}), so the comparison is incomplete`);
    process.exit(1);
  }
  if (r.baseCount === 0) {
    console.error(`✖ registry-append-only: ${REGISTRY} exists at base with 0 rows; a check over nothing is not a pass`);
    process.exit(1);
  }
  if (r.missing.length) {
    console.error(`\n✖ registry-append-only: ${r.missing.length} of ${r.baseCount} row id(s) at base are gone at head`);
    for (const m of r.missing) console.error(`  • ${m.id}  ${m.title.slice(0, 100)}`);
    console.error(
      '\nA row is closed, never deleted: restore it and set "state": "closed" with closedBy (the commit, decision or document' +
        ' that closed it). To split a row, close it with closedBy naming the rows that replace it.',
    );
    process.exit(1);
  }
  const headDate = git(['show', '-s', '--format=%cs', headSha]).trim();
  const changed = changeFindings(baseText, headText, { headDate });
  const count = (rule) => changed.filter((f) => f.rule === rule).length;
  console.log(`  R2 reopened ${count('R2')}, R3 changed without moving updated ${count('R3')}, R4 closed rows changed outside their closure ${count('R4')}`);
  if (changed.length) {
    console.error(`\n✖ registry-append-only: ${changed.length} row change(s) the range rules refuse`);
    for (const f of changed) console.error(`  • ${f.rule} ${f.id}: ${f.text}`);
    console.error('\nThe rules: .claude/rules/registry.md ("Closing a row").');
    process.exit(1);
  }
  console.log(`✓ registry-append-only: all ${r.baseCount} row ids at base are still rows at head; none reopened; every changed row moved its updated; no closed row changed outside its closure`);
}

if (import.meta.main) main();
