// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useGameStore } from '../../src/store/useGameStore.jsx';

// Coin sink (2026-06-14, next-levers #5). Coins were a DEAD currency — earned (dawn reward), displayed, and
// persisted, but nothing consumed them (no spendCoins; TradingInterface bartered items, never coins). This
// adds a spendCoins action + coins->consumable trades in the merchant so the dawn-reward loop pays off.
vi.mock('../../src/SoundManager', () => ({
  useGameSounds: () => ({ playPickup: () => {}, playLevelUpSound: () => {} }),
}));
const { TradingInterface } = await import('../../src/ui/TradingInterface.jsx');

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

// THE MERCHANT, TRADED WITH RATHER THAN READ.
//
// This block used to grep TradingInterface.jsx for four tokens — `type: 'coin'`, `executeCoinTrade`,
// `spendCoins`, `gameState.coins` — plus the string 'Health Potion'. Every one of those is satisfied by
// the code EXISTING, which is precisely what was never in doubt: the finding that motivated this feature
// was that coins were earned, displayed and persisted and nothing CONSUMED them. A gate that proves the
// consumer is spelled correctly re-creates the original defect one level up. And the sibling bug this
// repo has already shipped twice — a purchase routed into a bucket no panel renders, so the item
// vanishes (M5 #15, B3b) — is invisible to all five greps and is the first thing a real trade catches.
//
// The panel renders in jsdom. So: set a balance, click Trade, and check the wallet and the bag.
const openMerchant = () => render(createElement(TradingInterface, { villager: { npcName: 'Merchant' }, onClose: () => {} }));

/** The Trade button belonging to the row whose label is `name`. */
const tradeButtonFor = (name) => {
  const row = screen.getByText(name).closest('div.flex.items-center.justify-between');
  expect(row, `no merchant row named "${name}" — the trade table changed shape`).toBeTruthy();
  const btn = [...row.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Trade');
  expect(btn, `the "${name}" row has no Trade button`).toBeTruthy();
  return btn;
};

const bag = () => useGameStore.getState().inventory?.blocks || {};

describe('the merchant has a coin sink, driven through the panel', () => {
  beforeEach(() => { useGameStore.setState({ coins: 30, inventory: { blocks: {} } }); });
  afterEach(cleanup);

  it('buying a Health Potion DEBITS the coins and DELIVERS the potion to the bag the panels read', () => {
    openMerchant();
    fireEvent.click(tradeButtonFor('Coins to Health Potion'));

    expect(useGameStore.getState().coins, 'the coins were not spent — the sink does not sink').toBe(18);
    expect(bag()['Health Potion'],
      'the potion is not in inventory.blocks — this is the lost-buy bug (M5 #15 / B3b), which every source-grep in the old gate passed straight through').toBe(1);
  });

  it('a second currency exists and is priced differently, so the row is not hardcoded', () => {
    openMerchant();
    fireEvent.click(tradeButtonFor('Coins to Mana Potion'));
    expect(useGameStore.getState().coins).toBe(20);
    expect(bag()['Mana Potion']).toBe(1);
  });

  it('an unaffordable trade takes NOTHING and delivers NOTHING', () => {
    // The negative case. A sink that debits without delivering, or delivers without debiting, satisfies
    // the happy path above in one direction each.
    useGameStore.setState({ coins: 5 });
    openMerchant();
    const btn = tradeButtonFor('Coins to Health Potion');
    expect(btn.disabled, 'the merchant offers a trade the player cannot afford as though they could').toBe(true);

    // Disabled in the UI is the affordance; the handler must refuse independently, because a click can
    // still arrive (an enabled row, a stale render, a balance that dropped between paint and tap).
    fireEvent.click(btn);
    expect(useGameStore.getState().coins, 'coins were taken for a trade that could not complete').toBe(5);
    expect(bag()['Health Potion'], 'a potion was handed over for free').toBeUndefined();
  });

  it('the affordable row is ENABLED — otherwise "disabled" above proves nothing', () => {
    openMerchant();
    expect(tradeButtonFor('Coins to Health Potion').disabled).toBe(false);
  });

  it('spending is capped by the balance across repeated purchases', () => {
    // 30 coins buys two 12-coin potions and no more. This is the loop the feature exists for, and it is
    // the one thing no static read of the file can check: state carried between two user actions.
    openMerchant();
    const btn = () => tradeButtonFor('Coins to Health Potion');
    fireEvent.click(btn());
    fireEvent.click(btn());
    expect(useGameStore.getState().coins).toBe(6);
    expect(bag()['Health Potion']).toBe(2);

    expect(btn().disabled, 'a third potion is offered on a 6-coin balance').toBe(true);
    fireEvent.click(btn());
    expect(useGameStore.getState().coins, 'the balance went negative').toBe(6);
    expect(bag()['Health Potion']).toBe(2);
  });

  it('the coin trades yield genuinely-usable consumables, named as the item registry names them', () => {
    // What the old `/Health Potion|Mana Potion/` grep was reaching for: not that the string appears, but
    // that what lands in the bag is a key the consumable system will actually accept.
    openMerchant();
    fireEvent.click(tradeButtonFor('Coins to Health Potion'));
    fireEvent.click(tradeButtonFor('Coins to Mana Potion'));
    expect(Object.keys(bag()).sort()).toEqual(['Health Potion', 'Mana Potion']);
  });
});
