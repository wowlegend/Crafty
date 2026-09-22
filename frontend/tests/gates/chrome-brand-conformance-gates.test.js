import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SRC, strip, sourceFiles } from './_srcWalk.js';

/**
 * BRAND CONFORMANCE — the LOCKED bold-flat design language, enforced across ALL of src/.
 *
 * W1 deleted the original auth-only brand gate along with the file it scanned. W2 rebuilt it over the
 * two first-impression surfaces, App.jsx and MenuSystem.jsx.
 *
 * WIDENED 2026-09-22, selected by `gate-census.mjs` at 0/5. Two files is not where a design language
 * lives. `CLAUDE.md` states the lock for the whole codebase, and off-brand chrome returns wherever
 * someone is building UI — which by definition is not the two files a previous regression happened to
 * touch. Measured before widening: all eight signatures are already absent from all 308 source files, so
 * this costs nothing today and closes the gap for every file that is not one of the two.
 *
 * AND IT MADE THE PATTERNS STRONGER. The old file documented a deliberate weakening: MenuSystem.jsx
 * carries a comment using the prose words "purple gradient" and "confetti" to describe what the rebuild
 * REPLACED, so the gate matched only implementation signatures (`menu-particle`, `<Confetti`) and never
 * the bare word, "which would wrongly bite that historical comment". That is solving a comment problem
 * by narrowing the assertion. Stripping comments solves it properly and lets the bare word be forbidden:
 * a `confetti(` helper imported under any name, or a CSS class spelled differently, is now caught.
 *
 * Doing that found the shared `strip` helper was only half working — it removed block and full-line
 * comments but not `code; // trailing`, and two trailing comments in `systems/CombatSystem.jsx` were the
 * only `confetti` hits in the repo. Fixed in `_srcWalk.js`, which ~10 gates now share.
 *
 * BLIND SPOT, stated (R7): these are TEXT signatures of chrome that was removed once. They cannot see
 * NEW off-brand chrome nobody has named — a different gradient, another display font, a fresh particle
 * layer — and nothing here renders a pixel or judges whether the result looks on-brand. A brand lock
 * enforced by a blocklist only ever forbids the past.
 *
 * Mutation-Proof: 3 mutations, recorded on the commit.
 */
const OFF_BRAND = [
  ['off-brand display font (Orbitron)', /Orbitron/],
  ['off-brand pixel font class (pixel-font)', /pixel-font/],
  ['confetti/particle FX class (menu-particle)', /menu-particle/],
  ['confetti in ANY form (class, widget or helper)', /confetti/i],
  ['raw candy-purple palette (bg-purple-600)', /bg-purple-600/],
  ['glow chrome (glow-button)', /glow-button/],
  ['shimmer chrome (shimmer-text)', /shimmer-text/],
  ['off-brand wordmark string ("CRAFTY RPG")', /CRAFTY RPG/],
  ['the removed purple radial gradient', /radial-gradient\(ellipse at 50% 30%, #1a1040/],
];

describe('brand conformance — the bold-flat lock, across all of src/', () => {
  const files = sourceFiles();

  it('the scan reached the codebase, and the pattern set is pinned', () => {
    // R3a: every assertion here is an ABSENCE. Over zero files, or zero patterns, they all pass.
    expect(files.length, 'the src walk found nothing — every exclusion below is vacuous')
      .toBeGreaterThan(300);
    expect(OFF_BRAND.length).toBe(9);
  });

  it('the detector is LIVE — each pattern can still see what it forbids', () => {
    // A positive control, because a typo in any one of nine regexes would disarm that line silently and
    // permanently, and nothing about the green result would look different.
    const canary = {
      'off-brand display font (Orbitron)': 'fontFamily: "Orbitron"',
      'off-brand pixel font class (pixel-font)': 'className="pixel-font"',
      'confetti/particle FX class (menu-particle)': '<div className="menu-particle" />',
      'confetti in ANY form (class, widget or helper)': 'import confetti from "x"',
      'raw candy-purple palette (bg-purple-600)': 'className="bg-purple-600"',
      'glow chrome (glow-button)': 'className="glow-button"',
      'shimmer chrome (shimmer-text)': 'className="shimmer-text"',
      'off-brand wordmark string ("CRAFTY RPG")': '<h1>CRAFTY RPG</h1>',
      'the removed purple radial gradient': 'background: radial-gradient(ellipse at 50% 30%, #1a1040, #000)',
    };
    for (const [label, re] of OFF_BRAND) {
      expect(re.test(canary[label]), `the "${label}" pattern is dead — it cannot match its own canary`).toBe(true);
    }
  });

  it('ZERO off-brand chrome signatures anywhere in src — one list, every offender at once', () => {
    const offenders = [];
    for (const f of files) {
      const code = strip(readFileSync(f, 'utf8'));
      for (const [label, re] of OFF_BRAND) {
        if (re.test(code)) offenders.push(`${f.slice(SRC.length + 1)}: ${label}`);
      }
    }
    expect(offenders, `off-brand chrome returned:\n${offenders.join('\n')}`).toEqual([]);
  });
});
