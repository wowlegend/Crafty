import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { BLOOM_THRESHOLD } from '../../src/render/hdrGain.js';

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
    const src = readFileSync(resolve(SRC, 'world/terrainMaterial.js'), 'utf8');
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
  // DOCUMENTED EXCLUSION from the backdrop-blur check (NOT from the class checks):
  //   • ui/DebugOverlay.jsx — DEV-only debug tool, never shipped game chrome.
  // App.jsx is NOT excluded: its world-building caption is shown in play over the live canvas when Start is clicked
  // before the world is built, and it is a still caption there (DECISIONS 2026-10-31 item 371), so a blur in App.jsx reds here.
  // A blur is written three ways in this code: Tailwind's `backdrop-blur-*` class, the CSS property `backdrop-filter`
  // (`-webkit-backdrop-filter`), and React's inline style key `backdropFilter` (`WebkitBackdropFilter`); GLASS_BACKDROP
  // matches all three, so an inline style cannot slip past it (DECISIONS 2026-10-31 item 379).
  // The exclusion applies ONLY to backdrop-blur; the class bans below cover DebugOverlay too.
  //
  // FOLDED IN (S1-C-M2d): SimplifiedNPCSystem.jsx — the NPC trading modal + dialogue
  //   bubble + controls panel were the LAST un-migrated in-game glass UI. M2d migrated
  //   them to the bold-flat <Panel>/<Button>/<Toast> language, so this file is no longer
  //   excluded from the backdrop-blur check — its glass is now banned here too (the
  //   residual reporter below must therefore report 0 for it).
  const SPLASH_DEV_BACKDROP_EXCLUDE = [join('ui', 'DebugOverlay.jsx')];
  const GLASS_BACKDROP = /backdrop-blur|backdrop-?filter/i;
  it('S1-C: single UI design language — no minecraft-bevel + glass classes coexist', () => {
    const offenders = [];
    for (const f of FILES) {
      const src = readFileSync(f, 'utf8');
      const rel = f.replace(SRC + '/', '');
      // (a)+(b): class-based legacy languages — banned EVERYWHERE, no exclusions.
      if (/\bminecraft-[a-z]/.test(src)) offenders.push(`${rel}: minecraft-* class`);
      if (/\bgame-panel\b/.test(src)) offenders.push(`${rel}: game-panel glass class`);
      // backdrop-blur — banned on shipped in-game UI; only the dev overlay is excluded. SimplifiedNPCSystem is now in scope
      // (M2d migrated it) and is NO LONGER exempt.
      const backdropExempt =
        SPLASH_DEV_BACKDROP_EXCLUDE.some((x) => rel.endsWith(x));
      if (!backdropExempt && GLASS_BACKDROP.test(src)) {
        offenders.push(`${rel}: glass backdrop`);
      }
    }
    const css = readFileSync(resolve(SRC, 'App.css'), 'utf8');
    if (/\.minecraft-/.test(css)) offenders.push('App.css: .minecraft-* rule');
    if (/\.game-panel\b/.test(css)) offenders.push('App.css: .game-panel rule');
    // The blur ban reads every stylesheet under src/, not App.css alone: a `backdrop-filter` in index.css blurs the live
    // canvas as readily as one in a component (DECISIONS 2026-10-31 item 379). The count is the denominator: App.css,
    // index.css and theme/fonts.css as of 2026-11-01, so a walk that enumerated fewer reds here instead of passing empty.
    const sheets = walk(SRC, ['.css']);
    expect(sheets.length, 'the blur ban found fewer stylesheets under src/ than the three it was written against').toBeGreaterThanOrEqual(3);
    for (const sheet of sheets) {
      if (GLASS_BACKDROP.test(readFileSync(sheet, 'utf8'))) offenders.push(`${sheet.replace(SRC + '/', '')}: glass backdrop`);
    }
    expect(offenders, `legacy UI-language signatures remain:\n${offenders.join('\n')}`).toEqual([]);
  });

  // REPORTER (always passes; prints the residual frosted-glass burn-down). Flips the
  // exclusions above to a hard fail once SimplifiedNPCSystem.jsx is migrated to the
  // bold-flat <Panel> language. Keeps the remaining glass LOUD, not hidden.
  it('reports residual frosted-glass backdrop usage (burn-down metric)', () => {
    const residual = [];
    for (const f of FILES) {
      const src = readFileSync(f, 'utf8');
      if (GLASS_BACKDROP.test(src)) residual.push(f.replace(SRC, 'src'));
    }
    console.log(`[gate] files with frosted-glass backdrop (target 0, excl. pre-game splash/dev): ${residual.length}`);
    for (const f of residual) console.log('  -', f);
    expect(residual.length).toBeGreaterThanOrEqual(0); // reporter only
  });

  // W2-T1: Kevin REVERSED the restrained-NEUTRAL lock — warm magic-hour glow is now the
  // intended look, so highlights are MEANT to bloom (threshold lowered from the old 0.85
  // floor to 0.65). The floor stays >= 0.60 so an accidental near-zero threshold (which would
  // blow EVERYTHING out, losing all highlight detail) still trips the gate.
  it('W2-T1: bloom luminanceThreshold >= 0.60 (warm magic-hour glow, not blown-out)', () => {
    // The number has one home, render/hdrGain.js BLOOM_THRESHOLD, which the eyes' gain is computed against too
    // (W3-A PR A F3); the composer must pass that export, not a literal of its own.
    const src = readFileSync(resolve(SRC, 'GameScene.jsx'), 'utf8');
    expect(src, 'GameScene passes the one bloom threshold').toMatch(/luminanceThreshold=\{BLOOM_THRESHOLD\}/);
    expect(BLOOM_THRESHOLD).toBeGreaterThanOrEqual(0.60);

    // AND THE PROSE THAT QUOTES IT MUST AGREE. EnhancedMagicSystem.jsx explains its core colour choice
    // by naming this threshold, and it named 1.0 while the composer had been at 0.65 — so the file's
    // stated reason for its own tuning was arithmetic about a number that is not in the build. A comment
    // that cites a value is a claim, and this is the cheapest place to keep it true.
    const magic = readFileSync(resolve(SRC, 'EnhancedMagicSystem.jsx'), 'utf8');
    const quoted = magic.match(/luminanceThreshold=([0-9.]+)/);
    expect(quoted, 'the luminanceThreshold citation vanished from EnhancedMagicSystem.jsx').not.toBeNull();
    expect(parseFloat(quoted[1]), 'the comment cites a luminanceThreshold the composer does not use').toBe(BLOOM_THRESHOLD);
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
