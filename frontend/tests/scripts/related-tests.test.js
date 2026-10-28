import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, realpathSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureGit, isolatedGitEnv } from './_isolatedGit.js';
import { parseList, summary, TAIL } from '../../scripts/ci/related-tests.mjs';

// Sited in tests/scripts/: the subject is a CI script, driven as a process over a fixture app, plus its pure seams.

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ROOT = resolve(APP, '..');
const SCRIPT = join(APP, 'scripts/ci/related-tests.mjs');

describe('related-tests — the line it prints', () => {
  it('parseList drops blank lines and surrounding space', () => {
    expect(parseList('src/a.js\n\n  src/b.js \n')).toEqual(['src/a.js', 'src/b.js']);
    expect(parseList('')).toEqual([]);
  });
  it('nothing staged is SKIPPED, and says it is not a pass', () => {
    expect(summary({ staged: 0 })).toBe('related tests: 0 staged frontend file(s), 0 selected — SKIPPED, not a pass');
  });
  it('staged files no test imports: 0 selected, named as such', () => {
    expect(summary({ staged: 2, selected: 0, total: 9 })).toBe('related tests: 0 selected from 2 staged file(s) — nothing imports them statically');
  });
  it('the denominator, and what the commit does not run', () => {
    expect(summary({ staged: 1, selected: 3, total: 9 })).toBe(`related tests: 3 of 9 test files selected by static import from 1 staged file(s); ${TAIL}`);
    expect(TAIL).toMatch(/dynamic imports/);
    expect(TAIL).toMatch(/the full suite, build and bundle run at push and certify/);
  });
});

describe('related-tests — run the way ci/pipeline.sh runs it', () => {
  let dir;
  let app;
  beforeAll(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'crafty-related-')));
    app = join(dir, 'frontend');
    mkdirSync(join(app, 'src'), { recursive: true });
    writeFileSync(join(app, 'package.json'), '{ "type": "module" }\n');
    // Each package linked one by one, never the whole directory: vite keeps its cache in node_modules/.vite, and a
    // fixture writes only under the root it created.
    mkdirSync(join(app, 'node_modules'));
    for (const name of readdirSync(join(APP, 'node_modules'))) {
      if (name !== '.vite' && name !== '.cache') symlinkSync(join(APP, 'node_modules', name), join(app, 'node_modules', name));
    }
    writeFileSync(join(app, 'src/a.js'), 'export const a = 1;\n');
    writeFileSync(join(app, 'src/a.test.js'), "import { it, expect } from 'vitest';\nimport { a } from './a.js';\nit('a', () => expect(a).toBe(1));\n");
    writeFileSync(join(app, 'src/b.js'), 'export const b = 1;\n');
    writeFileSync(join(app, 'src/b.test.js'), "import { it, expect } from 'vitest';\nimport { b } from './b.js';\nit('b', () => expect(b).toBe(1));\n");
    writeFileSync(join(dir, '.gitignore'), 'node_modules\n');
    writeFileSync(join(dir, 'README.md'), '# fixture\n');
    fixtureGit(dir, 'init', '-q');
    fixtureGit(dir, 'config', 'user.email', 'fixture@example.invalid');
    fixtureGit(dir, 'config', 'user.name', 'fixture');
    fixtureGit(dir, 'add', '-A');
    fixtureGit(dir, 'commit', '-q', '-m', 'base');
  });
  afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

  /** Stage `files`, then list them with the REAL staged_frontend_files and run the REAL script under run_scrubbed. */
  function commitTier(files) {
    for (const [rel, text] of Object.entries(files)) writeFileSync(join(dir, rel), text);
    fixtureGit(dir, 'add', '-A');
    const list = join(dir, 'staged.list');
    const sh = `. '${ROOT}/ci/git-env.sh'; staged_frontend_files '${dir}' > '${list}' || exit 9; cd '${app}' && run_scrubbed node '${SCRIPT}' --staged-list '${list}'`;
    const r = spawnSync('bash', ['-c', sh], { encoding: 'utf8', env: isolatedGitEnv(), timeout: 120000 });
    fixtureGit(dir, 'reset', '-q', '--hard', 'HEAD');
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  }

  it('a staged source file selects the test that imports it, and only that one, from frontend/-relative paths', () => {
    const r = commitTier({ 'frontend/src/a.js': 'export const a = 1; // edited\n' });
    expect(r.out).toMatch(/related tests: 1 of 2 test files selected by static import from 1 staged file\(s\)/);
    expect(r.out).toMatch(/^ {2}selected: src\/a\.test\.js$/m);
    expect(r.out).not.toMatch(/selected: src\/b\.test\.js/);
    expect(r.status, r.out).toBe(0);
  }, 120000);

  it('a docs-only stage (outside frontend/) selects nothing and says SKIPPED', () => {
    const r = commitTier({ 'README.md': '# fixture, edited\n' });
    expect(r.out).toMatch(/0 staged frontend file\(s\), 0 selected — SKIPPED, not a pass/);
    expect(r.status, r.out).toBe(0);
  }, 120000);

  it('a failing selected test fails the step', () => {
    const r = commitTier({ 'frontend/src/a.js': 'export const a = 2;\n' });
    expect(r.out).toMatch(/1 of 2 test files selected/);
    expect(r.status, r.out).not.toBe(0);
  }, 120000);

  it('no list at all is COULD NOT CHECK (exit 3), never a pass', () => {
    const r = spawnSync('node', [SCRIPT, '--staged-list', join(dir, 'absent.list')], { cwd: app, encoding: 'utf8', env: isolatedGitEnv() });
    expect(r.stdout).toMatch(/COULD NOT CHECK — no staged list/);
    expect(r.status).toBe(3);
  });
});
