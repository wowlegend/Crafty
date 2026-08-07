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
const HOOK = join(ROOT, '.githooks/pre-push');
const CI = join(ROOT, '.github/workflows/ci.yml');
const AGENTS = join(ROOT, '.agent/AGENTS.md');

export const BEGIN = '<!-- BEGIN GATES (regenerate: node frontend/scripts/ci/gate-table.mjs --write) -->';
export const END = '<!-- END GATES -->';

/**
 * What each gate actually STOPS. Human-authored on purpose — see SCOPE above.
 * Keyed by the gate name as it appears in the hook.
 */
export const DESCRIPTIONS = {
  'mutation-proof-trailer': 'a commit that ADDS a gate (`tests/gates/`, `scripts/ci/`) without a `Mutation-Proof:` trailer stating what was broken and that it went RED',
  'doc-currency': 'a canonical doc citing a path that no longer exists (incl. bare, non-backticked paths), a cross-doc section citation aimed at a section that does not exist, and drift in the generated MEASURED and GATES blocks',
  'queue-ledger': 'a finding in the queue-of-record with no `▣✓/▢/⊘` marker, or a `⊘ DISMISSED` with no proof command',
  'artifact-currency': 'the published Artifact page drifting from HEAD — informational under the ceiling, hard fail above it. Also rejects an unusable page source (missing, or a fetched copy of the published wrapper)',
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
  lines.forEach((line, i) => {
    // the pre-pattern invocation: mutation-proof-trailer runs before the printf-banner block
    if (/mutation-proof-trailer\.mjs/.test(line) && !/^\s*#/.test(line)) {
      if (!gates.some((g) => g.name === 'mutation-proof-trailer')) {
        gates.push({ name: 'mutation-proof-trailer', cmd: 'node scripts/ci/mutation-proof-trailer.mjs <range>', line: i + 1 });
      }
      return;
    }
    const m = line.match(/printf '\\n▶ ([^\\']+?)\\n';\s*(.+)$/);
    if (!m) return;
    const name = m[1].replace(/\s*\([^)]*\)\s*$/, '').trim();
    const cmd = m[2].trim().replace(/^npm run --silent /, 'npm run ').replace(/\s*\|\|.*$/, '');
    gates.push({ name, cmd, line: i + 1 });
  });
  return gates;
}

/** PURE: which gate names appear as CI steps. */
export function parseCi(src) {
  const names = new Set();
  for (const m of src.matchAll(/^\s*-?\s*name:\s*(.+)$/gm)) names.add(m[1].trim().toLowerCase());
  for (const m of src.matchAll(/run:\s*(.+)$/gm)) names.add(m[1].trim().toLowerCase());
  return names;
}

/** PURE: does CI run this gate? Matched on the gate's command, not its prose name. */
export function inCi(gate, ciText) {
  const script = (gate.cmd.match(/scripts\/ci\/([\w-]+)\.mjs/) || [])[1];
  if (script) return new RegExp(script).test(ciText);
  if (/npm run lint/.test(gate.cmd)) return /run: .*npm run lint|npm run lint/.test(ciText);
  if (/test:unit/.test(gate.cmd)) return /test:unit/.test(ciText);
  if (/npm run build/.test(gate.cmd)) return /npm run build/.test(ciText);
  return false;
}

export function renderBlock(gates, ciText) {
  const rows = gates.map((g) => {
    const desc = DESCRIPTIONS[g.name] || '**TODO — describe what this stops** (a new gate landed with no description)';
    return `| ${g.name} | \`${g.cmd}\` | ✅ | ${inCi(g, ciText) ? '✅' : '—'} | ${desc} |`;
  });
  return [
    BEGIN,
    `**${gates.length} gates authorize a push.** Generated from \`.githooks/pre-push\` in hook order — this`,
    'paragraph undercounted itself three times when it was hand-maintained ("three" -> "Six" -> "NINE"),',
    'the last time one commit after the gate landed. Do not edit the table by hand; add the description to',
    '`DESCRIPTIONS` in `gate-table.mjs` and regenerate.',
    '',
    '| Gate | Command | pre-push | CI | What it actually stops |',
    '|---|---|:--:|:--:|---|',
    ...rows,
    END,
  ].join('\n');
}

export function derive() {
  const gates = parseHook(readFileSync(HOOK, 'utf8'));
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
