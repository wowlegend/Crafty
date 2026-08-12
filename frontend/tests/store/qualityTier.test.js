import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { TIERS } from '../../src/render/quality.js';

describe('store qualityTier', () => {
  beforeEach(() => useGameStore.getState().setQualityTier('low'));

  // READ THE DECLARED INITIAL STATE, NOT THE ONE beforeEach JUST SET.
  //
  // This asserted `getState().qualityTier` — after a beforeEach that calls `setQualityTier('low')`. So
  // it read a value the test itself had written, and would have passed with a store default of
  // undefined, null, or 'ultra'. The one guarantee in its name was the one thing it could not observe.
  //
  // `getInitialState()` (zustand 5) returns the state as declared by the store creator, untouched by any
  // setter, so the assertion finally sees what a fresh boot sees.
  it('defaults to a valid tier key', () => {
    const t = useGameStore.getInitialState().qualityTier;
    expect(Object.keys(TIERS), `declared default ${JSON.stringify(t)} is not a real tier`).toContain(t);
  });

  it('setQualityTier updates the field', () => {
    useGameStore.getState().setQualityTier('high');
    expect(useGameStore.getState().qualityTier).toBe('high');
  });
});
