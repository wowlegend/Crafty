// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { useSurvivalMode } from '../../src/world/survivalSystem.js';
import { buildSaveData } from '../../src/game/saveSchema.js';
import { ROAR_COST, GRAB_COST, SNARE_COST, FUSE_COST, IMBUE_COST, PLACE_GAIN, DAILY_BUILD_CAP, EMBER_MAX } from '../../src/game/ember.js';

// THE STORE'S EMBER (DECISIONS 2026-10-28 W1-H item 5). One bank, its spend, its build accrual under the daily cap,
// its place in the save, and dawn emptying it. The pure rules are tests/game/ember.test.js; this is the store glue the
// game calls, and the survival hook App mounts, which re-renders on every isDay flip a clock crossing or a load makes.
//
// WHAT THIS DOES NOT CHECK: that Components.jsx calls spendEmber at each verb (driven in the running game by
// tests/e2e/ember.spec.js, heavy-melee.spec.js and imbue-latch.spec.js), the game clock's ticker (useDayNightClock), or
// the kill bus (tests/gates/friend-foe-gates.test.jsx).
//
// Mutation-Proof: see the commit trailer.

const S = () => useGameStore.getState();
const POS = { position: { x: 0, y: 18, z: 0 } };
const HERE = dirname(fileURLToPath(import.meta.url));
const PRE_CUT_JSON = JSON.parse(readFileSync(resolve(HERE, '../fixtures/pre-cut-save.json'), 'utf8'));
const PRE_CUT = () => structuredClone(PRE_CUT_JSON); // a localStorage world blob written before the bar (preCutSave.test.js)

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

  it('gainEmber clamps to whole numbers in [0, EMBER_MAX]', () => {
    S().gainEmber(12.4);
    expect(S().ember).toBe(12);
    S().gainEmber(1000);
    expect(S().ember).toBe(EMBER_MAX);
    S().gainEmber(-500);
    expect(S().ember).toBe(0);
    S().gainEmber(NaN);
    expect(S().ember).toBe(0);
  });

  it('the store has no setter for the bar: it moves only by a gain, a spend, a placement, dawn or a load', () => {
    expect('setEmber' in S(), 'a bare setter for the bar is back on the store').toBe(false);
  });
});

// One case per spend: each verb's price is refused one short with nothing taken, and paid exactly from a surplus.
describe('each spend reads and spends ember at its old price', () => {
  for (const [verb, cost] of [['roar', ROAR_COST], ['grab', GRAB_COST], ['snare', SNARE_COST], ['fuse', FUSE_COST], ['imbue', IMBUE_COST]]) {
    it(`the ${verb} (${cost})`, () => {
      useGameStore.setState({ ember: cost - 1 });
      expect(S().spendEmber(cost), `a ${verb} was paid for one short`).toBe(false);
      expect(S().ember, `a refused ${verb} took ember`).toBe(cost - 1);
      const start = Math.min(EMBER_MAX, cost + 7);
      useGameStore.setState({ ember: start });
      expect(S().spendEmber(cost), `a ${verb} was refused with ${start} in the bar`).toBe(true);
      expect(S().ember, `a ${verb} took the wrong amount`).toBe(start - cost);
    });
  }
});

// A store write wakes every subscriber and App's autosave trigger; one that changes nothing must not write.
describe('a gain or a placement that changes nothing leaves the store as it was', () => {
  it('a night placement, a placement past the day\'s cap and a gain at a full bar notify no subscriber', () => {
    let calls = 0;
    const off = useGameStore.subscribe(() => { calls += 1; });
    try {
      useGameStore.setState({ isDay: true, nightCount: 2, ember: 10, emberBuildDay: { night: 2, built: 6 } });
      calls = 0;
      S().accrueBuildEmber();
      expect(calls, 'the control: a paying placement did not write').toBe(1);
      for (const [why, set, act] of [
        ['a night placement', { isDay: false }, () => S().accrueBuildEmber()],
        ['a placement past the cap', { isDay: true, emberBuildDay: { night: 2, built: DAILY_BUILD_CAP } }, () => S().accrueBuildEmber()],
        ['a gain at a full bar', { ember: EMBER_MAX }, () => S().gainEmber(16)],
        ['a gain of nothing', { ember: 30 }, () => S().gainEmber(0)],
      ]) {
        useGameStore.setState(set);
        const before = S();
        calls = 0;
        act();
        expect(calls, `${why} wrote the store`).toBe(0);
        expect(S(), `${why} replaced the state`).toBe(before);
      }
    } finally {
      off();
    }
  });
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

  it('a save written before the bar reads its own build-day record (none), not the session\'s', () => {
    // The world loaded first spent today's allowance on the night count the pre-cut save also carries (0).
    useGameStore.setState({ isDay: true, nightCount: 0, emberBuildDay: { night: 0, built: DAILY_BUILD_CAP } });
    const pre = PRE_CUT();
    expect('emberBuildDay' in pre.progression, 'SETUP: the fixture carries a build-day record').toBe(false);
    expect(pre.progression.nightCount, 'SETUP: the fixture is not on night 0').toBe(0);
    S().loadWorldData(pre);
    expect(S().emberBuildDay, 'the pre-cut save took the session\'s spent allowance').toEqual({ night: 0, built: 0 });
    useGameStore.setState({ isDay: true });
    const before = S().ember;
    S().accrueBuildEmber();
    expect(S().ember - before, 'a placement in the loaded world was paid from the other world\'s allowance').toBe(PLACE_GAIN);
  });

  it('a save with no progression slice at all keeps the session\'s record, as it keeps every progression field', () => {
    useGameStore.setState({ emberBuildDay: { night: 3, built: 12 } });
    const { progression: _gone, ...bare } = PRE_CUT();
    S().loadWorldData(bare);
    expect(S().emberBuildDay).toEqual({ night: 3, built: 12 });
  });

  it('a save with no progression slice loads an empty bar, not the bar of the world played before it', () => {
    const { progression: _gone, ...bare } = PRE_CUT();
    useGameStore.setState({ ember: 90 });
    S().loadWorldData(PRE_CUT());
    expect(S().ember, 'SETUP: the control load with a slice did not read its own ember').toBe(75);
    useGameStore.setState({ ember: 90 });
    S().loadWorldData(bare);
    expect(S().ember, 'a save with no slice took another world\'s ember').toBe(0);
  });

  it('a new world starts with an empty bar and a fresh allowance', () => {
    useGameStore.setState({ ember: 80, emberBuildDay: { night: 6, built: 30 } });
    S().startNewWorld('ember-fresh');
    expect(S().ember).toBe(0);
    expect(S().emberBuildDay).toEqual(useGameStore.getInitialState().emberBuildDay);
  });
});

// Dawn empties the bar, so no night opens with the last day's leftovers. The cases drive the clock through setGameTime,
// the one writer the ticker calls, and re-render the survival hook with the isDay it produced, as App does.
describe('dawn empties the bar', () => {
  afterEach(cleanup);

  it('the clock crossing into day empties it', () => {
    useGameStore.setState({ gameTime: 1150, isDay: false, nightCount: 1, lastRewardedNight: 1, ember: 70 });
    const { rerender } = renderHook(({ d }) => useSurvivalMode(d), { initialProps: { d: false } });
    act(() => { S().setGameTime((t) => t + 100); }); // 1150 -> 1250, across the half-cycle into day
    rerender({ d: S().isDay });
    expect(S().isDay, 'SETUP: the crossing did not reach day').toBe(true);
    expect(S().ember, 'dawn left the night\'s bar in place').toBe(0);
  });

  it('the clock crossing into night leaves it', () => {
    useGameStore.setState({ gameTime: 550, isDay: true, nightCount: 0, ember: 70 });
    const { rerender } = renderHook(({ d }) => useSurvivalMode(d), { initialProps: { d: true } });
    act(() => { S().setGameTime((t) => t + 100); }); // 550 -> 650, into night
    rerender({ d: S().isDay });
    expect(S().isDay, 'SETUP: the crossing did not reach night').toBe(false);
    expect(S().ember, 'nightfall emptied the bar').toBe(70);
  });

  // A load sets isDay from the save's clock, so a day save loaded at night flips the hook's isDay exactly as a dawn does.
  // A pre-cut save is the costly case: its four banks, just migrated into 75, would be emptied by the load and written as
  // ember 0 by the next save, and a save with an ember key is never migrated again.
  it('loading a day save at night is not a dawn: a pre-cut save keeps its 75, and the next save writes it', () => {
    useGameStore.setState({ gameTime: 700, isDay: false, nightCount: 0, ember: 10 });
    const { rerender } = renderHook(({ d }) => useSurvivalMode(d), { initialProps: { d: false } });
    act(() => { S().loadWorldData(PRE_CUT()); });
    rerender({ d: S().isDay });
    expect(S().isDay, 'SETUP: the pre-cut save is not a day save').toBe(true);
    expect(S().ember, 'loading a day save at night emptied the bar').toBe(75);
    const saved = JSON.parse(JSON.stringify(buildSaveData(S(), POS)));
    expect(saved.progression.ember, 'the save after the load lost the migrated ember').toBe(75);
  });

  it('a post-cut day save loaded at night keeps its bar too', () => {
    useGameStore.setState({ gameTime: 100, isDay: true, ember: 42 });
    const daySave = JSON.parse(JSON.stringify(buildSaveData(S(), POS)));
    useGameStore.setState({ gameTime: 700, isDay: false, ember: 0 });
    const { rerender } = renderHook(({ d }) => useSurvivalMode(d), { initialProps: { d: false } });
    act(() => { S().loadWorldData(daySave); });
    rerender({ d: S().isDay });
    expect(S().isDay, 'SETUP: the save is not a day save').toBe(true);
    expect(S().ember, 'loading a day save at night emptied the bar').toBe(42);
  });
});
