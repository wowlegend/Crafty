import { describe, it, expect, beforeEach } from 'vitest';
import { solveMeleeDamage, solveSpellDamage } from '../../src/utils/combat.js';
import { MOB_TYPES } from '../../src/game/mobTypes.js';
import { getWeaponBaseDamage } from '../../src/game/equipment.js';
import { useGameStore } from '../../src/store/useGameStore.jsx';

// THE DAMAGE REBALANCE (W2-F step 4; DECISIONS 2026-10-28 W1-H item 6; docs/superpowers/plans/2026-10-29-crafty-w2f-talents.md
// decisions 1-3). Player damage stops reading hand-allocated attributes and scales with level alone. This table records
// what the player dealt before the change, under three builds a level-L player could have had, and holds the new
// level-only scaling inside a band stated here.
//
// TODAY (main c3a0a7cb): a level paid five attribute points; the free spell-mastery click raised a spell's tier at the
// levels in TODAY_TIER_LEVEL. The three builds, each with no talent ranks:
//   unspent - no point ever allocated (strength, agility, intellect 10);
//   focused - every point in the attack's own stat (strength for melee, intellect for spells);
//   even    - the five points a level shared equally among strength, agility and intellect.
// Expected damage per hit is the real solver's plain hit plus its crit chance times the crit's extra, the crit chance
// found by bisecting Math.random against the solver itself, so no formula is copied here.
//
// THE BAND: at level 1 every attack deals exactly what it dealt; at levels 5, 10 and 20 each attack's expected damage is
// no lower than the unspent build's, no higher than the focused build's, and within 10% of the even build's. Against
// each hostile, the hits to kill sit between the focused and the unspent build's.

const LEVELS = [1, 5, 10, 20];
const SPELLS = ['fireball', 'iceball', 'lightning', 'arcane'];
const ATTACKS = ['unarmed', 'stoneSword', ...SPELLS];
const EVEN_BAND = 0.10;

// Recorded from the solvers at main c3a0a7cb (expected damage per hit, two decimals).
const TODAY = {
  unspent: {
    1: { unarmed: 22, stoneSword: 36.63, fireball: 63.84, iceball: 51.04, lightning: 95.76, arcane: 76.64 },
    5: { unarmed: 22, stoneSword: 36.63, fireball: 153.2, iceball: 127.68, lightning: 204.32, arcane: 178.72 },
    10: { unarmed: 22, stoneSword: 36.63, fireball: 153.2, iceball: 127.68, lightning: 204.32, arcane: 178.72 },
    20: { unarmed: 22, stoneSword: 36.63, fireball: 153.2, iceball: 127.68, lightning: 204.32, arcane: 178.72 },
  },
  focused: {
    1: { unarmed: 22, stoneSword: 36.63, fireball: 63.84, iceball: 51.04, lightning: 95.76, arcane: 76.64 },
    5: { unarmed: 55, stoneSword: 69.93, fireball: 204.32, iceball: 170.24, lightning: 272.4, arcane: 238.32 },
    10: { unarmed: 96.7, stoneSword: 112, fireball: 268.16, iceball: 223.44, lightning: 357.52, arcane: 312.8 },
    20: { unarmed: 179.2, stoneSword: 195.25, fireball: 395.84, iceball: 329.84, lightning: 527.76, arcane: 461.76 },
  },
  even: {
    1: { unarmed: 22, stoneSword: 36.63, fireball: 63.84, iceball: 51.04, lightning: 95.76, arcane: 76.64 },
    5: { unarmed: 34, stoneSword: 49.16, fireball: 172.8, iceball: 143.6, lightning: 230, arcane: 202 },
    10: { unarmed: 50.35, stoneSword: 66.18, fireball: 198, iceball: 165, lightning: 264, arcane: 231 },
    20: { unarmed: 85.31, stoneSword: 102.47, fireball: 250.8, iceball: 208.55, lightning: 333.95, arcane: 293.05 },
  },
};

// Today's spell ladder: each tier's base damage, and the player level whose free click unlocked it.
const TODAY_TIER_DAMAGE = { fireball: [50, 80, 120], iceball: [40, 65, 100], lightning: [75, 110, 160], arcane: [60, 90, 140] };
const TODAY_TIER_LEVEL = { fireball: [1, 2, 5], iceball: [1, 2, 5], lightning: [1, 3, 5], arcane: [1, 3, 5] };
const todayTier = (spell, level) => TODAY_TIER_DAMAGE[spell][TODAY_TIER_LEVEL[spell].filter((m) => level >= m).length - 1];
const STONE_SWORD_STATS = { strength: 4, agility: 2 }; // EQUIPMENT_STATS['Stone Sword'] at main c3a0a7cb

const withRandom = (r, fn) => {
  const real = Math.random;
  Math.random = () => r;
  try { return fn(); } finally { Math.random = real; }
};
const critChance = (fn) => {
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (withRandom(mid, fn).isCrit) lo = mid; else hi = mid;
  }
  return lo;
};
const expected = (fn) => {
  const plain = withRandom(0.999999, fn).damage;
  // Rounded to 1e-6: the bisection lands a hair under the crit chance, which would put 22 at 21.999999999.
  return Math.round((plain + critChance(fn) * (withRandom(0, fn).damage - plain)) * 1e6) / 1e6;
};
const round2 = (v) => Math.round(v * 100) / 100;

const BUILDS = {
  unspent: () => ({ strength: 10, agility: 10, intellect: 10 }),
  focused: (L, stat) => ({ strength: 10, agility: 10, intellect: 10, [stat]: 10 + 5 * (L - 1) }),
  even: (L) => ({ strength: 10 + 5 * (L - 1) / 3, agility: 10 + 5 * (L - 1) / 3, intellect: 10 + 5 * (L - 1) / 3 }),
};
const STAT = { unarmed: 'strength', stoneSword: 'strength', fireball: 'intellect', iceball: 'intellect', lightning: 'intellect', arcane: 'intellect' };

/** Today's expected damage for an attack, from the solvers, under a reference build. */
function todayDamage(build, level, attack) {
  const a = BUILDS[build](level, STAT[attack]);
  if (attack === 'unarmed') return expected(() => solveMeleeDamage(a, 5));
  if (attack === 'stoneSword') {
    const armed = { ...a, strength: a.strength + STONE_SWORD_STATS.strength, agility: a.agility + STONE_SWORD_STATS.agility };
    return expected(() => solveMeleeDamage(armed, 12));
  }
  return expected(() => solveSpellDamage(a, todayTier(attack, level), attack));
}

/** The new expected damage, read the way the game reads it: the store's effective stats and spell stats at `level`. */
function newDamage(level, attack) {
  const weapon = attack === 'stoneSword' ? 'Stone Sword' : null;
  useGameStore.setState({ level, unlockedTalents: {}, equipment: { head: null, chest: null, boots: null, weapon, offhand: null, relic: null } });
  const s = useGameStore.getState();
  const eff = s.getEffectiveAttributes();
  if (attack === 'unarmed' || attack === 'stoneSword') return expected(() => solveMeleeDamage(eff, getWeaponBaseDamage(weapon)));
  return expected(() => solveSpellDamage(eff, s.getSpellStats(attack).damage, attack));
}

const HOSTILES = Object.entries(MOB_TYPES).filter(([, m]) => !m.passive);

beforeEach(() => { useGameStore.setState(useGameStore.getInitialState(), true); });

describe('player damage before the rebalance (the recorded table)', () => {
  it('is what the solvers deal to the three reference builds at levels 1, 5, 10 and 20', () => {
    let checked = 0;
    for (const build of Object.keys(TODAY)) {
      for (const L of LEVELS) {
        for (const attack of ATTACKS) {
          expect(round2(todayDamage(build, L, attack)), `${build} build, level ${L}, ${attack}`).toBeCloseTo(TODAY[build][L][attack], 2);
          checked++;
        }
      }
    }
    expect(checked).toBe(3 * LEVELS.length * ATTACKS.length);
  });
});

describe('player damage after the rebalance (level only, inside the stated band)', () => {
  it('at level 1 deals exactly what every build dealt', () => {
    for (const attack of ATTACKS) {
      expect(round2(newDamage(1, attack)), `level 1 ${attack}`).toBeCloseTo(TODAY.unspent[1][attack], 2);
    }
  });

  it('at levels 5, 10 and 20 sits between the unspent and focused builds and within 10% of the even build', () => {
    let checked = 0;
    for (const L of LEVELS.slice(1)) {
      for (const attack of ATTACKS) {
        const got = round2(newDamage(L, attack));
        const { unspent, focused, even } = { unspent: TODAY.unspent[L][attack], focused: TODAY.focused[L][attack], even: TODAY.even[L][attack] };
        const why = `level ${L} ${attack}: ${got} against unspent ${unspent}, even ${even}, focused ${focused}`;
        expect(got, why).toBeGreaterThanOrEqual(unspent);
        expect(got, why).toBeLessThanOrEqual(focused);
        expect(Math.abs(got / even - 1), why).toBeLessThanOrEqual(EVEN_BAND);
        checked++;
      }
    }
    expect(checked).toBe(3 * ATTACKS.length);
  });

  it('rises with every level for every attack (a level is always worth something)', () => {
    for (const attack of ATTACKS) {
      const curve = LEVELS.map((L) => newDamage(L, attack));
      for (let i = 1; i < curve.length; i++) expect(curve[i], `${attack} at level ${LEVELS[i]} against ${LEVELS[i - 1]}`).toBeGreaterThan(curve[i - 1]);
    }
  });

  it('takes between the focused and the unspent build\'s hits to kill each hostile', () => {
    expect(HOSTILES.length, 'the hostile roster shrank: the per-hostile table is reading fewer rows').toBeGreaterThanOrEqual(7);
    let checked = 0;
    for (const L of LEVELS) {
      for (const attack of ATTACKS) {
        const got = newDamage(L, attack);
        for (const [type, mob] of HOSTILES) {
          const hits = Math.ceil(mob.health / got);
          const why = `level ${L} ${attack} against ${type} (${mob.health} HP): ${hits} hits`;
          expect(hits, why).toBeLessThanOrEqual(Math.ceil(mob.health / TODAY.unspent[L][attack]));
          expect(hits, why).toBeGreaterThanOrEqual(Math.ceil(mob.health / TODAY.focused[L][attack]));
          checked++;
        }
      }
    }
    expect(checked).toBe(LEVELS.length * ATTACKS.length * HOSTILES.length);
  });
});
