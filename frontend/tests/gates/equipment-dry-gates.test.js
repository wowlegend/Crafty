import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('equipment DRY gates', () => {
  it('the weapon base-damage ladder is not inlined in Components or GamePanels', () => {
    for (const f of ['src/Components.jsx', 'src/ui/GamePanels.jsx']) {
      expect(/===\s*'Stone Sword'\)\s*baseWeaponDmg\s*=\s*12/.test(read(f))).toBe(false);
    }
  });
  it('both consumers import getWeaponBaseDamage from the shared module', () => {
    expect(/getWeaponBaseDamage/.test(read('src/Components.jsx'))).toBe(true);
    expect(/getWeaponBaseDamage/.test(read('src/ui/GamePanels.jsx'))).toBe(true);
  });
  it('GamePanels no longer defines a local getItemSlot', () => {
    expect(/const\s+getItemSlot\s*=/.test(read('src/ui/GamePanels.jsx'))).toBe(false);
  });
});
