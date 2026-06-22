/**
 * spells.js — the spell roster (pure data; S3-M2 T1 extraction from EnhancedMagicSystem's
 * component useMemo — a module constant is the same stable reference, one component less
 * to own it). The shape test beside this file locks the four-spell set + combat fields.
 *
 * B2 (Phase B) — spell-color unify: every element-IDENTITY hue (color/trail/glow + the
 * secondary-effect tint) DERIVES from the canonical `MAGIC` palette in theme/tokens, the
 * one element-color SoT that the HUD / element-zones / beast avatars already use. This
 * killed the legacy drift (fire was #FF4500, lightning #FFD700, arcane #9932CC — out of
 * step with the spec §4 palette). The projectile's deliberately "pushed-hot" core/glow VFX
 * lives in spellVisualProfiles ENERGY_PROFILE (the W2-T4 hero look) and is intentionally
 * separate. Locked by tests/gates/spell-color-unify-gates.test.js.
 */
import { MAGIC } from '../theme/tokens.js';

export const SPELL_TYPES = {
    fireball: {
      color: MAGIC.fire,
      trailColor: MAGIC.fire,
      particleColor: MAGIC.fire,
      glowColor: MAGIC.fire,
      speed: 25,
      size: 1.2,
      damage: 50,
      trailLength: 25,
      effect: 'fire',
      secondary: {
        type: 'burn',
        duration: 4,
        damagePerSecond: 8,
        color: MAGIC.fire
      }
    },
    iceball: {
      color: MAGIC.ice,
      trailColor: MAGIC.ice,
      particleColor: MAGIC.ice,
      glowColor: MAGIC.ice,
      speed: 20,
      size: 1.0,
      damage: 40,
      trailLength: 20,
      effect: 'ice',
      secondary: {
        type: 'freeze',
        duration: 5,
        slowPercent: 70,
        freezeChance: 0.2,
        color: MAGIC.ice
      }
    },
    lightning: {
      color: MAGIC.lightning,
      trailColor: MAGIC.lightning,
      particleColor: MAGIC.lightning,
      glowColor: MAGIC.lightning,
      speed: 60,
      size: 0.8,
      damage: 75,
      trailLength: 30,
      effect: 'lightning',
      secondary: {
        type: 'chain',
        maxChains: 3,
        chainRange: 8,
        chainDamageReduction: 0.3,
        stunDuration: 1,
        color: MAGIC.lightning
      }
    },
    arcane: {
      color: MAGIC.arcane,
      trailColor: MAGIC.arcane,
      particleColor: MAGIC.arcane,
      glowColor: MAGIC.arcane,
      speed: 30,
      size: 1.1,
      damage: 60,
      trailLength: 22,
      effect: 'arcane',
      secondary: {
        type: 'pierce',
        pierceCount: 3,
        lifestealPercent: 15,
        color: MAGIC.arcane
      }
    }
  };
