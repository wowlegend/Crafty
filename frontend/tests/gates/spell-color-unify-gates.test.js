import { describe, it, expect } from 'vitest';
import { MAGIC } from '../../src/theme/tokens.js';
import { SPELL_TYPES } from '../../src/game/spells.js';
import { SPELL_COLORS } from '../../src/GameSystems.jsx';
import { SPARK_PROFILE, WAND_CONFIGS, ENERGY_PROFILE, _defaultEnergy } from '../../src/game/spellVisualProfiles.js';

// B2 (Phase B) — spell-color unify. Before this, each element's identity hue was redefined
// independently in 5+ places with DRIFTED/contradictory values (GameSystems SPELL_COLORS used
// #FF4500/#00BFFF/#FFD700/#9932CC; spells.js + WAND_CONFIGS used other legacy hues) — out of step
// with the canonical `MAGIC` palette that the HUD / element-zones / beast avatars already use.
// This pins the ONE token set: every element-IDENTITY color (wand indicator, projectile trail,
// telegraph, impact ring, spark, wand mesh tip) derives from theme/tokens MAGIC. The deliberately
// "pushed-hot" projectile core/glow (spellVisualProfiles ENERGY_PROFILE, the W2-T4 hero VFX) is a
// documented derivative and is intentionally NOT locked here.
const ELEMENT = { fireball: 'fire', iceball: 'ice', lightning: 'lightning', arcane: 'arcane' };

describe('B2 spell-color unify — one token set (theme/tokens MAGIC is the SoT)', () => {
  for (const [spell, mag] of Object.entries(ELEMENT)) {
    it(`${spell}: SPELL_TYPES identity (color/glow/trail) = MAGIC.${mag}`, () => {
      expect(SPELL_TYPES[spell].color).toBe(MAGIC[mag]);
      expect(SPELL_TYPES[spell].glowColor).toBe(MAGIC[mag]);
      expect(SPELL_TYPES[spell].trailColor).toBe(MAGIC[mag]);
    });
    it(`${spell}: GameSystems SPELL_COLORS = MAGIC.${mag}`, () => {
      expect(SPELL_COLORS[spell]).toBe(MAGIC[mag]);
    });
    it(`${spell}: wand mesh tip + spark color = MAGIC.${mag}`, () => {
      expect(WAND_CONFIGS[spell].tipColor).toBe(MAGIC[mag]);
      expect(SPARK_PROFILE[spell][0]).toBe(MAGIC[mag]);
    });
  }
});

// v7-S3.2 — ENERGY_PROFILE palette lane-separation + selective-bloom discipline (the deliberately
// "pushed-hot" hero VFX, NOT MAGIC-locked above). Pins the de-pink-wash levers so they can't regress.
describe('v7-S3.2 spell palette lane-separation + bloom discipline (ENERGY_PROFILE)', () => {
  const ELEMENTS = ['fireball', 'iceball', 'lightning', 'arcane'];

  it('every element + the fallback declares a midColor (ramp/accent stop)', () => {
    for (const k of ELEMENTS) expect(ENERGY_PROFILE[k].midColor, `${k} midColor`).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(_defaultEnergy.midColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('no two elements share a glow lane (all four glowColors distinct)', () => {
    const glows = ELEMENTS.map((k) => ENERGY_PROFILE[k].glowColor.toLowerCase());
    expect(new Set(glows).size).toBe(4);
  });

  it('the ice<->lightning blue collision is resolved (distinct glow hues)', () => {
    // Was the documented ambiguity: ice #3FB7FF vs lightning #86B8FF (both blue). Lightning is now
    // white-violet, ice a desaturated cyan -> they must not be equal.
    expect(ENERGY_PROFILE.iceball.glowColor.toLowerCase()).not.toBe(ENERGY_PROFILE.lightning.glowColor.toLowerCase());
    // lightning carries the violet/red component (R >= B is false for blue; violet has high R AND B).
    const lr = parseInt(ENERGY_PROFILE.lightning.glowColor.slice(1, 3), 16);
    const lb = parseInt(ENERGY_PROFILE.lightning.glowColor.slice(5, 7), 16);
    expect(lr).toBeGreaterThan(0x90); // violet has a strong red channel (a pure blue would not)
    expect(lb).toBeGreaterThan(0x90);
  });

  it('fire shrinks the white core + pushes the orange HDR (the de-pink-wash fix)', () => {
    expect(ENERGY_PROFILE.fireball.coreScale).toBeLessThanOrEqual(0.32); // was 0.40 (smaller white heart)
    expect(ENERGY_PROFILE.fireball.glowIntensity).toBeGreaterThanOrEqual(6.5); // orange pushed into HDR
  });

  it('ice lowers its glow opacity for crisp high-contrast facets (not a glow ball)', () => {
    expect(ENERGY_PROFILE.iceball.glowOpacity).toBeLessThanOrEqual(0.16); // was 0.20
  });
});
