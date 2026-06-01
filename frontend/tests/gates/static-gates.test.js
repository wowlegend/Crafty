import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';

const SRC = resolve(process.cwd(), 'src');
function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (['.js', '.jsx'].includes(extname(p))) acc.push(p);
  }
  return acc;
}
const FILES = walk(SRC);
// Emoji ranges (pictographic). Brand/HUD emoji are an AI-slop tell (S0 visual-quality#4).
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{2B00}-\u{2BFF}]/u;
const HEX = /#[0-9A-Fa-f]{6}\b/g;

describe('static gates', () => {
  // REPORTER (always passes; prints a burn-down number). Flips to a hard
  // assertion in S1-C once emoji are replaced by the custom icon set.
  it('reports emoji usage in src (burn-down metric)', () => {
    const offenders = FILES.filter((f) => EMOJI.test(readFileSync(f, 'utf8')));
    console.log(`[gate] files containing emoji: ${offenders.length}`);
    for (const f of offenders) console.log('  -', f.replace(SRC, 'src'));
    expect(offenders.length).toBeGreaterThanOrEqual(0); // reporter only
  });

  // REPORTER for the hardcoded-hex burn-down (target: 0 outside src/theme).
  it('reports hardcoded hex outside src/theme (burn-down metric)', () => {
    let total = 0;
    const perFile = [];
    for (const f of FILES) {
      if (f.includes(join('src', 'theme'))) continue;
      const n = (readFileSync(f, 'utf8').match(HEX) || []).length;
      if (n > 0) { total += n; perFile.push([f.replace(SRC, 'src'), n]); }
    }
    perFile.sort((a, b) => b[1] - a[1]);
    console.log(`[gate] hardcoded hex outside src/theme: ${total} across ${perFile.length} files`);
    for (const [f, n] of perFile.slice(0, 10)) console.log(`  ${n}\t${f}`);
    expect(total).toBeGreaterThanOrEqual(0); // reporter only
  });

  it('S1-B: voxel texture sRGB decode present (washout fix)', () => {
    const src = readFileSync(resolve(SRC, 'world/Terrain.jsx'), 'utf8');
    expect(src, 'voxel color_fragment must sRGB-decode the sampled texColor (pow 2.2)')
      .toMatch(/pow\(\s*texColor\.rgb\s*,\s*vec3\(\s*2\.2\s*\)\s*\)/);
  });

  // DEFERRED HARD GATES (enabled by later plans). Documented so they are not
  // silently forgotten; .todo keeps them visible in test output.
  it.todo('S1-C: zero emoji as brand/mascot/HUD markers (hard fail)');
  it.todo('S1-C: single UI design language — no minecraft-bevel + glass + neon coexisting');
  it('S1-B: AO pass present in the EffectComposer', () => {
    const src = readFileSync(resolve(SRC, 'GameScene.jsx'), 'utf8');
    expect(src, 'N8AO must be rendered inside the composer, not just imported')
      .toMatch(/<N8AO\b/);
  });

  it('S1-B: bloom luminanceThreshold >= 0.85', () => {
    const src = readFileSync(resolve(SRC, 'GameScene.jsx'), 'utf8');
    const m = src.match(/luminanceThreshold=\{\s*([0-9.]+)\s*\}/);
    expect(m, 'Bloom luminanceThreshold prop not found').not.toBeNull();
    expect(parseFloat(m[1])).toBeGreaterThanOrEqual(0.85);
  });

  // S1-C-M1: the new primitives must consume tokens (no raw hex chrome) — keeps the
  // bold-flat system single-sourced. (Game/3D colors elsewhere are out of scope.)
  it('S1-C-M1: src/ui/primitives contain zero hardcoded hex', () => {
    const dir = join(SRC, 'ui', 'primitives');
    const prim = FILES.filter((f) => f.startsWith(dir));
    expect(prim.length, 'primitives dir should have files').toBeGreaterThan(5);
    for (const f of prim) {
      const hits = readFileSync(f, 'utf8').match(HEX) || [];
      expect(hits, `${f.replace(SRC, 'src')} has raw hex ${hits}`).toHaveLength(0);
    }
  });
});
