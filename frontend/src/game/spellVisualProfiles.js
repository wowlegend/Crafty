/**
 * spellVisualProfiles.js — the per-element VISUAL personalities (pure data; S3-M2 T2):
 * ENERGY_PROFILE (projectile/impact/telegraph hues, intensities, turbulence) with
 * _defaultEnergy as the unknown-type fallback contract; SPARK_PROFILE (the GPU spark
 * burst recipes); WAND_CONFIGS (the caster's wand looks). Values verbatim from
 * EnhancedMagicSystem; the test locks the four-element coverage + the fallback.
 */
export const SPARK_PROFILE = {
    // [sparkColor, count] per element.
    fireball:  ['#FF7A1A', 52],
    iceball:   ['#7FD8FF', 42],
    lightning: ['#FFF0A0', 48],
    arcane:    ['#C77DFF', 46],
  };

export const ENERGY_PROFILE = {
  fireball: {
    coreColor: '#FFF4D6',   // white-hot heart (blooms white, edges go orange)
    glowColor: '#FF7A1A',   // saturated fiery orange shell (spec §4 #FF7A3C, pushed hot)
    coreIntensity: 6.0,
    glowIntensity: 4.0,
    coreScale: 0.62,        // larger hot heart so it dominates + blooms
    glowScale: 0.92,        // tighter halo (less pink wash)
    glowOpacity: 0.22,      // restrained outer wash so the hot core wins
    flicker: 0.18,          // strong fiery turbulence (gameplay only)
    flickerSpeed: 14,
    capturePhase: 0.65,     // flattering frozen phase (sin arg) -> slightly expanded
    shape: 'sphere',
  },
  iceball: {
    coreColor: '#F2FCFF',   // crystalline white heart
    glowColor: '#3FB7FF',   // cool saturated cyan shell (spec §4 #6FC8FF, pushed saturated)
    coreIntensity: 5.5,
    glowIntensity: 3.6,
    coreScale: 0.58,
    glowScale: 0.86,
    glowOpacity: 0.20,
    flicker: 0.07,          // crisp, low-turbulence (ice is sharp, not roiling)
    flickerSpeed: 7,
    capturePhase: 0.30,
    shape: 'crystal',
  },
  lightning: {
    coreColor: '#FFFFFF',   // pure electric white heart
    glowColor: '#86B8FF',   // white-blue electric shell (over the §4 #FFE066 bolt)
    coreIntensity: 8.0,
    glowIntensity: 4.0,
    coreScale: 0.50,
    glowScale: 0.74,        // thin, jagged — lightning is a hot line, not a ball
    glowOpacity: 0.18,
    flicker: 0.34,          // jagged, high-frequency electric jitter (gameplay only)
    flickerSpeed: 26,
    capturePhase: 1.10,     // frozen at a jagged-but-flattering peak
    shape: 'bolt',
  },
  arcane: {
    coreColor: '#FBEEFF',   // luminous near-white violet heart
    glowColor: '#B84DFF',   // saturated purple-magenta shell (spec §4 #B36BFF, pushed)
    coreIntensity: 6.0,
    glowIntensity: 3.8,
    coreScale: 0.60,
    glowScale: 0.90,
    glowOpacity: 0.22,
    flicker: 0.14,          // gentle swirling pulse
    flickerSpeed: 10,
    capturePhase: 0.50,
    shape: 'swirl',
  },
};

export const _defaultEnergy = {
  coreColor: '#FFFFFF', glowColor: '#46E0FF', coreIntensity: 5.0, glowIntensity: 3.4,
  coreScale: 0.58, glowScale: 0.9, glowOpacity: 0.22, flicker: 0.12, flickerSpeed: 10,
  capturePhase: 0.5, shape: 'sphere',
};

export const WAND_CONFIGS = {
  fireball: {
    handleColor: '#8B4513',
    tipColor: '#FF4500',
    gemColor: '#FF6347',
    auraColor: '#FFD700'
  },
  iceball: {
    handleColor: '#4169E1',
    tipColor: '#00BFFF',
    gemColor: '#87CEEB',
    auraColor: '#E0FFFF'
  },
  lightning: {
    handleColor: '#FFD700',
    tipColor: '#FFFF00',
    gemColor: '#FFFFE0',
    auraColor: '#FFFACD'
  },
  arcane: {
    handleColor: '#9932CC',
    tipColor: '#DA70D6',
    gemColor: '#DDA0DD',
    auraColor: '#E6E6FA'
  }
};
