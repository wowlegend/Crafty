/**
 * spellVisualProfiles.js — the per-element VISUAL personalities (pure data; S3-M2 T2):
 * ENERGY_PROFILE (projectile/impact/telegraph hues, intensities, turbulence) with
 * _defaultEnergy as the unknown-type fallback contract; SPARK_PROFILE (the GPU spark
 * burst recipes); WAND_CONFIGS (the caster's wand looks). Values verbatim from
 * EnhancedMagicSystem; the test locks the four-element coverage + the fallback.
 */
import { MAGIC } from '../theme/tokens.js';

// B2 spell-color unify: spark + wand-mesh IDENTITY hues derive from the canonical MAGIC palette
// (theme/tokens), the one element-color SoT. The projectile core/glow (ENERGY_PROFILE below) is the
// deliberately "pushed-hot" W2-T4 hero VFX and stays hand-tuned — a documented derivative, not drift.
export const SPARK_PROFILE = {
    // [sparkColor, count] per element — identity hue from MAGIC.
    fireball:  [MAGIC.fire, 52],
    iceball:   [MAGIC.ice, 42],
    lightning: [MAGIC.lightning, 48],
    arcane:    [MAGIC.arcane, 46],
  };

export const ENERGY_PROFILE = {
  fireball: {
    coreColor: '#FFF4D6',   // white-hot heart (blooms white, edges go orange)
    glowColor: '#FF7A1A',   // saturated fiery orange shell (spec §4 #FF7A3C, pushed hot)
    coreIntensity: 6.0,
    glowIntensity: 5.5,     // W2-T4: shape is the hero — boost the silhouette emissive
    coreScale: 0.40,        // W2-T4: white core shrunk to a small bloom spec
    glowScale: 0.92,        // tighter halo (less pink wash)
    glowOpacity: 0.22,      // restrained outer wash so the hot core wins
    flicker: 0.18,          // strong fiery turbulence (gameplay only)
    flickerSpeed: 14,
    capturePhase: 0.65,     // flattering frozen phase (sin arg) -> slightly expanded
    shape: 'sphere',
    trail: 'embers',        // W2-T4: soft turbulent ember taper
    impact: 'burst',        // W2-T4: expanding fireball burst
    motion: 'roil',         // v7-S3.1: turbulent, non-uniform, RISING (vs the old shared sin-pulse)
  },
  iceball: {
    coreColor: '#F2FCFF',   // crystalline white heart
    glowColor: '#3FB7FF',   // cool saturated cyan shell (spec §4 #6FC8FF, pushed saturated)
    coreIntensity: 5.5,
    glowIntensity: 5.0,     // W2-T4: shape is the hero — boost the crystal emissive
    coreScale: 0.36,        // W2-T4: white core shrunk to a small bloom spec
    glowScale: 0.86,
    glowOpacity: 0.20,
    flicker: 0.07,          // crisp, low-turbulence (ice is sharp, not roiling)
    flickerSpeed: 7,
    capturePhase: 0.30,
    shape: 'crystal',
    trail: 'shard',         // W2-T4: sharp thin shard streak
    impact: 'shatter',      // W2-T4: radial shard shatter
    motion: 'static',       // v7-S3.1: near-frozen, no tumble (cold reads as still)
  },
  lightning: {
    coreColor: '#FFFFFF',   // pure electric white heart
    glowColor: '#86B8FF',   // white-blue electric shell (over the §4 #FFE066 bolt)
    coreIntensity: 8.0,
    glowIntensity: 5.5,     // W2-T4: shape is the hero — boost the bolt emissive
    coreScale: 0.30,        // W2-T4: white core shrunk to a small bloom spec
    glowScale: 0.74,        // thin, jagged — lightning is a hot line, not a ball
    glowOpacity: 0.18,
    flicker: 0.34,          // jagged, high-frequency electric jitter (gameplay only)
    flickerSpeed: 26,
    capturePhase: 1.10,     // frozen at a jagged-but-flattering peak
    shape: 'bolt',
    trail: 'segments',      // W2-T4: thin jagged lightning segments
    impact: 'fork',         // W2-T4: forked flash + chain segment
    motion: 'strobe',       // v7-S3.1: discontinuous on/off flash, erratic (vs smooth pulse)
  },
  arcane: {
    coreColor: '#FBEEFF',   // luminous near-white violet heart
    glowColor: '#B84DFF',   // saturated purple-magenta shell (spec §4 #B36BFF, pushed)
    coreIntensity: 6.0,
    glowIntensity: 5.2,     // W2-T4: shape is the hero — boost the sigil emissive
    coreScale: 0.38,        // W2-T4: white core shrunk to a small bloom spec
    glowScale: 0.90,
    glowOpacity: 0.22,
    flicker: 0.14,          // gentle swirling pulse
    flickerSpeed: 10,
    capturePhase: 0.50,
    shape: 'sigil',         // W2-T4: rotating sigil orb (rings + rune glyph)
    trail: 'ribbon',        // W2-T4: flat double-sided arcane ribbon
    impact: 'rune',         // W2-T4: imploding rune ring
    motion: 'orbit',        // v7-S3.1: smooth orbital rotation, no scale-breathing (hypnotic/uncanny)
  },
};

export const _defaultEnergy = {
  coreColor: '#FFFFFF', glowColor: '#46E0FF', coreIntensity: 5.0, glowIntensity: 3.4,
  coreScale: 0.38, glowScale: 0.9, glowOpacity: 0.22, flicker: 0.12, flickerSpeed: 10,
  capturePhase: 0.5, shape: 'sphere', trail: 'embers', impact: 'burst', motion: 'pulse',
};

// Wand mesh: the handle stays a neutral material; the tip/gem/aura carry the element IDENTITY
// from MAGIC (B2 unify — was legacy-drifted per wand).
export const WAND_CONFIGS = {
  fireball: {
    handleColor: '#8B4513',
    tipColor: MAGIC.fire,
    gemColor: MAGIC.fire,
    auraColor: MAGIC.fire
  },
  iceball: {
    handleColor: '#4169E1',
    tipColor: MAGIC.ice,
    gemColor: MAGIC.ice,
    auraColor: MAGIC.ice
  },
  lightning: {
    handleColor: '#B8923A',
    tipColor: MAGIC.lightning,
    gemColor: MAGIC.lightning,
    auraColor: MAGIC.lightning
  },
  arcane: {
    handleColor: '#5B2E86',
    tipColor: MAGIC.arcane,
    gemColor: MAGIC.arcane,
    auraColor: MAGIC.arcane
  }
};
