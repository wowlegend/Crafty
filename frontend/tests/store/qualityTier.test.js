import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { TIERS } from '../../src/render/quality.js';

describe('store qualityTier', () => {
  beforeEach(() => useGameStore.getState().setQualityTier('low'));

  it('defaults to a valid tier key', () => {
    const t = useGameStore.getState().qualityTier;
    expect(Object.keys(TIERS)).toContain(t);
  });

  it('setQualityTier updates the field', () => {
    useGameStore.getState().setQualityTier('high');
    expect(useGameStore.getState().qualityTier).toBe('high');
  });
});
