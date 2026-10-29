#!/usr/bin/env node
/**
 * DOC-CURRENCY LINT — mechanical enforcement that the docs still describe reality.
 *
 * WHY: this repo carries 142 docs / ~44k lines. An agent cannot read them all, and a
 * STALE DOC IS A LIVE TRAP: on 2026-07-13 a single stale line in the loop charter (retired 2026-10-28) ("@react-three/test-renderer —
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
 *
 * THE SEAM (plan U8a, 2026-10-27). Every check lives in `run({ root, only, enforce })`, which returns
 * `{ errors, warnings, checked, danglingSections }` and never prints or exits; the CLI below is a thin printer around it. Until
 * then the whole lint ran at module scope with no export, so no test could call it, and deleting the call to one
 * of its checks stayed green under every test in the suite. `tests/scripts/doc-currency-wiring.test.js` drives
 * both seams, and each unit that wires a new check in adds its case there.
 *   root     where the DOCS are read from (default: this checkout). The generated blocks' sources — the hook
 *            gate-table derives from and the src tree measure() walks — are always this checkout's.
 *   only     run just these checks (names in CHECKS); an unknown name or an empty list throws, and so does a named
 *            check that records no denominator, because a run that checks nothing must never read as a pass.
 *   enforce  flags that turn a check's warning into an error (ENFORCE_FLAGS); an unknown flag throws.
 *   runners  the function behind each check name (default: the real ones). A test seam, so the wiring spec can show
 *            that a check which does not report is a throw rather than a pass.
 *   checked  the per-check denominator: how many things each check actually examined.
 *
 *   node scripts/ci/doc-currency.mjs               check this checkout; exit 1 on any error
 *   node scripts/ci/doc-currency.mjs --root=<dir>  check the docs under <dir> (a test seam)
 */
import { readFileSync, existsSync, realpathSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { measure, parseBlock, TOLERANCE, LARGE_FILE_LOC } from './measure.mjs';
import { checkBlock as checkGateBlock, TARGET as GATES_REL } from './gate-table.mjs';
import { SURFACES as READ_ORDER_SURFACES, checkFile as checkReadOrderFile } from './read-order.mjs';
import { checkBlock as checkControlsBlock } from './controls-table.mjs';
import { check as checkPublicFaceFiles } from './public-face.mjs';

import { DOC_ALIASES, sectionIds, itemIds, citations, unresolved } from './doc-anchors.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..'); // frontend/scripts/ci -> repo root

/**
 * The checks `run()` knows, in the order it runs them, each with the function behind it. A unit that wires in a new
 * check appends it HERE: `run()` iterates this table, so a check removed from it stops running, and CHECKS (its names)
 * is pinned by the wiring spec, which is what turns that red.
 */
const RUNNERS = Object.freeze({
  dangling: checkDangling,
  packages: checkPackages,
  status: checkStatus,
  gates: checkGates,
  measured: checkMeasured,
  'read-order': checkReadOrder,
  controls: checkControls,
  'public-face': checkPublicFace,
  sections: checkSections,
  locks: checkLocks,
  headings: checkHeadings,
  size: checkSize,
});
export const CHECKS = Object.freeze(Object.keys(RUNNERS));

/** Flags that turn a check's warning into an error. None exist yet; the first is U30's ACTIVE_PLAN cap. */
const ENFORCE_FLAGS = Object.freeze([]);

// The docs an agent is actually told to trust. Rot here is what causes damage; rot in a shipped 2026-06-03
// plan doc is just history.
export const CANONICAL = [
  'memory/STATUS.md',
  'memory/ACTIVE_PLAN.md',
  'memory/ARCHITECTURE.md',
  'docs/superpowers/INDEX.md',
  // Added 2026-08-09. DECISIONS.md is read-order #6 and the ONLY thing that settles who owns a decision,
  // yet it was the one canonical surface this gate did not check — found while running the gate on an
  // edit to it. A decision record citing a path that no longer exists is worse than a stale plan: plans
  // are expected to age, a RECORD is cited as ground truth. Superseding entries name the entry they
  // supersede and are append-only, so the corpus only grows and un-checked citations only accumulate.
  'docs/superpowers/DECISIONS.md',
  'docs/superpowers/SOTA-INITIATIVE.md',
  'README.md',
  'CLAUDE.md',
];

// Packages whose presence docs have historically LIED about. If a canonical doc asserts one of these is
// installed/landed/added and it is not in package.json, that is the trap — fail.
const CLAIM_VERBS = /(installed|landed|added|approved \+ landed|is wired|now available)/i;
const WATCHED_PACKAGES = ['@react-three/test-renderer', '@playwright/test', 'knip', 'puppeteer'];

const CLAUDE_REL = 'CLAUDE.md';

/**
 * The path-scoped rule files load into a session at the moment of use, so a dangling pointer in one misleads exactly
 * when it is read. They are scanned beside CANONICAL by the pointer checks (dangling, sections, headings).
 */
const RULES_DIR = '.claude/rules';
export function rulesDocs(root) {
  const dir = join(root, RULES_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.md')).sort().map((f) => `${RULES_DIR}/${f}`);
}
const pointerDocs = (root) => [...CANONICAL, ...rulesDocs(root)];

/** CLAUDE.md loads into every session and after every compaction; detail beyond this moves to a rule file. */
export const CLAUDE_MAX_BYTES = 12_000;

/**
 * Run the named checks (all of them by default) over the docs under `root`.
 * Returns `{ errors, warnings, checked, danglingSections }`: `checked[name]` is how many things that check
 * examined, and `danglingSections` the § citations that did not resolve (the CLI's PASSED line prints it).
 */
export function run({ root = ROOT, only, enforce = {}, runners = RUNNERS } = {}) {
  if (only !== undefined) {
    if (!Array.isArray(only) || only.length === 0) {
      throw new Error('doc-currency run(): `only` must name at least one check — a run that checks nothing would read as a pass');
    }
    const unknown = only.filter((name) => !CHECKS.includes(name));
    if (unknown.length) throw new Error(`doc-currency run(): unknown check(s) ${unknown.join(', ')}; known: ${CHECKS.join(', ')}`);
  }
  const badFlags = Object.keys(enforce).filter((flag) => !ENFORCE_FLAGS.includes(flag));
  if (badFlags.length) {
    throw new Error(`doc-currency run(): unknown enforce flag(s) ${badFlags.join(', ')}; known: ${ENFORCE_FLAGS.join(', ') || '(none yet)'}`);
  }
  const out = { errors: [], warnings: [], checked: {}, danglingSections: 0 };
  for (const name of CHECKS) {
    if (only !== undefined && !only.includes(name)) continue;
    const runner = runners[name];
    if (typeof runner === 'function') runner(root, out);
    // Every check records what it examined, even 0. One that recorded nothing did not run — and a run that checked
    // nothing must never read as a pass, so it is a thrown wiring defect, not an empty error list.
    if (!Object.hasOwn(out.checked, name)) {
      throw new Error(`doc-currency run(): check "${name}" did not run (it recorded no denominator) — a run that checks nothing must never read as a pass`);
    }
  }
  return out;
}

/** A doc's text, or null with an error naming the check that could not run. */
function readDoc(root, rel, out, what) {
  const abs = join(root, rel);
  if (!existsSync(abs)) {
    out.errors.push(`${rel}: does not exist, so ${what} could not be checked`);
    return null;
  }
  return readFileSync(abs, 'utf8');
}

// --- 1. DANGLING LINKS ------------------------------------------------------
// Match markdown links + inline-code paths that look repo-relative. The `.agent` first segment stays in both
// path lists on purpose: that directory is retired, so a canonical doc that still cites a path under it dangles
// and fails here instead of passing unexamined.
const LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g;
const CODEPATH_RE = /`((?:memory|docs|frontend|src|\.agent|\.claude|\.github|\.githooks|ci|scripts|tests)\/[A-Za-z0-9._\-/]+\.[a-z]{2,5})`/g;
// BARE paths — not in backticks, not a markdown link. This repo's prose is full of them:
//   "(plan docs/superpowers/plans/2026-06-14-crafty-ocean-coast.md, 4 slices)"
// and until 2026-08-02 the lint could not see a single one. Archiving that very file left ARCHITECTURE.md
// pointing at a path that no longer existed and doc-currency reported "✓ PASSED (9 canonical docs
// checked)" — a clean bill of health over text it never examined, which is the failure mode this lint
// exists to prevent in the DOCS. INDEX.md even asserted that moving such a file "trips doc-currency";
// it did not, and that false confidence is what made the hole worth closing rather than noting.
const BAREPATH_RE = /(?<![`(\w/.-])((?:memory|docs|frontend|src|\.agent|\.claude|\.github|\.githooks|ci|scripts|tests)\/[A-Za-z0-9._\-/]+\.[a-z]{2,5})/g;

// Some docs deliberately cite a WRONG path as a cautionary example (e.g. CLAUDE.md warns that
// `memory/SOTA-INITIATIVE.md` is the classic false-absence mistake — "it's at root"). Flagging those
// would be the lint failing to read English. Skip lines that are explicitly calling a path wrong.
const NEGATED = /\b(a wrong|wrong|incorrect|is at root|not at|does not exist|false-absence|used to be|REMOVED)\b/i;

/** checked.dangling = the citations actually resolved against the disk (after the external/negated/glob skips). */
function checkDangling(root, out) {
  let examined = 0;
  for (const rel of pointerDocs(root)) {
    const abs = join(root, rel);
    if (!existsSync(abs)) {
      out.errors.push(`MISSING CANONICAL DOC: ${rel}`);
      continue;
    }
    const src = readFileSync(abs, 'utf8');
    const seen = new Set();
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
        join(root, clean), // repo root
        join(root, 'frontend', clean), // the app dir (the two-level trap)
      ];
      examined += 1;
      if (!candidates.some(existsSync)) {
        out.errors.push(`DANGLING ${kind} in ${rel}: "${clean}" does not exist`);
      }
    };

    let m;
    while ((m = LINK_RE.exec(src))) check(m[1], 'link', m.index);
    while ((m = CODEPATH_RE.exec(src))) check(m[1], 'path', m.index);
    while ((m = BAREPATH_RE.exec(src))) check(m[1], 'bare path', m.index);
  }
  out.checked.dangling = examined;
}

// --- 2. PACKAGE CLAIMS ------------------------------------------------------
/** checked.packages = the doc lines that mention a watched package (each one is judged). */
function checkPackages(root, out) {
  const pkgAbs = join(root, 'frontend/package.json');
  if (!existsSync(pkgAbs)) {
    out.errors.push('frontend/package.json: does not exist, so package claims could not be checked');
    out.checked.packages = 0;
    return;
  }
  const PKG = JSON.parse(readFileSync(pkgAbs, 'utf8'));
  const DEPS = { ...(PKG.dependencies || {}), ...(PKG.devDependencies || {}) };
  let examined = 0;
  for (const rel of CANONICAL) {
    const abs = join(root, rel);
    if (!existsSync(abs)) continue;
    const lines = readFileSync(abs, 'utf8').split('\n');

    lines.forEach((line, i) => {
      for (const pkg of WATCHED_PACKAGES) {
        if (!line.includes(pkg)) continue;
        examined += 1;
        if (!CLAIM_VERBS.test(line)) continue;
        // A line that explicitly documents the REMOVAL/correction is fine — that is the fix, not the rot.
        if (/\b(REMOVED|removed|NOT in|not in|absent|was a LIVE TRAP|CORRECTED|no longer)\b/.test(line)) continue;
        const installed = Object.prototype.hasOwnProperty.call(DEPS, pkg);
        if (!installed) {
          out.errors.push(
            `STALE PACKAGE CLAIM in ${rel}:${i + 1} — claims "${pkg}" is installed/landed, ` +
              `but it is NOT in frontend/package.json.`,
          );
        }
      }
    });
  }
  out.checked.packages = examined;
}

// --- 3. STATUS INTEGRITY ----------------------------------------------------
/** process.env with every GIT_* removed: the age is read from the repo at `root`, never an inherited GIT_DIR's. */
const scrubbedEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));

/** checked.status = the load-bearing sections looked for (0 when STATUS is absent; dangling reports that). */
function checkStatus(root, out) {
  const statusAbs = join(root, 'memory/STATUS.md');
  out.checked.status = 0;
  if (!existsSync(statusAbs)) return;
  const status = readFileSync(statusAbs, 'utf8');
  const REQUIRED = [
    { re: /single source of truth/i, what: 'the source-of-truth declaration' },
    { re: /##\s*2\.\s*THE HARVESTED RECORD/i, what: 'the §2 harvested record (open work lives in memory/registry.jsonl)' },
    { re: /##\s*3\.\s*What.s next/i, what: 'the §3 cursor' },
    { re: /\[LOOP\]/, what: 'at least one [LOOP]-tagged item' },
    { re: /\[KEVIN\]|KEVIN-ONLY/, what: 'the KEVIN-only partition' },
  ];
  for (const { re, what } of REQUIRED) {
    if (!re.test(status)) out.errors.push(`STATUS.md has lost ${what} — it is the source of truth; keep it whole.`);
  }
  out.checked.status = REQUIRED.length;
  // Soft signal: STATUS should not go stale relative to shipped code.
  //
  // MEASURED FROM GIT, NOT FROM THE FILESYSTEM. This read `statSync(...).mtimeMs`, and a fresh CI
  // checkout writes every file at clone time — so in the one environment where this lint runs on every
  // push, the age was always ~0 and the warning was structurally incapable of firing. It could only ever
  // have spoken on a developer's own machine, which is precisely where someone already knows.
  // The commit date is the real "when was this last touched" and it travels with the repo.
  let ageDays = null;
  try {
    const ts = execFileSync('git', ['log', '-1', '--format=%ct', '--', statusAbs], {
      cwd: root,
      encoding: 'utf8',
      env: scrubbedEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    if (ts) ageDays = (Date.now() - Number(ts) * 1000) / 86_400_000;
  } catch {
    // Not a git checkout (a tarball, a sandbox). Say so rather than silently reporting fresh — an age
    // this cannot measure must not read as an age of zero.
    out.warnings.push('STATUS.md age is unknown here: git log is unavailable, so staleness went unchecked.');
  }
  if (ageDays !== null && ageDays > 14) {
    out.warnings.push(`STATUS.md has not been committed in ${ageDays.toFixed(0)} days — is the registry still true?`);
  }
}

// --- 3b. GATES BLOCK CURRENCY ------------------------------------------------
// The gate table is DERIVED from .githooks/pre-push. Hand-maintained, it undercounted itself three times
// ("three" -> "Six" -> "NINE"), the last time ONE COMMIT after artifact-currency landed — and a six-agent
// review read the paragraph closely with five of six certifying the stale number. A mirror of a
// machine-readable file drifts the moment that file changes, so this fails the push instead.
/** checked.gates = the gates the hook defines, which the block is compared against. */
function checkGates(root, out) {
  out.checked.gates = 0;
  const md = readDoc(root, GATES_REL, out, 'the GATES block');
  if (md === null) return;
  const r = checkGateBlock(md);
  out.checked.gates = r.count;
  if (!r.ok) {
    out.errors.push(`${GATES_REL}: ${r.reason} (hook defines ${r.count} gates) — regenerate: node frontend/scripts/ci/gate-table.mjs --write`);
  }
}

// --- 4. MEASURED BLOCK CURRENCY ---------------------------------------------
// `CLAUDE.md` carries a generated size block. A number in a doc that is re-read every iteration is a
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
/** checked.measured = the claimed quantities compared: the two counts plus each listed large file. */
function checkMeasured(root, out) {
  out.checked.measured = 0;
  const md = readDoc(root, CLAUDE_REL, out, 'the MEASURED block');
  if (md === null) return;
  const claimed = parseBlock(md);
  const regen = 'node frontend/scripts/ci/measure.mjs --write';
  if (!claimed) {
    out.errors.push(`${CLAUDE_REL}: MEASURED block missing or unparseable — regenerate: ${regen}`);
    return;
  }
  out.checked.measured = 2 + claimed.largeFiles.length;
  const actual = measure();
  const drift = (a, b) => Math.abs(a - b) / Math.max(b, 1);
  for (const [label, got, want] of [
    ['source files', claimed.srcFiles, actual.srcFiles],
    ['source LOC', claimed.srcLoc, actual.srcLoc],
  ]) {
    if (drift(got, want) > TOLERANCE) {
      out.errors.push(
        `${CLAUDE_REL}: MEASURED ${label} says ${got.toLocaleString('en-US')}, actual ` +
          `${want.toLocaleString('en-US')} (${(drift(got, want) * 100).toFixed(0)}% drift, band ` +
          `${Math.round(TOLERANCE * 100)}%) — regenerate: ${regen}`,
      );
    }
  }
  const key = (l) => l.map((f) => f.file).sort().join(', ');
  if (key(claimed.largeFiles) !== key(actual.largeFiles)) {
    out.errors.push(
      `${CLAUDE_REL}: the >=${LARGE_FILE_LOC}-LOC file list is wrong.\n` +
        `    doc says: ${key(claimed.largeFiles) || '(none)'}\n` +
        `    actual:   ${key(actual.largeFiles) || '(none)'}\n` +
        `    regenerate: ${regen}`,
    );
  }
  // ...and the per-file LOC VALUES, which membership alone never looked at: the block prints
  // `Components.jsx 1325`, and that number could rot to any value without changing who is on the list.
  // Banded, NOT exact — every one of these files changes LOC on ordinary commits, so an exact check would
  // redden nearly every push and get switched off within a day (the same reasoning as the counts above).
  // The band still catches the drift that misleads: a file read as ~1300 that is really ~900.
  const actualLoc = new Map(actual.largeFiles.map((f) => [f.file, f.loc]));
  for (const f of claimed.largeFiles) {
    const want = actualLoc.get(f.file);
    if (want === undefined) continue; // membership drift — already reported above
    if (drift(f.loc, want) > TOLERANCE) {
      out.errors.push(
        `${CLAUDE_REL}: MEASURED says ${f.file} is ${f.loc} LOC, actual ${want} ` +
          `(${(drift(f.loc, want) * 100).toFixed(0)}% drift, band ${Math.round(TOLERANCE * 100)}%) — ` +
          `regenerate: ${regen}`,
      );
    }
  }
}

// --- 4b. READ-ORDER BLOCK PARITY ---------------------------------------------
// Hand-kept copies of the orientation read order drifted apart, and a cold agent follows whichever one it reads
// first. The order is generated from one source; a stale rendered block fails here.
/** checked['read-order'] = the surfaces read and compared against the one generated block. */
function checkReadOrder(root, out) {
  let examined = 0;
  for (const rel of READ_ORDER_SURFACES) {
    const md = readDoc(root, rel, out, 'its READ-ORDER block');
    if (md === null) continue;
    examined += 1;
    const r = checkReadOrderFile(md);
    if (!r.ok) {
      out.errors.push(`${rel}: ${r.reason} — regenerate: node frontend/scripts/ci/read-order.mjs --write`);
    }
  }
  out.checked['read-order'] = examined;
}

// --- 4c. PUBLIC FACE ----------------------------------------------------------
// The README's controls table comes from KEY_MAP, and the page head, noscript, manifest, README lead and repo
// metadata from src/brand.js. A hand edit to any of them, or a rebound key, fails here until it is re-rendered.
/** checked.controls = the KEY_MAP rows the README's CONTROLS block was compared over (0 when README is absent). */
function checkControls(root, out) {
  const readme = readDoc(root, 'README.md', out, 'its CONTROLS block');
  if (readme === null) {
    out.checked.controls = 0;
    return;
  }
  const c = checkControlsBlock(readme);
  if (!c.ok) out.errors.push(`README.md: ${c.reason} — regenerate: node frontend/scripts/ci/controls-table.mjs --write`);
  out.checked.controls = c.rows;
}

/** checked['public-face'] = the rendered targets compared against a fresh render of src/brand.js. */
function checkPublicFace(root, out) {
  const { checked, stale } = checkPublicFaceFiles(root);
  for (const s of stale) {
    out.errors.push(`${s.rel}: ${s.reason} against src/brand.js — regenerate: node frontend/scripts/ci/public-face.mjs --write`);
  }
  out.checked['public-face'] = checked;
}

// --- cross-doc SECTION citations (`STATUS §2`) ---------------------------------
// Paths were the only thing this lint checked. Docs also point at each other by SECTION, and those rot the
// same way: a section is renumbered or removed and the pointer aims at nothing. STATUS §G1 records that ONE
// stale line in the charter "regenerated a week-sized proposal"; a dangling § is that failure, smaller.
//
// A ZERO-TARGET, not a ratchet-with-slack. The first version of this check reported FIVE dangling
// pointers and I recorded them in STATUS as "genuinely stale". They were FALSE POSITIVES: it modelled only
// ATX headings, while these docs also anchor on ITEM ids (`- ▢ **V1 …` under `### B.`) and on COMPOUND
// refs (`charter §2.5` = section 2, list item 5). Once doc-anchors learned both, the count went to zero.
//
// So the freeze is 0 and any dangling citation fails the push outright. That is only defensible BECAUSE
// the checker was corrected first — freezing at 5 would have permanently licensed five phantom findings
// and taught the next reader to distrust the lint. A ratchet that ratchets in rot it invented is worse
// than no ratchet.
const ANCHOR_FROZEN = 0;

/** checked.sections = the `<doc> §<id>` citations found in the canonical docs; each is resolved or reported. */
function checkSections(root, out) {
  const sectionsByAlias = {};
  for (const [alias, rel] of Object.entries(DOC_ALIASES)) {
    try {
      const src = readFileSync(join(root, rel), 'utf8');
      // Headings AND item ids: these docs cite both `STATUS §2` (a heading) and `STATUS §V1` (an item inside
      // one). Reading headings alone reported five valid citations as dangling.
      sectionsByAlias[alias] = new Set([...sectionIds(src), ...itemIds(src)]);
    } catch { /* absent: unresolved() skips it */ }
  }
  const dangling = [];
  let examined = 0;
  for (const rel of pointerDocs(root)) {
    let src;
    try { src = readFileSync(join(root, rel), 'utf8'); } catch { continue; }
    examined += citations(src).length;
    for (const c of unresolved(src, sectionsByAlias)) dangling.push(`${rel}: ${c.alias} §${c.section}`);
  }
  out.checked.sections = examined;
  out.danglingSections = dangling.length;
  if (dangling.length > ANCHOR_FROZEN) {
    out.errors.push(
      `SECTION-CITATION RATCHET: ${dangling.length} dangling cross-doc citations, frozen at ${ANCHOR_FROZEN}.\n` +
        dangling.map((d) => `      - ${d}`).join('\n') +
        `\n    A ` +
        `\u00a7 pointer to a section that does not exist sends the next reader looking for a rule that isn't there.`,
    );
  } else if (dangling.length < ANCHOR_FROZEN) {
    out.warnings.push(`section-citation ratchet can tighten: ${dangling.length} dangling (frozen ${ANCHOR_FROZEN}) — lower ANCHOR_FROZEN in doc-currency.mjs`);
  }
}

// --- 5. LOCK LABELS -----------------------------------------------------------
// Nothing in Crafty is locked (DECISIONS 2026-10-28 items 14 and 16). A canonical doc states a decision, its reason and
// that it stands while it earns its place; a lock label reads to the next agent as a ban. DECISIONS.md is the record
// and quotes the labels it retired, so it is not scanned.
// Blind spot: only these six phrasings. "locked" in prose, "do NOT change", "Kevin's call" and any new wording pass.
export const LOCK_LABELS = Object.freeze([
  ['(LOCKED', /\(LOCKED\b/],
  // \b keeps "BLOCKED —" out (memory/ACTIVE_PLAN.md uses it for a pinned dependency).
  ['LOCKED —', /\bLOCKED\s*[—–]/],
  // The label is the capitalised word or "documented irreducible"; a lower-case "irreducible" in prose, such as
  // "do not assume they are irreducible too", argues against a lock rather than stating one.
  ['IRREDUCIBLE', /\bIRREDUCIBLE\b|\b[Dd]ocumented irreducible\b/],
  ['MUST NOT be split', /\bmust not be split\b/i],
  ["KEEP, don't rewrite", /\bkeep, don['’]t rewrite\b/i],
  ['do not relitigate', /\bdo not relitigate\b/i],
]);
export const LOCK_DOCS = Object.freeze(CANONICAL.filter((rel) => rel !== 'docs/superpowers/DECISIONS.md'));
// A doc quotes Kevin's directive, which names a label, by citing the decision that retired it on the same line.
const QUOTES_THE_DECISION = /\bitem 16\b/;

/** checked.locks = the canonical docs read for lock labels (a missing one is reported by `dangling`). */
function checkLocks(root, out) {
  let scanned = 0;
  for (const rel of LOCK_DOCS) {
    const abs = join(root, rel);
    if (!existsSync(abs)) continue;
    scanned += 1;
    readFileSync(abs, 'utf8').split('\n').forEach((line, i) => {
      if (QUOTES_THE_DECISION.test(line)) return;
      const hits = LOCK_LABELS.filter(([, re]) => re.test(line)).map(([label]) => `"${label}"`);
      if (hits.length === 0) return;
      out.errors.push(
        `LOCK LABEL at ${rel}:${i + 1}: ${hits.join(', ')} — nothing in Crafty is locked; state the decision, its ` +
          `reason, and that it stands while it earns its place (DECISIONS 2026-10-28 item 16). To quote a label, ` +
          `cite "item 16" on the same line.`,
      );
    });
  }
  out.checked.locks = scanned;
}

// --- 6. CLAUDE.md HEADING CITATIONS -------------------------------------------
// The rule files and the cursor point into CLAUDE.md by heading, written `CLAUDE.md` "Landing". A heading that is
// renamed or dropped leaves the pointer aimed at nothing, and no path check can see it. The cited text must begin a
// `## ` heading of CLAUDE.md (case-insensitive), so "Landing" names "Landing: how a change reaches main".
// Blind spot: a pointer written any other way ("CLAUDE.md, Method") is not recognised as a citation.
const HEADING_CITE_RE = /`?CLAUDE\.md`?\s+"([^"\n]{2,80})"/g;

/** checked.headings = the `CLAUDE.md` "Heading" citations found in the pointer docs; each is resolved or reported. */
function checkHeadings(root, out) {
  out.checked.headings = 0;
  const md = readDoc(root, CLAUDE_REL, out, 'its heading citations');
  if (md === null) return;
  const headings = md.split('\n').filter((l) => /^##\s/.test(l)).map((l) => l.replace(/^##\s+/, '').toLowerCase());
  let examined = 0;
  for (const rel of pointerDocs(root)) {
    const abs = join(root, rel);
    if (!existsSync(abs)) continue;
    for (const m of readFileSync(abs, 'utf8').matchAll(HEADING_CITE_RE)) {
      examined += 1;
      const cited = m[1].trim().toLowerCase();
      if (!headings.some((h) => h.startsWith(cited))) {
        out.errors.push(`DANGLING heading citation in ${rel}: CLAUDE.md has no "## ${m[1].trim()}" heading`);
      }
    }
  }
  out.checked.headings = examined;
}

// --- 7. CLAUDE.md SIZE --------------------------------------------------------
/** checked.size = the files measured against their byte ceiling (CLAUDE.md, so 1 when it exists). */
function checkSize(root, out) {
  out.checked.size = 0;
  const abs = join(root, CLAUDE_REL);
  if (!existsSync(abs)) {
    out.errors.push(`${CLAUDE_REL}: does not exist, so its size could not be checked`);
    return;
  }
  out.checked.size = 1;
  const bytes = readFileSync(abs).length;
  out.claudeBytes = bytes;
  if (bytes > CLAUDE_MAX_BYTES) {
    out.errors.push(
      `${CLAUDE_REL} is ${bytes.toLocaleString('en-US')} bytes, over its ${CLAUDE_MAX_BYTES.toLocaleString('en-US')}-byte ` +
        `ceiling (DECISIONS 2026-10-28, W2-J item 1): move detail into the .claude/rules file that loads at the moment of use`,
    );
  }
}

// --- report -----------------------------------------------------------------
// The CLI is a printer around run(): what it prints and its exit code come from run()'s result and nothing else.
//
// Invoked directly, however the path was spelled. Node loads the main module by its REAL path, so a plain
// `resolve(process.argv[1]) === fileURLToPath(import.meta.url)` is false when the script is reached through a
// symlinked directory, and the lint then exited 0 having checked nothing (tranche A review, 2026-10-27; before
// the seam it ran on import, so no spelling could skip it). Both sides are compared as real paths.
function invokedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
if (invokedDirectly()) {
  const rootArg = process.argv.slice(2).find((a) => a.startsWith('--root='));
  const { errors, warnings, checked, danglingSections, claudeBytes } = run(rootArg ? { root: resolve(rootArg.slice('--root='.length)) } : {});

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

  console.log(
    `✓ doc-currency PASSED (CLAUDE.md ${claudeBytes.toLocaleString('en-US')} of ${CLAUDE_MAX_BYTES.toLocaleString('en-US')} ` +
      `bytes; ${checked.dangling} path and ${checked.headings} CLAUDE.md heading citations in ${CANONICAL.length} ` +
      `canonical docs and the rule files; ${danglingSections} dangling ` +
      `\u00a7 citation(s), ratchet ${ANCHOR_FROZEN}; lock labels: 0 (${LOCK_LABELS.length} phrasings, ${checked.locks} docs))`,
  );
}
