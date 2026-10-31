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

/**
 * THE MERGED RUNTIME-REACH JOB (deep audit 2026-10-30, lane L12; AUDIT:debt:runtime-reach-per-shard).
 *
 * The e2e suite runs in 8 shards. Each used to print its own reach report and exit 0 whatever it read: half the shards
 * listed the dragon's modules as never reached, and a shard with no coverage printed "instrument failure" and passed.
 * Now each shard writes the modules it reached (`--emit`), and one job (`--merge`) unions the 8 and exits 1 when a
 * shard file is missing, duplicated or empty, or when a module in MUST_REACH was reached by none of them.
 *
 * What this drives: the pure merge (every way a shard set can be wrong, and the one way it can be right while no single
 * shard is), the real CLI on synthetic shard files (exit codes, the files it writes), MUST_REACH against the real tree
 * (a renamed module is a stale entry), and ci.yml as a YAML document (the emit step, the upload, the merge job, the
 * `--expect` that must equal the matrix). What would still pass if the job were deleted: nothing here.
 *
 * SITED IN tests/scripts/: the subject is a CI script and a workflow file; half of it reads ci.yml, half executes the
 * script on fixtures, and nothing is a behavioural gate over the game.
 *
 * NOT PROVEN HERE: that the real shards' coverage maps to these module paths (CI run 41199587278's eight shard logs
 * reach 408 of 415 modules including all 70 of MUST_REACH, checked offline when the set was written), and that the
 * workflow runs (its own PR run is that proof).
 *
 * Mutation-Proof: scripts/dev/mutate.sh, receipts in the commit.
 */

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ROOT = resolve(APP, '..');
const SCRIPT = join(APP, 'scripts/ci/runtime-reach.mjs');
const CI_YML = join(ROOT, '.github/workflows/ci.yml');

// The files under src, as the script's own `git ls-files src` filter reads them (a tracked file is a file on disk here).
const known = readSourceTree().map((f) => f.file).sort();
const mustAll = MUST_REACH.flatMap((g) => g.modules);

const shard = (id, over = {}) => ({ format: SHARD_FORMAT, shard: String(id), files: 10, entries: 5000, known: known.length, reached: known, ...over });
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

  it('a module reached by ONE shard only is reached: the union is the point (the dragon runs in some shards, not all)', () => {
    const boss = 'src/render/BossEntity.jsx';
    const r = mergeShards(eight((i) => ({ reached: i === 3 ? known : known.filter((m) => m !== boss) })), { expect: 8, known });
    expect(r.ok, r.problems.join('; ')).toBe(true);
    expect(r.reached).toContain(boss);
  });

  it('a MUST_REACH module that no shard reached is a problem that names it (the deleted-mount case)', () => {
    const gone = 'src/systems/SpawnerSystem.jsx';
    expect(mustAll).toContain(gone);
    const r = mergeShards(eight(() => ({ reached: known.filter((m) => m !== gone) })), { expect: 8, known });
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes(gone) && p.includes('none of the 8 shards'))).toBe(true);
    expect(r.mustReached).toBe(r.mustTotal - 1);
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
    expect(r.problems.join('\n')).toMatch(/is not runtime-reach-shard\/1/);
  });

  it('a file in another format version is rejected even when its fields look right', () => {
    const r = mergeShards([...eight().slice(0, 7), shard(8, { format: 'runtime-reach-shard/2' })], { expect: 8, known });
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/is not runtime-reach-shard\/1/);
  });

  it('a MUST_REACH entry that is not a src module any more is a stale entry (a rename must update the contract)', () => {
    const r = mergeShards(eight(), { expect: 8, known: known.filter((m) => m !== 'src/game/worldBoot.js') });
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/src\/game\/worldBoot\.js, which is not a src module any more/);
  });

  it('a reached path the tree does not list is dropped, not invented into the report', () => {
    const r = mergeShards(eight(() => ({ reached: [...known, 'src/gone.js'] })), { expect: 8, known });
    expect(r.reached).not.toContain('src/gone.js');
    expect(r.reached).toHaveLength(known.length);
  });
});

describe('shardRecord — what one shard writes', () => {
  const entry = (url, count) => ({ url, functions: [{ ranges: [{ count }] }] });
  it('records the modules its entries reached, the entry count and the format', () => {
    const rec = shardRecord({
      shard: 3, files: 2, entries: [entry('http://x/src/App.jsx', 4), entry('http://x/src/HUD.jsx', 0), entry('http://x/node_modules/a.js', 9)],
      known: ['src/App.jsx', 'src/HUD.jsx'], workerScoped: new Set(),
    });
    expect(rec).toEqual({ format: SHARD_FORMAT, shard: '3', files: 2, entries: 3, known: 2, reached: ['src/App.jsx'] });
  });
});

describe('MUST_REACH — the contract, against the real tree', () => {
  it('is a list of distinct src modules that git lists, in groups that say why', () => {
    expect(mustAll.length, 'the contract shrank').toBeGreaterThanOrEqual(70);
    expect(new Set(mustAll).size, 'a module is named twice').toBe(mustAll.length);
    for (const g of MUST_REACH) expect(g.why.length, 'a group with no reason').toBeGreaterThan(20);
    const stale = mustAll.filter((m) => !known.includes(m));
    expect(stale, 'MUST_REACH names modules the tree no longer has').toEqual([]);
  });

  it('names the boot, the save path, the dragon and the systems the scene mounts (one of each family)', () => {
    for (const m of ['src/game/worldBoot.js', 'src/game/saveSchema.js', 'src/render/BossEntity.jsx', 'src/world/bossSystem.js', 'src/QuestSystem.jsx', 'src/world/SquadAISystem.jsx', 'src/world/Terrain.jsx']) {
      expect(mustAll, m).toContain(m);
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
    const cov = coverageDir('cov-ok', [{ url: 'http://localhost:4179/src/App.jsx?t=1', functions: [{ ranges: [{ count: 2 }] }] }]);
    const out = join(dir, 'out', 'shard-6.json');
    const r = run('--emit', out, '--shard', '6', cov);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const rec = JSON.parse(readFileSync(out, 'utf8'));
    expect(rec).toMatchObject({ format: SHARD_FORMAT, shard: '6', files: 1, entries: 1, reached: ['src/App.jsx'] });
    expect(rec.known).toBe(known.length);
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
    expect(r.stdout).toMatch(/MUST_REACH: \d+ of \d+ named modules reached/);
  });

  it('--merge exits 1 when a MUST_REACH module is reached by no shard, and names it', () => {
    const d = shardDir('merge-must', allShards(() => ({ reached: known.filter((m) => m !== 'src/world/HurlSystem.jsx') })));
    const r = run('--merge', d, '--expect', '8');
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/MUST_REACH src\/world\/HurlSystem\.jsx was reached by none/);
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
