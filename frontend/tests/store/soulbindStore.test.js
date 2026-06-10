import { describe, it, expect } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore';
import { buildSaveData } from '../../src/game/saveSchema';
import { SOUL_MAX, SNARE_COST } from '../../src/game/soul';

// S2-B3-M2 T3: the soulBanked store wiring — twin of the kineticBanked block in voidhandStore.test.js.
describe('S2-B3-M2: soulBanked store + persistence', () => {
  it('accrueSoul clamps to [0, SOUL_MAX] and rounds', () => {
    const s = useGameStore.getState();
    s.setSoulBanked(0);
    s.accrueSoul(12.4);
    expect(useGameStore.getState().soulBanked).toBe(12);
    s.accrueSoul(1000);
    expect(useGameStore.getState().soulBanked).toBe(SOUL_MAX);
    s.accrueSoul(-1000);
    expect(useGameStore.getState().soulBanked).toBe(0);
  });
  it('a bind spend debits SNARE_COST', () => {
    const s = useGameStore.getState();
    s.setSoulBanked(80);
    s.accrueSoul(-SNARE_COST);
    expect(useGameStore.getState().soulBanked).toBe(80 - SNARE_COST);
  });
  it('soulBanked IS serialized into the save progression slice (the ferocity/kinetic slice)', () => {
    useGameStore.getState().setSoulBanked(42);
    const save = buildSaveData(useGameStore.getState(), { x: 0, y: 0, z: 0 });
    expect(save.progression.soulBanked).toBe(42);
  });
});
