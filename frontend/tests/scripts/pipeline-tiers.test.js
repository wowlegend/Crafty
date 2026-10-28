import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync, existsSync, copyFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isolatedGitEnv, fixtureGit } from './_isolatedGit.js';
import { parseHook, callersFor } from '../../scripts/ci/gate-table.mjs';

// Which tier runs which step, read two ways: parsed from ci/pipeline.sh the way the gate table reads it, and the
// real pipeline run with recording node/npm stubs. Sited in tests/scripts/: the subject is the pipeline file.
// The certify tier runs only on copies of ci/ inside a throwaway repository: run here, it would write a green receipt
// for this checkout's tree that no gate had earned.

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ROOT = resolve(APP, '..');
const PIPELINE = join(ROOT, 'ci/pipeline.sh');
const STATIC = ['opsec-scan', 'doc-currency', 'eslint', 'gate-shape', 'cli-guard'];
const HEAVY = ['unit + static gates', 'build', 'bundle byte budget'];

describe('ci/pipeline.sh tiers, as the gate table parses them', () => {
  const gates = parseHook(readFileSync(PIPELINE, 'utf8'));
  const callers = (name) => {
    const g = gates.find((x) => x.name === name);
    expect(g, `${name} is a step of ci/pipeline.sh`).toBeTruthy();
    return callersFor(g);
  };

  it('every static gate runs on the commit, the push and in CI', () => {
    for (const name of STATIC) expect(callers(name), name).toEqual({ commit: true, push: true, ci: true });
  });
  it('the unit suite, build and bundle budget run on the push and in CI, never on the commit', () => {
    for (const name of HEAVY) expect(callers(name), name).toEqual({ commit: false, push: true, ci: true });
  });
  it('vitest related runs on the commit only', () => {
    expect(callers('vitest related')).toEqual({ commit: true, push: false, ci: false });
  });
  it('only the certify tier writes a receipt', () => {
    const code = readFileSync(PIPELINE, 'utf8').split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    const writes = code.match(/sh "\$ROOT\/ci\/write-receipt\.sh" "\$RECEIPT"[^\n]*/g) || [];
    expect(writes).toEqual(['sh "$ROOT/ci/write-receipt.sh" "$RECEIPT" certify "$START_TREE" || true']);
    const at = code.indexOf(writes[0]);
    const guard = code.lastIndexOf('if [ "$TIER"', at);
    expect(code.slice(guard, at)).toMatch(/^if \[ "\$TIER" = "certify" \]; then\s+if \[ -n "\$START_TREE" \]; then\s*$/);
  });
});

describe('ci/pipeline.sh, run with recording stubs', () => {
  let dir;
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'crafty-tiers-')); });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  let n = 0;
  function run(...args) {
    const bin = join(dir, `bin-${++n}`);
    const log = join(dir, `cmd-${n}.log`);
    mkdirSync(bin);
    for (const t of ['node', 'npm']) {
      writeFileSync(join(bin, t), `#!/bin/sh\necho "${t} $*" >> "${log}"\nexit 0\n`);
      chmodSync(join(bin, t), 0o755);
    }
    const r = spawnSync('bash', [PIPELINE, ...args], { encoding: 'utf8', env: isolatedGitEnv({ PATH: `${bin}:${process.env.PATH}` }) });
    return { ...r, cmds: existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [] };
  }

  it('the commit tier runs the static gates and vitest related over a staged list, and no unit suite, build or bundle', () => {
    const r = run('--tier=commit');
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.cmds.filter((c) => /^node scripts\/ci\/related-tests\.mjs --staged-list \S+$/.test(c)), r.cmds.join('\n')).toHaveLength(1);
    expect(r.cmds).toContain('npm run --silent lint');
    expect(r.cmds).not.toContain('npm run --silent test:unit');
    expect(r.cmds).not.toContain('npm run --silent build');
    expect(r.cmds).not.toContain('node scripts/ci/bundle-budget.mjs');
  });
  it('control: the push tier runs the unit suite, build and bundle, and no vitest related', () => {
    const r = run('--tier=push');
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.cmds).toContain('npm run --silent test:unit');
    expect(r.cmds).toContain('npm run --silent build');
    expect(r.cmds).toContain('node scripts/ci/bundle-budget.mjs');
    expect(r.cmds.some((c) => c.includes('related-tests.mjs'))).toBe(false);
  });
  it('an unknown tier exits 2 and names every tier, certify among them', () => {
    const r = run('--tier=bogus');
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/expected commit\|push\|fast\|certify/);
    expect(r.cmds).toEqual([]);
  });
});

// THE RACE (W2-C review, finding 1). certify is run in the background, so the tree can move while its steps run. The
// npm stub makes a commit during the unit step, the way a commit made by hand or a merge would land mid-run.
describe('the certify tier, run on copies of ci/ in a throwaway repository: the receipt names the tree the steps read', () => {
  let outside;
  let fx;
  const RECEIPTS = () => join(fx, '.git', 'crafty-green-trees');
  const receipts = () => (existsSync(RECEIPTS()) ? readdirSync(RECEIPTS()) : []);
  beforeEach(() => {
    outside = mkdtempSync(join(tmpdir(), 'crafty-certify-'));
    fx = join(outside, 'repo');
    mkdirSync(fx);
    fixtureGit(fx, 'init', '-q');
    fixtureGit(fx, 'config', 'user.email', 'fixture@example.invalid');
    fixtureGit(fx, 'config', 'user.name', 'fixture');
    fixtureGit(fx, 'config', 'commit.gpgsign', 'false');
    mkdirSync(join(fx, 'ci'));
    for (const f of ['pipeline.sh', 'git-env.sh', 'write-receipt.sh']) copyFileSync(join(ROOT, 'ci', f), join(fx, 'ci', f));
    mkdirSync(join(fx, 'frontend/src'), { recursive: true });
    writeFileSync(join(fx, 'frontend/src/a.js'), 'export const a = 1;\n');
    fixtureGit(fx, 'add', '-A');
    fixtureGit(fx, 'commit', '-q', '-m', 'base');
  });
  afterEach(() => rmSync(outside, { recursive: true, force: true }));

  // midRun: a shell command the npm stub runs when the unit step starts (cwd frontend/, GIT_* already scrubbed).
  function certify(midRun = '') {
    const bin = join(outside, 'bin');
    const log = join(outside, 'cmds.log');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'node'), `#!/bin/sh\necho "node $*" >> '${log}'\nexit 0\n`);
    writeFileSync(join(bin, 'npm'), `#!/bin/sh\necho "npm $*" >> '${log}'\nif [ "$*" = "run --silent test:unit" ] && [ -n "$MID_RUN" ]; then sh -c "$MID_RUN" || exit 9; fi\nexit 0\n`);
    chmodSync(join(bin, 'node'), 0o755);
    chmodSync(join(bin, 'npm'), 0o755);
    const r = spawnSync('bash', [join(fx, 'ci/pipeline.sh'), '--tier=certify'], { encoding: 'utf8', env: isolatedGitEnv({ PATH: `${bin}:${process.env.PATH}`, MID_RUN: midRun }) });
    const cmds = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
    // Presence: every heavy step ran, so a missing receipt is the writer's verdict, not a run that stopped early.
    for (const c of ['npm run --silent test:unit', 'npm run --silent build', 'node scripts/ci/bundle-budget.mjs']) expect(cmds, r.stdout + r.stderr).toContain(c);
    return { ...r, out: r.stdout + r.stderr };
  }

  it('control: a run on a tree nobody touches writes one receipt, for that tree', () => {
    const t0 = fixtureGit(fx, 'rev-parse', 'HEAD^{tree}');
    const r = certify();
    expect(r.status, r.out).toBe(0);
    expect(receipts(), r.out).toEqual([t0]);
    expect(readFileSync(join(RECEIPTS(), t0), 'utf8')).toMatch(new RegExp(`^${t0} certify \\d{4}-`));
  });

  it('a commit made while the steps run gets no receipt, and neither does the tree the run started on', () => {
    const t0 = fixtureGit(fx, 'rev-parse', 'HEAD^{tree}');
    const r = certify("printf 'export const late = 1;\\n' > src/late.js && git add src/late.js && git -c core.hooksPath=/dev/null commit -q -m late");
    const t1 = fixtureGit(fx, 'rev-parse', 'HEAD^{tree}');
    expect(t1, 'the mid-run commit did not happen, so this case reproduces nothing').not.toBe(t0);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/REFUSED: the index tree changed during the run/);
    expect(receipts(), r.out).toEqual([]);
  });

  it('a change staged while the steps run, with no commit: no receipt', () => {
    const r = certify("printf 'export const a = 2;\\n' > src/a.js && git add src/a.js");
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/REFUSED: the index tree changed during the run/);
    expect(receipts(), r.out).toEqual([]);
  });

  it('a tree that is not the index at the start gets no receipt, though it is clean at the end, and every step still runs', () => {
    writeFileSync(join(fx, 'frontend/src/a.js'), 'export const a = 3;\n');
    const r = certify('git add src/a.js && git -c core.hooksPath=/dev/null commit -q -m tidied');
    expect(fixtureGit(fx, 'status', '--porcelain'), 'the end state must be clean for this case to mean anything').toBe('');
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/no receipt will be written/);
    expect(receipts(), r.out).toEqual([]);
  });
});
