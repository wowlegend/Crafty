import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/*
 * ENHANCED 2026-09-22, selected by `gate-census.mjs` at 0/5.
 *
 * BLIND SPOT, stated (R7): source assertions throughout. Nothing renders the HUD, presses H, or looks at
 * what is on screen — and "declutter" is a judgement about what a player SEES, which is the one thing
 * none of this can check. The visual capture gate cannot resolve HUD detail either.
 *
 * Mutation-Proof: 2 mutations, recorded on the commit.
 */
describe('hud declutter gates', () => {
  it('HUD.jsx was read — two cases below are negative assertions', () => {
    expect(read('HUD.jsx').length, 'HUD.jsx read as empty — the exclusions are vacuous').toBeGreaterThan(2000);
  });

  it('CombatInstructions is gated on a showControls store flag (not always-on)', () => {
    const hud = read('HUD.jsx');
    expect(hud).toMatch(/showControls.*CombatInstructions|CombatInstructions.*showControls/s);
    expect(read('store/useGameStore.jsx')).toMatch(/showControls:/);
  });
  it('H TOGGLES the controls sheet — the handler, not the token', () => {
    // `/KeyH/` matched the string appearing anywhere in a 900-line file, including in the comment
    // listing the keybinds. Anchored to the comparison form AND to the toggle it performs, so a keybind
    // that is advertised but wired to nothing reds — which is exactly how two live keybinds once shipped
    // advertised nowhere, and its mirror image, advertised and dead, fails the same way.
    const im = strip(read('InputManager.jsx'));
    expect(im, 'H is no longer bound').toMatch(/code === 'KeyH'/);
    // WORD-BOUNDED. Without \b this matched `showControlsX` — a mutation renaming the toggle away left
    // the gate green, because the mutated identifier still CONTAINS the original. That is the second
    // time this exact prefix defect appeared in one session (the first: `.hostileChance` matching
    // `.hostileChanceX` in siege-gates), which is enough to call it a habit rather than a slip.
    expect(im, 'H is bound but toggles nothing').toMatch(/KeyH'[\s\S]{0,200}?\b(showControls|setShowControls)\b/);
  });
  it('the standalone top-center spell label band is removed (folded into the action bar)', () => {
    const hud = read('HUD.jsx');
    // the old persistent band read "Spell: " in a centered Panel; assert it is gone
    expect(hud).not.toMatch(/Spell:\s*<\/span>/);
  });
  it('PlayerHungerBar is gated on survival mode (no duplicate 100/100 pill in non-survival)', () => {
    // anchored to the ACTUAL gate `gameMode === 'survival' && <PlayerHungerBar`; the old
    // /gameMode|.../ alternation passed on any bare `gameMode` token anywhere in the file.
    expect(read('HUD.jsx')).toMatch(/gameMode\s*===\s*'survival'\s*&&\s*<PlayerHungerBar\b/);
  });
});
