import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HELD_REST } from './playerRender.jsx';

// THE IDLE RESET AND THE AUTHORED POSE DISAGREED, AND THE RESET WON EVERY FRAME.
//
// wandRef is attached to two mutually-exclusive groups with different authored transforms — a weapon at
// y 0.32 rotation zero, a wand at y 0.4 rotation (0.1, 0.2, 0.1). The idle branch in useFrame hardcoded
// rotation (0.1, 0, 0) and y = 0.4, which is NEITHER of them. So the wand's authored yaw and roll never
// rendered, and an equipped sword sat 0.08 high and pitched 0.1 rad. Idle is the overwhelming steady
// state — attackType is set only in 150-200ms bursts — so the authored transform showed for one frame
// after each re-render and was clobbered on the next, which reads as a subtle model offset, not a bug.
//
// The fix is ONE table read by both, so they cannot disagree. What this file can check is that the table
// is complete and immutable, and that no literal pose has crept back into either site.
const SRC = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'playerRender.jsx'), 'utf8');

describe('HELD_REST — one authored pose, read by both sites', () => {
  it('covers both mounted groups with complete 3-tuples', () => {
    for (const key of ['weapon', 'wand']) {
      expect(HELD_REST[key], `${key} rest pose missing`).toBeTruthy();
      expect(HELD_REST[key].position).toHaveLength(3);
      expect(HELD_REST[key].rotation).toHaveLength(3);
      for (const n of [...HELD_REST[key].position, ...HELD_REST[key].rotation]) {
        expect(Number.isFinite(n), `${key} carries a non-finite component`).toBe(true);
      }
    }
  });

  it('the two poses actually DIFFER — one shared pose is the bug wearing a table', () => {
    expect(HELD_REST.weapon.position).not.toEqual(HELD_REST.wand.position);
    expect(HELD_REST.weapon.rotation).not.toEqual(HELD_REST.wand.rotation);
  });

  it('is frozen, so the per-frame reset cannot mutate the table it resets to', () => {
    // The reset runs in useFrame. A writable table here would let one frame's write become every later
    // frame's rest pose, which is a worse version of the defect this replaced.
    expect(Object.isFrozen(HELD_REST)).toBe(true);
    expect(Object.isFrozen(HELD_REST.wand)).toBe(true);
    expect(Object.isFrozen(HELD_REST.wand.position)).toBe(true);
  });

  it('neither the JSX nor the idle reset carries a literal pose any more', () => {
    // The defect was two copies of the numbers. This asserts there is exactly one: the old literals are
    // gone from both sites, and both read the table.
    expect(SRC).not.toMatch(/wandRef\.current\.position\.y = 0\.4;/);
    expect(SRC).not.toMatch(/wandRef\.current\.rotation\.set\(0\.1, 0, 0\)/);
    expect(SRC).toMatch(/position=\{HELD_REST\.weapon\.position\}/);
    expect(SRC).toMatch(/position=\{HELD_REST\.wand\.position\}/);
    expect(SRC).toMatch(/const rest = isWeaponEquipped \? HELD_REST\.weapon : HELD_REST\.wand;/);
  });
});
