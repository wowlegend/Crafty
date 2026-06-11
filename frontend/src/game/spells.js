/**
 * spells.js — the spell roster (pure data; S3-M2 T1 extraction from EnhancedMagicSystem's
 * component useMemo — a module constant is the same stable reference, one component less
 * to own it). Values verbatim; the shape test beside this file locks the four-spell set.
 */
export const SPELL_TYPES = {
    fireball: {
      color: '#FF4500',
      trailColor: '#FF6347',
      particleColor: '#FFD700',
      glowColor: '#FF6600',
      speed: 25,
      size: 1.2,
      damage: 50,
      trailLength: 25,
      particleCount: 15,
      effect: 'fire',
      secondary: {
        type: 'burn',
        duration: 4,
        damagePerSecond: 8,
        color: '#FF4500'
      }
    },
    iceball: {
      color: '#00BFFF',
      trailColor: '#87CEEB',
      particleColor: '#E0FFFF',
      glowColor: '#00FFFF',
      speed: 20,
      size: 1.0,
      damage: 40,
      trailLength: 20,
      particleCount: 12,
      effect: 'ice',
      secondary: {
        type: 'freeze',
        duration: 5,
        slowPercent: 70,
        freezeChance: 0.2,
        color: '#87CEEB'
      }
    },
    lightning: {
      color: '#FFD700',
      trailColor: '#FFFF00',
      particleColor: '#FFFFE0',
      glowColor: '#FFFF00',
      speed: 60,
      size: 0.8,
      damage: 75,
      trailLength: 30,
      particleCount: 20,
      effect: 'lightning',
      secondary: {
        type: 'chain',
        maxChains: 3,
        chainRange: 8,
        chainDamageReduction: 0.3,
        stunDuration: 1,
        color: '#FFFF00'
      }
    },
    arcane: {
      color: '#9932CC',
      trailColor: '#DA70D6',
      particleColor: '#DDA0DD',
      glowColor: '#FF00FF',
      speed: 30,
      size: 1.1,
      damage: 60,
      trailLength: 22,
      particleCount: 14,
      effect: 'arcane',
      secondary: {
        type: 'pierce',
        pierceCount: 3,
        lifestealPercent: 15,
        color: '#DA70D6'
      }
    }
  };
