import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const SRC = readFileSync(resolve(process.cwd(), 'src/render/playerRender.jsx'), 'utf8');
describe('W2-T6 stylized FPV hands (character render language)', () => {
  it('the raw flesh-box hex #fdbcb4 is gone', () => { expect(SRC.toLowerCase()).not.toMatch(/#fdbcb4/); });
  it('the hands use drei Outlines (the character render language)', () => { expect(SRC).toMatch(/Outlines/); });
  // ANCHORED TO THE DECLARATION, NOT TO A WORD THAT APPEARS IN PROSE. The alternation here was
  // `/#FFF|#F8E|gold|FFD700|E8D9|accent/i` — case-insensitive, so the literal words 'gold' and 'accent'
  // in the file's own comments satisfied it, and the gate would have passed a hands render with no
  // accent colour at all. The cuff is a named constant; assert the constant, and that something uses it.
  it('a white-gold accent is present on the hands', () => {
    const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const decl = code.match(/const GLOVE_CUFF = '(#[0-9A-Fa-f]{6})'/);
    expect(decl, 'GLOVE_CUFF is gone — the wrist accent has no declared colour').not.toBeNull();
    const uses = (code.match(/GLOVE_CUFF/g) || []).length;
    expect(uses, 'GLOVE_CUFF is declared but never rendered').toBeGreaterThan(1);
  });
});
