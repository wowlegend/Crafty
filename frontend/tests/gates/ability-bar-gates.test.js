import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('ability-bar cooldown mirror wiring', () => {
  it('store defines abilityCooldowns + setter', () => {
    const store = read('store/useGameStore.jsx');
    expect(store).toMatch(/abilityCooldowns:/);
    expect(store).toMatch(/setAbilityCooldowns:/);
  });
  it('Components.jsx writes the mirror via buildCooldownMirror (throttled, not per-frame React state)', () => {
    const c = strip(read('Components.jsx'));
    expect(c).toMatch(/buildCooldownMirror/);
    expect(c).toMatch(/setAbilityCooldowns|abilityCooldowns:/);
    // Game-Loop-Isolation: must use a throttle ref, never a per-frame setState in the hot loop
    expect(c).toMatch(/_lastCdMirror|cdMirrorThrottle/);
  });
});

describe('AbilityBar component', () => {
  const bar = read('ui/AbilityBar.jsx');
  it('reads abilityCooldowns from the store (not the SM refs)', () => {
    expect(bar).toMatch(/abilityCooldowns/);
    expect(bar).not.toMatch(/voidhandSMRef|soulbindSMRef/);
  });
  it('uses a conic-gradient radial sweep + the Slot primitive', () => {
    expect(bar).toMatch(/conic-gradient/);
    expect(bar).toMatch(/Slot/);
  });
  it('is capture-suppressed (returns null under isCaptureMode)', () => {
    expect(bar).toMatch(/isCaptureMode\(\)/);
  });
  it('labels the 5 signature abilities', () => {
    for (const k of ['GRAB', 'SNARE', 'IMBUE', 'ROAR', 'DODGE']) expect(bar).toMatch(new RegExp(k));
  });
});
