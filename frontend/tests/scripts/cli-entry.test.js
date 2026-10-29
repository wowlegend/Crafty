import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { parse } from '@babel/parser';

// IMPORTING A SCRIPT NEVER RUNS ITS CLI; RUNNING IT BY PATH ALWAYS DOES.
//
// A script under scripts/ that exports a seam and runs its CLI at module scope executes the tool when a test imports
// the seam. It happened twice: i18n-adoption.mjs's process.exit(1) killed the vitest worker during collection, so the
// run printed "1 failed | no tests" with every assertion skipped, and a browser harness spawned vite and a browser on
// `import`. Each script guards its CLI with `if (import.meta.main)`. That flag is undefined before Node 24.2.0, where
// every guarded CLI would do nothing and exit 0, so the second half runs scripts by path and asks for their output.
//
// This test EXECUTES the imports rather than reading guard syntax: one child node process imports every exporting
// script with every side-effecting API it could reach trapped, so a guard that is always true when imported (or
// missing) shows up as a call, whatever its spelling. The child runs from a file, so process.argv[1] is set there, as
// it is in any real importer; a guard that only tests process.argv[1] runs its CLI in it.
// Sited in tests/scripts/: its subject is the scripts tree.

const APP = resolve(__dirname, '../..');
const SCRIPTS = join(APP, 'scripts');
const pkg = JSON.parse(readFileSync(join(APP, 'package.json'), 'utf8'));

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.mjs')) out.push(p);
  }
  return out;
}
const exporting = walk(SCRIPTS).sort().filter((abs) => {
  const ast = parse(readFileSync(abs, 'utf8'), { sourceType: 'module', plugins: ['jsx'], errorRecovery: true, allowAwaitOutsideFunction: true });
  return ast.program.body.some((n) => n.type.startsWith('Export'));
});

/** The importer: traps first, then every import in turn, then one JSON line on the real stdout. */
const IMPORTER = `
import { syncBuiltinESMExports } from 'node:module';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import cp from 'node:child_process';
const realWrite = process.stdout.write.bind(process.stdout);
const calls = [];
const failures = [];
let current = '(before any import)';
const note = (what, args) => calls.push({ script: current, what, arg: String(args[0] ?? '').slice(0, 120) });
const trap = (what) => (...args) => { note(what, args); throw new Error('cli-entry trap: ' + what); };
for (const k of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) cp[k] = trap('child_process.' + k);
for (const k of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'rmSync', 'renameSync', 'copyFileSync', 'unlinkSync', 'writeFile', 'appendFile', 'mkdir', 'rm']) fs[k] = trap('fs.' + k);
syncBuiltinESMExports();
process.exit = trap('process.exit');
for (const k of ['log', 'error', 'warn', 'info', 'table']) console[k] = (...a) => note('console.' + k, a);
process.stdout.write = (...a) => { note('stdout', a); return true; };
process.stderr.write = (...a) => { note('stderr', a); return true; };
globalThis.fetch = trap('fetch');
process.on('uncaughtException', (e) => failures.push({ script: current, what: 'uncaught', arg: String(e?.message ?? e).split('\\n')[0] }));
process.on('unhandledRejection', (e) => failures.push({ script: current, what: 'unhandled rejection', arg: String(e?.message ?? e).split('\\n')[0] }));
const files = JSON.parse(process.env.CLI_ENTRY_FILES);
let imported = 0;
for (const f of files) {
  current = f;
  try { await import(pathToFileURL(f).href); imported++; }
  catch (e) { failures.push({ script: f, what: 'import threw', arg: String(e?.message ?? e).split('\\n')[0].slice(0, 160) }); }
}
await new Promise((r) => setTimeout(r, 300)); // a CLI that starts after an await shows up here
realWrite(JSON.stringify({ imported, calls, failures }) + '\\n');
`;

let tmp;
beforeAll(() => { tmp = mkdtempSync(join(tmpdir(), 'cli-entry-')); });
afterAll(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

const node = (args, opts = {}) => spawnSync(process.execPath, args, { cwd: APP, encoding: 'utf8', timeout: 120000, ...opts });

describe('importing a script never runs its CLI', () => {
  it('every exporting script under scripts/ imports with no output, exit, spawn, write or fetch', () => {
    expect(exporting.length, 'the walk found almost no exporting script: the path moved, and this would assert nothing').toBeGreaterThanOrEqual(30);
    const importer = join(tmp, 'importer.mjs');
    writeFileSync(importer, IMPORTER);
    const p = node([importer], { env: { ...process.env, CLI_ENTRY_FILES: JSON.stringify(exporting) } });
    const line = p.stdout.trim().split('\n').pop() || '';
    expect(line.startsWith('{'), `the importer printed no verdict (status ${p.status}): ${p.stderr.slice(0, 400)}`).toBe(true);
    const r = JSON.parse(line);
    const rel = (x) => ({ ...x, script: x.script.startsWith(APP) ? relative(APP, x.script) : x.script });
    expect(r.failures.map(rel), 'these scripts could not be imported cleanly').toEqual([]);
    expect(r.imported, 'presence: every listed script was imported').toBe(exporting.length);
    expect(r.calls.map(rel), 'importing these ran something: the CLI is not behind `if (import.meta.main)`').toEqual([]);
  });
});

describe('running a script by path always runs its CLI', () => {
  it('import.meta.main on this Node: true by path and through a symlinked directory, false when imported', () => {
    const dir = join(tmp, 'fixture');
    const link = join(tmp, 'fixture-link');
    const mark = join(tmp, 'ran');
    const read = () => (existsSync(mark) ? readFileSync(mark, 'utf8') : '');
    mkdirSync(dir);
    writeFileSync(join(dir, 'entry.mjs'), "import { appendFileSync } from 'node:fs';\nexport const seam = 1;\nif (import.meta.main) appendFileSync(process.env.MARK, 'x');\n");
    writeFileSync(join(dir, 'importer.mjs'), "await import('./entry.mjs');\n");
    symlinkSync(dir, link);
    const env = { ...process.env, MARK: mark };
    node([join(dir, 'entry.mjs')], { env });
    expect(read(), 'run by path').toBe('x');
    node([join(link, 'entry.mjs')], { env });
    expect(read(), 'run through a symlinked directory').toBe('xx');
    node([join(dir, 'importer.mjs')], { env });
    expect(read(), 'imported by another module: the CLI must not run').toBe('xx');
  });

  it('a real gate run by path prints its verdict, also through a symlinked directory', () => {
    const link = join(tmp, 'ci-link');
    symlinkSync(join(SCRIPTS, 'ci'), link);
    for (const path of [join(SCRIPTS, 'ci', 'registry-dedupe.mjs'), join(link, 'registry-dedupe.mjs')]) {
      const p = node([path, '--check']);
      expect(p.status, p.stderr).toBe(0);
      expect(p.stdout, `${path} ran nothing`).toMatch(/^✓ registry-dedupe: /m);
    }
  });

  it('engines.node admits no Node without import.meta.main (added in 24.2.0)', () => {
    const floor = /^>=\s*(\d+)\.(\d+)\.(\d+)/.exec(pkg.engines?.node || '');
    expect(floor, `engines.node "${pkg.engines?.node}" has no >= floor`).not.toBe(null);
    const [, a, b, c] = floor.map(Number);
    expect(a * 1e6 + b * 1e3 + c, `engines.node "${pkg.engines.node}" admits a Node where import.meta.main is undefined`).toBeGreaterThanOrEqual(24 * 1e6 + 2 * 1e3);
  });
});
