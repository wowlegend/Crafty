#!/usr/bin/env node
/**
 * DOC-CURRENCY LINT — mechanical enforcement that the docs still describe reality.
 *
 * WHY (LOOP-CHARTER §0-B.6): this repo carries 142 docs / ~44k lines. An agent cannot read them all, and a
 * STALE DOC IS A LIVE TRAP: on 2026-07-13 a single stale line in LOOP-CHARTER ("@react-three/test-renderer —
 * approved + landed") caused an agent to propose a week-sized campaign to "wire the installed E2E substrate"
 * for a package that had been REMOVED months earlier. Doc rot is not cosmetic; it manufactures dead work.
 *
 * OpenAI's harness-engineering answer to exactly this is to enforce the knowledge base MECHANICALLY
 * (linters + CI + a doc-gardening pass) rather than trusting anyone to remember. This is that lint.
 *
 * It is deliberately DETERMINISTIC and narrow — it only asserts things that are objectively checkable:
 *   1. DANGLING LINKS   — a canonical doc points at a repo file that does not exist (catches renames/moves).
 *   2. PACKAGE CLAIMS   — a doc claims a package is installed/landed when package.json says otherwise.
 *   3. STATUS INTEGRITY — memory/STATUS.md exists and still carries its load-bearing sections.
 *
 * It does NOT try to judge prose staleness with an LLM. A lint that can be argued with is a lint that gets
 * ignored.
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { measure, parseBlock, TOLERANCE, LARGE_FILE_LOC } from './measure.mjs';

import { DOC_ALIASES, sectionIds, unresolved } from './doc-anchors.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..'); // frontend/scripts/ci -> repo root
const PKG = JSON.parse(readFileSync(join(ROOT, 'frontend/package.json'), 'utf8'));
const DEPS = { ...(PKG.dependencies || {}), ...(PKG.devDependencies || {}) };

// The docs an agent is actually told to trust. Rot here is what causes damage; rot in a shipped 2026-06-03
// plan doc is just history.
const CANONICAL = [
  'memory/STATUS.md',
  'memory/ACTIVE_PLAN.md',
  'memory/ARCHITECTURE.md',
  'docs/superpowers/LOOP-CHARTER.md',
  'docs/superpowers/LOOP-KERNEL-PROMPT.md',
  'docs/superpowers/INDEX.md',
  'SOTA-INITIATIVE.md',
  'README.md',
  '.agent/AGENTS.md',
];

// Packages whose presence docs have historically LIED about. If a canonical doc asserts one of these is
// installed/landed/added and it is not in package.json, that is the trap — fail.
const CLAIM_VERBS = /(installed|landed|added|approved \+ landed|is wired|now available)/i;
const WATCHED_PACKAGES = ['@react-three/test-renderer', '@playwright/test', 'knip', 'puppeteer'];

const errors = [];
const warnings = [];

// --- 1. DANGLING LINKS ------------------------------------------------------
// Match markdown links + inline-code paths that look repo-relative.
const LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g;
const CODEPATH_RE = /`((?:memory|docs|frontend|src|\.agent|scripts|tests)\/[A-Za-z0-9._\-/]+\.[a-z]{2,5})`/g;
// BARE paths — not in backticks, not a markdown link. This repo's prose is full of them:
//   "(plan docs/superpowers/plans/2026-06-14-crafty-ocean-coast.md, 4 slices)"
// and until 2026-08-02 the lint could not see a single one. Archiving that very file left ARCHITECTURE.md
// pointing at a path that no longer existed and doc-currency reported "✓ PASSED (9 canonical docs
// checked)" — a clean bill of health over text it never examined, which is the failure mode this lint
// exists to prevent in the DOCS. INDEX.md even asserted that moving such a file "trips doc-currency";
// it did not, and that false confidence is what made the hole worth closing rather than noting.
const BAREPATH_RE = /(?<![`(\w/.-])((?:memory|docs|frontend|src|\.agent|scripts|tests)\/[A-Za-z0-9._\-/]+\.[a-z]{2,5})/g;

for (const rel of CANONICAL) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) {
    errors.push(`MISSING CANONICAL DOC: ${rel}`);
    continue;
  }
  const src = readFileSync(abs, 'utf8');
  const seen = new Set();

  // Some docs deliberately cite a WRONG path as a cautionary example (e.g. AGENTS.md warns that
  // `memory/SOTA-INITIATIVE.md` is the classic false-absence mistake — "it's at root"). Flagging those
  // would be the lint failing to read English. Skip lines that are explicitly calling a path wrong.
  const NEGATED = /\b(a wrong|wrong|incorrect|is at root|not at|does not exist|false-absence|used to be|REMOVED)\b/i;
  const lineOf = (idx) => src.slice(0, idx).split('\n').length - 1;
  const srcLines = src.split('\n');

  const check = (target, kind, atIndex) => {
    if (seen.has(target)) return;
    seen.add(target);
    if (/^(https?:|mailto:|#)/.test(target)) return; // external / anchor
    if (atIndex != null && NEGATED.test(srcLines[lineOf(atIndex)] || '')) return;
    const clean = target.split('#')[0].trim();
    if (!clean) return;
    if (/[*?<>|]/.test(clean)) return; // globs/placeholders, not real paths
    // TWO-LEVEL REPO: docs live at the ROOT but habitually write app paths as `src/...` / `tests/...`,
    // meaning `frontend/src/...`. Resolve against all three roots before calling a path dangling —
    // otherwise this lint emits 36 false positives on its first run, and a noisy gate gets disabled,
    // which is strictly worse than no gate at all.
    const candidates = [
      resolve(dirname(abs), clean), // relative to the doc
      join(ROOT, clean), // repo root
      join(ROOT, 'frontend', clean), // the app dir (the two-level trap)
    ];
    if (!candidates.some(existsSync)) {
      errors.push(`DANGLING ${kind} in ${rel}: "${clean}" does not exist`);
    }
  };

  let m;
  while ((m = LINK_RE.exec(src))) check(m[1], 'link', m.index);
  while ((m = CODEPATH_RE.exec(src))) check(m[1], 'path', m.index);
  while ((m = BAREPATH_RE.exec(src))) check(m[1], 'bare path', m.index);
}

// --- 2. PACKAGE CLAIMS ------------------------------------------------------
for (const rel of CANONICAL) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) continue;
  const lines = readFileSync(abs, 'utf8').split('\n');

  lines.forEach((line, i) => {
    for (const pkg of WATCHED_PACKAGES) {
      if (!line.includes(pkg)) continue;
      if (!CLAIM_VERBS.test(line)) continue;
      // A line that explicitly documents the REMOVAL/correction is fine — that is the fix, not the rot.
      if (/\b(REMOVED|removed|NOT in|not in|absent|was a LIVE TRAP|CORRECTED|no longer)\b/.test(line)) continue;
      const installed = Object.prototype.hasOwnProperty.call(DEPS, pkg);
      if (!installed) {
        errors.push(
          `STALE PACKAGE CLAIM in ${rel}:${i + 1} — claims "${pkg}" is installed/landed, ` +
            `but it is NOT in frontend/package.json.`,
        );
      }
    }
  });
}

// --- 3. STATUS INTEGRITY ----------------------------------------------------
const statusRel = 'memory/STATUS.md';
const statusAbs = join(ROOT, statusRel);
if (existsSync(statusAbs)) {
  const status = readFileSync(statusAbs, 'utf8');
  const REQUIRED = [
    { re: /single source of truth/i, what: 'the source-of-truth declaration' },
    { re: /##\s*2\.\s*THE REGISTRY/i, what: 'the §2 REGISTRY (the loop’s definition of done)' },
    { re: /##\s*3\.\s*What.s next/i, what: 'the §3 cursor' },
    { re: /\[LOOP\]/, what: 'at least one [LOOP]-tagged item' },
    { re: /\[KEVIN\]|KEVIN-ONLY/, what: 'the KEVIN-only partition' },
  ];
  for (const { re, what } of REQUIRED) {
    if (!re.test(status)) errors.push(`STATUS.md has lost ${what} — it is the source of truth; keep it whole.`);
  }
  // Soft signal: STATUS should not go stale relative to shipped code.
  const ageDays = (Date.now() - statSync(statusAbs).mtimeMs) / 86_400_000;
  if (ageDays > 14) {
    warnings.push(`STATUS.md has not been touched in ${ageDays.toFixed(0)} days — is the registry still true?`);
  }
}

// --- 4. MEASURED BLOCK CURRENCY ---------------------------------------------
// `.agent/AGENTS.md` carries a generated size block. A number in a doc that is re-read every iteration is a
// CLAIM, and this one rotted badly before it was generated: the hand-typed version said "~14.4k LOC / ~31
// JS(X) files" against a real 30,022 / 264, and asserted a single large file when five are >= 900 LOC.
//
// THE COUNTS GET A TOLERANCE BAND ON PURPOSE. LOC moves on nearly every commit, so an exact-match check
// would redden the push constantly and be switched off within a day — the same reasoning that made the i18n
// gate a ratchet rather than a zero-target. What this defends against is MATERIAL drift, and being 12x wrong
// clears a 10% band by a mile.
//
// The large-file LIST is checked EXACTLY, not by tolerance: it is short, slow-moving, was the most-wrong
// claim of the three, and its membership is precisely what de-monolith decisions get made from.
{
  const agentsRel = '.agent/AGENTS.md';
  const md = readFileSync(join(ROOT, agentsRel), 'utf8');
  const claimed = parseBlock(md);
  const regen = 'node frontend/scripts/ci/measure.mjs --write';
  if (!claimed) {
    errors.push(`${agentsRel}: MEASURED block missing or unparseable — regenerate: ${regen}`);
  } else {
    const actual = measure();
    const drift = (a, b) => Math.abs(a - b) / Math.max(b, 1);
    for (const [label, got, want] of [
      ['source files', claimed.srcFiles, actual.srcFiles],
      ['source LOC', claimed.srcLoc, actual.srcLoc],
    ]) {
      if (drift(got, want) > TOLERANCE) {
        errors.push(
          `${agentsRel}: MEASURED ${label} says ${got.toLocaleString('en-US')}, actual ` +
            `${want.toLocaleString('en-US')} (${(drift(got, want) * 100).toFixed(0)}% drift, band ` +
            `${Math.round(TOLERANCE * 100)}%) — regenerate: ${regen}`,
        );
      }
    }
    const key = (l) => l.map((f) => f.file).sort().join(', ');
    if (key(claimed.largeFiles) !== key(actual.largeFiles)) {
      errors.push(
        `${agentsRel}: the >=${LARGE_FILE_LOC}-LOC file list is wrong.\n` +
          `    doc says: ${key(claimed.largeFiles) || '(none)'}\n` +
          `    actual:   ${key(actual.largeFiles) || '(none)'}\n` +
          `    regenerate: ${regen}`,
      );
    }
  }
}

// --- cross-doc SECTION citations (`charter §6.4`, `STATUS §2`) ---------------
// Paths were the only thing this lint checked. Docs also point at each other by SECTION, and those rot the
// same way: a section is renumbered or removed and the pointer aims at nothing. STATUS §G1 records that ONE
// stale line in the charter "regenerated a week-sized proposal"; a dangling § is that failure, smaller.
//
// RATCHET, not a hard zero — the first full run surfaced FIVE already-dangling pointers, and deciding
// whether each wants renumbering, deleting, or a section actually written is a documentation judgement,
// not a push blocker. Blocking on it is the kind of pressure that gets a lint switched off. The count may
// FALL, never RISE, exactly like the i18n adoption ratchet (frozen 109) and queue-ledger (frozen 215).
//
// The five, all genuinely stale (STATUS has no V1/V2/C1; the charter has §2 but no §2.5):
//   memory/ACTIVE_PLAN.md -> STATUS §V1        docs/superpowers/INDEX.md -> STATUS §C1, §V2
//   docs/superpowers/LOOP-CHARTER.md -> §V2    SOTA-INITIATIVE.md -> charter §2.5
// They are recorded in STATUS §G rather than fixed here: renumbering someone else's section pointers is a
// separate, reviewable change from adding the check that finds them.
const ANCHOR_FROZEN = 5;
const sectionsByAlias = {};
for (const [alias, rel] of Object.entries(DOC_ALIASES)) {
  try { sectionsByAlias[alias] = sectionIds(readFileSync(join(ROOT, rel), 'utf8')); } catch { /* absent: unresolved() skips it */ }
}
const dangling = [];
for (const rel of CANONICAL) {
  let src;
  try { src = readFileSync(join(ROOT, rel), 'utf8'); } catch { continue; }
  for (const c of unresolved(src, sectionsByAlias)) dangling.push(`${rel}: ${c.alias} §${c.section}`);
}
if (dangling.length > ANCHOR_FROZEN) {
  errors.push(
    `SECTION-CITATION RATCHET: ${dangling.length} dangling cross-doc citations, frozen at ${ANCHOR_FROZEN}.\n` +
      dangling.map((d) => `      - ${d}`).join('\n') +
      `\n    A \u00a7 pointer to a section that does not exist sends the next reader looking for a rule that isn't there.`,
  );
} else if (dangling.length < ANCHOR_FROZEN) {
  warnings.push(`section-citation ratchet can tighten: ${dangling.length} dangling (frozen ${ANCHOR_FROZEN}) — lower ANCHOR_FROZEN in doc-currency.mjs`);
}

// --- report -----------------------------------------------------------------
for (const w of warnings) console.warn(`⚠ ${w}`);

if (errors.length) {
  console.error(`\n✘ doc-currency FAILED (${errors.length} issue${errors.length === 1 ? '' : 's'}):\n`);
  for (const e of errors) console.error(`  • ${e}`);
  console.error(
    `\nA stale doc is not cosmetic — it manufactures dead work for the next agent.` +
      `\nFix the doc, or delete the claim. Do not silence this lint.`,
  );
  process.exit(1);
}

console.log(`✓ doc-currency PASSED (${CANONICAL.length} canonical docs checked; ${dangling.length} dangling \u00a7 citation(s), ratchet ${ANCHOR_FROZEN})`);
