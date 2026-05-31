import { describe, it, expect } from 'vitest';
import { selectTier, TIERS } from '../../src/render/quality.js';

describe('selectTier', () => {
  it('coarse pointer (phone/tablet) starts at low', () => {
    expect(selectTier({ coarsePointer: true, deviceMemory: 8, cores: 8 })).toBe('low');
  });
  it('strong desktop → high', () => {
    expect(selectTier({ coarsePointer: false, deviceMemory: 16, cores: 12 })).toBe('high');
  });
  it('mid desktop/laptop → med', () => {
    expect(selectTier({ coarsePointer: false, deviceMemory: 8, cores: 6 })).toBe('med');
  });
  it('weak/unknown → low', () => {
    expect(selectTier({})).toBe('low');
  });
});

describe('TIERS config', () => {
  it('every tier defines the same switches', () => {
    const keys = Object.keys(TIERS.low).sort();
    for (const t of ['med', 'high']) expect(Object.keys(TIERS[t]).sort(), t).toEqual(keys);
  });
  it('ramps monotonically on render distance', () => {
    expect(TIERS.low.renderDistance).toBeLessThanOrEqual(TIERS.med.renderDistance);
    expect(TIERS.med.renderDistance).toBeLessThanOrEqual(TIERS.high.renderDistance);
  });
});
