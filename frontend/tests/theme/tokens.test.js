import { describe, it, expect } from 'vitest';
import { PALETTE, PALETTE_KEYS, MAGIC, DANGER_STATES } from '../../src/theme/tokens.js';

const HEX = /^#[0-9A-Fa-f]{6}$/;

describe('palette tokens', () => {
  it('every palette state defines every required key as a valid hex', () => {
    for (const state of ['explore', ...DANGER_STATES]) {
      for (const key of PALETTE_KEYS) {
        expect(PALETTE[state]?.[key], `${state}.${key}`).toMatch(HEX);
      }
    }
  });

  it('danger states share EXACTLY the explore keys (lerp-safety: no undefined mid-lerp)', () => {
    const exploreKeys = Object.keys(PALETTE.explore).sort();
    for (const state of DANGER_STATES) {
      expect(Object.keys(PALETTE[state]).sort(), state).toEqual(exploreKeys);
    }
  });

  it('magic palette covers all elements + default', () => {
    for (const el of ['fire', 'ice', 'lightning', 'arcane', 'nature', 'default']) {
      expect(MAGIC[el], el).toMatch(HEX);
    }
  });

  it('explore keys match PALETTE_KEYS exactly (no silent key escaping the validity sweep)', () => {
    expect(Object.keys(PALETTE.explore).sort()).toEqual([...PALETTE_KEYS].sort());
  });
});
