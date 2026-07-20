import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore';
import { resolvePlacement } from '../../src/world/placementEconomy';

// B3c — PLACING A BLOCK WAS FREE while mining granted +1. (18-domain review, HIGH.)
//
// Terrain.jsx place() had zero inventory logic; the worker's block_broken handler grants +1 on every mine.
// place-free + mine-+1 is an infinite-material loop — infinite diamonds in seconds — which guts the whole
// crafting/economy loop. In SURVIVAL you must spend the block you place; CREATIVE (the game's default)
// stays free, as a builder sandbox should.
//
// place() lives inside the unmountable R3F Terrain component, so the mutation-provable surface is the pure
// rule (resolvePlacement) + the store seam (consumeForPlacement) that place() delegates to. The one-line
// place() guard `if (!store.consumeForPlacement(type)) return;` is a read-verified wiring edit.
//
// MUTATION-PROOF: in placementEconomy.js change the survival success return `consume: 1` to `consume: 0`
// (placement free again) — "survival debits exactly 1" and "N places cost N" go RED; creative stays green.

describe('B3c resolvePlacement — the pure rule', () => {
  it('creative places for free', () => {
    expect(resolvePlacement('creative', 0)).toEqual({ allowed: true, consume: 0 });
    expect(resolvePlacement('creative', 99)).toEqual({ allowed: true, consume: 0 });
  });
  it('survival with the block in hand debits exactly 1', () => {
    expect(resolvePlacement('survival', 5)).toEqual({ allowed: true, consume: 1 });
    expect(resolvePlacement('survival', 1)).toEqual({ allowed: true, consume: 1 });
  });
  it('survival with an empty stack REFUSES the placement', () => {
    expect(resolvePlacement('survival', 0)).toEqual({ allowed: false, consume: 0 });
    expect(resolvePlacement('survival', undefined)).toEqual({ allowed: false, consume: 0 });
  });
});

describe('B3c consumeForPlacement — the store seam place() delegates to', () => {
  beforeEach(() => {
    useGameStore.setState({ gameMode: 'survival', inventory: { blocks: { stone: 5 }, tools: {}, magic: {} } });
  });

  it('survival: a placement debits exactly one from the stack', () => {
    const ok = useGameStore.getState().consumeForPlacement('stone');
    expect(ok).toBe(true);
    expect(useGameStore.getState().inventory.blocks.stone).toBe(4);   // RED if placement is free again
  });

  it('survival: N placements cost N, not 0', () => {
    for (let i = 0; i < 5; i++) useGameStore.getState().consumeForPlacement('stone');
    expect(useGameStore.getState().inventory.blocks.stone).toBe(0);   // the infinite-block loop is closed
  });

  it('survival: placing a block you do not own is REFUSED, and nothing is debited', () => {
    const ok = useGameStore.getState().consumeForPlacement('diamond');
    expect(ok).toBe(false);
    expect(useGameStore.getState().inventory.blocks.diamond ?? 0).toBe(0);
    expect(useGameStore.getState().inventory.blocks.stone).toBe(5);   // an unrelated stack is untouched
  });

  it('creative: placement is free and never debits (the default builder sandbox)', () => {
    useGameStore.setState({ gameMode: 'creative', inventory: { blocks: { stone: 3 }, tools: {}, magic: {} } });
    expect(useGameStore.getState().consumeForPlacement('stone')).toBe(true);
    expect(useGameStore.getState().inventory.blocks.stone).toBe(3);   // unchanged — free
  });
});
