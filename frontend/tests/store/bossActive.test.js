import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';

describe('store bossActive', () => {
  beforeEach(() => useGameStore.getState().setBossActive(false));

  it('defaults to a boolean false (not undefined)', () => {
    // Fresh store state must expose a real boolean, since SoundManager gates
    // boss music on `state.bossActive` truthiness.
    //
    // READ THE DECLARED INITIAL STATE, NOT THE ONE beforeEach JUST SET. This asserted
    // `getState().bossActive` after a beforeEach calling `setBossActive(false)`, so it read back the
    // test's own write and would have passed with a declared default of `undefined` — precisely the
    // value the test name exists to rule out, and the one SoundManager's truthiness gate would trip on.
    expect(useGameStore.getInitialState().bossActive).toBe(false);
  });

  it('setBossActive(true) flips the stored value to true', () => {
    useGameStore.getState().setBossActive(true);
    expect(useGameStore.getState().bossActive).toBe(true);
  });

  it('setBossActive(false) flips the stored value back to false', () => {
    useGameStore.getState().setBossActive(true);
    useGameStore.getState().setBossActive(false);
    expect(useGameStore.getState().bossActive).toBe(false);
  });

  it('coerces truthy/falsy inputs to a real boolean', () => {
    useGameStore.getState().setBossActive(1);
    expect(useGameStore.getState().bossActive).toBe(true);
    useGameStore.getState().setBossActive(0);
    expect(useGameStore.getState().bossActive).toBe(false);
  });

  it('isBossActive() agrees with the value — single source of truth', () => {
    useGameStore.getState().setBossActive(true);
    // The function and the value must never diverge.
    expect(useGameStore.getState().isBossActive()).toBe(true);
    expect(useGameStore.getState().isBossActive()).toBe(useGameStore.getState().bossActive);

    useGameStore.getState().setBossActive(false);
    expect(useGameStore.getState().isBossActive()).toBe(false);
    expect(useGameStore.getState().isBossActive()).toBe(useGameStore.getState().bossActive);
  });
});
