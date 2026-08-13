import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// WHO IS USING THE INVERSE TOKEN — the usage half of the contrast ban.
//
// SITED HERE, NOT IN tests/gates/, and stated rather than left implicit: this check must read source,
// and gate-shape freezes the source-grep population inside tests/gates/ so it may only fall. The
// ARITHMETIC half — that textInverse on a dark surface is below even the large-text floor — is fully
// behavioural and lives in tests/gates/text-contrast-gates.test.js. That one proves the pair is
// unreadable; this one proves nobody renders it that way.
//
// The defect: #231708 is documented in tokens.js as "text on gold fills". On the title screen's
// controls strip it rendered at 1.07:1 against the diorama ground and shipped, one screen into the game.

describe('the inverse token is not applied outside a gold fill', () => {
  it('no source file applies text-text-inverse outside a gold fill', () => {
    // The arithmetic above proves the pair is unreadable; this proves nobody is using it that way. Scans
    // for the Tailwind class and requires an accent/gold background on the same element — which is the
    // only context tokens.js documents for it.
    // GOLD IS DECLARED THREE WAYS in this codebase, and the first draft of this scan knew only one of
    // them — so it reported four false positives on correct code. Widened after checking every one by
    // hand rather than exempting the sites, which would have been a list to hide real defects in:
    //   1. the Tailwind class      -> `bg-accent`
    //   2. an inline gradient      -> style={{ background: 'linear-gradient(... --ui-accent-raise ...)' }}
    //   3. on the PARENT element   -> <Panel className="bg-accent text-text-inverse"><Icon .../></Panel>
    // The window is SYMMETRIC, which the second draft got wrong: `style={{ background: ... }}` usually
    // sits on the line AFTER `className=` inside the same JSX opening tag, so a look-back-only scan
    // still reported three false positives. Backward covers the enclosing parent, forward covers the
    // rest of this element's own tag. That window is the honest limit of a line-based instrument; the
    // ARITHMETIC above is what proves the pair unreadable, and this only asks who is using it.
    const GOLD = /bg-accent|bg-warn|bg-\[#[cC]9[aA]86[aA]\]|--ui-accent/;
    const LOOKBACK = 4;
    const LOOKAHEAD = 3;
    const files = ['MenuSystem.jsx', 'QuestSystem.jsx', 'SimpleExperienceSystem.jsx', 'GameSystems.jsx', 'HUD.jsx'];
    const offenders = [];
    let scanned = 0;
    for (const f of files) {
      let src;
      try { src = readFileSync(resolve(HERE, '../../src', f), 'utf8'); } catch { continue; }
      const lines = src.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (!/className=[^>]*text-text-inverse/.test(lines[i])) continue;
        scanned++;
        const context = lines.slice(Math.max(0, i - LOOKBACK), i + 1 + LOOKAHEAD).join('\n');
        if (GOLD.test(context)) continue;
        offenders.push(`${f}:${i + 1}: ${lines[i].trim().slice(0, 90)}`);
      }
    }
    // The denominator. A scan that matched nothing would report zero offenders and look identical to a
    // clean codebase — which is this project's signature defect.
    expect(scanned, 'no text-text-inverse usage found at all — the scan or the files moved').toBeGreaterThan(3);
    expect(
      offenders,
      'text-text-inverse (#231708) applied without a gold background. On a dark surface it renders at ' +
      'roughly 1:1 — the title-screen controls-strip defect, which shipped and which no pixel gate saw.',
    ).toEqual([]);
  });
});
