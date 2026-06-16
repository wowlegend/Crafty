import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(HERE, '../..');
const read = (rel) => readFileSync(resolve(FRONTEND, rel), 'utf8');

// M6 #20 repo-health: the production bundle was ONE 4.35MB monolith (React+Three+Rapier+drei+
// postprocessing+app all in the entry chunk). manualChunks vendor-splitting does NOT lazy-load (all
// chunks still load upfront via modulepreload -> the deliberate zero-stutter intent is preserved) but
// peels the big STABLE leaf libs (three, rapier, the r3f ecosystem) into cache-stable chunks so an
// app-code deploy no longer busts the multi-MB vendor bytes + the browser downloads them in parallel.
// This pins the split so a future vite.config refactor can't silently revert to the monolith.
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

  it('postprocessing (imported directly in src) is a declared dependency', () => {
    expect(declared).toHaveProperty('postprocessing');
  });
});
