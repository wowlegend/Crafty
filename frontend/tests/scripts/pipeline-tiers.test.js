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
// The certify tier is read only from the file: run for real with stubs it would write a green receipt for this
// checkout's tree that no gate had earned.

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
    const writes = code.match(/sh "\$ROOT\/ci\/write-receipt\.sh"[^\n]*/g) || [];
    expect(writes).toEqual(['sh "$ROOT/ci/write-receipt.sh" "$RECEIPT" certify || true']);
    const at = code.indexOf(writes[0]);
    const guard = code.lastIndexOf('if [', at);
    expect(code.slice(guard, at)).toMatch(/^if \[ "\$TIER" = "certify" \]; then\s*$/);
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
