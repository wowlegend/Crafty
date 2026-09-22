#!/usr/bin/env node
/**
 * GATE TABLE — generate the "what authorizes a push" table in .agent/AGENTS.md from the HOOK ITSELF.
 *
 * WHY THIS EXISTS. That paragraph has now undercounted its own gates THREE TIMES:
 *   "three gates"  ->  "Six"  ->  "NINE"  ->  live TEN
 * Each rewrite was written to fix the previous one, and the "Six" version stated the wrong number
 * directly above a table already showing eight. The latest rot took ONE COMMIT: adding
 * artifact-currency to the hook left AGENTS.md claiming NINE with no row for the new gate — and a
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
 *   node scripts/ci/gate-table.mjs --write   regenerate the block inside .agent/AGENTS.md
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
// The two trailer gates run in the PUSH HOOK, not the pipeline — deliberately, because they read the
// refspecs git puts on the hook's stdin and nothing else has them. A table generated only from the
// pipeline therefore cannot see them, and printed "15 gates authorize a push" when 17 do: an undercount
// in the exact file that exists to stop undercounting (it read "three", "Six" and "NINE" in turn when it
// was hand-kept). Parsing both surfaces is the fix; asserting the count here would just be a fourth guess.
const PUSH_HOOK = join(ROOT, '.githooks/pre-push');
const CI = join(ROOT, '.github/workflows/ci.yml');
const AGENTS = join(ROOT, '.agent/AGENTS.md');

export const BEGIN = '<!-- BEGIN GATES (regenerate: node frontend/scripts/ci/gate-table.mjs --write) -->';
export const END = '<!-- END GATES -->';

/**
 * What each gate actually STOPS. Human-authored on purpose — see SCOPE above.
 * Keyed by the gate name as it appears in the hook.
 */
export const DESCRIPTIONS = {
  'e2e freshness': 'a push whose `src/` or `tests/e2e/` tree has changed since the last GREEN e2e run. The 21 Playwright specs are CI-only (~20 min, serialized because they share in-page game state), so no local chokepoint can see an e2e regression — which is exactly how the 2026-09-22 damage-model change shipped green locally and broke `soft-death-protections`. This asserts the RECEIPT, content-keyed on the observed trees so editing a doc does not expire it and editing a store action does. Fails CLOSED on stale, OPEN on absent (a fresh clone must not be refused), exit 3 on an empty walk',
  'knip': 'an unused file, export or dependency — the accretion that makes a codebase look larger than the part that runs. CI-only because it is slow and never a correctness failure',
  'npm audit': 'a HIGH or CRITICAL advisory in the installed dependency set. CI-only ON PURPOSE (R5): this needs the registry, and a network outage reddening a local commit is how developers learn to pass --no-verify',
  'prod-smoke': 'the bundle that actually SHIPS failing to boot, render, or keep a live GL context. It is the only harness that loads the production build — `capture.mjs` and all 25 probes drive the DEV server, which measures LCP ~6.6x slower and cannot see a prod-only break. CI-only because it needs a browser',
  'opsec-scan': 'an operator home path, a credential shape, or agent attribution reaching a PUBLIC repo. Built after a third-party statusline tool injected `/Users/<user>/...` into a TRACKED `.claude/settings.json` on its own — a convention cannot stop a tool that edits your config unprompted. Deliberately does NOT flag the operator first name (~196 files of design attribution): a gate that cries wolf gets bypassed, and a bypassed gate on a publish boundary is worse than none',
  'killability-ledger': 'a NEW check file that never states what makes it fail. The `Mutation-Proof:` trailer proves a COMMIT was asked; this proves the FILE carries the answer, ratcheted like the source-grep ledger so the debt can fall and never rise. It also prints the number nothing in this suite could previously state — how many of its own checks have ever been shown to fail. It does NOT verify the receipt is true; nothing can',
  'mutation-proof-trailer': 'a commit that ADDS a gate under `tests/gates/` or `scripts/ci/`, or REWRITES the ASSERTIONS of an existing one, without a `Mutation-Proof:` trailer stating what was broken and that it went RED',
  'baseline-trailer': 'a commit that rewrites the visual ORACLE under `tests/visual/baseline/` without a `Baseline-Review:` trailer, or that BUNDLES the rewrite with `frontend/src/` changes — which makes an intended look change indistinguishable from a regression the baseline was updated to match',
  'doc-currency': 'a canonical doc citing a path that no longer exists (incl. bare, non-backticked paths), a cross-doc section citation aimed at a section that does not exist, and drift in the generated MEASURED and GATES blocks',
  'queue-ledger': 'a finding in the queue-of-record with no `▣✓/▢/⊘` marker, or a `⊘ DISMISSED` with no proof command',
  'artifact-currency': 'the published Artifact page drifting from HEAD — informational under the ceiling, hard fail above it. Also rejects an unusable page source (missing, or a fetched copy of the published wrapper), and a row still marked **Queued** whose declared `data-absent` artifact now EXISTS — a status pill is a claim, and one nothing can falsify is how `d90a6b1` read Queued for a day after it shipped',
  eslint: 'crash-class bugs + dead code; `no-unused-vars` is an **error**, and `no-undef` catches a hook wired into the wrong component',
  'gate-shape': 'a test assertion satisfiable by a COMMENT alone; also ratchets the source-grep gate population (may fall, never rise)',
  'cli-guard': 'a script under `scripts/` that EXPORTS a seam yet runs its CLI at module scope — importing it executes the tool. Runs BEFORE `test:unit` because that is the run it corrupts',
  'unit + static gates': 'everything in `tests/**` + `src/**/*.test.js` — incl. the i18n adoption ratchet and key-resolution gates',
  build: 'broken JSX/imports',
  'bundle byte budget': 'a chunk growing past its byte ceiling',
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
    const guard = line.match(/^if \[ "\$TIER" (=|!=) "(\w+)" \]; then$/);
    if (guard) { tier = guard[1] === '=' ? guard[2] : 'core'; return; }
    if (/^fi$/.test(line)) { tier = 'core'; return; }

    const m = line.match(/^\s*step "([^"]+)"\s+(.+)$/);
    if (!m) return;
    const name = m[1].replace(/\s*\([^)]*\)\s*$/, '').trim();
    const cmd = m[2].trim().replace(/^npm run --silent /, 'npm run ').replace(/\s*\|\|.*$/, '');
    gates.push({ name, cmd, tier, line: i + 1 });
  });
  return gates;
}

/**
 * PURE: which of the three callers run a gate, derived from its tier. The mapping IS the pipeline's
 * contract, stated once:
 *   core  — no tier guard      -> every caller
 *   push  — reads a commit RANGE -> pre-push only (a CI runner on a squashed ref cannot rebuild it)
 *   fast  — needs network/browser -> CI only (never on an edit path, R5)
 * A range-reading pre-banner gate (the trailers) is `range`: the hook owns it, and this file says so
 * rather than claiming the pipeline runs it.
 */
export const CALLERS = {
  core:  { commit: true,  push: true,  ci: true  },
  push:  { commit: false, push: true,  ci: false },
  fast:  { commit: false, push: false, ci: true  },
  range: { commit: false, push: true,  ci: false },
};
export const callersFor = (gate) => CALLERS[gate.tier] || CALLERS.core;

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
    return `| ${g.name} | \`${g.cmd}\` | ${tick(c.commit)} | ${tick(c.push)} | ${tick(c.ci)} | ${desc} |`;
  });
  const n = (t) => gates.filter((g) => (callersFor(g))[t]).length;
  return [
    BEGIN,
    `**${gates.length} gates, across three callers.** Generated from \`ci/pipeline.sh\` — the ONE definition`,
    'pre-commit, pre-push and GitHub Actions all call, so no two can drift. Do not edit the table by hand;',
    'add the description to `DESCRIPTIONS` in `gate-table.mjs` and regenerate.',
    '',
    `**${n('commit')} run on every commit** (offline core, 69s) · **${n('push')} on every push** · **${n('ci')} in CI**.`,
    'The columns are DERIVED from each step\'s tier guard in the script, not asserted here — they used to be,',
    'and all three network/browser gates were printed as pre-push gates they have never been.',
    '',
    '| Gate | Command | pre-commit | pre-push | CI | What it actually stops |',
    '|---|---|:--:|:--:|:--:|---|',
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
    const md = readFileSync(AGENTS, 'utf8');
    const i = md.indexOf(BEGIN);
    const j = md.indexOf(END);
    if (i < 0 || j < 0) {
      console.error(`gate-table: no ${BEGIN} / ${END} markers in .agent/AGENTS.md — add them around the gate table first`);
      process.exit(1);
    }
    writeFileSync(AGENTS, md.slice(0, i) + block + md.slice(j + END.length));
    console.log(`gate-table: wrote ${gates.length} gates into .agent/AGENTS.md`);
    return;
  }
  console.log(block);
  const missing = gates.filter((g) => !DESCRIPTIONS[g.name]);
  if (missing.length) {
    console.error(`\ngate-table: ${missing.length} gate(s) have no description: ${missing.map((g) => g.name).join(', ')}`);
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
