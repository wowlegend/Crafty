// @vitest-environment jsdom
//
// R1 — QUEST MULTI-CLAIM: reward theft + save corruption.
//
// THIS IS A BEHAVIORAL GATE, NOT A SOURCE-GREP.
// The pre-existing `quest-rewards-gates.test.js` "covers" quest rewards by asserting the SOURCE TEXT
// contains `store.addCoins(r.coins)`. That proves the LINE EXISTS. It cannot prove the line RUNS — and it
// sat green while the bug below stole every second quest reward and corrupted the save. A gate that greps
// source text is not a gate (LOOP-CHARTER §3).
//
// THE BUG (QuestSystem.jsx claimQuest + InputManager.jsx:136-140):
//   1. `claimQuest` mutates the closure variable `claimedQuest` from INSIDE the `setQuests` updater, then
//      reads it AFTER the call to grant the reward. React only evaluates that updater eagerly when the
//      fiber has no pending lanes. On a SECOND claim in the same tick there ARE pending lanes → the updater
//      is deferred → `claimedQuest` is still null when the reward block runs → THE REWARD IS NEVER GRANTED.
//   2. `new Set([...completedQuestIds, questId])` reads a STALE closure of `completedQuestIds`, so claim #2
//      builds its set from the pre-claim-#1 state → QUEST #1 IS ERASED from the completed list. It gets
//      re-offered, and the bounty sequence miscounts.
//
// WHY IT IS REACHABLE (not a theoretical race): the `Q` key handler claims EVERY completed quest in one
// synchronous forEach, and quests routinely complete in pairs — a single zombie kill advances both
// `first_blood` (type 'kill', target 1) and `zombie_slayer` (type 'kill_type').
//
// This test MUST go RED against the unfixed HEAD. A version of it that is green on day one is a rubber
// stamp and the slice is void.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useQuestSystem } from '../../src/QuestSystem.jsx';
import { GameMethods } from '../../src/GameMethods';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { questRewards } from '../../src/game/questRewards.js';

/** Two quests that a SINGLE zombie kill completes together — the real-world trigger. */
const TWO_COMPLETED = () => [
  {
    id: 'first_blood',
    title: 'First Blood',
    type: 'kill',
    target: 1,
    xpReward: 30,
    tier: 1,
    progress: 1,
    completed: true,
    claimed: false,
  },
  {
    id: 'zombie_slayer',
    title: 'Zombie Slayer',
    type: 'kill_type',
    mobType: 'zombie',
    target: 10,
    xpReward: 120,
    tier: 2,
    progress: 10,
    completed: true,
    claimed: false,
  },
];

const seedStore = (quests) => {
  useGameStore.setState({
    coins: 0,
    questState: {
      quests,
      completedQuestIds: [],
      stats: { kills: 0, kills_by_type: {}, spells: 0, blocks_placed: 0, blocks_broken: 0, chests: 0, distance: 0, deaths: 0, level: 1 },
      unlockedAchievements: ['first_step'],
    },
  });
};

describe('R1 — quest multi-claim (one Q press, two completed quests)', () => {
  beforeEach(() => {
    GameMethods.grantXP = vi.fn();
    GameMethods.spawnLootDrop = vi.fn();
    seedStore(TWO_COMPLETED());
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('grants BOTH rewards — the 2nd claim in the same tick must not be swallowed', () => {
    const { result } = renderHook(() => useQuestSystem());

    act(() => {
      // EXACTLY what InputManager.jsx:136-140 does on the Q key: claim every completed quest, one tick.
      result.current.quests.forEach((q) => {
        if (q.progress >= q.target && !q.claimed) result.current.claimQuest(q.id);
      });
    });

    const xpCalls = GameMethods.grantXP.mock.calls.map((c) => c[0]);
    expect(
      xpCalls,
      'both quests were completed and claimed in one press — both XP rewards must be granted',
    ).toEqual(expect.arrayContaining([30, 120]));
    expect(GameMethods.grantXP).toHaveBeenCalledTimes(2);

    // Coins are the second half of the reward bundle and go through the real store.
    const expectedCoins = questRewards({ xpReward: 30 }).coins + questRewards({ xpReward: 120 }).coins;
    expect(useGameStore.getState().coins, 'both coin payouts must land').toBe(expectedCoins);
  });

  it('does NOT erase the first quest from the save (completedQuestIds keeps BOTH ids)', () => {
    const { result } = renderHook(() => useQuestSystem());

    act(() => {
      result.current.quests.forEach((q) => {
        if (q.progress >= q.target && !q.claimed) result.current.claimQuest(q.id);
      });
    });

    // The hook mirrors completedQuestIds into the store's questState — that mirror IS the save.
    const saved = useGameStore.getState().questState?.completedQuestIds ?? [];
    expect(
      [...saved].sort(),
      'a stale-closure Set rebuild drops the first claim → the quest is re-offered and the bounty seq miscounts',
    ).toEqual(['first_blood', 'zombie_slayer']);
  });

  it('marks both quests claimed (neither is left dangling as active)', () => {
    const { result } = renderHook(() => useQuestSystem());

    act(() => {
      result.current.quests.forEach((q) => {
        if (q.progress >= q.target && !q.claimed) result.current.claimQuest(q.id);
      });
    });

    const stillOffered = result.current.quests.filter(
      (q) => q.id === 'first_blood' || q.id === 'zombie_slayer',
    );
    expect(stillOffered, 'a claimed quest must not remain in the active feed').toEqual([]);
  });
});
