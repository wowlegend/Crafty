import { describe, it, expect } from 'vitest';
import { urlToSrcPath, reachedModules, workerClosure } from '../../scripts/ci/runtime-reach.mjs';

// WHY THIS EXISTS — the defect class nothing in this repo catches.
//
// On 2026-08-05 four features shipped, compiled, passed every gate, and never RAN: two achievements
// nothing called (`fddf7d4`), mob grass-bending driven by 81 chunks and working in none (`34f11b0`), a
// mote layer rendering at the world origin (`869f71e`), two keybinds advertised nowhere (`8a5e008`).
// knip sees the export used. A source-grep gate sees the line exist. `npm run build` sees it compile.
// `coverage-zero` sees whether a TEST executed it. None of them sees whether the GAME reaches it.
//
// V8 coverage collected during the PLAYWRIGHT playthrough answers exactly that question and no other:
// which src modules did the running game execute while a real player-input session drove it. That is a
// different denominator from vitest coverage and must never be conflated with it — a module can be at
// 100% test coverage and unreachable in the running game, which is precisely the shape of all four
// defects above.
describe('urlToSrcPath — map a dev-server URL back to a repo path', () => {
  it('maps a dev-server module URL to its src path', () => {
    expect(urlToSrcPath('http://localhost:4179/src/render/TitleDiorama.jsx')).toBe('src/render/TitleDiorama.jsx');
  });

  it('strips Vite cache-busting and HMR query strings', () => {
    // Vite appends ?t=<ts> on HMR and ?v=<hash> on deps. Without stripping, the same module counts as
    // several distinct URLs and the reached-set silently inflates.
    expect(urlToSrcPath('http://localhost:4179/src/App.jsx?t=1786')).toBe('src/App.jsx');
    expect(urlToSrcPath('http://localhost:4179/src/game/keyMap.js?v=abc123')).toBe('src/game/keyMap.js');
  });

  it('rejects anything outside src/ — node_modules, vite internals, inline scripts', () => {
    // The denominator is src modules. Counting the 1,900-file dep tree would drown the finding.
    for (const u of [
      'http://localhost:4179/node_modules/.vite/deps/three.js',
      'http://localhost:4179/@vite/client',
      'http://localhost:4179/',
      '',
    ]) {
      expect(urlToSrcPath(u)).toBeNull();
    }
  });
});

describe('reachedModules — what the RUNNING GAME executed', () => {
  const entry = (url, count) => ({ url, functions: [{ functionName: 'f', ranges: [{ count }] }] });

  it('counts a module with an executed range as reached', () => {
    const r = reachedModules([entry('http://x/src/a.js', 3)], ['src/a.js', 'src/b.js']);
    expect(r.reached).toEqual(['src/a.js']);
    expect(r.unreached).toEqual(['src/b.js']);
  });

  it('does NOT count a module that was merely LOADED but never executed', () => {
    // The load-bearing distinction. Vite serves the module, V8 parses it, and every range is count 0 —
    // an import that ran no code. Counting that as "reached" would make this instrument agree with knip
    // and inherit the exact blind spot it exists to cover.
    const r = reachedModules([entry('http://x/src/dead.js', 0)], ['src/dead.js']);
    expect(r.reached).toEqual([]);
    expect(r.unreached).toEqual(['src/dead.js']);
  });

  it('reports the DENOMINATOR — reached out of how many known modules', () => {
    const r = reachedModules([entry('http://x/src/a.js', 1)], ['src/a.js', 'src/b.js', 'src/c.js']);
    expect(r.total).toBe(3);
    expect(r.reached).toHaveLength(1);
  });

  it('flags an EMPTY coverage set rather than reporting 0% as a finding', () => {
    // A shard whose fixture failed to attach writes no entries. "0 of 281 modules reached" would be a
    // spectacular-looking result and a pure instrument failure. Seven things in this repo have shipped a
    // clean report over input they never examined; this is the same shape inverted.
    const r = reachedModules([], ['src/a.js']);
    expect(r.empty).toBe(true);
    expect(r.reached).toEqual([]);
  });

  it('merges duplicate URLs across shards instead of double-counting', () => {
    // Three CI shards each produce their own coverage for the same module. The union is the answer.
    const r = reachedModules(
      [entry('http://x/src/a.js', 0), entry('http://x/src/a.js?t=9', 2)],
      ['src/a.js']
    );
    expect(r.reached).toEqual(['src/a.js']);
    expect(r.total).toBe(1);
  });

  it('ignores coverage for a module not in the known set instead of inventing rows', () => {
    // A stale entry for a deleted file must not appear as reached — the src list is the denominator of
    // record, and a reached-set larger than its denominator is a broken report.
    const r = reachedModules([entry('http://x/src/gone.js', 5)], ['src/a.js']);
    expect(r.reached).toEqual([]);
    expect(r.total).toBe(1);
  });

  it('survives malformed entries instead of throwing', () => {
    // Runs under `if: always()`, i.e. when the e2e step has already failed and output may be truncated.
    const r = reachedModules([null, {}, { url: 'http://x/src/a.js' }, entry('http://x/src/a.js', 1)], ['src/a.js']);
    expect(r.reached).toEqual(['src/a.js']);
  });
});

// THE INSTRUMENT'S OWN BLIND SPOT, made explicit rather than left to mislead.
//
// `page.coverage` observes the PAGE's V8 isolate. A Web Worker is a different isolate, so nothing a
// worker executes is ever reported — and this project runs two: src/workers/ai.worker.js (mob AI) and
// src/world/terrain.worker.js (greedy mesher). On the first real run, 9 of 20 "unreached" modules were
// worker-only: mobSenses, mobLineOfSight, mobArchetypes, mobSteering, mesher, vertexAO, foliage,
// grassField, oreGen. Reporting the greedy mesher as code the game never reached would be this
// instrument lying with total confidence — the exact failure it was built to catch, committed by itself.
//
// (The enumeration that found this had its own denominator bug: `ls src/workers/` sees ONE worker,
// because terrain.worker.js lives in src/world/. The glob must be **/*.worker.js.)
describe('worker scope — what this instrument structurally CANNOT see', () => {
  const files = {
    'src/world/terrain.worker.js': "import { mesh } from './mesher.js';\nimport { ao } from './vertexAO.js';",
    'src/world/mesher.js': "import { g } from './grassField.js';",
    'src/world/grassField.js': '',
    'src/world/vertexAO.js': '',
    'src/main.jsx': "import './world/mesher.js';",
  };
  const read = (p) => files[p] ?? null;

  it('follows imports TRANSITIVELY from a worker entry', () => {
    // mesher is a direct import; grassField only via mesher. A one-level scan would call grassField
    // unreached, which is the same mistake one indirection deeper.
    const c = workerClosure(['src/world/terrain.worker.js'], read);
    expect([...c].sort()).toEqual(['src/world/grassField.js', 'src/world/mesher.js', 'src/world/vertexAO.js']);
  });

  it('resolves an extensionless import specifier', () => {
    // The real shape: src/workers/ai.worker.js imports '../devtest/captureMode'. (An earlier version of
    // this fixture put the worker at src/a.worker.js, where '../devtest/' resolves ABOVE src/ — the test
    // was wrong, not the resolver, which is worth a line since a bad fixture usually gets "fixed" in the
    // code instead.)
    const f = { 'src/workers/ai.worker.js': "import x from '../devtest/captureMode';", 'src/devtest/captureMode.js': '' };
    const c = workerClosure(['src/workers/ai.worker.js'], (p) => f[p] ?? null);
    expect([...c]).toEqual(['src/devtest/captureMode.js']);
  });

  it('ignores bare package specifiers', () => {
    const f = { 'src/a.worker.js': "import * as THREE from 'three';\nimport './b.js';", 'src/b.js': '' };
    const c = workerClosure(['src/a.worker.js'], (p) => f[p] ?? null);
    expect([...c]).toEqual(['src/b.js']);
  });

  it('terminates on an import CYCLE instead of recursing forever', () => {
    const f = { 'src/a.worker.js': "import './b.js';", 'src/b.js': "import './c.js';", 'src/c.js': "import './b.js';" };
    const c = workerClosure(['src/a.worker.js'], (p) => f[p] ?? null);
    expect([...c].sort()).toEqual(['src/b.js', 'src/c.js']);
  });

  it('classifies worker-only modules as WORKER-SCOPE, never as unreached', () => {
    const entry = (url, count) => ({ url, functions: [{ ranges: [{ count }] }] });
    const r = reachedModules(
      [entry('http://x/src/main.jsx', 1)],
      ['src/main.jsx', 'src/world/mesher.js', 'src/ui/Dead.jsx'],
      new Set(['src/world/mesher.js'])
    );
    expect(r.reached).toEqual(['src/main.jsx']);
    expect(r.workerScoped).toEqual(['src/world/mesher.js']);
    expect(r.unreached).toEqual(['src/ui/Dead.jsx']); // the only honest finding of the three
  });

  it('still counts a worker module as REACHED if coverage somehow shows it executing', () => {
    // Worker-scope means "not observable here", not "ignore". If a module is both imported by a worker
    // and executed on the main thread, the measurement outranks the classification.
    const entry = (url, count) => ({ url, functions: [{ ranges: [{ count }] }] });
    const r = reachedModules([entry('http://x/src/shared.js', 4)], ['src/shared.js'], new Set(['src/shared.js']));
    expect(r.reached).toEqual(['src/shared.js']);
    expect(r.workerScoped).toEqual([]);
  });
});
