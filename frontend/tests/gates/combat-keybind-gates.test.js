import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

// 2026-06-28 (Kevin): magic spells are the marquee feature, so the prime F key CASTS the selected
// spell; melee moves to its own key (T). Both are "express" verbs on top of the contextual mouse
// router (LMB=mine/melee, RMB=cast/place). This gate pins the new bindings + keeps keyMap honest.
describe('combat keybinds — F casts, T melees', () => {
  const comp = read('Components.jsx');
  const keymap = read('game/keyMap.js');

  it('KeyF triggers the spell cast (not melee)', () => {
    // window kept tight (120) so the F-block doesn't bleed into the adjacent T-block
    expect(/code === 'KeyF'\)\s*\{[\s\S]{0,120}triggerSpellCast\(\)/.test(comp)).toBe(true);
    expect(/code === 'KeyF'\)\s*\{[\s\S]{0,120}triggerMeleeAttack\(\)/.test(comp)).toBe(false);
  });

  it('KeyT triggers the melee attack', () => {
    expect(/code === 'KeyT'\)\s*\{[\s\S]{0,120}triggerMeleeAttack\(\)/.test(comp)).toBe(true);
  });

  it('keyMap advertises F = Cast and T = Melee in the Combat group', () => {
    expect(keymap).toMatch(/code: 'KeyF', label: 'Cast/);
    expect(keymap).toMatch(/code: 'KeyT', label: '[^']*[Mm]elee/);
  });
});
