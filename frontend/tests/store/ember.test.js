// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { buildSaveData } from '../../src/game/saveSchema.js';
import { ROAR_COST, GRAB_COST, SNARE_COST, FUSE_COST, IMBUE_COST, PLACE_GAIN, DAILY_BUILD_CAP, EMBER_MAX } from '../../src/game/ember.js';

// THE STORE'S EMBER (DECISIONS 2026-10-28 W1-H item 5). One bank, its spend, its build accrual under the daily cap,
// and its place in the save. The pure rules are tests/game/ember.test.js; this is the store glue the game calls.
//
// WHAT THIS DOES NOT CHECK: that Components.jsx calls spendEmber at each verb (the roar, the grab and the imbue are
// driven in the running game by tests/e2e/ember.spec.js, heavy-melee.spec.js and imbue-latch.spec.js; the snare and the
// fuse sites are not driven by any test), or the kill bus (tests/gates/friend-foe-gates.test.jsx).
//
// Mutation-Proof: see the commit trailer.

const S = () => useGameStore.getState();
const POS = { position: { x: 0, y: 18, z: 0 } };

beforeEach(() => useGameStore.setState(useGameStore.getInitialState(), true));
afterEach(() => useGameStore.setState(useGameStore.getInitialState(), true));

describe('the one bank replaces the four', () => {
  it('the store holds ember and none of the four retired banks or their actions', () => {
    expect(S().ember, 'a fresh store does not start with an empty bar').toBe(0);
    for (const gone of ['ferocityBanked', 'kineticBanked', 'soulBanked', 'resonanceBanked', 'accrueFerocity', 'accrueKinetic',
      'accrueSoul', 'accrueResonance', 'setFerocityBanked', 'setKineticBanked', 'setSoulBanked', 'setResonanceBanked']) {
      expect(gone in S(), `the store still carries ${gone}`).toBe(false);
    }
  });

  it('gainEmber and setEmber clamp to whole numbers in [0, EMBER_MAX]', () => {
    S().gainEmber(12.4);
    expect(S().ember).toBe(12);
    S().gainEmber(1000);
    expect(S().ember).toBe(EMBER_MAX);
    S().setEmber(-5);
    expect(S().ember).toBe(0);
    S().setEmber(NaN);
    expect(S().ember).toBe(0);
  });
});

// One case per spend: each verb's price is refused one short with nothing taken, and paid exactly from a surplus.
describe('each spend reads and spends ember at its old price', () => {
  for (const [verb, cost] of [['roar', ROAR_COST], ['grab', GRAB_COST], ['snare', SNARE_COST], ['fuse', FUSE_COST], ['imbue', IMBUE_COST]]) {
    it(`the ${verb} (${cost})`, () => {
      S().setEmber(cost - 1);
      expect(S().spendEmber(cost), `a ${verb} was paid for one short`).toBe(false);
      expect(S().ember, `a refused ${verb} took ember`).toBe(cost - 1);
      const start = Math.min(EMBER_MAX, cost + 7);
      S().setEmber(start);
      expect(S().spendEmber(cost), `a ${verb} was refused with ${start} in the bar`).toBe(true);
      expect(S().ember, `a ${verb} took the wrong amount`).toBe(start - cost);
    });
  }
});

describe('building by day, under the daily cap', () => {
  it('each day placement adds PLACE_GAIN until the day\'s allowance is spent, then nothing', () => {
    useGameStore.setState({ isDay: true, nightCount: 2 });
    const per = [];
    for (let i = 0; i < DAILY_BUILD_CAP / PLACE_GAIN + 2; i++) {
      const before = S().ember;
      S().accrueBuildEmber();
      per.push(S().ember - before);
    }
    expect(per.filter((g) => g === PLACE_GAIN).length, 'the allowance paid a different number of placements').toBe(DAILY_BUILD_CAP / PLACE_GAIN);
    expect(per.slice(-2), 'placements past the cap still paid').toEqual([0, 0]);
    expect(S().emberBuildDay).toEqual({ night: 2, built: DAILY_BUILD_CAP });
  });

  it('the next day renews it; a night placement pays nothing', () => {
    useGameStore.setState({ isDay: true, nightCount: 2, emberBuildDay: { night: 2, built: DAILY_BUILD_CAP } });
    S().accrueBuildEmber();
    expect(S().ember, 'SETUP: the spent day still paid').toBe(0);
    useGameStore.setState({ nightCount: 3 });
    S().accrueBuildEmber();
    expect(S().ember, 'the next day did not renew the allowance').toBe(PLACE_GAIN);
    useGameStore.setState({ isDay: false });
    S().accrueBuildEmber();
    expect(S().ember, 'a night placement paid ember').toBe(PLACE_GAIN);
  });
});

describe('ember in the save', () => {
  it('the save writes ember and the build-day record, and none of the four banks', () => {
    useGameStore.setState({ ember: 63, emberBuildDay: { night: 4, built: 18 } });
    const saved = JSON.parse(JSON.stringify(buildSaveData(S(), POS)));
    expect(saved.progression.ember).toBe(63);
    expect(saved.progression.emberBuildDay).toEqual({ night: 4, built: 18 });
    for (const gone of ['ferocityBanked', 'kineticBanked', 'soulBanked', 'resonanceBanked']) {
      expect(gone in saved.progression, `a fresh save wrote ${gone}`).toBe(false);
    }
  });

  it('a load restores both, sanitized', () => {
    useGameStore.setState({ ember: 63, emberBuildDay: { night: 4, built: 18 } });
    const saved = JSON.parse(JSON.stringify(buildSaveData(S(), POS)));
    useGameStore.setState(useGameStore.getInitialState(), true);
    S().loadWorldData(saved);
    expect(S().ember).toBe(63);
    expect(S().emberBuildDay).toEqual({ night: 4, built: 18 });
    S().loadWorldData({ ...saved, progression: { ...saved.progression, ember: 400, emberBuildDay: { night: 'x', built: 999 } } });
    expect(S().ember).toBe(EMBER_MAX);
    expect(S().emberBuildDay).toEqual({ night: 0, built: DAILY_BUILD_CAP });
  });

  it('a reload cannot renew the day\'s build allowance', () => {
    useGameStore.setState({ isDay: true, nightCount: 1, emberBuildDay: { night: 1, built: DAILY_BUILD_CAP } });
    const saved = JSON.parse(JSON.stringify(buildSaveData(S(), POS)));
    useGameStore.setState(useGameStore.getInitialState(), true);
    S().loadWorldData(saved);
    expect(S().nightCount, 'SETUP: the night count did not survive the reload').toBe(1);
    useGameStore.setState({ isDay: true }); // the load derives isDay from the clock; the case is about the record
    const before = S().ember;
    S().accrueBuildEmber();
    expect(S().ember - before, 'a reload renewed the spent allowance').toBe(0);
  });

  it('a new world starts with an empty bar and a fresh allowance', () => {
    useGameStore.setState({ ember: 80, emberBuildDay: { night: 6, built: 30 } });
    S().startNewWorld('ember-fresh');
    expect(S().ember).toBe(0);
    expect(S().emberBuildDay).toEqual(useGameStore.getInitialState().emberBuildDay);
  });
});
