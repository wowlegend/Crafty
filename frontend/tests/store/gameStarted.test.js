import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';

describe('store gameStarted flag', () => {
  beforeEach(() => useGameStore.setState({ gameStarted: false }));

  it('defaults to a boolean false (never undefined)', () => {
    expect(useGameStore.getState().gameStarted).toBe(false);
  });

  it('markGameStarted() latches it true', () => {
    useGameStore.getState().markGameStarted();
    expect(useGameStore.getState().gameStarted).toBe(true);
  });

  it('markGameStarted() is a one-way latch (stays true)', () => {
    useGameStore.getState().markGameStarted();
    useGameStore.getState().markGameStarted();
    expect(useGameStore.getState().gameStarted).toBe(true);
  });
});
