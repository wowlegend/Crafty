import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceFiles } from './_srcWalk.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(HERE, '../..');
const read = (rel) => readFileSync(resolve(FRONTEND, rel), 'utf8');

// M6 #20 repo-health: the production bundle was ONE 4.35MB monolith (React+Three+Rapier+drei+
// postprocessing+app all in the entry chunk). manualChunks vendor-splitting does NOT lazy-load (all
// chunks still load upfront via modulepreload -> the deliberate zero-stutter intent is preserved) but
// peels the big STABLE leaf libs (three, rapier, the r3f ecosystem) into cache-stable chunks so an
// app-code deploy no longer busts the multi-MB vendor bytes + the browser downloads them in parallel.
// This pins the split so a future vite.config refactor can't silently revert to the monolith.
/*
 * ENHANCED 2026-09-22, selected by `gate-census.mjs` at 0/5.
 *
 * The config half stays a source assertion and says so: it pins that vite.config still DECLARES the
 * vendor split. Whether the BUILT output actually has separate chunks is asserted by
 * `scripts/ci/bundle-budget.mjs`, which reads build/assets after a real build and prints
 * "split: three / rapier / r3f are separate chunks". Restating that here would be a second, weaker copy
 * of a check that already runs on every commit.
 *
 * BLIND SPOT, stated (R7): nothing here builds anything. A vite.config that names the right packages and
 * produces one monolith anyway would pass every case in this file.
 *
 * Mutation-Proof: 3 mutations, recorded on the commit.
 */
describe('M6 #20 bundle code-split (manualChunks vendor split, zero-stutter preserved)', () => {
  const viteConfig = read('vite.config.js');

  it('vite.config defines a manualChunks vendor split', () => {
    expect(viteConfig).toMatch(/manualChunks/);
    expect(viteConfig).toMatch(/rollupOptions/);
  });

  it('peels the big stable leaf libs into their own chunks (three + rapier + r3f)', () => {
    expect(viteConfig).toMatch(/['"]three['"]/);      // three core -> 'three' chunk
    expect(viteConfig).toMatch(/@dimforge/);          // Rapier physics -> 'rapier' chunk
    expect(viteConfig).toMatch(/@react-three/);       // R3F ecosystem -> 'r3f' chunk
  });
});

// M6 #20: the dead blind-rubber-stamp removed. `npm test` was already repointed to real vitest (locked by
// m1-bugfix-gates), and the only remaining reference to the superseded puppeteer rubber-stamp was the
// non-default `test:swarm` script -> the file + that script are gone (the real visual gate supersedes it).
describe('M6 #20 dead rubber-stamp removed', () => {
  it('test_swarm.js no longer exists', () => {
    expect(existsSync(resolve(FRONTEND, 'test_swarm.js'))).toBe(false);
  });

  it('the test:swarm script (its only caller) is gone from package.json', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts['test:swarm']).toBeUndefined();
    // and the real test target is unchanged (defense-in-depth with m1-bugfix-gates)
    expect(pkg.scripts.test).toBe('vitest run');
  });
});

// M6 #20: every package imported DIRECTLY in src/ must be a declared dependency, not relied on via
// transitive resolution. `postprocessing` was imported directly (GameScene/MascotStudio: ToneMappingMode,
// BloomEffect, HueSaturationEffect, BrightnessContrastEffect) but resolved only transitively through
// @react-three/postprocessing -- a hoist/version change in the parent could break the direct import.
// This pins it as a declared direct dependency.
describe('M6 #20 direct deps declared (no transitive-resolution reliance)', () => {
  const pkg = JSON.parse(read('package.json'));
  const declared = { ...pkg.dependencies, ...pkg.devDependencies };

  it('EVERY package imported directly in src is declared — the class, not the one that broke', () => {
    // This describe's own docblock states the rule as "every package imported DIRECTLY in src/ must be
    // a declared dependency", and then checked ONE package. `postprocessing` was the instance that
    // broke: imported directly but resolved only transitively through @react-three/postprocessing, so a
    // hoist or version change in the parent would have broken it. Every other direct import was covered
    // by nothing, and the next transitively-resolved one would fail identically.
    const bare = new Set();
    for (const f of sourceFiles()) {
      // STRIP COMMENTS FIRST. Without it the scan picked up prose — "...from 'next frame'" in a
      // docblock parsed as an import of a package called `next frame`. Four such phantom packages were
      // reported before this line existed, which would have made the gate permanently red on correct
      // code and, worse, taught the next reader that the check cries wolf.
      const code = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const m of code.matchAll(/^\s*(?:import|export)[\s\S]{0,200}?from\s+['"]([^.'"][^'"]*)['"]/gm)) {
        const spec = m[1];
        if (spec.startsWith('node:')) continue;
        // Scope to the PACKAGE name: `three/examples/jsm/...` is the `three` package; `@scope/pkg/sub`
        // is `@scope/pkg`. A subpath is not a separate dependency and demanding one would be false.
        const parts = spec.split('/');
        bare.add(spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]);
      }
    }
    expect(bare.size, 'no bare imports found — this reports every dependency declared over an empty set')
      .toBeGreaterThan(5);
    const undeclared = [...bare].filter((p) => !(p in declared));
    expect(undeclared, 'a package is imported directly in src but not declared — it resolves only transitively')
      .toEqual([]);
  });
});
