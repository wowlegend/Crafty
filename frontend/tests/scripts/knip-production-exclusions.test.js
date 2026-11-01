import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// A MODULE LEFT OUT OF PRODUCTION KNIP'S PROJECT LEAVES IT THE MOMENT THE GAME IMPORTS IT (DECISIONS 2026-11-01 (W3-A PR C)
// item 499). `.knip.json` lists, as `!src/<file>!`, the src modules no shipped code imports: tooling's (brand.js, the key
// reachability table, the contrast maths, detile) and code a later unit wires in (the First Night's lights, game/lights.js,
// until D2, N2 or N8 reads it). Left in the list after the game imports a module, the exception would hide that module's
// dead exports from production knip for good, so this fails, naming the importer, once any non-test src file imports a
// listed module. It reads files by their nature (a config and the import graph), so it lives in tests/scripts.
// NOT CHECKED HERE: a bare (package) import, and an import built from a variable.
const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = join(APP, 'src');

function sources(dir = SRC, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(js|jsx)$/.test(name) && !/\.test\.(js|jsx)$/.test(name)) out.push(p);
  }
  return out;
}
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
const SPEC = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.{1,2}\/[^'"]+)['"]/g;
const resolveImport = (from, spec) => {
  const base = resolve(dirname(from), spec.replace(/\?.*$/, ''));
  return ['', '.js', '.jsx', '/index.js', '/index.jsx'].map((e) => base + e).find((p) => existsSync(p) && statSync(p).isFile()) || null;
};

/** Every relative import edge in src's non-test modules: [importer, target], both APP-relative. */
function edges() {
  const out = [];
  for (const file of sources()) {
    for (const m of strip(readFileSync(file, 'utf8')).matchAll(SPEC)) {
      const target = resolveImport(file, m[1]);
      if (target) out.push([relative(APP, file), relative(APP, target)]);
    }
  }
  return out;
}

/** The single src files `.knip.json` leaves out of the production project (`!src/<file>!`, no glob). */
function excluded() {
  const { project } = JSON.parse(readFileSync(join(APP, '.knip.json'), 'utf8'));
  return project.filter((p) => /^!src\/[^*{}]+!$/.test(p)).map((p) => p.slice(1, -1));
}

describe('production knip\'s exclusions', () => {
  it('the import graph is read (the control): the entry\'s own imports are found', () => {
    const all = edges();
    expect(all.length, 'the scan found almost no import edges').toBeGreaterThan(1000);
    expect(all.some(([a, b]) => a === 'src/index.jsx' && b === 'src/startGame.jsx'), 'src/index.jsx -> src/startGame.jsx was not seen')
      .toBe(true);
    expect(all.some(([a, b]) => a === 'src/night/nightLoader.js' && b === 'src/night/night.js'), 'a dynamic import was not seen')
      .toBe(true);
  });

  it('lists only modules no shipped code imports', () => {
    const list = excluded();
    expect(list.length, 'the exclusions were not read from .knip.json').toBeGreaterThanOrEqual(5);
    expect(list.every((p) => existsSync(join(APP, p))), `an exclusion names a file that does not exist: ${list}`).toBe(true);
    const all = edges();
    const imported = list.flatMap((p) => all.filter(([, b]) => b === p).map(([a]) => `${p} <- ${a}`));
    expect(imported, 'a module the game imports is still left out of production knip: delete its line in .knip.json').toEqual([]);
  });
});
