import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { inspect, needsGuard } from '../../scripts/ci/cli-guard.mjs';

// The class this enforces bit TWICE, and both times the symptom was a suite that reported a result over
// tests it never ran. scripts/ci/i18n-adoption.mjs called process.exit(1) at module scope; importing a seam
// from it killed the vitest worker DURING COLLECTION and the run printed "1 failed | no tests" — which reads
// like a caught failure rather than a suite that never executed. scripts/visual/capture.mjs was worse in
// kind: `import` spawned a browser and a vite server.
//
// STATUS §G recorded the sweep as done with nothing left to fix. That is a SNAPSHOT, not a ratchet — nothing
// stopped the next script shipping unguarded, which is the whole reason this checker exists.

const APP = resolve(__dirname, '../..');
const SCRIPTS = join(APP, 'scripts');

const GUARD = `const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);`;

describe('cli-guard — flags an exporting script that runs on import', () => {
  it('flags the exact shape that killed the vitest worker: export + top-level exit, no guard', () => {
    const src = `
      export function seam(x) { return x + 1; }
      const failures = collect();
      if (failures.length) { console.error('nope'); process.exit(1); }
    `;
    const info = inspect(src);
    expect(info.hasExport).toBe(true);
    expect(info.topLevelCount).toBeGreaterThan(0);
    expect(info.hasGuard).toBe(false);
    expect(needsGuard(info)).toBe(true);
  });

  it('flags the capture.mjs shape — a top-level await that launches something', () => {
    const src = `
      export const PORT = 4178;
      const browser = await launch();
      await browser.close();
    `;
    expect(needsGuard(inspect(src))).toBe(true);
  });

  it('flags a bare top-level call, the cheapest way to reintroduce this', () => {
    expect(needsGuard(inspect(`export const A = 1;\nmain();`))).toBe(true);
  });

  it('does NOT accept `dirname(fileURLToPath(import.meta.url))` as a guard — that resolves a PATH', () => {
    // Found by mutation-proofing this checker rather than by reading it. i18n-adoption.mjs mentions
    // import.meta.url TWICE: line 52 resolves its own directory, line 133 is the real guard. The first
    // version of hasGuard was a source-wide regex for `import.meta.url`, so the PATH idiom alone scored as
    // guarded — meaning a script with an export, top-level work and that one common line would pass
    // unflagged. A checker with a false negative in the exact shape it exists to catch is worse than none,
    // because it also silences the reviewer. A guard COMPARES; it does not merely mention.
    const src = `
      const HERE = dirname(fileURLToPath(import.meta.url));
      export function seam() {}
      run(HERE);
    `;
    expect(inspect(src).hasGuard).toBe(false);
    expect(needsGuard(inspect(src))).toBe(true);
  });
});

describe('cli-guard — stays silent where a guard is genuinely not owed', () => {
  // Every entry here is a FALSE-POSITIVE canary. A checker that flags harmless module setup becomes noise,
  // and noise is how a check gets switched off — so each of these is as load-bearing as the flags above.

  it('does NOT flag a pure helper with exports and no top-level work (the _serve.mjs shape)', () => {
    const src = `
      export function serve(dir) { return createServer(dir); }
      export const PORT = 4178;
      export default serve;
    `;
    const info = inspect(src);
    expect(info.hasExport).toBe(true);
    expect(info.topLevelCount).toBe(0);
    expect(needsGuard(info)).toBe(false);
  });

  it('does NOT flag a guarded CLI (the measure.mjs shape) — that is the fix, not the defect', () => {
    const src = `
      export function measure() { return 1; }
      ${GUARD}
      if (isCli) { console.log(measure()); }
    `;
    expect(needsGuard(inspect(src))).toBe(false);
  });

  it('accepts the process.argv[1] guard form on its own', () => {
    expect(needsGuard(inspect(`export const A = 1;\nif (process.argv[1]) { run(); }`))).toBe(false);
  });

  it('does NOT flag a script with no exports — nothing can import a seam it does not offer', () => {
    // The 20-odd probes under scripts/visual/ are this shape: run directly, never imported.
    expect(needsGuard(inspect(`const b = await launch();\nawait b.close();`))).toBe(false);
  });

  it('treats declarations as inert — functions, classes, literals and arrows do not run on import', () => {
    const src = `
      export function f() {}
      export class C {}
      const OBJ = { a: 1 };
      const ARR = [1, 2];
      const FN = (x) => x * 2;
      const S = 'literal';
    `;
    expect(inspect(src).topLevelCount).toBe(0);
  });

  it('counts a const initialised by a CALL — `const x = f()` really does run f on import', () => {
    // This is the line that separates inert setup from execution, so it is asserted directly rather
    // than inferred from the aggregate above.
    expect(inspect(`const HERE = dirname(fileURLToPath(import.meta.url));`).topLevelCount).toBe(1);
    expect(inspect(`const N = new Thing();`).topLevelCount).toBe(1);
  });

  it('returns null on unparseable source rather than accusing it', () => {
    expect(inspect('function ( { { {')).toBeNull();
    expect(needsGuard(null)).toBe(false);
  });
});

describe('cli-guard — the live repo, with its denominator asserted', () => {
  // A checker reporting "all clear" over a set it never walked is this session's dominant defect. The scan
  // is repeated here so the COUNT is an assertion, not a line of console output nobody reads.
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.mjs$/.test(e.name)) files.push(p);
    }
  };
  walk(SCRIPTS);
  const scanned = files.map((f) => ({ rel: relative(APP, f), info: inspect(readFileSync(f, 'utf8')) }));

  it('actually walks the script tree — a zero-file scan would make every claim below vacuous', () => {
    expect(scanned.length).toBeGreaterThan(20);
    expect(scanned.every((s) => s.info !== null)).toBe(true);
  });

  it('finds NO exporting script that runs its CLI on import', () => {
    const offenders = scanned.filter((s) => needsGuard(s.info)).map((s) => s.rel);
    expect(offenders).toEqual([]);
  });

  it('the two historical offenders are guarded TODAY — the fix is still in place', () => {
    for (const rel of ['scripts/ci/i18n-adoption.mjs', 'scripts/visual/capture.mjs']) {
      const hit = scanned.find((s) => s.rel === rel);
      expect(hit, `${rel} not found — path moved? update this test`).toBeDefined();
      expect(hit.info.hasExport, `${rel} should still export a seam`).toBe(true);
      expect(hit.info.hasGuard, `${rel} lost its CLI guard`).toBe(true);
    }
  });

  it('_serve.mjs is a real exporting file that is correctly NOT flagged', () => {
    // Pinned to a real file so the false-positive canary cannot rot into a synthetic-only claim. If a
    // future edit gives _serve.mjs top-level work, this goes red and the answer is a guard, not a skip.
    const hit = scanned.find((s) => s.rel === 'scripts/visual/_serve.mjs');
    expect(hit, '_serve.mjs not found — path moved? update this test').toBeDefined();
    expect(hit.info.hasExport).toBe(true);
    expect(hit.info.topLevelCount).toBe(0);
    expect(needsGuard(hit.info)).toBe(false);
  });
});
