// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useQuestSystem } from '../../src/QuestSystem.jsx';
import { GameMethods } from '../../src/GameMethods';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { emitMobKill } from '../../src/game/mobKillBus.js';
import { questRewards } from '../../src/game/questRewards.js';

// QUESTS CLAIM THEMSELVES ON COMPLETION (the HUD lane, DECISIONS 2026-10-29 item 96): the claim key (Q) and the
// tracker's claim button are gone. Driven through the REAL hook and the REAL kill bus: one zombie kill completes two
// quests in one tick (First Blood and the hunt), and each must pay exactly once, through reduceClaim, the only payer.
const STATS = { kills: 0, kills_by_type: {}, spells: 0, blocks_placed: 0, blocks_broken: 0, chests: 0, distance: 0, deaths: 0, level: 1 };
const NEAR = () => [
  { id: 'first_blood', title: 'First Blood', type: 'kill', target: 1, xpReward: 30, tier: 1, progress: 0, completed: false, claimed: false },
  { id: 'zombie_slayer', title: 'Zombie Slayer', type: 'kill_type', mobType: 'zombie', target: 10, xpReward: 120, tier: 2, progress: 9, completed: false, claimed: false },
];

describe('automatic claim', () => {
  beforeEach(() => {
    GameMethods.grantXP = vi.fn();
    GameMethods.spawnLootDrop = vi.fn();
    useGameStore.setState({ coins: 0, questState: { quests: NEAR(), completedQuestIds: [], stats: { ...STATS }, unlockedAchievements: ['first_step'] } });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('one kill completes two quests in one tick: each pays exactly once, with no key pressed', () => {
    const { result } = renderHook(() => useQuestSystem());
    expect(GameMethods.grantXP, 'SETUP: something paid before any quest completed').not.toHaveBeenCalled();
    act(() => emitMobKill('zombie', [0, 0, 0], 'player'));
    const paid = GameMethods.grantXP.mock.calls.filter((c) => c[1] === 'Quest Reward').map((c) => c[0]).sort((a, b) => a - b);
    expect(paid, 'the two completed quests did not each pay once').toEqual([30, 120]);
    expect(useGameStore.getState().coins).toBe(questRewards({ xpReward: 30 }).coins + questRewards({ xpReward: 120 }).coins);
    expect(useGameStore.getState().questState.completedQuestIds, 'a completed quest was left unclaimed')
      .toEqual(expect.arrayContaining(['first_blood', 'zombie_slayer']));
    expect(result.current.quests.some((q) => q.completed && !q.claimed), 'a completed quest waits for a claim').toBe(false);

    // More kills, and a manual claim of an already-claimed quest: nothing pays twice.
    act(() => { emitMobKill('zombie', [0, 0, 0], 'player'); result.current.claimQuest('first_blood'); });
    const again = GameMethods.grantXP.mock.calls.filter((c) => c[1] === 'Quest Reward').map((c) => c[0]);
    expect(again.filter((x) => x === 30), 'First Blood paid twice').toHaveLength(1);
    expect(again.filter((x) => x === 120), 'the hunt paid twice').toHaveLength(1);
  });
});
