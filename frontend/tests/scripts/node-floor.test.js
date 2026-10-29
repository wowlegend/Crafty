import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Sited in tests/scripts/: the subject is a script run as a process, the way the pipeline and the hooks run it.

const SCRIPT = resolve(__dirname, '../../scripts/ci/node-floor.mjs');
const ROOT = resolve(__dirname, '../../..');
const judge = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

describe('node-floor: a Node without import.meta.main stops the gates instead of letting them pass unrun', () => {
  it('refuses every version below 24.2.0', () => {
    for (const v of ['24.1.9', '24.0.0', '23.11.0', '22.12.0', 'garbage']) {
      const r = judge('--as', v);
      expect(r.status, `${v} passed the floor`).toBe(1);
      expect(r.stderr).toMatch(/below 24\.2\.0/);
    }
  });

  it('passes 24.2.0 and everything after it, and the Node running this suite', () => {
    for (const v of ['24.2.0', '24.2.1', '24.13.0', '25.0.0']) expect(judge('--as', v).status, v).toBe(0);
    expect(judge().status).toBe(0);
  });

  it('runs before the first gate in the pipeline and before the gates the hooks call directly', () => {
    const pipeline = readFileSync(resolve(ROOT, 'ci/pipeline.sh'), 'utf8');
    const floorAt = pipeline.indexOf('scripts/ci/node-floor.mjs');
    expect(floorAt, 'ci/pipeline.sh never runs node-floor').toBeGreaterThan(-1);
    expect(floorAt, 'node-floor runs after the first gate').toBeLessThan(pipeline.indexOf('scripts/ci/opsec-scan.mjs'));
    const prePush = readFileSync(resolve(ROOT, '.githooks/pre-push'), 'utf8');
    expect(prePush.indexOf('node-floor.mjs'), 'pre-push runs a gate before node-floor').toBeLessThan(prePush.indexOf('mutation-proof-trailer.mjs'));
    expect(prePush).toMatch(/node-floor\.mjs/);
    const commitMsg = readFileSync(resolve(ROOT, '.githooks/commit-msg'), 'utf8');
    expect(commitMsg).toMatch(/node-floor\.mjs/);
    expect(commitMsg.indexOf('node-floor.mjs')).toBeLessThan(commitMsg.indexOf('commit-msg-gate.mjs'));
  });
});
