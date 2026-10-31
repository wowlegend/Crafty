import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';
import { mergeShards, shardRecord, MUST_REACH, SHARD_FORMAT } from '../../scripts/ci/runtime-reach.mjs';
import { SKIPPABLE_ON_DOCS } from '../../scripts/ci/ci-ok.mjs';
import { readSourceTree } from '../_support/primitiveCallSites.js';
import { v8FunctionNames, declaredNames } from '../_support/v8FunctionNames.js';
import { slimCoverage } from '../e2e/_coverage.js';

/**
 * THE MERGED RUNTIME-REACH JOB (deep audit 2026-10-30, lane L12; AUDIT:debt:runtime-reach-per-shard).
 *
 * The e2e suite runs in 8 shards. Each used to print its own reach report and exit 0 whatever it read: half the shards
 * listed the dragon's modules as never reached, and a shard with no coverage printed "instrument failure" and passed.
 * Now each shard writes the modules it evaluated and the named functions that ran (`--emit`), and one job (`--merge`)
 * unions the 8 and exits 1 when a shard file is missing, duplicated, empty or carries no function names, when the
 * contract is empty, or when an entry point in MUST_REACH (`module#function`: a mounted component, a called hook or
 * function) ran in none of them, whether or not its module was evaluated.
 *
 * What this drives: the pure merge (every way a shard set can be wrong, and the one way it can be right while no single
 * shard is), what a shard records and what each test keeps of V8's coverage, the real CLI on synthetic files (exit
 * codes, the files it writes), MUST_REACH against the real tree (a renamed module is a stale entry, and each entry names
 * one function by the name V8 reports, declared once in its file), and ci.yml as a YAML document (the emit step, the
 * upload, the merge job, the `--expect` that must equal the matrix). What would still pass if the job were deleted:
 * nothing here.
 *
 * SITED IN tests/scripts/: the subject is a CI script and a workflow file; half of it reads ci.yml, half executes the
 * script on fixtures, and nothing is a behavioural gate over the game.
 *
 * NOT PROVEN HERE: that the real shards' coverage names these functions as the source does. The dev server's transform
 * was checked offline when the entries were written (vite 6.4.5's transformRequest with plugin-react's fast refresh on:
 * 71 of 71 entries name one function), and each PR's CI run is the proof on the real coverage.
 *
 * Mutation-Proof: scripts/dev/mutate.sh, receipts in the commit.
 */

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ROOT = resolve(APP, '..');
const SCRIPT = join(APP, 'scripts/ci/runtime-reach.mjs');
const CI_YML = join(ROOT, '.github/workflows/ci.yml');

// The files under src, as the script's own `git ls-files src` filter reads them (a tracked file is a file on disk here).
const known = readSourceTree().map((f) => f.file).sort();
const mustEntries = MUST_REACH.flatMap((g) => g.entries);
const mustModules = [...new Set(mustEntries.map((e) => e.split('#')[0]))];

const shard = (id, over = {}) => ({
  format: SHARD_FORMAT, shard: String(id), files: 10, entries: 5000, known: known.length, named: 4000, reached: known, functions: mustEntries, ...over,
});
const eight = (over = () => ({})) => Array.from({ length: 8 }, (_, i) => shard(i + 1, over(i + 1)));

describe('mergeShards — the union of 8 shard files, and every way the set can be wrong', () => {
  it('presence: eight good files merge clean, and the report is the union over the tree', () => {
    const r = mergeShards(eight(), { expect: 8, known });
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.reached).toHaveLength(known.length);
    expect(r.perShard).toHaveLength(8);
    expect(r.mustTotal, 'the contract is empty or tiny').toBeGreaterThan(60);
    expect(r.mustReached).toBe(r.mustTotal);
  });

  it('an entry point that ran in ONE shard only ran: the union is the point (the dragon runs in some shards, not all)', () => {
    const boss = 'src/render/BossEntity.jsx#glowHead';
    const r = mergeShards(eight((i) => ({ functions: i === 3 ? mustEntries : mustEntries.filter((e) => e !== boss) })), { expect: 8, known });
    expect(r.ok, r.problems.join('; ')).toBe(true);
    expect(r.functionsRan).toContain(boss);
  });

  it('an entry point that never ran is a problem that names it, though its module was evaluated (the deleted mount: ElementZoneSystem.jsx keeps two other importers)', () => {
    const gone = 'src/world/ElementZoneSystem.jsx#ElementZoneSystem';
    expect(mustEntries).toContain(gone);
    const r = mergeShards(eight(() => ({ functions: mustEntries.filter((e) => e !== gone) })), { expect: 8, known });
    expect(r.ok).toBe(false);
    expect(r.problems.filter((p) => p.includes(gone)), r.problems.join('; ')).toEqual([
      `MUST_REACH ${gone} never ran in any of the 8 shards (the systems the scene mounts), though its module was evaluated`,
    ]);
    expect(r.mustReached).toBe(r.mustTotal - 1);
  });

  it('an entry point whose module was never evaluated says so', () => {
    const gone = 'src/systems/SpawnerSystem.jsx';
    const r = mergeShards(eight(() => ({ reached: known.filter((m) => m !== gone), functions: mustEntries.filter((e) => !e.startsWith(`${gone}#`)) })), { expect: 8, known });
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toContain(`MUST_REACH ${gone}#SpawnerSystem never ran in any of the 8 shards (the systems the scene mounts), and its module was never evaluated`);
  });

  it('a shard whose coverage carries no function names is an instrument failure: no entry point can be seen in it', () => {
    const r = mergeShards(eight((i) => (i === 6 ? { named: 0, functions: [] } : {})), { expect: 8, known });
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/shard 6 reached \d+ modules and saw no named function/);
  });

  it('an empty contract, or an entry that names no function, is a problem', () => {
    expect(mergeShards(eight(), { expect: 8, known, must: [] }).problems).toContain('MUST_REACH names no entry point: a contract of nothing passes over nothing');
    const r = mergeShards(eight(), { expect: 8, known, must: [{ why: 'x: y', entries: ['src/App.jsx'] }] });
    expect(r.problems.join('\n')).toMatch(/MUST_REACH entry src\/App\.jsx names no function/);
  });

  it('a module outside the contract that no shard reached is a report line, not a failure', () => {
    const r = mergeShards(eight(() => ({ reached: known.filter((m) => m !== 'src/theme/contrast.js') })), { expect: 8, known });
    expect(r.ok).toBe(true);
    expect(r.unreached).toContain('src/theme/contrast.js');
  });

  it('no shard file at all is an instrument failure, never a clean report', () => {
    for (const none of [[], undefined, null]) {
      const r = mergeShards(none, { expect: 8, known });
      expect(r.ok).toBe(false);
      expect(r.problems[0]).toMatch(/no shard file was read/);
    }
  });

  it('a missing shard file is named (7 of 8)', () => {
    const r = mergeShards(eight().filter((s) => s.shard !== '5'), { expect: 8, known });
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/1 of 8 shard files missing: shard 5/);
  });

  it('eight files that are one shard twice are not eight shards', () => {
    const r = mergeShards(eight((i) => (i === 8 ? { shard: '7' } : {})), { expect: 8, known });
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/shard 7 appears more than once/);
    expect(r.problems.join('\n')).toMatch(/shard 8/);
  });

  it('a shard outside 1..N is named', () => {
    const r = mergeShards([...eight().slice(0, 7), shard(9)], { expect: 8, known });
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/outside 1\.\.8: 9/);
  });

  it('a shard that read no coverage entries is named, even though its file is well formed', () => {
    const r = mergeShards(eight((i) => (i === 2 ? { entries: 0, reached: [] } : {})), { expect: 8, known });
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/shard 2 read 0 coverage entries/);
  });

  it('a shard with entries that reached nothing is named separately (nothing mapped to src/)', () => {
    const r = mergeShards(eight((i) => (i === 4 ? { reached: [] } : {})), { expect: 8, known });
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/shard 4 read 5000 entries and reached 0 modules/);
  });

  it('an unreadable file and a file of another format are problems, not skipped', () => {
    const r = mergeShards([...eight().slice(0, 6), new Error('shard-7.json: Unexpected end of JSON input'), { format: 'other', shard: '8' }], { expect: 8, known });
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/could not be read: shard-7\.json/);
    expect(r.problems.join('\n')).toMatch(/is not runtime-reach-shard\/2/);
  });

  it('a file in another format version is rejected even when its fields look right (a /1 file has no functions)', () => {
    const r = mergeShards([...eight().slice(0, 7), shard(8, { format: 'runtime-reach-shard/1' })], { expect: 8, known });
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/is not runtime-reach-shard\/2/);
    const noFns = mergeShards([...eight().slice(0, 7), shard(8, { functions: undefined })], { expect: 8, known });
    expect(noFns.problems.join('\n')).toMatch(/is not runtime-reach-shard\/2/);
  });

  it('a MUST_REACH entry whose module is not a src module any more is a stale entry (a rename must update the contract)', () => {
    const r = mergeShards(eight(), { expect: 8, known: known.filter((m) => m !== 'src/game/worldBoot.js') });
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/src\/game\/worldBoot\.js#bootWorld, whose module is not a src module any more/);
  });

  it('a reached path the tree does not list is dropped, not invented into the report', () => {
    const r = mergeShards(eight(() => ({ reached: [...known, 'src/gone.js'] })), { expect: 8, known });
    expect(r.reached).not.toContain('src/gone.js');
    expect(r.reached).toHaveLength(known.length);
  });
});

describe('shardRecord — what one shard writes', () => {
  // V8's per-function record: the function's name and its ranges, the first being the whole function with its call count.
  const fn = (functionName, count) => ({ functionName, ranges: [{ count }, { count: 0 }] });
  const entry = (url, ...functions) => ({ url, functions });
  it('records the modules its entries evaluated, the named functions that ran, how many named functions it saw, and the format', () => {
    const rec = shardRecord({
      shard: 3, files: 2,
      entries: [
        entry('http://x/src/App.jsx?t=1', fn('', 1), fn('App', 4), fn('helper', 0)),
        entry('http://x/src/HUD.jsx', fn('', 0), fn('HUD', 0)),
        entry('http://x/src/App.jsx', fn('App', 1), fn('late', 2)),
        entry('http://x/node_modules/a.js', fn('vendor', 9)),
      ],
      known: ['src/App.jsx', 'src/HUD.jsx'], workerScoped: new Set(),
    });
    expect(rec).toEqual({
      format: SHARD_FORMAT, shard: '3', files: 2, entries: 4, known: 2, reached: ['src/App.jsx'],
      named: 5, functions: ['src/App.jsx#App', 'src/App.jsx#late'],
    });
  });

  it('a function that only a nested block of counted is not taken as run: the first range is the call count', () => {
    const rec = shardRecord({ shard: 1, files: 1, entries: [entry('http://x/src/App.jsx', { functionName: 'App', ranges: [{ count: 0 }, { count: 3 }] })], known: ['src/App.jsx'], workerScoped: new Set() });
    expect(rec.functions).toEqual([]);
  });
});

describe('slimCoverage — what each test keeps of V8\'s coverage (tests/e2e/_coverage.js)', () => {
  it('keeps the url, each function\'s name and its range counts, and drops the source and the offsets', () => {
    const v8 = [{ url: 'http://x/src/App.jsx', scriptId: '7', source: 'export function App() {}', functions: [
      { functionName: 'App', isBlockCoverage: true, ranges: [{ startOffset: 0, endOffset: 24, count: 2 }] },
      { isBlockCoverage: false, ranges: [{ startOffset: 0, endOffset: 1, count: 1 }] },
    ] }];
    expect(slimCoverage(v8)).toEqual([{ url: 'http://x/src/App.jsx', functions: [
      { functionName: 'App', ranges: [{ count: 2 }] },
      { functionName: '', ranges: [{ count: 1 }] },
    ] }]);
  });
});

describe('MUST_REACH — the contract, against the real tree', () => {
  const trees = Object.fromEntries(readSourceTree().map((f) => [f.file, f.text]));
  it('is a list of distinct entry points in src modules that git lists, in groups that say why', () => {
    // 69 of each since CI run 41221423846: WorldManager and recoverFromContextLoss left with a registry row each.
    expect(mustEntries.length, 'the contract shrank').toBeGreaterThanOrEqual(69);
    expect(mustModules.length, 'a module left the contract').toBeGreaterThanOrEqual(69);
    expect(new Set(mustEntries).size, 'an entry is named twice').toBe(mustEntries.length);
    for (const g of MUST_REACH) expect(g.why.length, 'a group with no reason').toBeGreaterThan(20);
    expect(mustModules.filter((m) => !known.includes(m)), 'MUST_REACH names modules the tree no longer has').toEqual([]);
  });

  it('every entry names one function, by the name V8 reports for it, declared once in its file', () => {
    // V8 names a function by its declaration, a named function expression, or the const or property it is the value of;
    // `memo(() => ...)` is anonymous. And the dev server's esbuild renames a second declaration of a name in one file:
    // `const X = memo(function X() {})` is served as `function X2()` (measured on vite 6.4.5 with plugin-react 4.7.0, fast
    // refresh on, 2026-10-31), so a name declared twice would never match. Both are checked here, offline, so a refactor
    // that breaks an entry's name fails before CI does.
    const problems = [];
    for (const e of mustEntries) {
      const [mod, name] = e.split('#');
      const fns = v8FunctionNames(trees[mod]).filter((f) => f.name === name);
      const decls = declaredNames(trees[mod]).filter((n) => n === name).length;
      if (fns.length !== 1) problems.push(`${e}: ${fns.length} functions V8 would name ${name}`);
      else if (decls > 1) problems.push(`${e}: ${name} is declared ${decls} times in the file, and the dev server renames one`);
    }
    expect(problems).toEqual([]);
  });

  it('names an entry of each kind: a mounted component, a hook App calls, a call on the save path, the dragon\'s chunk', () => {
    for (const e of ['src/systems/SpawnerSystem.jsx#SpawnerSystem', 'src/world/ElementZoneSystem.jsx#ElementZoneSystem', 'src/QuestSystem.jsx#useQuestSystem',
      'src/game/worldSaves.js#writeWorld', 'src/game/worldBoot.js#bootWorld', 'src/render/BossEntity.jsx#glowHead', 'src/render/dragonLoader.js#Dragon']) {
      expect(mustEntries, e).toContain(e);
    }
  });
});

describe('the CLI — --emit and --merge on files', () => {
  let dir;
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'runtime-reach-')); });
  afterAll(() => { rmSync(dir, { recursive: true, force: true }); });
  const run = (...args) => spawnSync('node', [SCRIPT, ...args], { cwd: APP, encoding: 'utf8' });

  const coverageDir = (name, entries) => {
    const d = join(dir, name);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'a.json'), JSON.stringify(entries));
    return d;
  };
  const shardDir = (name, files) => {
    const d = join(dir, name);
    mkdirSync(d, { recursive: true });
    for (const [file, rec] of Object.entries(files)) writeFileSync(join(d, file), typeof rec === 'string' ? rec : JSON.stringify(rec));
    return d;
  };
  const allShards = (mut = () => ({})) => Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`shard-${i + 1}.json`, shard(i + 1, mut(i + 1))]));

  it('--emit writes the shard file for a directory of coverage and exits 0', () => {
    const cov = coverageDir('cov-ok', [{ url: 'http://localhost:4179/src/App.jsx?t=1', functions: [{ functionName: '', ranges: [{ count: 1 }] }, { functionName: 'App', ranges: [{ count: 2 }] }] }]);
    const out = join(dir, 'out', 'shard-6.json');
    const r = run('--emit', out, '--shard', '6', cov);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const rec = JSON.parse(readFileSync(out, 'utf8'));
    expect(rec).toMatchObject({ format: SHARD_FORMAT, shard: '6', files: 1, entries: 1, reached: ['src/App.jsx'], named: 1, functions: ['src/App.jsx#App'] });
    expect(rec.known).toBe(known.length);
  });

  it('--emit exits 1, and still writes the file, when the coverage carries no function names (the fixture dropped them)', () => {
    const cov = coverageDir('cov-nonames', [{ url: 'http://localhost:4179/src/App.jsx', functions: [{ ranges: [{ count: 2 }] }] }]);
    const out = join(dir, 'out', 'shard-7.json');
    const r = run('--emit', out, '--shard', '7', cov);
    expect(r.status, r.stdout).toBe(1);
    expect(r.stdout).toMatch(/no named function/);
    expect(JSON.parse(readFileSync(out, 'utf8')).named).toBe(0);
  });

  it('--emit exits 1 when the coverage directory does not exist (a shard that wrote nothing is not a clean shard)', () => {
    const r = run('--emit', join(dir, 'out', 'x.json'), '--shard', '1', join(dir, 'nope'));
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/INSTRUMENT FAILURE/);
  });

  it('--emit exits 1, and still writes the file, when the coverage holds no entries', () => {
    const cov = coverageDir('cov-empty', []);
    const out = join(dir, 'out', 'shard-2.json');
    const r = run('--emit', out, '--shard', '2', cov);
    expect(r.status).toBe(1);
    expect(existsSync(out), 'the merge could not name this shard').toBe(true);
    expect(JSON.parse(readFileSync(out, 'utf8')).entries).toBe(0);
  });

  it('--emit exits 1 when no entry maps to src/ (presence: the same call with one src entry exits 0, above)', () => {
    const cov = coverageDir('cov-foreign', [{ url: 'http://localhost:4179/node_modules/x.js', functions: [{ ranges: [{ count: 1 }] }] }]);
    expect(run('--emit', join(dir, 'out', 'shard-3.json'), '--shard', '3', cov).status).toBe(1);
  });

  it('--merge exits 0 on eight good shard files and prints the denominator and the contract', () => {
    const d = shardDir('merge-ok', allShards());
    const r = run('--merge', d, '--expect', '8');
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/8 shard file\(s\) of 8/);
    expect(r.stdout).toMatch(new RegExp(`MUST_REACH: ${mustEntries.length} of ${mustEntries.length} entry points ran \\(in ${mustModules.length} modules\\)`));
  });

  it('--merge exits 1 when a MUST_REACH entry point ran in no shard, though its module was evaluated, and names it', () => {
    const d = shardDir('merge-must', allShards(() => ({ functions: mustEntries.filter((e) => e !== 'src/world/HurlSystem.jsx#HurlSystem') })));
    const r = run('--merge', d, '--expect', '8');
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/MUST_REACH src\/world\/HurlSystem\.jsx#HurlSystem never ran in any of the 8 shards .*though its module was evaluated/);
  });

  it('--merge exits 1 with seven files, with an empty directory and with no directory', () => {
    const seven = allShards();
    delete seven['shard-8.json'];
    expect(run('--merge', shardDir('merge-seven', seven), '--expect', '8').status).toBe(1);
    expect(run('--merge', shardDir('merge-none', {}), '--expect', '8').status).toBe(1);
    expect(run('--merge', join(dir, 'absent'), '--expect', '8').status).toBe(1);
  });

  it('--merge exits 1 on a file that is not JSON, and 2 when it is not told how many shards to expect', () => {
    const files = allShards();
    files['shard-3.json'] = '{ not json';
    expect(run('--merge', shardDir('merge-bad', files), '--expect', '8').status).toBe(1);
    expect(run('--merge', shardDir('merge-noexpect', allShards())).status).toBe(2);
  });
});

describe('ci.yml — the shards emit, the job merges, and the number 8 is one number', () => {
  const doc = parseYaml(readFileSync(CI_YML, 'utf8'));
  const e2e = doc.jobs.e2e;
  const merge = doc.jobs['runtime-reach'];
  const runs = (job) => (job.steps || []).map((s) => s.run).filter(Boolean);
  const matrix = e2e.strategy.matrix.shard;

  it('the merge job exists, runs after the e2e job whatever its result, and is conditional on the scope like e2e', () => {
    expect(merge, 'no runtime-reach job').toBeTruthy();
    expect(merge.needs).toEqual(['changes', 'e2e']);
    expect(merge.if).toBe("always() && needs.changes.outputs.code != 'false' && needs.changes.outputs.certified != 'true'");
    expect(SKIPPABLE_ON_DOCS).toContain('runtime-reach');
    expect(doc.jobs['ci-ok'].needs).toContain('runtime-reach');
  });

  it('each shard emits its file for ITS number and uploads it, failing the shard when the file is missing', () => {
    const emit = (e2e.steps || []).find((s) => /runtime-reach\.mjs --emit/.test(s.run || ''));
    expect(emit, 'no emit step in the e2e job').toBeTruthy();
    expect(emit.if).toBe('always()');
    expect(emit.run).toBe('node scripts/ci/runtime-reach.mjs --emit test-results/reach/shard-${{ matrix.shard }}.json --shard ${{ matrix.shard }}');
    const up = (e2e.steps || []).find((s) => s.uses?.startsWith('actions/upload-artifact') && s.with?.name === 'reach-shard-${{ matrix.shard }}');
    expect(up, 'the reach file is not uploaded').toBeTruthy();
    expect(up.if).toBe('always()');
    expect(up.with.path).toBe('frontend/test-results/reach/');
    expect(up.with['if-no-files-found']).toBe('error');
  });

  it('the old per-shard report step is gone: no job runs the script with no mode', () => {
    for (const [id, job] of Object.entries(doc.jobs)) {
      for (const r of runs(job)) {
        if (/runtime-reach\.mjs/.test(r)) expect(r, `${id} runs runtime-reach with no mode`).toMatch(/--emit|--merge/);
      }
    }
  });

  it('the merge downloads every reach-shard-* artifact into the directory it reads and expects as many files as the matrix has shards', () => {
    const dl = merge.steps.find((s) => s.uses?.startsWith('actions/download-artifact'));
    expect(dl?.with).toMatchObject({ pattern: 'reach-shard-*', path: 'frontend/test-results/reach', 'merge-multiple': true });
    const step = merge.steps.find((s) => /runtime-reach\.mjs --merge/.test(s.run || ''));
    expect(step, 'no merge step').toBeTruthy();
    expect(step.run).toBe(`node scripts/ci/runtime-reach.mjs --merge test-results/reach --expect ${matrix.length}`);
  });

  it('the matrix, the --shard=N/M split and the merge\'s --expect are one number', () => {
    const e2eRun = runs(e2e).find((r) => /test:e2e/.test(r));
    const m = /--shard=\$\{\{ matrix\.shard \}\}\/(\d+)/.exec(e2eRun);
    expect(m, 'the e2e command has no --shard=N/M').toBeTruthy();
    expect(Number(m[1])).toBe(matrix.length);
    expect(matrix).toEqual(Array.from({ length: matrix.length }, (_, i) => i + 1));
  });

  it('the merge job checks out src (git ls-files and the worker closure read it) and installs nothing', () => {
    const co = merge.steps.find((s) => s.uses?.startsWith('actions/checkout'));
    expect(co.with['sparse-checkout']).toMatch(/frontend\/src\//);
    expect(co.with['sparse-checkout']).toMatch(/frontend\/scripts\/ci\/runtime-reach\.mjs/);
    expect(runs(merge).join('\n')).not.toMatch(/npm (ci|install)/);
  });
});
