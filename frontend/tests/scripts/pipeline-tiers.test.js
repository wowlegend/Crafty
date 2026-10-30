import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isolatedGitEnv } from './_isolatedGit.js';
import { parseHook, callersFor } from '../../scripts/ci/gate-table.mjs';

// Which tier runs which step, read two ways: parsed from ci/pipeline.sh the way the gate table reads it, and the
// real pipeline run with recording node/npm stubs. Sited in tests/scripts/: the subject is the pipeline file.

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ROOT = resolve(APP, '..');
const PIPELINE = join(ROOT, 'ci/pipeline.sh');
const STATIC = ['doc-currency', 'eslint', 'gate-shape'];
const HEAVY = ['unit + static gates', 'build', 'bundle byte budget'];
const RANGE = ['queue-ledger', 'artifact-currency'];

describe('ci/pipeline.sh tiers, as the gate table parses them', () => {
  const gates = parseHook(readFileSync(PIPELINE, 'utf8'));
  const callers = (name) => {
    const g = gates.find((x) => x.name === name);
    expect(g, `${name} is a step of ci/pipeline.sh`).toBeTruthy();
    return callersFor(g);
  };

  it('opsec-scan runs on the commit, the push and in CI', () => {
    expect(callers('opsec-scan')).toEqual({ commit: true, push: true, ci: true });
  });
  it('every other static gate runs on the commit and in CI, never on the push', () => {
    for (const name of STATIC) expect(callers(name), name).toEqual({ commit: true, push: false, ci: true });
  });
  it('the unit suite, build and bundle budget run in CI only: no hook runs them', () => {
    for (const name of HEAVY) expect(callers(name), name).toEqual({ commit: false, push: false, ci: true });
  });
  it('the commit-range gates run on the push, and registry-append-only in CI as well', () => {
    for (const name of RANGE) expect(callers(name), name).toEqual({ commit: false, push: true, ci: false });
    expect(callers('registry-append-only')).toEqual({ commit: false, push: true, ci: true });
  });
  it('vitest related runs on the commit only', () => {
    expect(callers('vitest related')).toEqual({ commit: true, push: false, ci: false });
  });
  it('the changelog freshness check is a step of no tier: it is a manual command (DECISIONS 2026-10-29 item 101)', () => {
    expect(gates.map((g) => g.name), 'presence: the parse found the static gates').toContain('doc-currency');
    expect(gates.filter((g) => /changelog/i.test(`${g.name} ${g.cmd}`)).map((g) => g.name)).toEqual([]);
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
  it('the push tier runs no static gate, unit suite, build or bundle, and no vitest related', () => {
    const r = run('--tier=push');
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.cmds, 'presence: the push tier ran its range gates').toContain('node scripts/ci/artifact-currency.mjs');
    for (const c of ['npm run --silent lint', 'npm run --silent test:unit', 'npm run --silent build', 'node scripts/ci/bundle-budget.mjs', 'node scripts/ci/doc-currency.mjs']) {
      expect(r.cmds, c).not.toContain(c);
    }
    expect(r.cmds.some((c) => c.includes('related-tests.mjs'))).toBe(false);
  });
  it('control: the certify tier runs the static gates, the unit suite, build and bundle, and no vitest related', () => {
    const r = run('--tier=certify');
    expect(r.status, r.stdout + r.stderr).toBe(0);
    for (const c of ['node scripts/ci/doc-currency.mjs', 'npm run --silent lint', 'npm run --silent test:unit', 'npm run --silent build', 'node scripts/ci/bundle-budget.mjs']) {
      expect(r.cmds, c).toContain(c);
    }
    expect(r.cmds.some((c) => c.includes('related-tests.mjs'))).toBe(false);
  });
  it('no tier runs the changelog check: each tier runs its own steps and none of them names changelog', () => {
    for (const tier of ['commit', 'push', 'fast', 'certify']) {
      const r = run(`--tier=${tier}`);
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.cmds.length, `presence: the ${tier} tier ran its steps`).toBeGreaterThan(0);
      expect(r.cmds.filter((c) => /changelog/i.test(c)), tier).toEqual([]);
      expect(r.stdout, `${tier}: the tier's own printout`).not.toMatch(/changelog/i);
    }
  });
  it('an unknown tier exits 2 and names every tier, certify among them', () => {
    const r = run('--tier=bogus');
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/expected commit\|push\|fast\|certify/);
    expect(r.cmds).toEqual([]);
  });
});
