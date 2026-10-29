import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EMBER_MAX, ROAR_COST, GRAB_COST, SNARE_COST, FUSE_COST, IMBUE_COST, PLACE_GAIN, DAILY_BUILD_CAP,
  clampEmber, canAfford, emberForKill, emberForPlace, dailyCap, accrueBuild, readBuildDay, migrateBanks, emberFromSave,
} from '../../src/game/ember.js';
import { MOB_TYPES } from '../../src/game/mobTypes.js';

// EMBER (DECISIONS 2026-10-28 W1-H item 5; plan docs/superpowers/plans/2026-10-28-crafty-w2f-ember.md). One bar
// replaces the four Aspect banks: day kills and building fill it, the four verbs spend it at their old prices, and an
// old save's four banks are added into it.
//
// WHAT THIS DOES NOT CHECK: the store's actions (tests/store/ember.test.js), the kill bus and the place executor
// (tests/gates/friend-foe-gates.test.jsx, tests/gates/place-executor-gates.test.jsx), or the bar in the running game
// (tests/e2e/ember.spec.js).

const HERE = dirname(fileURLToPath(import.meta.url));
const PRE_CUT = JSON.parse(readFileSync(resolve(HERE, '../fixtures/pre-cut-save.json'), 'utf8'));

describe('the bar and its prices', () => {
  it('clamps to whole numbers in [0, EMBER_MAX], and anything not a finite number reads 0', () => {
    expect(EMBER_MAX).toBe(100);
    expect(clampEmber(12.4)).toBe(12);
    expect(clampEmber(12.6)).toBe(13);
    expect(clampEmber(-5)).toBe(0);
    expect(clampEmber(1e6)).toBe(EMBER_MAX);
    for (const bad of [NaN, Infinity, -Infinity, undefined, null, '40', {}]) expect(clampEmber(bad), `clampEmber(${String(bad)})`).toBe(0);
  });

  it('keeps the four verbs at the prices their own meters charged', () => {
    // The roar spent a full Ferocity bank (100); a grab 25 Kinetic; a bind 35 and a fuse 50 Soul; an imbue 30 Resonance.
    expect({ ROAR_COST, GRAB_COST, SNARE_COST, FUSE_COST, IMBUE_COST }).toEqual({ ROAR_COST: 100, GRAB_COST: 25, SNARE_COST: 35, FUSE_COST: 50, IMBUE_COST: 30 });
  });

  it('canAfford is true exactly from the price up', () => {
    for (const cost of [ROAR_COST, GRAB_COST, SNARE_COST, FUSE_COST, IMBUE_COST]) {
      expect(canAfford(cost - 1, cost), `one short of ${cost}`).toBe(false);
      expect(canAfford(cost, cost), `exactly ${cost}`).toBe(true);
    }
    expect(canAfford(NaN, GRAB_COST)).toBe(false);
  });
});

describe('what fills it', () => {
  it('a day kill pays the mob its bank, and a night kill pays nothing, for every mob type', () => {
    const types = Object.keys(MOB_TYPES);
    expect(types.length, 'MOB_TYPES is empty, so nothing below is checked').toBeGreaterThan(5);
    let paid = 0;
    for (const t of types) {
      expect(emberForKill(t, true), `a day ${t} kill`).toBe(MOB_TYPES[t].bank);
      expect(emberForKill(t, false), `a night ${t} kill paid`).toBe(0);
      if (MOB_TYPES[t].bank > 0) paid += 1;
    }
    expect(paid, 'no mob pays anything, so the night zero above proves nothing').toBeGreaterThan(3);
    expect(emberForKill('zombie', true)).toBe(16);
    expect(emberForKill('dragon_boss', true), 'a boss kill banks its burst').toBe(60);
    expect(emberForKill('dragon_boss', false)).toBe(0);
  });

  it('a day placement pays PLACE_GAIN and a night one nothing', () => {
    expect(PLACE_GAIN).toBe(2);
    expect(emberForPlace(true)).toBe(PLACE_GAIN);
    expect(emberForPlace(false)).toBe(0);
  });
});

describe('the daily build cap', () => {
  // Building alone pays for any one grab, bind or imbue a day, never a fuse or the roar.
  it('sits between the dearest cheap verb and the fuse', () => {
    expect(DAILY_BUILD_CAP).toBe(40);
    expect(DAILY_BUILD_CAP).toBeGreaterThanOrEqual(Math.max(GRAB_COST, SNARE_COST, IMBUE_COST));
    expect(DAILY_BUILD_CAP).toBeLessThan(FUSE_COST);
  });

  it('twenty placements in one day fill the allowance, and the twenty-first adds nothing', () => {
    let s = { ember: 0, record: readBuildDay(undefined) };
    const gains = [];
    for (let i = 0; i < 21; i++) {
      const next = accrueBuild(s.ember, s.record, 3, true);
      gains.push(next.ember - s.ember);
      s = next;
    }
    expect(gains.slice(0, 20), 'the first twenty placements did not each pay PLACE_GAIN').toEqual(Array(20).fill(PLACE_GAIN));
    expect(gains[20], 'the twenty-first placement of the day paid past the cap').toBe(0);
    expect(s.ember).toBe(DAILY_BUILD_CAP);
    expect(s.record).toEqual({ night: 3, built: DAILY_BUILD_CAP });
    expect(dailyCap(s.record, 3)).toBe(0);
  });

  it('a new day renews the allowance, read from the night count, with no dawn handler', () => {
    const spent = { night: 3, built: DAILY_BUILD_CAP };
    expect(dailyCap(spent, 3)).toBe(0);
    expect(dailyCap(spent, 4), 'the next day did not renew the allowance').toBe(DAILY_BUILD_CAP);
    const next = accrueBuild(10, spent, 4, true);
    expect(next.ember).toBe(10 + PLACE_GAIN);
    expect(next.record).toEqual({ night: 4, built: PLACE_GAIN });
  });

  it('counts what entered the bar: a placement at a full bar spends none of the allowance', () => {
    const full = accrueBuild(EMBER_MAX, { night: 1, built: 0 }, 1, true);
    expect(full.ember).toBe(EMBER_MAX);
    expect(full.record.built, 'a placement that added nothing used up the day\'s allowance').toBe(0);
    const nearly = accrueBuild(EMBER_MAX - 1, { night: 1, built: 0 }, 1, true);
    expect(nearly.ember).toBe(EMBER_MAX);
    expect(nearly.record.built).toBe(1);
  });

  it('pays the last of the allowance when it is less than a placement', () => {
    const r = accrueBuild(0, { night: 2, built: DAILY_BUILD_CAP - 1 }, 2, true);
    expect(r.ember).toBe(1);
    expect(r.record.built).toBe(DAILY_BUILD_CAP);
  });

  it('a night placement adds nothing and leaves the record alone', () => {
    const rec = { night: 2, built: 6 };
    const r = accrueBuild(20, rec, 2, false);
    expect(r.ember).toBe(20);
    expect(r.record).toEqual(rec);
  });

  it('a saved record is sanitized: a bad night reads 0, the built amount is clamped to [0, cap]', () => {
    expect(readBuildDay(undefined)).toEqual({ night: 0, built: 0 });
    expect(readBuildDay({ night: 5, built: 12 })).toEqual({ night: 5, built: 12 });
    expect(readBuildDay({ night: 'x', built: 999 })).toEqual({ night: 0, built: DAILY_BUILD_CAP });
    expect(readBuildDay({ night: 2.7, built: -3 })).toEqual({ night: 2, built: 0 });
    expect(readBuildDay([1, 2])).toEqual({ night: 0, built: 0 });
  });
});

describe('an old save\'s four banks become one', () => {
  it('the pre-cut fixture\'s banks add up to 75', () => {
    const p = PRE_CUT.progression;
    expect([p.ferocityBanked, p.kineticBanked, p.soulBanked, p.resonanceBanked], 'SETUP: the fixture changed').toEqual([30, 20, 15, 10]);
    expect(migrateBanks(p)).toBe(75);
    expect(emberFromSave(p), 'a save with no ember key did not get its banks summed').toBe(75);
  });

  it('a NaN or negative bank adds nothing, a bank above 100 counts as 100, and the sum is clamped', () => {
    expect(migrateBanks({ ferocityBanked: NaN, kineticBanked: 20, soulBanked: -40, resonanceBanked: 10 })).toBe(30);
    expect(migrateBanks({ ferocityBanked: 1e6, kineticBanked: 0, soulBanked: 0, resonanceBanked: 0 })).toBe(EMBER_MAX);
    expect(migrateBanks({ ferocityBanked: 60, kineticBanked: 60, soulBanked: 60, resonanceBanked: 60 })).toBe(EMBER_MAX);
    expect(migrateBanks({ kineticBanked: 5 }), 'a missing bank is not 0').toBe(5);
    expect(migrateBanks({})).toBe(0);
    expect(migrateBanks(undefined)).toBe(0);
  });

  it('a save that has an ember key is read as is, so the migration cannot run twice', () => {
    // The tombstone writes the four banks back on every save, so a post-cut save holds both.
    expect(emberFromSave({ ...PRE_CUT.progression, ember: 12 })).toBe(12);
    expect(emberFromSave({ ...PRE_CUT.progression, ember: 0 }), 'an emptied bar was refilled from the old banks').toBe(0);
    expect(emberFromSave({ ...PRE_CUT.progression, ember: NaN })).toBe(0);
  });

  it('a save with no progression slice keeps the fallback', () => {
    expect(emberFromSave(undefined, 33)).toBe(33);
    expect(emberFromSave(null)).toBe(0);
  });
});
