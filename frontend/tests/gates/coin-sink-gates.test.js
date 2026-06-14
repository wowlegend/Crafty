import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { useGameStore } from '../../src/store/useGameStore.jsx';

// Coin sink (2026-06-14, next-levers #5). Coins were a DEAD currency — earned (dawn reward), displayed, and
// persisted, but nothing consumed them (no spendCoins; TradingInterface bartered items, never coins). This
// adds a spendCoins action + coins->consumable trades in the merchant so the dawn-reward loop pays off.
const __dir = dirname(fileURLToPath(import.meta.url));
const trading = readFileSync(resolve(__dir, '../../src/ui/TradingInterface.jsx'), 'utf8');

describe('spendCoins store action', () => {
  beforeEach(() => { useGameStore.setState({ coins: 20 }); });

  it('deducts and returns true when affordable', () => {
    expect(useGameStore.getState().spendCoins(12)).toBe(true);
    expect(useGameStore.getState().coins).toBe(8);
  });
  it('returns false and does NOT deduct when unaffordable', () => {
    expect(useGameStore.getState().spendCoins(100)).toBe(false);
    expect(useGameStore.getState().coins).toBe(20);
  });
  it('clamps a negative / nullish spend to a no-op (never adds coins)', () => {
    expect(useGameStore.getState().spendCoins(-5)).toBe(true);
    expect(useGameStore.getState().coins).toBe(20);
    useGameStore.getState().spendCoins(NaN);
    expect(useGameStore.getState().coins).toBe(20);
  });
});

describe('the merchant has a coin sink', () => {
  it('TradingInterface offers coin->item trades reading the coin balance', () => {
    expect(trading).toMatch(/type:\s*'coin'/);
    expect(trading).toMatch(/executeCoinTrade/);
    expect(trading).toMatch(/spendCoins/);
    expect(trading).toMatch(/gameState\.coins/);
  });
  it('the coin trades yield genuinely-usable consumables (potions)', () => {
    expect(trading).toMatch(/Health Potion|Mana Potion/);
  });
});
