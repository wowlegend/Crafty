import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { buildSaveData } from '../../src/game/saveSchema.js';
import { FEROCITY_MAX, FEROCITY_THRESHOLD, canTransform } from '../../src/game/ferocity.js';

// S2-B1-M4: the store wiring for Ferocity — accrue (day kills), spend (the unleash on transform),
// the roar gate, and persistence. The economy math is in ferocity.test.js; this locks the store glue.

beforeEach(() => useGameStore.getState().setFerocityBanked(0));

describe('Ferocity store wiring (M4)', () => {
  it('accrueFerocity banks + clamps to [0, MAX]', () => {
    useGameStore.getState().accrueFerocity(40);
    expect(useGameStore.getState().ferocityBanked).toBe(40);
    useGameStore.getState().accrueFerocity(1000);
    expect(useGameStore.getState().ferocityBanked).toBe(FEROCITY_MAX);
  });

  it('a NEGATIVE delta spends, clamping to 0 (the unleash on transform)', () => {
    useGameStore.getState().setFerocityBanked(FEROCITY_MAX);
    useGameStore.getState().accrueFerocity(-FEROCITY_THRESHOLD);
    expect(useGameStore.getState().ferocityBanked).toBe(0);
  });

  it('the roar gate (canTransform) reads the bank: full = ready, under = blocked', () => {
    useGameStore.getState().setFerocityBanked(FEROCITY_THRESHOLD - 1);
    expect(canTransform(useGameStore.getState().ferocityBanked)).toBe(false);
    useGameStore.getState().setFerocityBanked(FEROCITY_THRESHOLD);
    expect(canTransform(useGameStore.getState().ferocityBanked)).toBe(true);
  });

  it('ferocityBanked persists in the save (clamped+rounded)', () => {
    useGameStore.getState().setFerocityBanked(73);
    const save = buildSaveData(useGameStore.getState());
    expect(save.progression.ferocityBanked).toBe(73);
  });
});
