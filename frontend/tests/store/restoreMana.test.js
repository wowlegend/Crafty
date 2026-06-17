import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';

describe('store restoreMana', () => {
  beforeEach(() => useGameStore.setState({ mana: 20, maxMana: 100, isAlive: true }));

  it('adds mana clamped to maxMana', () => {
    useGameStore.getState().restoreMana(40);
    expect(useGameStore.getState().mana).toBe(60);
  });

  it('never exceeds maxMana', () => {
    useGameStore.setState({ mana: 80 });
    useGameStore.getState().restoreMana(40);
    expect(useGameStore.getState().mana).toBe(100);
  });

  it('is a no-op when dead', () => {
    useGameStore.setState({ isAlive: false, mana: 20 });
    useGameStore.getState().restoreMana(40);
    expect(useGameStore.getState().mana).toBe(20);
  });
});
