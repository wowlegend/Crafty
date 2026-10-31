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
 * TWO GRAINS, STATED. The REPORT is at module grain: a module the page EVALUATED, which V8 reports as its top-level
 * code with a count of 1 even when every function in it is uncalled (measured with node:inspector's
 * Profiler.takePreciseCoverage, 2026-10-31: `["", 1]`). Every static import is evaluated at boot, so a module that is
 * imported and never mounted or called still reads as reached; that is what the report can say and all it says. The
 * GATE is at entry-point grain: each MUST_REACH entry names a FUNCTION (`src/x.jsx#Name`, the mounted component or the
 * called hook or function), and it ran when V8's record of that function, by the name V8 gives it, counted a call in
 * some shard (its first range is the whole function, with its call count). So deleting a system's mount turns the job
 * red even when the module keeps other importers (ElementZoneSystem.jsx keeps two). V8 names a function by its
 * declaration, a named function expression, or the const or property it is the value of, so `memo(() => ...)` is
 * anonymous and an entry names `memo(function XRender() {})` instead; the dev server's esbuild renames a name declared
 * twice in a file (`const X = memo(function X() {})` is served as `X2`), so an entry's name is declared once.
 * tests/scripts/runtime-reach-merge.test.js checks both rules against the source, offline.
 *
 * TWO JOBS, ONE REPORT (deep audit 2026-10-30, AUDIT:debt:runtime-reach-per-shard). The e2e suite runs in 8 shards
 * and each reaches 393-399 of the 417 modules, so a per-shard report listed the boss and dragon modules as never
 * reached in half of them, and a shard that attached no coverage printed "instrument failure" and exited 0. Now:
 *
 *   --emit <file> --shard <n> [coverage-dir]   each shard writes the modules ITS coverage evaluated and the named
 *                                              functions that ran (a small JSON), and exits 1 when it read no coverage,
 *                                              reached nothing, or saw no named function (the fixture dropped names)
 *   --merge <dir> --expect <n>                 the `runtime-reach` job reads the n files, unions them, prints one
 *                                              report and exits 1 on a problem: fewer or duplicate shard files, a
 *                                              shard with no entries or no names, an empty contract, or a MUST_REACH
 *                                              entry point that ran in no shard
 *   [coverage-dir]                             one directory's report, for a local run (default test-results/coverage)
 *
 * THE GATE IS FOR A NAMED SET: the unreached list legitimately contains modules the suite does not visit (a showcase
 * page, a theme helper), and failing on all of them would be failing on E2E breadth in a reachability costume.
 * MUST_REACH names the entry points the suite is contracted to run: the systems the scene mounts, the hooks App
 * mounts, the dragon, the boot and the save path. An entry added to it that no spec runs turns the job red; an entry
 * that leaves the contract leaves it by a commit that says why.
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
 * PURE. Partition a known module list into what the game evaluated and what it did not: the report's module grain.
 *
 * `count > 0` on ANY range is the test. A module that was fetched and parsed but never evaluated reports every range at
 * 0; one that was evaluated counts its top-level code at least once, whether or not any function in it was called, which
 * is why the contract is checked by entry point (reachedFunctions), not here.
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

/**
 * PURE. The named functions of known src modules that RAN: `src/x.jsx#Name` for each function V8 named whose first range
 * (the whole function, its call count) counted above 0; and how many named functions the entries carried at all, so a
 * coverage file whose names were dropped reads as an instrument failure rather than as nothing having run. An anonymous
 * function ('') is neither: it cannot be an entry point.
 * @returns {{ ran: string[], named: number }}
 */
export function reachedFunctions(entries, known) {
  const knownSet = new Set(known || []);
  const ran = new Set();
  let named = 0;
  for (const e of Array.isArray(entries) ? entries : []) {
    const path = e && typeof e === 'object' ? urlToSrcPath(e.url) : null;
    if (!path || !knownSet.has(path)) continue;
    for (const f of Array.isArray(e.functions) ? e.functions : []) {
      if (typeof f?.functionName !== 'string' || f.functionName === '') continue;
      named++;
      if ((f.ranges?.[0]?.count || 0) > 0) ran.add(`${path}#${f.functionName}`);
    }
  }
  return { ran: [...ran].sort(), named };
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
 * THE ENTRY POINTS THE E2E SUITE IS CONTRACTED TO RUN, with why. Each group is a way a feature stops running with every
 * gate still green (the 2026-08-05 class): its mount is deleted, its hook or call is dropped, and nothing else notices.
 * Each entry is `module#function`, the function by the name V8 reports for it (see THE GRAIN above): the component its
 * mounter renders, the hook App calls, the function the boot or save path calls. For the dragon's chunk it is
 * `glowHead`, which BossEntity's frame loop calls on every frame the dragon is drawn: the chunk itself is preloaded
 * before a fight, so its module being evaluated says nothing about the dragon being on screen, and BossEntity is an
 * anonymous `memo(() => ...)`. The modules are the 70 the union of the 8 shards of run 41199587278 reached; each entry
 * is the name its module's mounter or caller uses, checked against the source and against the dev server's transform.
 *
 * To add one: it must be an entry point a spec runs today (the job says if not). To remove one: the commit says why the
 * game no longer needs it, because removing an entry is how a contract quietly shrinks.
 */
export const MUST_REACH = Object.freeze([
  { why: 'the systems the scene mounts: a system that never mounts is a feature that never runs', entries: [
    'src/systems/AIWorkerSystem.jsx#AIWorkerSystem', 'src/systems/BootSettle.jsx#BootSettle', 'src/systems/CombatSystem.jsx#CombatSystem',
    'src/systems/EnemyProjectileSystem.jsx#EnemyProjectileSystem', 'src/systems/LootSystem.jsx#LootSystem',
    'src/systems/PositionTracker.jsx#PositionTrackerRender', 'src/systems/SpawnerSystem.jsx#SpawnerSystem',
    'src/systems/WorldClockTicker.jsx#WorldClockTicker', 'src/systems/XPOrbSystem.jsx#XPOrbSystem',
    'src/world/BlockParticleSystem.jsx#BlockParticleSystem', 'src/world/ElementZoneRenderSystem.jsx#ElementZoneRenderSystem',
    'src/world/ElementZoneSystem.jsx#ElementZoneSystem', 'src/world/GPUSparkSystem.jsx#GPUSparkSystem', 'src/world/HurlSystem.jsx#HurlSystem',
    'src/world/PhantomBlockSystem.jsx#PhantomBlockSystem', 'src/world/SnareTetherSystem.jsx#SnareTetherSystem',
    'src/world/SquadAISystem.jsx#SquadAISystem', 'src/world/Terrain.jsx#MinecraftWorldRender', 'src/world/FarField.jsx#FarField',
    'src/EnhancedMagicSystem.jsx#EnhancedMagicSystemRender', 'src/SimplifiedNPCSystem.jsx#NPCSystemRender',
    'src/OptimizedGrassSystem.jsx#OptimizedGrassSystem',
  ] },
  { why: 'the render drivers and audio the scene mounts', entries: [
    'src/render/Atmosphere.jsx#Atmosphere', 'src/render/BloomSpikeDriver.jsx#BloomSpikeDriver', 'src/render/LightMotes.jsx#LightMotes',
    'src/render/LightningDriver.jsx#LightningDriver', 'src/render/MoodGradeDriver.jsx#MoodGradeDriver', 'src/render/Nametags.jsx#NametagsRender',
    'src/render/Ocean.jsx#Ocean', 'src/render/PointerLook.jsx#PointerLook', 'src/render/SpatialAudioController.jsx#SpatialAudioController',
    'src/render/Sun.jsx#Sun', 'src/render/WeatherSystem.jsx#WeatherSystem', 'src/render/lightPool.jsx#PointLightPool',
    'src/render/postFx.jsx#PostTierDriver', 'src/ui/DayNightAudio.jsx#DayNightAudio', 'src/ui/HeartbeatAudio.jsx#HeartbeatAudio',
    'src/ui/MusicPlayer.jsx#MusicPlayer', 'src/SoundManager.jsx#SoundProvider',
  ] },
  { why: 'the hooks and roots App mounts: quests, XP, survival, ember accrual, input, the HUD and the menus', entries: [
    'src/QuestSystem.jsx#useQuestSystem', 'src/SimpleExperienceSystem.jsx#useSimpleExperience', 'src/world/survivalSystem.js#useSurvivalMode',
    'src/world/accrualHooks.js#useEmberAccrual', 'src/GameSystems.jsx#GameSystemsProvider', 'src/InputManager.jsx#useInputManager',
    'src/HUD.jsx#HUD', 'src/ui/GameHud.jsx#GameUI', 'src/ui/TouchControls.jsx#TouchControls', 'src/MenuSystem.jsx#MenuSystem',
    'src/WorldManager.jsx#WorldManager', 'src/Components.jsx#Player', 'src/App.jsx#App', 'src/GameScene.jsx#GameSceneRender',
  ] },
  { why: 'the dragon: its hook, its chunk, its moves and its bar (a fight that never arms was found by no gate once already)', entries: [
    'src/world/bossSystem.js#useBossSystem', 'src/world/bossSmash.js#destroyVoxelsInRadius', 'src/render/BossEntity.jsx#glowHead',
    'src/render/dragonLoader.js#Dragon', 'src/render/dragonTelegraphs.js#decalFor', 'src/game/dragonMoves.js#stepDragon',
    'src/ui/BossHealthBar.jsx#BossHealthBarRender',
  ] },
  { why: 'the boot and the save path: a world that is not loaded, saved or recovered loses the player\'s progress silently', entries: [
    'src/startGame.jsx#startGame', 'src/game/worldBoot.js#bootWorld', 'src/game/saveSchema.js#buildSaveData', 'src/game/worldSaves.js#writeWorld',
    'src/game/autosave.js#installAutosave', 'src/game/contextRecovery.js#onContextLost', 'src/game/contextRecovery.js#recoverFromContextLoss',
    'src/game/settingsPersist.js#initSettingsPersistence', 'src/store/useGameStore.jsx#saveActiveWorld', 'src/game/eventBus.js#emit',
    'src/ui/ContextLossPanel.jsx#ContextLossPanel',
  ] },
]);

/** The shard-file format version: /2 carries the named functions that ran (`functions`) and how many it saw (`named`). */
export const SHARD_FORMAT = 'runtime-reach-shard/2';

/** PURE. What one shard writes: the modules its coverage evaluated, the named functions that ran, and the sizes that say it read something. */
export function shardRecord({ shard, files, entries, known, workerScoped }) {
  const r = reachedModules(entries, known, workerScoped);
  const f = reachedFunctions(entries, known);
  return { format: SHARD_FORMAT, shard: String(shard), files, entries: entries.length, known: r.total, reached: r.reached, named: f.named, functions: f.ran };
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
    if (!sh || sh.format !== SHARD_FORMAT || !Array.isArray(sh.reached) || !Number.isFinite(sh.entries)
      || !Array.isArray(sh.functions) || !Number.isFinite(sh.named)) {
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
    else if (s.named === 0) problems.push(`shard ${s.shard} reached ${s.reached.length} modules and saw no named function: its coverage carries no function names (tests/e2e/_coverage.js), so no entry point can be seen in it`);
  }

  const knownSet = new Set(known);
  const union = new Set();
  for (const s of good) for (const m of s.reached) if (knownSet.has(m)) union.add(m);
  const ran = new Set();
  for (const s of good) for (const fn of s.functions) ran.add(fn);
  const inWorker = workerScoped || new Set();
  const rest = known.filter((m) => !union.has(m));

  let mustTotal = 0;
  let mustReached = 0;
  const mustModules = new Set();
  for (const g of must) {
    const group = g.why.split(':')[0];
    for (const entry of g.entries) {
      mustTotal++;
      const [mod, fn] = String(entry).split('#');
      mustModules.add(mod);
      if (!fn) problems.push(`MUST_REACH entry ${entry} names no function: an entry is module#function (${group})`);
      else if (!knownSet.has(mod)) problems.push(`MUST_REACH names ${entry}, whose module is not a src module any more (${group}): rename or remove the entry`);
      else if (!ran.has(entry)) {
        problems.push(`MUST_REACH ${entry} never ran in any of the ${good.length} shards (${group}), ${union.has(mod) ? 'though its module was evaluated' : 'and its module was never evaluated'}`);
      } else mustReached++;
    }
  }
  if (mustTotal === 0) problems.push('MUST_REACH names no entry point: a contract of nothing passes over nothing');

  return {
    ok: problems.length === 0,
    problems,
    reached: [...union].sort(),
    functionsRan: [...ran].sort(),
    unreached: rest.filter((m) => !inWorker.has(m)).sort(),
    workerScoped: rest.filter((m) => inWorker.has(m)).sort(),
    total: knownSet.size,
    perShard: good.map((s) => ({ shard: s.shard, reached: s.reached.length, entries: s.entries, ran: s.functions.length })),
    mustTotal,
    mustReached,
    mustModules: mustModules.size,
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
    console.log(`runtime-reach: shard ${shard}: ${files} coverage file(s), ${rec.entries} script entries, ${rec.reached.length} of ${rec.known} src modules evaluated, ${rec.functions.length} named functions ran of ${rec.named} seen -> ${out}`);
    if (rec.entries === 0 || rec.reached.length === 0) {
      console.log('  INSTRUMENT FAILURE: the fixture attached no coverage, or none of it mapped to src/. The file was written so the merge names this shard.');
      process.exit(1);
    }
    if (rec.named === 0) {
      console.log('  INSTRUMENT FAILURE: the coverage carries no named function (tests/e2e/_coverage.js keeps functionName), so no entry point can be seen. The file was written so the merge names this shard.');
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
    for (const s of r.perShard) console.log(`    shard ${s.shard}: ${s.entries} script entries, ${s.reached} modules, ${s.ran} named functions ran`);
    console.log(`\n  MUST_REACH: ${r.mustReached} of ${r.mustTotal} entry points ran (in ${r.mustModules} modules)`);
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
