import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ROOT = resolve(APP, '..');

// THE REQUIRED RUNTIME WAS UNDECLARED WHILE CI HARD-PINNED IT.
//
// CI runs `node-version: 24` in both jobs; package.json had no `engines` and there was no .nvmrc or
// .node-version anywhere. So the one number that decides whether a local run matches CI existed only
// inside a workflow file, and a contributor on node 20 or 22 would find out from a failure whose cause
// is nowhere stated. Declaring it is cheap; keeping the declaration in step with CI is the part that
// rots, which is what this asserts.
//
// Deliberately a RANGE, not an exact pin: ordinary 24.x patch drift must not red anything.
describe('the required node runtime is declared, and agrees with CI', () => {
  const pkg = JSON.parse(readFileSync(resolve(APP, 'package.json'), 'utf8'));

  it('package.json declares an engines.node range', () => {
    expect(pkg.engines, 'package.json has no engines field').toBeTruthy();
    expect(typeof pkg.engines.node, 'engines.node is not declared').toBe('string');
    expect(pkg.engines.node, 'engines.node is an exact pin — patch drift would red every install').not.toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('a version file exists for nvm/fnm/asdf users', () => {
    const candidates = ['.nvmrc', '.node-version'].map((f) => resolve(APP, f));
    const found = candidates.filter(existsSync);
    expect(found.length, 'no .nvmrc or .node-version — version managers have nothing to read').toBeGreaterThan(0);
  });

  it('the declared major matches the major CI actually installs', () => {
    const wf = resolve(ROOT, '.github/workflows/ci.yml');
    expect(existsSync(wf), 'ci.yml not found — this assertion cannot check agreement').toBe(true);
    const versions = [...readFileSync(wf, 'utf8').matchAll(/node-version:\s*'?(\d+)/g)].map((m) => m[1]);
    expect(versions.length, 'no node-version pins parsed out of ci.yml — the regex or the file moved').toBeGreaterThan(0);

    // CI must be internally consistent first: two jobs on different majors is its own defect.
    expect(new Set(versions).size, `ci.yml pins more than one node major: ${versions.join(', ')}`).toBe(1);

    const declaredMajor = (pkg.engines.node.match(/(\d+)/) || [])[1];
    expect(declaredMajor, `engines.node "${pkg.engines.node}" declares a major of ${declaredMajor}, CI installs ${versions[0]}`).toBe(versions[0]);

    const nvmrc = resolve(APP, '.nvmrc');
    if (existsSync(nvmrc)) {
      const major = readFileSync(nvmrc, 'utf8').trim().replace(/^v/, '').split('.')[0];
      expect(major, `.nvmrc says ${major}, CI installs ${versions[0]}`).toBe(versions[0]);
    }
  });
});
