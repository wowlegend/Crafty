// @vitest-environment jsdom
//
// B4 — quest rewards: claiming a quest must grant the FULL bundle (xp + coins + item).
//
// ⚠️ THIS GATE WAS REWRITTEN 2026-07-13. It used to be a SOURCE-GREP:
//     expect(qs).toMatch(/const r = questRewards\(claimedQuest\)/);
//     expect(qs).toMatch(/store\.addCoins\(r\.coins\)/);
// i.e. it asserted that certain LINES OF TEXT existed in QuestSystem.jsx. Its own comment claimed it
// "fails closed if a refactor drops coins/items". It did the exact opposite, and we proved it:
//
//   * It stayed GREEN for weeks while claimQuest was SILENTLY STEALING REWARDS — on a second claim in the
//     same tick the `store.addCoins(r.coins)` line it was asserting on NEVER EXECUTED (React batching), so
//     the player lost a whole quest's XP + coins and had to redo the quest. The gate could not see that,
//     because a line existing is not a line running.
//   * It went RED the moment the bug was FIXED, because the fix renamed a variable.
//
// A gate that is green on broken code and red on fixed code is ANTI-CORRELATED WITH CORRECTNESS. It is not
// a weak gate; it is a harmful one. (LOOP-CHARTER §3: a gate that greps source text is not a gate.)
//
// This version asserts the BEHAVIOR: claim a quest, and check that the xp, the coins and the item actually
// arrive. It is mutation-proven — delete the addCoins call in claimQuest and this goes red.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useQuestSystem, QUEST_LIST } from '../../src/QuestSystem.jsx';
import { GameMethods } from '../../src/GameMethods';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { questRewards } from '../../src/game/questRewards.js';

/** A completed, unclaimed quest carrying the full bundle: xp + (derived) coins + a gear item. */
const GEAR_QUEST = {
  id: 'hunter',
  title: 'Hunter',
  type: 'kill',
  target: 5,
  xpReward: 75,
  itemReward: { item: 'Iron Sword', count: 1 },
  tier: 1,
  progress: 5,
  completed: true,
  claimed: false,
};

describe('B4 quest rewards — the full bundle actually LANDS (behavioral)', () => {
  beforeEach(() => {
    GameMethods.grantXP = vi.fn();
    useGameStore.setState({
      coins: 0,
      questState: {
        quests: [GEAR_QUEST],
        completedQuestIds: [],
        stats: { kills: 0, kills_by_type: {}, spells: 0, blocks_placed: 0, blocks_broken: 0, chests: 0, distance: 0, deaths: 0, level: 1 },
        unlockedAchievements: ['first_step'],
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('grants XP, coins AND the item (not xp-only — the original B4 bug)', () => {
    const addToInventory = vi.spyOn(useGameStore.getState(), 'addToInventory');
    const { result } = renderHook(() => useQuestSystem());

    act(() => result.current.claimQuest('hunter'));

    const expected = questRewards(GEAR_QUEST);
    expect(expected.xp).toBe(75);
    expect(expected.coins).toBeGreaterThan(0); // coins derive from xp when not explicit
    expect(expected.item).toEqual({ item: 'Iron Sword', count: 1 });

    expect(GameMethods.grantXP).toHaveBeenCalledWith(75, 'Quest Reward');
    expect(useGameStore.getState().coins, 'coins must be paid, not just XP').toBe(expected.coins);
    expect(addToInventory, 'the gear item must reach the inventory').toHaveBeenCalledWith('Iron Sword', 1);
  });

  it('an unclaimable quest pays NOTHING (no double-pay on a repeat dispatch)', () => {
    const { result } = renderHook(() => useQuestSystem());

    act(() => result.current.claimQuest('hunter')); // legitimate
    const coinsAfterFirst = useGameStore.getState().coins;
    GameMethods.grantXP.mockClear();

    act(() => result.current.claimQuest('hunter')); // repeat — already claimed

    expect(GameMethods.grantXP, 'a repeat claim must not re-pay').not.toHaveBeenCalled();
    expect(useGameStore.getState().coins).toBe(coinsAfterFirst);
  });

  // This one is legitimately a DATA assertion — but read the DATA, don't regex the file.
  it('quests carry itemReward gear payoffs (earn back the B6-stripped starter gear)', () => {
    const gear = QUEST_LIST.filter((q) => q.itemReward?.item).map((q) => q.itemReward.item);
    expect(gear).toEqual(expect.arrayContaining(['Iron Sword', 'Diamond Sword']));
  });
});
