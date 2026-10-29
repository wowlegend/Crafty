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

  it('the controls are a panel (showControls, a store flag) and the HUD mounts the first-run card, not an always-on sheet', () => {
    // The panel's behaviour (what H opens, what it lists, when the card and hint leave) is driven in
    // controls-panel-gates.test.jsx; this pins only that the HUD mounts the until-seen card as a JSX element.
    expect(read('HUD.jsx')).toMatch(/<ControlsCardUntilSeen\b/);
    expect(read('store/useGameStore.jsx')).toMatch(/\bshowControls:/);
  });
  // 'H toggles the controls sheet' was a source-text case here; H is now driven through the real key handler in
  // tests/integration/menu-panel-interaction.test.jsx and tests/gates/controls-panel-gates.test.jsx (it opens the
  // controls panel and marks it seen), which a regex over InputManager.jsx could only approximate.
  it('the standalone top-center spell label band is removed (folded into the action bar)', () => {
    const hud = read('HUD.jsx');
    // the old persistent band read "Spell: " in a centered Panel; assert it is gone
    expect(hud).not.toMatch(/Spell:\s*<\/span>/);
  });
});
