import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore';
import { resolvePlacement } from '../../src/world/placementEconomy';

// ONE COSTED BUILD MODE (DECISIONS 2026-10-28 W1-H item 4). Placing a block spends one of it, in every game: the
// worker's block_broken handler grants +1 on every mine, so a free placement is an infinite-material loop, and a free
// wall makes holding a siege no choice. No game mode exists to make it free.
//
// The surface here is the pure rule (resolvePlacement) and the store seam (consumeForPlacement) the place executor calls
// per cell. tests/gates/place-executor-gates.test.jsx drives that executor (world/placeAtHit.js, what Terrain.jsx's
// place() calls); tests/e2e/the-cut.spec.js places through a real right-click and reads the hotbar's count.
//
// Mutation-Proof: see the commit trailer (each case below named by the mutant that reddens it).

describe('resolvePlacement — the one rule', () => {
  it('a block in hand is placed for exactly one', () => {
    expect(resolvePlacement(3)).toEqual({ allowed: true, consume: 1 });
    expect(resolvePlacement(1)).toEqual({ allowed: true, consume: 1 });
  });
  it('an empty or unreadable stack REFUSES the placement and debits nothing', () => {
    for (const owned of [0, -2, undefined, null, NaN, '3']) {
      expect(resolvePlacement(owned), `owned ${String(owned)}`).toEqual({ allowed: false, consume: 0 });
    }
  });
});

describe('consumeForPlacement — the store seam place() delegates to', () => {
  beforeEach(() => {
    useGameStore.setState({ inventory: { blocks: { stone: 3 }, tools: {}, magic: {} } });
  });

  it('has no game mode left to consult', () => {
    const s = useGameStore.getState();
    expect('gameMode' in s, 'the store still carries a gameMode').toBe(false);
    expect('setGameMode' in s, 'the store still carries setGameMode').toBe(false);
  });

  it('a placement debits exactly one from the stack', () => {
    expect(useGameStore.getState().consumeForPlacement('stone')).toBe(true);
    expect(useGameStore.getState().inventory.blocks.stone).toBe(2);
  });

  it('three placements spend three, and the fourth is refused with the stack at zero', () => {
    const verdicts = [0, 1, 2, 3].map(() => useGameStore.getState().consumeForPlacement('stone'));
    expect(verdicts).toEqual([true, true, true, false]);
    expect(useGameStore.getState().inventory.blocks.stone).toBe(0);
  });

  it('placing a block you do not own is REFUSED, and nothing is debited', () => {
    expect(useGameStore.getState().consumeForPlacement('diamond')).toBe(false);
    expect(useGameStore.getState().inventory.blocks.diamond ?? 0).toBe(0);
    expect(useGameStore.getState().inventory.blocks.stone).toBe(3);
  });

  it('a stale creative flag written into the store does not make placement free', () => {
    // An old save, a dev hook or a stray setState could still write the dead key; nothing may read it.
    useGameStore.setState({ gameMode: 'creative', inventory: { blocks: { stone: 0 }, tools: {}, magic: {} } });
    expect(useGameStore.getState().consumeForPlacement('stone')).toBe(false);
    useGameStore.setState({ inventory: { blocks: { stone: 2 }, tools: {}, magic: {} } });
    expect(useGameStore.getState().consumeForPlacement('stone')).toBe(true);
    expect(useGameStore.getState().inventory.blocks.stone).toBe(1);
    useGameStore.setState((s) => { const { gameMode: _drop, ...rest } = s; return rest; }, true);
  });
});
