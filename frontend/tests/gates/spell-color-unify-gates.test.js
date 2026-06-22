import { describe, it, expect } from 'vitest';
import { MAGIC } from '../../src/theme/tokens.js';
import { SPELL_TYPES } from '../../src/game/spells.js';
import { SPELL_COLORS } from '../../src/GameSystems.jsx';
import { SPARK_PROFILE, WAND_CONFIGS } from '../../src/game/spellVisualProfiles.js';

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
