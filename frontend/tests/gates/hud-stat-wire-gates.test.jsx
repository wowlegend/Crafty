// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameSystemsProvider, useGameSystems, PlayerHealthBar } from '../../src/GameSystems.jsx';

/**
 * HUD stat-bar wiring — the keys the HUD reads must be the keys the context supplies.
 *
 * THE ORIGINAL DEFECT (2026-06-28 audit, HIGH). `<PlayerHealthBar health={gameSystems.health} />` — but
 * the context exposes `playerHealth`, not `health`. `undefined` fell through to StatBar's `value = 0`
 * default, so the health bar rendered 0/100 at full HP forever. The mana bar was correct, which masked it.
 *
 * WHY THIS FILE MATTERS MORE THAN ITS SIZE SUGGESTS. `tests/e2e/_boot.js` names it in prose as the
 * committed guard for exactly what the e2e layer deliberately does NOT assert: "live in-game HUD-DOM
 * assertions are intentionally NOT in this suite ... covered by the static wiring gate". So it is the
 * last thing watching this property, and the 2026-09-22 audit put it in its DELETE column.
 *
 * CONVERTED 2026-09-22, selected by `gate-census.mjs` which scored it 0/5.
 *
 * WHAT CHANGED. The old version PARSED the provider's `const value = {...}` literal with a regex and
 * diffed key names as text. That is fragile in the direction that matters: reformat the object, spread
 * something into it, or build a key conditionally, and the parse silently yields a different set while
 * still reporting a clean diff. It now RENDERS the real provider and reads the context object it actually
 * hands its children — the keys are observed, not inferred.
 *
 * And it renders the bar with a known value, which is the only form that reproduces the original defect:
 * a key-set comparison would pass if the HUD read a key that EXISTS but is the wrong one, while the bar
 * showing 0 at full health is the thing a player saw.
 *
 * BLIND SPOT, stated (R7): the HUD-to-context binding itself is still read as SOURCE. `HUD.jsx` mounts
 * inside the R3F/Rapier tree that no jsdom harness can stand up, so "the health bar binds to
 * gameSystems.playerHealth" is a call-site grep, comment-stripped. What is now executed is the CONTRACT
 * (what the context provides) and the RENDER (what a bar does with a value) — the two ends the defect
 * lived between.
 *
 * Mutation-Proof: 4 mutations, denominator asserted (5/5 cases collected on every run).
 *   M1 rename `playerHealth` to `health` in the provider's value -> contract case RED
 *   M2 HUD.jsx binds `gameSystems.health` again (the original defect) -> binding case RED
 *   M3 StatBar's value default 0 made to swallow a real value -> render case RED
 *   M4 delete `isAlive` from the provider value -> contract case RED (the required-key list is real, not
 *      a subset that happens to pass)
 * Subjects restored from cp backups and diffed byte-identical after each.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(HERE, '../../src', rel), 'utf8');
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Render the REAL provider and capture the context object it hands its children. */
function captureContext() {
  let seen = null;
  const Probe = () => { seen = useGameSystems(); return null; };
  render(<GameSystemsProvider><Probe /></GameSystemsProvider>);
  return seen;
}

describe('HUD stat-bar wiring — context-key integrity', () => {
  it('the provider really hands its children an object (not undefined — else every check below is vacuous)', () => {
    const ctx = captureContext();
    expect(ctx).toBeTruthy();
    // R3a: the denominator. A provider yielding {} would make the key assertions below meaningless.
    expect(Object.keys(ctx).length).toBeGreaterThan(0);
  });

  it('every stat key the HUD needs is present on the context it ACTUALLY provides', () => {
    const ctx = captureContext();
    const REQUIRED = ['playerHealth', 'maxHealth', 'mana', 'maxMana', 'hunger', 'isAlive'];
    expect(REQUIRED.length).toBeGreaterThan(0);
    for (const k of REQUIRED) expect(Object.keys(ctx), k).toContain(k);
  });

  it('there is NO `health` key — the name the HUD once read, whose absence caused the 0/100 bar', () => {
    // The defect was reading a key that does not exist. Pinning its continued absence is what stops the
    // fix being undone by "helpfully" adding an alias that hides the next mis-binding.
    expect(Object.keys(captureContext())).not.toContain('health');
  });

  it('a stat bar given a real value RENDERS it — the thing the player actually saw was 0 at full HP', () => {
    const { container } = render(<PlayerHealthBar health={73} maxHealth={100} />);
    const text = container.textContent || '';
    expect(text).toMatch(/73/);
    expect(text).not.toMatch(/\b0\s*\/\s*100\b/); // the original symptom, stated as the symptom
  });

  it('HUD.jsx binds the bar to gameSystems.playerHealth (call-site grep — see BLIND SPOT)', () => {
    const hud = code('HUD.jsx');
    expect(hud).toMatch(/<PlayerHealthBar\s+health=\{gameSystems\.playerHealth\}/);
    expect(hud).not.toMatch(/health=\{gameSystems\.health\}/);
  });
});
