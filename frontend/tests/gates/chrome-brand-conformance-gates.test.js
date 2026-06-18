import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

// W2 brand-conformance gate (REBUILT).
//
// W1 deleted the original auth-only brand gate (it scanned the now-deleted AuthComponents.jsx,
// so it died with that file). The 2026-06-17 audit recommended a BROADER gate covering the two
// first-impression chrome surfaces that survive — App.jsx (the app shell / pre-game splash) and
// MenuSystem.jsx (the title screen) — so the off-brand chrome the rebuild removed cannot silently
// return. The LOCKED bold-flat design language (per CLAUDE.md "Design Language — S1-C") forbids:
//   • off-brand display fonts        — `Orbitron`, `pixel-font`  (bold-flat uses `font-display`)
//   • the old confetti / particle FX — the `menu-particle` class + a <Confetti>/`confetti(` widget
//   • the raw candy-purple palette   — `bg-purple-600`
//   • the glow / shimmer chrome      — `glow-button`, `shimmer-text`
//   • the off-brand wordmark string  — raw "CRAFTY RPG" (the wordmark is now "Crafty" on font-display)
//
// PATTERN-CHOICE NOTE (avoids a false positive): MenuSystem.jsx line ~201 has a legit *comment*
// that uses the bare prose words "purple gradient" and "confetti" to describe what the rebuild
// REPLACED. So this gate matches IMPLEMENTATION signatures only — the `menu-particle` CSS class and
// a JSX `<Confetti`/`confetti(` widget call — NEVER the bare word /confetti/, which would wrongly
// bite that historical comment.
const CHROME = {
  'App.jsx': read('App.jsx'),
  'MenuSystem.jsx': read('MenuSystem.jsx'),
};

// Each entry: [human label, RegExp]. A file FAILS the gate if any pattern matches.
const OFF_BRAND = [
  ['off-brand display font (Orbitron)', /Orbitron/],
  ['off-brand pixel font class (pixel-font)', /pixel-font/],
  ['confetti/particle FX class (menu-particle)', /menu-particle/],
  ['confetti widget (<Confetti> / confetti(…))', /<Confetti\b|\bconfetti\s*\(/],
  ['raw candy-purple palette (bg-purple-600)', /bg-purple-600/],
  ['glow chrome (glow-button)', /glow-button/],
  ['shimmer chrome (shimmer-text)', /shimmer-text/],
  ['off-brand wordmark string ("CRAFTY RPG")', /CRAFTY RPG/],
];

describe('W2 chrome brand conformance — App.jsx + MenuSystem.jsx free of removed off-brand patterns', () => {
  for (const [file, src] of Object.entries(CHROME)) {
    describe(file, () => {
      for (const [label, re] of OFF_BRAND) {
        it(`has no ${label}`, () => {
          expect(re.test(src), `${file} contains off-brand ${label} (regression of W1-removed chrome) — pattern ${re}`).toBe(false);
        });
      }
    });
  }

  // Aggregate sweep — one assertion enumerating EVERY (file, pattern) offender, so a multi-pattern
  // regression surfaces the full list at once rather than one failure at a time.
  it('aggregate: zero off-brand chrome signatures across both first-impression files', () => {
    const offenders = [];
    for (const [file, src] of Object.entries(CHROME)) {
      for (const [label, re] of OFF_BRAND) {
        if (re.test(src)) offenders.push(`${file}: ${label}`);
      }
    }
    expect(offenders, `off-brand chrome signatures returned:\n${offenders.join('\n')}`).toEqual([]);
  });
});
