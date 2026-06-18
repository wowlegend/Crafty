import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

describe('hud declutter gates', () => {
  it('CombatInstructions is gated on a showControls store flag (not always-on)', () => {
    const hud = read('HUD.jsx');
    expect(hud).toMatch(/showControls.*CombatInstructions|CombatInstructions.*showControls/s);
    expect(read('store/useGameStore.jsx')).toMatch(/showControls:/);
  });
  it('H toggles the controls sheet (InputManager)', () => {
    expect(read('InputManager.jsx')).toMatch(/KeyH/);
  });
  it('the standalone top-center spell label band is removed (folded into the action bar)', () => {
    const hud = read('HUD.jsx');
    // the old persistent band read "Spell: " in a centered Panel; assert it is gone
    expect(hud).not.toMatch(/Spell:\s*<\/span>/);
  });
  it('PlayerHungerBar is gated on survival mode (no duplicate 100/100 pill in non-survival)', () => {
    expect(read('HUD.jsx')).toMatch(/gameMode|survival.*Hunger|Hunger.*survival/s);
  });
});
