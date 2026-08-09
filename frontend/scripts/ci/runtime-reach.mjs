#!/usr/bin/env node
/**
 * RUNTIME REACHABILITY — which src modules the RUNNING GAME executed during the E2E playthrough.
 *
 * THE DEFECT THIS EXISTS FOR. On 2026-08-05 four features shipped, compiled, passed every gate, and never
 * ran: two achievements nothing called (`fddf7d4`), mob grass-bending that 81 chunks drove and none of
 * them worked (`34f11b0`), a mote layer rendering at the world origin instead of with its chunk
 * (`869f71e`), two keybinds advertised nowhere (`8a5e008`). Four in ONE day, caught by nothing.
 *
 * Every existing instrument answers an adjacent question. `knip` sees the export is used. A source-grep
 * gate sees the line exists. `npm run build` sees it compiles. `coverage-zero.mjs` sees whether a TEST
 * executed it — and its own header says, correctly, that it "can never measure whether the APP reaches
 * it". This is the instrument for that sentence.
 *
 * WHAT MAKES IT DIFFERENT: the coverage is collected from V8 inside the browser while PLAYWRIGHT drives a
 * real booted game — world built, HUD mounted, input dispatched. So "reached" means the game got there,
 * not that a test called it. A module can sit at 100% unit coverage and be unreachable in play; that is
 * the exact shape of all four defects above.
 *
 * REPORT-ONLY, deliberately, and this is not timidity. The unreached list will legitimately include
 * whole subsystems the 28-spec suite never visits — the boss lair, crafting, trading. Failing on that
 * would be failing on E2E breadth wearing a reachability costume, and the honest response to a big
 * unreached list is to write specs, not to ratchet a number. It becomes a gate only for a NAMED module
 * set, once someone decides which ones the suite is contracted to reach.
 *
 *   node scripts/ci/runtime-reach.mjs [coverage-dir]     (default: test-results/coverage)
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * PURE. Map a dev-server script URL back to a repo-relative src path, or null if it is not ours.
 *
 * Vite appends `?t=<ts>` on HMR and `?v=<hash>` on pre-bundled deps, so the SAME module arrives under
 * several URLs; without stripping, the reached-set inflates and the report quietly overstates coverage.
 *
 * @param {string} url
 * @returns {string|null}
 */
export function urlToSrcPath(url) {
  if (typeof url !== 'string' || !url) return null;
  const noQuery = url.split('?')[0];
  const i = noQuery.indexOf('/src/');
  if (i === -1) return null;
  const rel = noQuery.slice(i + 1); // drop the leading slash -> "src/..."
  // node_modules can legitimately contain a "/src/" segment; the denominator is OUR source only.
  if (rel.includes('node_modules') || rel.startsWith('src/../')) return null;
  return rel;
}

/**
 * PURE. Partition a known module list into what the game executed and what it did not.
 *
 * `count > 0` on ANY range is the test, and the distinction from "was loaded" is the whole point: Vite
 * serves a module and V8 parses it even when every range is 0, i.e. an import that ran no code. Counting
 * a parse as a reach would make this agree with knip and inherit the blind spot it exists to cover.
 *
 * @param {Array<{url: string, functions: Array<{ranges: Array<{count: number}>}>}>} entries  V8 coverage
 * @param {string[]} known  repo-relative src module paths — the DENOMINATOR of record
 */
/**
 * PURE. Transitive import closure from the worker entry points — i.e. everything this instrument is
 * STRUCTURALLY BLIND TO.
 *
 * `page.coverage` observes the PAGE's V8 isolate. A Web Worker is a separate isolate, so nothing it
 * executes is ever reported. This project runs two — `src/workers/ai.worker.js` (mob AI) and
 * `src/world/terrain.worker.js` (greedy mesher) — and on the first real run NINE of the twenty
 * "unreached" modules were worker-only. Publishing "the game never reached the greedy mesher" would have
 * been this instrument lying with total confidence: the precise failure it was built to catch.
 *
 * Transitive, not one-level: `mesher.js` is a direct worker import but `grassField.js` only arrives
 * through it, and a shallow scan would mislabel it one indirection deeper.
 *
 * @param {string[]} entries  worker entry paths, repo-relative
 * @param {(path: string) => string|null} readSource  injected so this stays pure and testable
 * @returns {Set<string>}
 */
export function workerClosure(entries, readSource) {
  const seen = new Set();
  const stack = [...(entries || [])];
  const roots = new Set(entries || []);

  while (stack.length) {
    const cur = stack.pop();
    const src = readSource(cur);
    if (src == null) continue;
    for (const m of src.matchAll(/(?:import|export)[\s\S]{0,200}?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g)) {
      const spec = m[1] || m[2];
      if (!spec || !spec.startsWith('.')) continue; // bare specifier -> a package, not our source
      const resolved = resolveSpec(cur, spec, readSource);
      if (!resolved || seen.has(resolved) || roots.has(resolved)) continue; // `seen` also breaks cycles
      seen.add(resolved);
      stack.push(resolved);
    }
  }
  return seen;
}

/** Resolve a relative specifier against its importer, trying the extensionless forms Vite accepts. */
function resolveSpec(fromPath, spec, readSource) {
  const base = fromPath.split('/').slice(0, -1);
  for (const part of spec.split('/')) {
    if (part === '.' || part === '') continue;
    if (part === '..') base.pop();
    else base.push(part);
  }
  const p = base.join('/');
  for (const cand of [p, `${p}.js`, `${p}.jsx`, `${p}/index.js`, `${p}/index.jsx`]) {
    if (readSource(cand) != null) return cand;
  }
  return null;
}

/**
 * @param {Set<string>} [workerScoped]  modules only a worker runs — reported separately, never as a finding
 */
export function reachedModules(entries, known, workerScoped) {
  const list = Array.isArray(entries) ? entries : [];
  const knownSet = new Set(known || []);
  const inWorker = workerScoped || new Set();
  const hit = new Set();

  for (const e of list) {
    if (!e || typeof e !== 'object') continue;
    const path = urlToSrcPath(e.url);
    // A reached-set larger than its denominator is a broken report, so an entry for a module that is
    // not in the known list (a deleted file, a stale artifact) is dropped rather than invented into a row.
    if (!path || !knownSet.has(path)) continue;
    const fns = Array.isArray(e.functions) ? e.functions : [];
    const executed = fns.some((f) => Array.isArray(f?.ranges) && f.ranges.some((r) => (r?.count || 0) > 0));
    if (executed) hit.add(path); // union across shards — three shards cover the same module separately
  }

  const reached = [...hit].sort();
  // Three classes, not two. A worker-only module is NOT OBSERVABLE here, which is a different statement
  // from "the game never got there" — and measurement outranks classification, so a module that shows up
  // executing on the main thread counts as reached even if a worker also imports it.
  const rest = (known || []).filter((m) => !hit.has(m));
  return {
    reached,
    workerScoped: rest.filter((m) => inWorker.has(m)).sort(),
    unreached: rest.filter((m) => !inWorker.has(m)).sort(),
    total: knownSet.size,
    // An empty coverage set means the FIXTURE failed to attach, not that the game reached nothing.
    // "0 of 281 modules reached" is a spectacular-looking number and a pure instrument failure.
    empty: list.length === 0,
  };
}

/** Every src module git knows about — the denominator, taken from the tree rather than a hand list. */
function knownSrcModules() {
  const out = execFileSync('git', ['ls-files', 'src'], { cwd: ROOT, encoding: 'utf8' });
  return out
    .split('\n')
    .filter((f) => /\.(js|jsx)$/.test(f) && !/\.test\.(js|jsx)$/.test(f))
    .sort();
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const dir = resolve(ROOT, process.argv[2] || 'test-results/coverage');
  if (!existsSync(dir)) {
    console.log(`runtime-reach: no coverage at ${dir} — the e2e fixture wrote nothing (not a failure here)`);
    process.exit(0);
  }
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  const entries = [];
  for (const f of files) {
    try {
      const parsed = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      if (Array.isArray(parsed)) entries.push(...parsed);
    } catch {
      console.log(`  (skipped unreadable ${f})`);
    }
  }

  const known = knownSrcModules();
  // **/*.worker.js, NOT src/workers/*.worker.js — terrain.worker.js lives in src/world/, and the
  // enumeration that first found this blind spot had exactly that denominator bug.
  const workerEntries = known.filter((f) => f.endsWith('.worker.js'));
  const read = (p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8') : null);
  const inWorker = workerClosure(workerEntries, read);
  const r = reachedModules(entries, known, inWorker);

  console.log(`\nruntime-reach: ${files.length} coverage file(s), ${entries.length} script entries`);
  if (r.empty) {
    console.log('  NO COVERAGE ENTRIES. The fixture did not attach — this is an instrument failure,');
    console.log('  NOT a finding that the game reached nothing.');
    process.exit(0);
  }
  const pct = r.total ? ((r.reached.length / r.total) * 100).toFixed(1) : '0.0';
  console.log(`  the running game executed ${r.reached.length} of ${r.total} src modules (${pct}%)`);
  console.log(`  ${r.workerScoped.length} module(s) run only inside a Web Worker — NOT OBSERVABLE by this`);
  console.log(`    instrument (separate V8 isolate), so their absence is not evidence of anything:`);
  for (const m of r.workerScoped) console.log(`      ${m}`);
  console.log(`\n  ${r.unreached.length} module(s) the E2E playthrough never reached on the main thread:`);
  for (const m of r.unreached.slice(0, 40)) console.log(`    ${m}`);
  if (r.unreached.length > 40) console.log(`    … and ${r.unreached.length - 40} more`);
  console.log('\n  READ THIS CORRECTLY. Unreached means THIS SUITE never got there — a subsystem no spec');
  console.log('  visits is expected here. It is a finding only for a module the suite should have reached.');
  console.log('  Distinct from coverage-zero.mjs, which reports what no TEST executed.');
  process.exit(0); // report, never a gate — see the header
}
