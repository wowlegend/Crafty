// bossTier.js — THE DRAGON RETURNS (QUEUE C3). Spec: docs/superpowers/specs/2026-09-22-crafty-boss-tiers-design.md.
//
// Tier n = Shadow Dragons slain so far. Tier 0 is the original fight, unchanged, and its kill is still the
// game's win (bossSystem's kill beat, win latch LAST). Each later tier waits at the Blight Heart until the
// player has survived RETURN_NIGHTS more nights AND gained LEVEL_STEP more levels, then fights harder and pays
// more. A tier dimension over the existing encounter — derived from BOSS_CONFIG, never a second copy of it.
//
// Pure: no React, no store. bossSystem, BossEntity, BossHealthBar and the persistence read it.
import { BOSS_CONFIG, BOSS_LOOT } from './bossConfig.js';

/** Nights after a kill before the next tier can wake. */
export const RETURN_NIGHTS = 3;
/** The first fight's level gate (bossSystem's arrival rule) and the extra levels each return demands. */
export const BOSS_BASE_LEVEL = 5;
export const LEVEL_STEP = 4;
/** Per-tier growth. Speed is capped: a dragon faster than the player can turn is not a fight. */
const HEALTH_PER_TIER = 0.5;
const DAMAGE_PER_TIER = 0.2;
const SPEED_PER_TIER = 0.06;
export const SPEED_CAP = 1.3;

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

const tierOf = (t) => (Number.isFinite(t) && t > 0 ? Math.floor(t) : 0);

/** The name suffix for a tier: '' for the original, then 'Risen', 'Risen II', 'Risen III', ... */
export function tierLabel(tier) {
  const n = tierOf(tier);
  if (n === 0) return '';
  if (n === 1) return 'Risen';
  return `Risen ${ROMAN[n] || n}`;
}

/** Everything that differs between tiers, derived from BOSS_CONFIG. Tier 0 is the config itself. */
export function bossTierStats(tier) {
  const n = tierOf(tier);
  if (n === 0) {
    return {
      tier: 0, name: BOSS_CONFIG.name, health: BOSS_CONFIG.health, xpReward: BOSS_CONFIG.xpReward,
      phases: BOSS_CONFIG.phases.map((p) => ({ ...p })), loot: BOSS_LOOT.map(([i, q]) => [i, q]),
    };
  }
  const speedMult = Math.min(SPEED_CAP, 1 + SPEED_PER_TIER * n);
  return {
    tier: n,
    name: `${BOSS_CONFIG.name} ${tierLabel(n)}`,
    health: Math.round(BOSS_CONFIG.health * (1 + HEALTH_PER_TIER * n)),
    xpReward: Math.round(BOSS_CONFIG.xpReward * (1 + n)),
    phases: BOSS_CONFIG.phases.map((p) => ({
      ...p, speed: p.speed * speedMult, damage: Math.round(p.damage * (1 + DAMAGE_PER_TIER * n)),
    })),
    // The crown is the first kill's trophy; a returning dragon pays in scales, more each time.
    loot: [['Dragon Scale', 2 + n]],
  };
}

/**
 * May a slain dragon wake again? Only for tier >= 1 (the first fight is bossSystem's level-5 arrival), and
 * only once BOTH the nights and the levels are due. Any non-finite input answers no.
 */
export function bossCanReturn({ tier, killNight, nightCount, level } = {}) {
  const n = tierOf(tier);
  if (n === 0) return false;
  if (![killNight, nightCount, level].every(Number.isFinite)) return false;
  return nightCount >= killNight + RETURN_NIGHTS && level >= BOSS_BASE_LEVEL + LEVEL_STEP * n;
}
