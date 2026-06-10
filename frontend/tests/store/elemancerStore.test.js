import { describe, it, expect } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore';
import { buildSaveData } from '../../src/game/saveSchema';
import { RESONANCE_MAX, ZONE_COST } from '../../src/game/resonance';

// S2-B4-M2 T3: the resonanceBanked store wiring — the soulbindStore twin.
describe('S2-B4-M2: resonanceBanked store + persistence', () => {
  it('accrueResonance clamps to [0, RESONANCE_MAX] and rounds', () => {
    const s = useGameStore.getState();
    s.setResonanceBanked(0);
    s.accrueResonance(12.4);
    expect(useGameStore.getState().resonanceBanked).toBe(12);
    s.accrueResonance(1000);
    expect(useGameStore.getState().resonanceBanked).toBe(RESONANCE_MAX);
    s.accrueResonance(-1000);
    expect(useGameStore.getState().resonanceBanked).toBe(0);
  });
  it('a zone spend debits ZONE_COST', () => {
    const s = useGameStore.getState();
    s.setResonanceBanked(90);
    s.accrueResonance(-ZONE_COST);
    expect(useGameStore.getState().resonanceBanked).toBe(90 - ZONE_COST);
  });
  it('resonanceBanked IS serialized into the save progression slice (the meter family slice)', () => {
    useGameStore.getState().setResonanceBanked(44);
    const save = buildSaveData(useGameStore.getState(), { x: 0, y: 0, z: 0 });
    expect(save.progression.resonanceBanked).toBe(44);
  });
});
