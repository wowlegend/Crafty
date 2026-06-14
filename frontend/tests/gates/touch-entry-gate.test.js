import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Touch cold-start fix (2026-06-14): on iPad/iPhone there is NO Pointer Lock, yet the title menu hides
// ONLY when `active` is true and the menu's buttons opened that gate via requestPointerLock() — so tapping
// "Start Adventure" on a real device did nothing and the player was STUCK on the title screen (the same
// untested-headless blind spot that hid the dead mouse-look; confirmed live by scripts/visual/touch-probe.mjs).
// The fix bridges the active gate directly on touch. This gate locks that bridge so it can't silently regress.
const __dir = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(__dir, '../../src', p), 'utf8');

describe('touch menu->play entry bridge', () => {
  const menu = read('MenuSystem.jsx');

  it('MenuSystem knows about touch devices', () => {
    expect(menu).toMatch(/import\s*\{[^}]*isTouchDevice[^}]*\}\s*from\s*['"]\.\/input\/touchDevice['"]/);
  });

  it('opens the active gate directly on touch (no pointer-lock to rely on)', () => {
    // the play-entry helper must set active itself when on a touch device
    expect(menu).toMatch(/if\s*\(\s*isTouchDevice\(\)\s*\)\s*setIsPointerLocked\(\s*true\s*\)/);
  });

  it('the "Start Adventure" cold-start uses the touch-aware entry (not a raw lock request)', () => {
    // the entry helper is named enterPlay and the title button is wired straight to it
    expect(menu).toMatch(/const\s+enterPlay\s*=/);
    expect(menu).toMatch(/onClick=\{enterPlay\}/);
  });

  it('the duplicated per-site raw requestPointerLock blocks are collapsed into the single enterPlay helper', () => {
    // every former panel-close block (there were 9 identical copies) is now routed through enterPlay();
    // the lock-request line must survive in exactly ONE place — the canonical enterPlay helper itself.
    const rawBlocks = menu.match(/else if \(document\.body\.requestPointerLock\) document\.body\.requestPointerLock\(\)\.catch\(e => console\.warn\(e\)\);/g) || [];
    expect(rawBlocks.length).toBe(1);
  });
});
