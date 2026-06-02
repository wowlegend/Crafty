import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';

const SRC = resolve(process.cwd(), 'src');
function walk(dir, exts = ['.js', '.jsx'], acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, exts, acc);
    else if (exts.includes(extname(p))) acc.push(p);
  }
  return acc;
}
const FILES = walk(SRC);
// Same walk, widened to include CSS — the zero-emoji gate must cover stylesheets too.
const CSS_AND_JS_FILES = walk(SRC, ['.js', '.jsx', '.css']);
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

  // S1-C-M3 HARD GATE: zero emoji in src/. Emoji as brand/mascot/HUD/item markers
  // are an AI-slop tell (S0 visual-quality#4); the bold-flat language uses the baked
  // 2-tone game-icons + lucide outline set instead. M3 removed ALL emoji from src/;
  // this gate keeps it that way — any future emoji in src/ fails CI.
  //
  // Walks src/**/*.{js,jsx,css} (NOT tests/) and counts matches of a COMPREHENSIVE
  // pictographic/symbol regex. NO allowlist, no carve-outs: src/ must be genuinely
  // clean. The regex is written with \u{...} escapes ONLY so this test file does not
  // match itself. Ranges: emoji+symbols (1F000-1FAFF), misc-symbols/dingbats
  // (2600-27BF), misc-symbols-and-arrows (2B00-2BFF), regional indicators
  // (1F1E6-1F1FF), arrows-as-icons (2190-21FF), misc-technical incl. hourglass
  // (2300-23FF), plus the emoji variation selector (FE0F) + ZWJ (200D).
  // Geometric Shapes (25A0-25FF) ADDED: catches symbol-as-icon glyphs ▲▼◆●■
  // going forward (true parity with the gate's stated intent). Box-drawing
  // (U+2500-257F) is OUTSIDE this range, so comment separators stay uncaught.
  const EMOJI_HARD =
    /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}\u{FE0F}\u{200D}]/gu;
  it('S1-C: zero emoji as brand/mascot/HUD markers (hard fail)', () => {
    const offenders = [];
    for (const f of CSS_AND_JS_FILES) {
      const n = (readFileSync(f, 'utf8').match(EMOJI_HARD) || []).length;
      if (n > 0) offenders.push(`${f.replace(SRC + '/', '')}:${n}`);
    }
    expect(offenders, `emoji found in src/ (file:count) — replace with the baked icon set:\n${offenders.join('\n')}`).toEqual([]);
  });

  // S1-C-M2c HARD GATE: the in-game UI is a single bold-flat design language.
  // The two LEGACY CLASS-BASED languages M2 set out to eliminate —
  //   (a) minecraft-bevel classes (`minecraft-*` / `.minecraft-*`)  [killed in M2a]
  //   (b) the glassmorphic `.game-panel` rule + its consumers        [killed in M2b/M2c]
  // — must be GONE everywhere (src JS/JSX + App.css). PLUS no Tailwind frosted-glass
  // `backdrop-blur`/`backdrop-filter` chrome may coexist on the SHIPPED IN-GAME UI
  // surfaces that M2 migrated.
  //
  // DOCUMENTED EXCLUSIONS from the backdrop-blur check (NOT from the class checks):
  //   • App.jsx           — `backdrop-blur` lives only on the PRE-GAME loading splash
  //                         (`!isWorldBuilt` "GENERATING WORLD") + the click-to-play
  //                         pointer-lock entry overlay. Both are pre-game splash
  //                         surfaces, OUTSIDE the in-game "single language" mandate
  //                         (same rationale as the MenuSystem `.glow-button` splash).
  //   • ui/DebugOverlay.jsx — DEV-only debug tool, never shipped game chrome.
  // These exclusions apply ONLY to backdrop-blur; the class bans below cover them too.
  //
  // FOLDED IN (S1-C-M2d): SimplifiedNPCSystem.jsx — the NPC trading modal + dialogue
  //   bubble + controls panel were the LAST un-migrated in-game glass UI. M2d migrated
  //   them to the bold-flat <Panel>/<Button>/<Toast> language, so this file is no longer
  //   excluded from the backdrop-blur check — its glass is now banned here too (the
  //   residual reporter below must therefore report 0 for it).
  const SPLASH_DEV_BACKDROP_EXCLUDE = ['App.jsx', join('ui', 'DebugOverlay.jsx')];
  it('S1-C: single UI design language — no minecraft-bevel + glass classes coexist', () => {
    const offenders = [];
    for (const f of FILES) {
      const src = readFileSync(f, 'utf8');
      const rel = f.replace(SRC + '/', '');
      // (a)+(b): class-based legacy languages — banned EVERYWHERE, no exclusions.
      if (/\bminecraft-[a-z]/.test(src)) offenders.push(`${rel}: minecraft-* class`);
      if (/\bgame-panel\b/.test(src)) offenders.push(`${rel}: game-panel glass class`);
      // backdrop-blur — banned on shipped in-game UI; only the documented pre-game
      // splash + dev-overlay surfaces are excluded. SimplifiedNPCSystem is now in scope
      // (M2d migrated it) and is NO LONGER exempt.
      const backdropExempt =
        SPLASH_DEV_BACKDROP_EXCLUDE.some((x) => rel.endsWith(x));
      if (!backdropExempt && /backdrop-blur|backdrop-filter/.test(src)) {
        offenders.push(`${rel}: glass backdrop`);
      }
    }
    const css = readFileSync(resolve(SRC, 'App.css'), 'utf8');
    if (/\.minecraft-/.test(css)) offenders.push('App.css: .minecraft-* rule');
    if (/\.game-panel\b/.test(css)) offenders.push('App.css: .game-panel rule');
    if (/backdrop-blur|backdrop-filter/.test(css)) offenders.push('App.css: glass backdrop');
    expect(offenders, `legacy UI-language signatures remain:\n${offenders.join('\n')}`).toEqual([]);
  });

  // REPORTER (always passes; prints the residual frosted-glass burn-down). Flips the
  // exclusions above to a hard fail once SimplifiedNPCSystem.jsx is migrated to the
  // bold-flat <Panel> language. Keeps the remaining glass LOUD, not hidden.
  it('reports residual frosted-glass backdrop usage (burn-down metric)', () => {
    const residual = [];
    for (const f of FILES) {
      const src = readFileSync(f, 'utf8');
      if (/backdrop-blur|backdrop-filter/.test(src)) residual.push(f.replace(SRC, 'src'));
    }
    console.log(`[gate] files with frosted-glass backdrop (target 0, excl. pre-game splash/dev): ${residual.length}`);
    for (const f of residual) console.log('  -', f);
    expect(residual.length).toBeGreaterThanOrEqual(0); // reporter only
  });

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
