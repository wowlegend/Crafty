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
 * THE GRAIN, STATED. "Reached" is a module the page EVALUATED: V8 reports an evaluated ES module's top-level code as
 * a range with count 1, so a module that is imported and never mounted or called still reads as reached (measured
 * with node:inspector's Profiler.takePreciseCoverage, 2026-10-31: the top-level entry is `["", 1]` for a module whose
 * every function is uncalled). What it sees is a module that nothing imports any more, which is what deleting a
 * system's mount (and the import eslint then forces out) leaves behind. A function never called inside a module that
 * is imported is not seen: the per-test coverage file keeps no function names (tests/e2e/_fixtures.js), and the
 * dev server's React-refresh wrapper adds an executed function to every .jsx module, so counting executed
 * functions would mean nothing. Function-level reach is a named open row, not something this reports.
 *
 * TWO JOBS, ONE REPORT (deep audit 2026-10-30, AUDIT:debt:runtime-reach-per-shard). The e2e suite runs in 8 shards
 * and each reaches 391-397 of the 415 modules, so a per-shard report listed the boss and dragon modules as never
 * reached in half of them, and a shard that attached no coverage printed "instrument failure" and exited 0. Now:
 *
 *   --emit <file> --shard <n> [coverage-dir]   each shard writes the modules ITS coverage reached (a small JSON) and
 *                                              exits 1 when it read no coverage or reached nothing
 *   --merge <dir> --expect <n>                 the `runtime-reach` job reads the n files, unions them, prints one
 *                                              report and exits 1 on a problem: fewer or duplicate shard files, a
 *                                              shard with no entries, or a MUST_REACH module the union never reached
 *   [coverage-dir]                             one directory's report, for a local run (default test-results/coverage)
 *
 * THE GATE IS FOR A NAMED SET, as this header used to say it would be: the unreached list legitimately contains
 * modules the suite does not visit (a showcase page, a theme helper), and failing on all of them would be failing on
 * E2E breadth in a reachability costume. MUST_REACH names the modules the suite is contracted to reach: the systems
 * the scene mounts, the hooks App mounts, the dragon, the boot and the save path. A module added to it that no spec
 * reaches turns the job red; a module that leaves the contract leaves it by a commit that says why.
 *
 * Mutation-Proof: tests/gates/runtime-reach-gates.test.js and tests/scripts/runtime-reach-merge.test.js, receipts in
 * the commit that added the merge.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
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
 * PURE. Partition a known module list into what the game executed and what it did not.
 *
 * `count > 0` on ANY range is the test, and the distinction from "was loaded" is the whole point: Vite
 * serves a module and V8 parses it even when every range is 0, i.e. an import that ran no code. Counting
 * a parse as a reach would make this agree with knip and inherit the blind spot it exists to cover.
 *
 * @param {Array<{url: string, functions: Array<{ranges: Array<{count: number}>}>}>} entries  V8 coverage
 * @param {string[]} known  repo-relative src module paths — the DENOMINATOR of record
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
    if (executed) hit.add(path); // the same module arrives under several URLs and in many files: one reach
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

/**
 * THE MODULES THE E2E SUITE IS CONTRACTED TO REACH, with why. Each group is a way a feature stops running with every
 * gate still green (the 2026-08-05 class): its mount is deleted or its import is lost, and nothing else notices. Every
 * entry was reached by the union of the 8 shards of CI run 41199587278 (a05bf328's lineage: 408 of 415 modules, the
 * seven unreached being brand.js, i18n/keyReachability.js, render/passTimer.js, theme/contrast.js, ui/LocaleToggle.jsx,
 * ui/PrimitivesShowcase.jsx and world/detile.js, none a game system).
 *
 * To add one: it must be a module a spec reaches today (the job says if not). To remove one: the commit says why the
 * game no longer needs it, because removing an entry is how a contract quietly shrinks.
 */
export const MUST_REACH = Object.freeze([
  { why: 'the systems the scene mounts: a system that never mounts is a feature that never runs', modules: [
    'src/systems/AIWorkerSystem.jsx', 'src/systems/BootSettle.jsx', 'src/systems/CombatSystem.jsx', 'src/systems/EnemyProjectileSystem.jsx',
    'src/systems/LootSystem.jsx', 'src/systems/PositionTracker.jsx', 'src/systems/SpawnerSystem.jsx', 'src/systems/WorldClockTicker.jsx',
    'src/systems/XPOrbSystem.jsx',
    'src/world/BlockParticleSystem.jsx', 'src/world/ElementZoneRenderSystem.jsx', 'src/world/ElementZoneSystem.jsx', 'src/world/GPUSparkSystem.jsx',
    'src/world/HurlSystem.jsx', 'src/world/PhantomBlockSystem.jsx', 'src/world/SnareTetherSystem.jsx', 'src/world/SquadAISystem.jsx',
    'src/world/Terrain.jsx', 'src/world/FarField.jsx',
    'src/EnhancedMagicSystem.jsx', 'src/SimplifiedNPCSystem.jsx', 'src/OptimizedGrassSystem.jsx',
  ] },
  { why: 'the render drivers and audio the scene mounts', modules: [
    'src/render/Atmosphere.jsx', 'src/render/BloomSpikeDriver.jsx', 'src/render/LightMotes.jsx', 'src/render/LightningDriver.jsx',
    'src/render/MoodGradeDriver.jsx', 'src/render/Nametags.jsx', 'src/render/Ocean.jsx', 'src/render/PointerLook.jsx',
    'src/render/SpatialAudioController.jsx', 'src/render/Sun.jsx', 'src/render/WeatherSystem.jsx', 'src/render/lightPool.jsx', 'src/render/postFx.jsx',
    'src/ui/DayNightAudio.jsx', 'src/ui/HeartbeatAudio.jsx', 'src/ui/MusicPlayer.jsx', 'src/SoundManager.jsx',
  ] },
  { why: 'the hooks and roots App mounts: quests, XP, survival, ember accrual, input, the HUD and the menus', modules: [
    'src/QuestSystem.jsx', 'src/SimpleExperienceSystem.jsx', 'src/world/survivalSystem.js', 'src/world/accrualHooks.js', 'src/GameSystems.jsx',
    'src/InputManager.jsx', 'src/HUD.jsx', 'src/ui/GameHud.jsx', 'src/ui/TouchControls.jsx', 'src/MenuSystem.jsx', 'src/WorldManager.jsx',
    'src/Components.jsx', 'src/App.jsx', 'src/GameScene.jsx',
  ] },
  { why: 'the dragon: its hook, its chunk, its moves and its bar (a fight that never arms was found by no gate once already)', modules: [
    'src/world/bossSystem.js', 'src/world/bossSmash.js', 'src/render/BossEntity.jsx', 'src/render/dragonLoader.js',
    'src/render/dragonTelegraphs.js', 'src/game/dragonMoves.js', 'src/ui/BossHealthBar.jsx',
  ] },
  { why: 'the boot and the save path: a world that is not loaded, saved or recovered loses the player\'s progress silently', modules: [
    'src/startGame.jsx', 'src/game/worldBoot.js', 'src/game/saveSchema.js', 'src/game/worldSaves.js', 'src/game/autosave.js',
    'src/game/contextRecovery.js', 'src/game/settingsPersist.js', 'src/store/useGameStore.jsx', 'src/game/eventBus.js', 'src/ui/ContextLossPanel.jsx',
  ] },
]);

/** The shard-file format version. */
export const SHARD_FORMAT = 'runtime-reach-shard/1';

/** PURE. What one shard writes: the modules its coverage reached, and the sizes that say it read something. */
export function shardRecord({ shard, files, entries, known, workerScoped }) {
  const r = reachedModules(entries, known, workerScoped);
  return { format: SHARD_FORMAT, shard: String(shard), files, entries: entries.length, known: r.total, reached: r.reached };
}

/**
 * PURE. Union the shard files and judge them. `shards` are parsed records (or an Error for an unreadable file),
 * `expect` the number of shard files the e2e matrix produces, `known` the src modules git lists.
 *
 * Every problem is a reason the report cannot be trusted or the contract is broken; none is a finding about breadth.
 *
 * @returns {{ok: boolean, problems: string[], reached: string[], unreached: string[], workerScoped: string[], total: number, perShard: Array<{shard: string, reached: number, entries: number}>, mustTotal: number, mustReached: number}}
 */
export function mergeShards(shards, { expect, known, must = MUST_REACH, workerScoped }) {
  const problems = [];
  const list = Array.isArray(shards) ? shards : [];
  const good = [];
  for (const sh of list) {
    if (sh instanceof Error) { problems.push(`a shard file could not be read: ${sh.message}`); continue; }
    if (!sh || sh.format !== SHARD_FORMAT || !Array.isArray(sh.reached) || !Number.isFinite(sh.entries)) {
      problems.push(`a shard file is not ${SHARD_FORMAT}: ${JSON.stringify(sh)?.slice(0, 120)}`);
      continue;
    }
    good.push(sh);
  }
  if (list.length === 0) problems.push('no shard file was read: the e2e shards uploaded nothing, so this is an instrument failure, not a clean report');
  const expected = Array.from({ length: expect }, (_, i) => String(i + 1));
  const ids = good.map((s) => s.shard);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) problems.push(`shard ${[...new Set(dup)].join(', ')} appears more than once`);
  const missing = expected.filter((id) => !ids.includes(id));
  if (missing.length) problems.push(`${missing.length} of ${expect} shard files missing: shard ${missing.join(', ')}`);
  const stray = ids.filter((id) => !expected.includes(id));
  if (stray.length) problems.push(`shard file(s) outside 1..${expect}: ${stray.join(', ')}`);
  for (const s of good) {
    if (s.entries === 0) problems.push(`shard ${s.shard} read 0 coverage entries: the fixture did not attach, so its reach is unknown`);
    else if (s.reached.length === 0) problems.push(`shard ${s.shard} read ${s.entries} entries and reached 0 modules: nothing mapped to src/`);
  }

  const knownSet = new Set(known);
  const union = new Set();
  for (const s of good) for (const m of s.reached) if (knownSet.has(m)) union.add(m);
  const inWorker = workerScoped || new Set();
  const rest = known.filter((m) => !union.has(m));

  let mustTotal = 0;
  let mustReached = 0;
  for (const g of must) {
    for (const m of g.modules) {
      mustTotal++;
      if (!knownSet.has(m)) problems.push(`MUST_REACH names ${m}, which is not a src module any more (${g.why.split(':')[0]}): rename or remove the entry`);
      else if (!union.has(m)) problems.push(`MUST_REACH ${m} was reached by none of the ${good.length} shards (${g.why.split(':')[0]})`);
      else mustReached++;
    }
  }

  return {
    ok: problems.length === 0,
    problems,
    reached: [...union].sort(),
    unreached: rest.filter((m) => !inWorker.has(m)).sort(),
    workerScoped: rest.filter((m) => inWorker.has(m)).sort(),
    total: knownSet.size,
    perShard: good.map((s) => ({ shard: s.shard, reached: s.reached.length, entries: s.entries })),
    mustTotal,
    mustReached,
  };
}

/** Read every *.json coverage file in `dir`: { files, entries } (an unreadable file is named and skipped). */
function loadCoverageDir(dir) {
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
  return { files: files.length, entries };
}

function workerScopeOf(known) {
  // **/*.worker.js, NOT src/workers/*.worker.js — terrain.worker.js lives in src/world/, and the
  // enumeration that first found this blind spot had exactly that denominator bug.
  const workerEntries = known.filter((f) => f.endsWith('.worker.js'));
  const read = (p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8') : null);
  return workerClosure(workerEntries, read);
}

function printReport(r, headline) {
  const pct = r.total ? ((r.reached.length / r.total) * 100).toFixed(1) : '0.0';
  console.log(`\n${headline}`);
  console.log(`  the running game executed ${r.reached.length} of ${r.total} src modules (${pct}%)`);
  console.log(`  ${r.workerScoped.length} module(s) run only inside a Web Worker — NOT OBSERVABLE by this`);
  console.log(`    instrument (separate V8 isolate), so their absence is not evidence of anything:`);
  for (const m of r.workerScoped) console.log(`      ${m}`);
  console.log(`\n  ${r.unreached.length} module(s) the E2E playthrough never reached on the main thread:`);
  for (const m of r.unreached.slice(0, 60)) console.log(`    ${m}`);
  if (r.unreached.length > 60) console.log(`    … and ${r.unreached.length - 60} more`);
  console.log('\n  READ THIS CORRECTLY. Unreached means THIS SUITE never got there — a subsystem no spec');
  console.log('  visits is expected here. It is a finding only for a module the suite should have reached (MUST_REACH).');
  console.log('  Distinct from coverage-zero.mjs, which reports what no TEST executed.');
}

function arg(argv, name) {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1] ?? null;
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const known = knownSrcModules();
  const inWorker = workerScopeOf(known);

  if (argv.includes('--emit')) {
    const out = arg(argv, '--emit');
    const shard = arg(argv, '--shard');
    const dirArg = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--emit' && argv[i - 1] !== '--shard');
    if (!out || !shard) { console.log('runtime-reach --emit <file> --shard <n> [coverage-dir]'); process.exit(2); }
    const dir = resolve(ROOT, dirArg || 'test-results/coverage');
    if (!existsSync(dir)) {
      console.log(`runtime-reach: shard ${shard}: no coverage at ${dir}: the e2e fixture wrote nothing. INSTRUMENT FAILURE (a shard with no coverage reaches nothing it can report).`);
      process.exit(1);
    }
    const { files, entries } = loadCoverageDir(dir);
    const rec = shardRecord({ shard, files, entries, known, workerScoped: inWorker });
    mkdirSync(dirname(resolve(ROOT, out)), { recursive: true });
    writeFileSync(resolve(ROOT, out), `${JSON.stringify(rec)}\n`);
    console.log(`runtime-reach: shard ${shard}: ${files} coverage file(s), ${rec.entries} script entries, ${rec.reached.length} of ${rec.known} src modules reached -> ${out}`);
    if (rec.entries === 0 || rec.reached.length === 0) {
      console.log('  INSTRUMENT FAILURE: the fixture attached no coverage, or none of it mapped to src/. The file was written so the merge names this shard.');
      process.exit(1);
    }
    process.exit(0);
  }

  if (argv.includes('--merge')) {
    const dir = resolve(process.cwd(), arg(argv, '--merge') || '');
    const expect = Number(arg(argv, '--expect'));
    if (!Number.isInteger(expect) || expect < 1) { console.log('runtime-reach --merge <dir> --expect <number of shards>'); process.exit(2); }
    const shards = existsSync(dir)
      ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => {
          try { return JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch (e) { return new Error(`${f}: ${e.message}`); }
        })
      : [];
    const r = mergeShards(shards, { expect, known, workerScoped: inWorker });
    printReport(r, `runtime-reach (merged): ${shards.length} shard file(s) of ${expect}`);
    for (const s of r.perShard) console.log(`    shard ${s.shard}: ${s.entries} script entries, ${s.reached} modules`);
    console.log(`\n  MUST_REACH: ${r.mustReached} of ${r.mustTotal} named modules reached`);
    if (!r.ok) {
      console.log(`\n  FAILED — ${r.problems.length} problem(s):`);
      for (const p of r.problems) console.log(`    - ${p}`);
      process.exit(1);
    }
    process.exit(0);
  }

  // One directory's report, for a local run. An absent or empty directory is an instrument failure and exits 1.
  const dir = resolve(ROOT, argv.find((a) => !a.startsWith('--')) || 'test-results/coverage');
  if (!existsSync(dir)) {
    console.log(`runtime-reach: no coverage at ${dir}: the e2e fixture wrote nothing. INSTRUMENT FAILURE, not a finding that the game reached nothing.`);
    process.exit(1);
  }
  const { files, entries } = loadCoverageDir(dir);
  const r = reachedModules(entries, known, inWorker);
  console.log(`\nruntime-reach: ${files} coverage file(s), ${entries.length} script entries`);
  if (r.empty) {
    console.log('  NO COVERAGE ENTRIES. The fixture did not attach — INSTRUMENT FAILURE, not a finding that the game reached nothing.');
    process.exit(1);
  }
  printReport(r, 'runtime-reach (one directory)');
  process.exit(0);
}
