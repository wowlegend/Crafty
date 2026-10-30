#!/usr/bin/env node
/**
 * GATE TABLE — generate the table of every gate and where it runs from the HOOK ITSELF, into TARGET (the gates rule
 * file that loads when a test or script is edited; CLAUDE.md keeps a three-line summary of the tiers).
 *
 * WHY THIS EXISTS. That paragraph has now undercounted its own gates THREE TIMES:
 *   "three gates"  ->  "Six"  ->  "NINE"  ->  live TEN
 * Each rewrite was written to fix the previous one, and the "Six" version stated the wrong number
 * directly above a table already showing eight. The latest rot took ONE COMMIT: adding
 * artifact-currency to the hook left CLAUDE.md claiming NINE with no row for the new gate — and a
 * six-agent review read that paragraph closely, with five of six certifying the old count.
 *
 * That is not carelessness anyone can fix by being careful. A hand-maintained mirror of a machine-
 * readable file drifts the moment the file changes, so this derives it instead — the same contract
 * measure.mjs already has for the size block, and doc-currency re-derives on every push and fails on
 * drift.
 *
 * SCOPE: this owns the gate NAME, its COMMAND, and where it runs (pre-push / CI). It deliberately does
 * NOT own the "what it actually stops" column — that is human judgement about consequences, and
 * generating prose nobody wrote would be worse than a stale table. Descriptions live in DESCRIPTIONS
 * below; a gate with no entry renders a TODO marker, so a new gate is visible rather than silent.
 *
 *   node scripts/ci/gate-table.mjs           print the derived table (check mode)
 *   node scripts/ci/gate-table.mjs --write   regenerate the block inside TARGET
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
// THE DEFINITION, not a caller. This parsed `.githooks/pre-push` until 2026-09-22, when the hook and
// ci.yml were two independently-maintained lists that disagreed -- a damage-model change passed every
// gate the hook knew and broke an E2E spec only the workflow ran. Both now call ci/pipeline.sh, so the
// table must be generated from the pipeline or it documents a caller rather than the build.
const HOOK = join(ROOT, 'ci/pipeline.sh');
// The trailer gate runs in the PUSH HOOK, not the pipeline — deliberately, because it reads the
// refspecs git puts on the hook's stdin and nothing else has them. A table generated only from the
// pipeline therefore cannot see them, and printed "15 gates authorize a push" when 17 do: an undercount
// in the exact file that exists to stop undercounting (it read "three", "Six" and "NINE" in turn when it
// was hand-kept). Parsing both surfaces is the fix; asserting the count here would just be a fourth guess.
const PUSH_HOOK = join(ROOT, '.githooks/pre-push');
const CI = join(ROOT, '.github/workflows/ci.yml');
/** Where the block lives, relative to the repo root; doc-currency reads the same constant. */
export const TARGET = '.claude/rules/gates-and-probes.md';
const TARGET_ABS = join(ROOT, TARGET);

export const BEGIN = '<!-- BEGIN GATES (regenerate: node frontend/scripts/ci/gate-table.mjs --write) -->';
export const END = '<!-- END GATES -->';

/**
 * What each gate actually STOPS. Human-authored on purpose — see SCOPE above.
 * Keyed by the gate name as it appears in the hook.
 */
export const DESCRIPTIONS = {
  'knip': 'an unused file, export or dependency',
  'npm audit': 'a HIGH or CRITICAL advisory (CI only: it needs the registry)',
  'prod-smoke': 'the production build failing to boot, render or keep a GL context',
  'opsec-scan': 'a home path, credential shape or agent attribution reaching this public repo',
  'mutation-proof-trailer': 'a commit that adds a gate or changes its assertions with no `Mutation-Proof:` trailer',
  'doc-currency': 'a dangling path, § or `CLAUDE.md` heading citation in a canonical doc or rule file, a stale generated block, a lock label, `CLAUDE.md` over 12,000 bytes',
  changelog: 'a `memory/CHANGELOG.md` missing a landing git can prove, hand-edited, or naming a commit outside the history',
  'queue-ledger': 'a queue finding with no `▣✓/▢/⊘` marker, or a dismissal with no proof command',
  'registry-append-only': 'a `memory/registry.jsonl` row deleted instead of closed',
  'artifact-currency': 'an unusable operator-page source, a falsified Queued pill, a wrong as-of stamp',
  eslint: 'crash-class bugs and dead code (`no-unused-vars` and `no-undef` are errors)',
  'gate-shape': 'an assertion a comment could satisfy; the source-grep gate count may only fall',
  'registry-dedupe': 'a `memory/registry.jsonl` id a merge left twice (`registry-dedupe.mjs` collapses it)',
  'unit + static gates': 'the whole vitest suite: `tests/**` and colocated `src/**/*.test.js`',
  'vitest related': 'a staged change that breaks a unit test statically importing it',
  build: 'broken JSX or imports',
  'bundle byte budget': 'a chunk past its byte ceiling',
};

/** PURE: pull the ordered gate list out of the hook source. */
export function parseHook(src) {
  const gates = [];
  const lines = src.split('\n');
  let tier = 'core';
  lines.forEach((line, i) => {
    // PRE-BANNER INVOCATIONS. A couple of gates take a commit RANGE and run before the printf-banner
    // block, so they never match the pattern below. This used to hardcode `mutation-proof-trailer` by
    // name, which meant the second such gate would have been silently absent from the generated table —
    // the same self-undercount this file exists to stop (the hand-kept version said "three", "Six" and
    // "NINE" in turn, each time wrong). Matched structurally now, so the next one needs no edit here.
    const preBanner = line.match(/scripts\/ci\/([a-z0-9-]+)\.mjs" "\$RANGE"/);
    if (preBanner && !/^\s*#/.test(line)) {
      const name = preBanner[1];
      if (!gates.some((g) => g.name === name)) {
        gates.push({ name, cmd: `node scripts/ci/${name}.mjs <range>`, tier: 'range', line: i + 1 });
      }
      return;
    }
    // LEADING WHITESPACE MATTERS: the push-tier steps sit inside an `if` block and are indented, so an
    // anchor at column 0 silently dropped three gates and the table reported 9 of 12. A generator that
    // produces a COUNT must not have a denominator bug.
    // TIER TRACKING. Until 2026-09-22 every parsed step was rendered with `pre-push: ✅`, and the CI
    // column was inferred by grepping ci.yml for the script name — which stopped working the moment CI
    // began calling `pipeline.sh --tier=fast` instead of naming steps. So BOTH columns were fiction:
    // `npm audit` and `prod-smoke` were printed as pre-push gates when they are deliberately CI-only,
    // which is a scope defect in the exact form R9 names (a gate's LABEL is a claim with a scope).
    // Derive the tier from the structure the script already provides, never from prose.
    // A `!=` GUARD IS AN EXCLUSION, NOT AN ABSENCE OF ONE. This used to collapse `!=` to 'core', whose
    // CALLERS entry says commit+push+ci — so a step inside `if [ "$TIER" != "push" ]` (the static gates) would be
    // printed as a pre-push gate while the script explicitly skips it there.
    const guard = line.match(/^if \[ "\$TIER" (=|!=) "(\w+)" \]; then$/);
    if (guard) { tier = guard[1] === '=' ? guard[2] : `not-${guard[2]}`; return; }
    // `if [ "$TIER" = "a" ] || [ "$TIER" = "b" ]; then`: a step two tiers run (the certify and fast block). Its tiers
    // are a list, and callersFor unions them as it does for a step two blocks state (`also`, below).
    if (/^if \[ "\$TIER" = "\w+" \](?: \|\| \[ "\$TIER" = "\w+" \])+; then$/.test(line)) {
      tier = [...line.matchAll(/"\$TIER" = "(\w+)"/g)].map((m) => m[1]);
      return;
    }
    // Any other guard on the tier would leave its steps printed under the tier before it: refuse to render that.
    if (/^if \[ "\$TIER"/.test(line)) throw new Error(`gate-table: line ${i + 1} guards on $TIER in a form this parser cannot read: ${line}`);
    if (/^fi$/.test(line)) { tier = 'core'; return; }

    const m = line.match(/^\s*step "([^"]+)"\s+(.+)$/);
    if (!m) return;
    const name = m[1].replace(/\s*\([^)]*\)\s*$/, '').trim();
    const cmd = m[2].trim().replace(/^npm run --silent /, 'npm run ').replace(/\s*\|\|.*$/, '');
    // ONE GATE, TWO TIERS: registry-append-only runs in the push tier AND in the fast tier. A second row would
    // count it twice, and the first row alone would print `CI: —` for a gate CI runs. So a step whose name an
    // earlier step already took adds its tier to that row (`also`), and callersFor unions them; the row keeps the
    // first command.
    const [first, ...rest] = [].concat(tier);
    const prior = gates.find((g) => g.name === name);
    if (prior) { (prior.also ||= []).push(first, ...rest); return; }
    gates.push({ name, cmd, tier: first, ...(rest.length ? { also: rest } : {}), line: i + 1 });
  });
  return gates;
}

/**
 * PURE: which of the three callers run a gate, derived from its tier. The mapping IS the pipeline's
 * contract, stated once:
 *   core  — no tier guard      -> every caller
 *   commit — the staged change   -> pre-commit only (the push and CI run the whole suite instead)
 *   push  — reads a commit RANGE -> pre-push only (a CI runner on a squashed ref cannot rebuild it)
 *   fast  — needs network/browser -> CI only (never on an edit path, R5)
 *   certify — run by hand        -> no caller (a step it shares with fast is a CI gate through fast)
 * A range-reading pre-banner gate (the trailers) is `range`: the hook owns it, and this file says so
 * rather than claiming the pipeline runs it.
 */
export const CALLERS = {
  core:  { commit: true,  push: true,  ci: true  },
  commit: { commit: true, push: false, ci: false },
  push:  { commit: false, push: true,  ci: false },
  fast:  { commit: false, push: false, ci: true  },
  certify: { commit: false, push: false, ci: false },
  range: { commit: false, push: true,  ci: false },
  // The exclusions. Derived from the same three tiers, so adding a tier cannot leave one unmapped
  // silently — `callersFor` falls back to `core` and that fallback is now asserted in the test.
  'not-commit': { commit: false, push: true,  ci: true  },
  'not-push':   { commit: true,  push: false, ci: true  },
  'not-fast':   { commit: true,  push: true,  ci: false },
};
export const callersFor = (gate) => {
  // A gate parsed in more than one tier (`also`, see parseHook) runs for every caller any of its tiers names.
  const each = [gate.tier, ...(gate.also || [])].map((t) => CALLERS[t] || CALLERS.core);
  return { commit: each.some((c) => c.commit), push: each.some((c) => c.push), ci: each.some((c) => c.ci) };
};

/*
 * REMOVED 2026-09-22: `parseCi` / `inCi`. They answered "does ci.yml mention this script's name", which
 * was true until CI started calling `pipeline.sh --tier=fast` — after that they returned false for nearly
 * every gate and the CI column was fiction. The tier guard in the script is the real answer, so the
 * column is derived from `CALLERS` above instead. Deleted rather than left exported: a dead function that
 * once decided a column is a trap for the next reader.
 */

export function renderBlock(gates, _ciText) {
  const tick = (b) => (b ? '✅' : '—');
  const rows = gates.map((g) => {
    const desc = DESCRIPTIONS[g.name] || '**TODO — describe what this stops** (a new gate landed with no description)';
    const c = callersFor(g);
    // A gate whose command is the default spelling prints its name alone, which keeps the block small.
    const cell = g.cmd === `node scripts/ci/${g.name}.mjs` ? g.name : `${g.name}: \`${g.cmd}\``;
    return `| ${cell} | ${tick(c.commit)} | ${tick(c.push)} | ${tick(c.ci)} | ${desc} |`;
  });
  const n = (t) => gates.filter((g) => (callersFor(g))[t]).length;
  return [
    BEGIN,
    `**${gates.length} gates; ${n('commit')} run on a commit, ${n('push')} on a push, ${n('ci')} in CI.** Generated by \`gate-table.mjs\` from \`ci/pipeline.sh\``,
    'and `.githooks/pre-push`; edit it, never the table. A bare name runs as `node scripts/ci/<name>.mjs` from `frontend/`.',
    'A push runs no unit suite, build or bundle: CI runs them on the exact sha (DECISIONS 2026-10-28 items 23, 24).',
    '',
    '| Gate | commit | push | CI | Stops |',
    '|---|:--:|:--:|:--:|---|',
    ...rows,
    END,
  ].join('\n');
}

export function derive() {
  const gates = parseHook(readFileSync(HOOK, 'utf8'));
  // Range gates first: they run before anything else in the hook, so the table should read in run order.
  const rangeGates = existsSync(PUSH_HOOK) ? parseHook(readFileSync(PUSH_HOOK, 'utf8')) : [];
  gates.unshift(...rangeGates.filter((r) => !gates.some((g) => g.name === r.name)));
  const ciText = existsSync(CI) ? readFileSync(CI, 'utf8') : '';
  return { gates, ciText };
}

/** Used by doc-currency: is the committed block identical to the derived one? */
export function checkBlock(md) {
  const { gates, ciText } = derive();
  const want = renderBlock(gates, ciText);
  const i = md.indexOf(BEGIN);
  const j = md.indexOf(END);
  if (i < 0 || j < 0) return { ok: false, reason: 'GATES block missing', count: gates.length };
  const got = md.slice(i, j + END.length);
  return { ok: got === want, reason: got === want ? '' : 'GATES block is stale', count: gates.length };
}

function main() {
  const { gates, ciText } = derive();
  const block = renderBlock(gates, ciText);
  if (process.argv.includes('--write')) {
    const md = readFileSync(TARGET_ABS, 'utf8');
    const i = md.indexOf(BEGIN);
    const j = md.indexOf(END);
    if (i < 0 || j < 0) {
      console.error(`gate-table: no ${BEGIN} / ${END} markers in ${TARGET} — add them around the gate table first`);
      process.exit(1);
    }
    writeFileSync(TARGET_ABS, md.slice(0, i) + block + md.slice(j + END.length));
    console.log(`gate-table: wrote ${gates.length} gates into ${TARGET}`);
    return;
  }
  console.log(block);
  const missing = gates.filter((g) => !DESCRIPTIONS[g.name]);
  if (missing.length) {
    console.error(`\ngate-table: ${missing.length} gate(s) have no description: ${missing.map((g) => g.name).join(', ')}`);
    process.exit(1);
  }
}

if (import.meta.main) main();
