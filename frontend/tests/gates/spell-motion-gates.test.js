import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ENERGY_PROFILE } from '../../src/game/spellVisualProfiles.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VFX = readFileSync(resolve(__dirname, '../../src/render/spellVfx.jsx'), 'utf8');

// v7-S3.1 seam-allowlist: the per-element motion grammar (spellMotion.computeSpellMotion) replaced the
// single shared sin-pulse + the hardcoded uniform spin in SpellProjectileCore. Lock the wiring so a future
// edit can't silently revert all 4 spells to one identical motion.
describe('spell motion-grammar wiring (v7-S3.1)', () => {
  it('SpellProjectileCore drives motion via computeSpellMotion (not a shared inline pulse)', () => {
    expect(/import\s*\{\s*computeSpellMotion\s*\}\s*from\s*'\.\.\/game\/spellMotion'/.test(VFX)).toBe(true);
    expect(/computeSpellMotion\(\s*profile\.motion\s*,\s*phase\s*,\s*profile\.flicker\s*\)/.test(VFX)).toBe(true);
  });

  it('the legacy hardcoded uniform spin is GONE from the projectile core', () => {
    // The old tell: rotation.x += 0.06 / .y += 0.05 / .z += 0.04 on every element.
    expect(/rotation\.x\s*\+=\s*0\.06/.test(VFX)).toBe(false);
  });

  it('all four elements declare a distinct motion grammar', () => {
    const motions = ['fireball', 'iceball', 'lightning', 'arcane'].map((k) => ENERGY_PROFILE[k].motion);
    expect(motions).toEqual(['roil', 'static', 'strobe', 'orbit']);
    expect(new Set(motions).size).toBe(4); // genuinely distinct, no two share a grammar
  });
});
