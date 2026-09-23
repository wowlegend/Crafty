import { describe, it, expect } from 'vitest';
import {
  RETURN_NIGHTS, LEVEL_STEP, BOSS_BASE_LEVEL, SPEED_CAP, bossTierStats, bossCanReturn, tierLabel,
} from '../../src/game/bossTier.js';
import { BOSS_CONFIG, BOSS_LOOT } from '../../src/game/bossConfig.js';
import { ITEMS } from '../../src/data/items.js';

/**
 * THE DRAGON RETURNS, STRONGER (QUEUE C3; spec 2026-09-22-crafty-boss-tiers-design, plan Task 1).
 *
 * Tier n = dragons slain so far. Tier 0 is today's fight exactly, and its kill is still the game's win; each
 * later tier waits at the lair until the player has survived RETURN_NIGHTS more nights AND gained LEVEL_STEP
 * more levels. Pure, so every boundary is driven here.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh against src/game/bossTier.js, each observed RED:
 *   T1 tier 0 scaled like the rest (today's fight drifts)   T2 speed uncapped
 *   T3 the crown drops every tier                            T4 plausible-wrong: `>` on the night boundary
 *   T5 the level step ignored after tier 1                   T6 tier 0 "returns"
 *   T7 damage flat across tiers                              T8 plausible-wrong: phase thresholds scaled
 *
 * BLIND SPOT: whether a tier-3 dragon is FUN — winnable, and worth the walk — is a person-playing question.
 */
const TIERS = [0, 1, 2, 3, 4, 5];
const S = TIERS.map(bossTierStats);

describe('tier 0 is today\'s fight, exactly', () => {
  it('same health, XP, phases and loot as BOSS_CONFIG', () => {
    const t0 = bossTierStats(0);
    expect(t0.health).toBe(BOSS_CONFIG.health);
    expect(t0.xpReward).toBe(BOSS_CONFIG.xpReward);
    expect(t0.phases).toEqual(BOSS_CONFIG.phases);
    expect(t0.loot).toEqual(BOSS_LOOT);
    expect(t0.name).toBe(BOSS_CONFIG.name);
  });
});

describe('each return is stronger, and worth more', () => {
  it('health, every phase\'s damage, and the XP reward rise strictly with the tier', () => {
    for (let i = 1; i < S.length; i++) {
      expect(S[i].health).toBeGreaterThan(S[i - 1].health);
      expect(S[i].xpReward).toBeGreaterThan(S[i - 1].xpReward);
      S[i].phases.forEach((p, k) => expect(p.damage).toBeGreaterThan(S[i - 1].phases[k].damage));
    }
  });

  it('speed rises but is CAPPED — a dragon faster than the player can turn is not a fight', () => {
    for (const s of S) {
      s.phases.forEach((p, k) => {
        expect(p.speed).toBeGreaterThanOrEqual(BOSS_CONFIG.phases[k].speed);
        expect(p.speed).toBeLessThanOrEqual(BOSS_CONFIG.phases[k].speed * SPEED_CAP + 1e-9);
      });
    }
    expect(bossTierStats(50).phases[2].speed).toBeCloseTo(BOSS_CONFIG.phases[2].speed * SPEED_CAP, 9);
  });

  it('the phase THRESHOLDS and colours stay the config\'s — a tier is harder, not a different fight', () => {
    for (const s of S) s.phases.forEach((p, k) => {
      expect(p.hpPercent).toBe(BOSS_CONFIG.phases[k].hpPercent);
      expect(p.color).toBe(BOSS_CONFIG.phases[k].color);
    });
  });
});

describe('the reward', () => {
  it('the crown drops at tier 0 only; every later tier drops more scales', () => {
    const hasCrown = (s) => s.loot.some(([n]) => n === 'Crown of the Dragon King');
    expect(hasCrown(S[0])).toBe(true);
    for (const s of S.slice(1)) expect(hasCrown(s)).toBe(false);
    for (let i = 2; i < S.length; i++) {
      const scales = (s) => s.loot.find(([n]) => n === 'Dragon Scale')[1];
      expect(scales(S[i])).toBeGreaterThan(scales(S[i - 1]));
    }
  });

  it('every item any tier drops exists in the registry', () => {
    const names = new Set(Object.values(ITEMS).map((i) => i.name));
    for (const s of S) for (const [n, q] of s.loot) {
      expect(names.has(n), n).toBe(true);
      expect(q).toBeGreaterThan(0);
    }
  });
});

describe('when it returns', () => {
  const at = (o) => bossCanReturn({ tier: 1, killNight: 10, nightCount: 10 + RETURN_NIGHTS, level: BOSS_BASE_LEVEL + LEVEL_STEP, ...o });

  it('not a night early, and exactly on the night it is due', () => {
    expect(at({ nightCount: 10 + RETURN_NIGHTS - 1 })).toBe(false);
    expect(at({})).toBe(true);
  });

  it('not a level early, and exactly at the level it is due', () => {
    expect(at({ level: BOSS_BASE_LEVEL + LEVEL_STEP - 1 })).toBe(false);
    expect(at({ tier: 2, level: BOSS_BASE_LEVEL + 2 * LEVEL_STEP - 1 })).toBe(false);
    expect(at({ tier: 2, level: BOSS_BASE_LEVEL + 2 * LEVEL_STEP })).toBe(true);
  });

  it('tier 0 never "returns" — the first fight is the level-5 arrival, owned by bossSystem', () => {
    expect(bossCanReturn({ tier: 0, killNight: 0, nightCount: 99, level: 99 })).toBe(false);
  });

  it('junk inputs never return a dragon', () => {
    expect(bossCanReturn({ tier: 1, killNight: NaN, nightCount: 99, level: 99 })).toBe(false);
    expect(bossCanReturn({})).toBe(false);
  });
});

describe('names', () => {
  it('tier 0 is the dragon; later tiers say which return this is', () => {
    expect(tierLabel(0)).toBe('');
    expect(S[1].name).toBe(`${BOSS_CONFIG.name} ${tierLabel(1)}`);
    expect(new Set(S.map((s) => s.name)).size).toBe(S.length);
  });
});
