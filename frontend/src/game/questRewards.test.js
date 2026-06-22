import { describe, it, expect } from 'vitest';
import { questRewards, QUEST_COIN_RATE } from './questRewards.js';

// B4 (Phase B) — quest rewards. Quests were XP-ONLY (no payoff beyond a number). Now every quest
// also grants COINS (explicit `coinReward`, else derived from xp) and optionally an ITEM
// (`itemReward: {item, count}`) — gear/mats/recipe payoffs. This pairs with B6 (which stripped the
// trivializing starter kit): quests become the way you EARN gear back. Pure + clamped + NaN-safe.
describe('B4 questRewards — xp + coins + optional item (pure)', () => {
  it('derives coins from xp when no explicit coinReward', () => {
    expect(questRewards({ xpReward: 100 }).coins).toBe(Math.round(100 * QUEST_COIN_RATE));
    expect(questRewards({ xpReward: 30 }).xp).toBe(30);
  });
  it('explicit coinReward overrides the derived default (incl. 0)', () => {
    expect(questRewards({ xpReward: 100, coinReward: 250 }).coins).toBe(250);
    expect(questRewards({ xpReward: 100, coinReward: 0 }).coins).toBe(0);
  });
  it('passes an item reward through, defaulting count to 1', () => {
    expect(questRewards({ xpReward: 50, itemReward: { item: 'Iron Sword' } }).item).toEqual({ item: 'Iron Sword', count: 1 });
    expect(questRewards({ xpReward: 50, itemReward: { item: 'wood', count: 16 } }).item).toEqual({ item: 'wood', count: 16 });
  });
  it('no itemReward -> item null', () => {
    expect(questRewards({ xpReward: 50 }).item).toBeNull();
  });
  it('nullish / NaN inputs are safe (never negative, never NaN)', () => {
    expect(questRewards(undefined)).toEqual({ xp: 0, coins: 0, item: null });
    expect(questRewards({})).toEqual({ xp: 0, coins: 0, item: null });
    expect(questRewards({ xpReward: -50 }).xp).toBe(0);
    expect(questRewards({ xpReward: NaN, coinReward: NaN }).coins).toBe(0);
    expect(questRewards({ xpReward: 40, itemReward: { item: 'x', count: -3 } }).item.count).toBe(1);
  });
  it('the coin rate is a conservative fraction of xp', () => {
    expect(QUEST_COIN_RATE).toBeGreaterThan(0);
    expect(QUEST_COIN_RATE).toBeLessThanOrEqual(1);
  });
});
