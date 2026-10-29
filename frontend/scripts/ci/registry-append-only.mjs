#!/usr/bin/env node
/**
 * REGISTRY APPEND-ONLY — a row in `memory/registry.jsonl` is closed, never deleted.
 *
 * `registry-harvest.mjs` checks a tree: every open item the old sources hold has at least one row. It cannot see a row
 * deleted while its key keeps another row (`ACTIVE_PLAN:owed:w3-d-row/b` gone, `/a` still there), and once the old
 * sources leave HEAD (plan row 32) it sees nothing at all. Deletion is a property of a change, so this reads the
 * change: every row id in the registry at the range's BASE must still be a row id at its HEAD.
 *
 * THE RANGE, in this order:
 *   an argument          `<base>..<head>`, for a hand run
 *   PUSH_RANGES          pre-push exports `<remote sha>..<local sha>` per pushed ref; the one whose head is HEAD
 *   GitHub Actions       change-scope's base for the event: a push's `before`, a pull request's base sha, else the
 *                        merge-base with origin/main
 *   otherwise            the merge-base of HEAD with origin/main (a new branch, which pre-push sends no range for)
 * A base git cannot resolve is printed as COULD NOT CHECK and exits 0, as the trailer checks do: the harvest gate still
 * runs in every unit run, and a push is not blocked over a ref this clone lacks.
 *
 * BLIND SPOTS: only the range's two ends are compared, so a row deleted and restored inside the range passes; a row's
 * content is not compared, so reopening, retitling or re-owning a row passes; a registry absent at the base has no ids
 * to carry, which is printed with its 0.
 *
 *   node scripts/ci/registry-append-only.mjs [<base>..<head>]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { REGISTRY } from './registry-harvest.mjs';
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
  console.log(`registry-append-only: base ${baseSha.slice(0, 8)} (${range.from}) .. head ${headSha.slice(0, 8)}`);
  const baseText = registryAt(git, baseSha);
  if (baseText === null) {
    console.log(`✓ registry-append-only: 0 row ids at base; ${REGISTRY} did not exist at ${baseSha.slice(0, 8)}, so no row can have been deleted`);
    return;
  }
  const r = missingIds(baseText, registryAt(git, headSha));
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
  console.log(`✓ registry-append-only: all ${r.baseCount} row ids at base are still rows at head`);
}

if (import.meta.main) main();
