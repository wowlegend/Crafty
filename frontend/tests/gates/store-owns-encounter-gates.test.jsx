// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import { useBossSystem } from '../../src/world/bossSystem';
import { useQuestSystem, QUEST_LIST } from '../../src/QuestSystem.jsx';
import { useGameStore } from '../../src/store/useGameStore';
import { GameMethods } from '../../src/GameMethods';
import { blightHeartSite } from '../../src/world/blightHeart';
import { bossTierStats } from '../../src/game/bossTier.js';
import { buildSaveData } from '../../src/game/saveSchema.js';

/**
 * THE STORE OWNS THE ENCOUNTER AND THE QUEST LOG: A LOAD INTO A MOUNTED GAME REACHES THE HOOKS (deep audit 2026-10-30,
 * lane L3; AUDIT:softlocks:boss-hook-ignores-world-load, AUDIT:persistence:new-world-keeps-old-quests).
 *
 * Every world switch is a boot since lane L2, so the hooks mount on the loaded world. The in-place load stays as the
 * boot's primitive (store loadWorldData), and these keep it correct if a caller ever loads into a mounted game again:
 * the dragon hook held the fight in its own state seeded at mount and mirrored it into the store, so a load reached the
 * store alone; the quest hook's re-seed returned early on a null questState (a new world's), keeping the old log.
 *
 * THE ORDER IS THE POINT. The B2g gate (boss-persistence-hook-gates) loads the store and then mounts, which is how the
 * hook-seeded-at-mount defect was recorded FIXED. Here the hooks MOUNT FIRST, play, and then the world loads in place.
 * Each case reads the hook, the store and the next save, and walks the player to the lair, so the arrival poll is seen
 * waking a fight (presence) before it is seen staying quiet.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh on src/world/bossSystem.js, src/QuestSystem.jsx and
 * src/store/useGameStore.jsx, receipts in the commit.
 */

const lair = blightHeartSite();
const AT_LAIR = { x: lair.x, y: 40, z: lair.z };
const MAX0 = bossTierStats(0).health;
const poll = () => act(() => { vi.advanceTimersByTime(3200); });

const arm = () => {
  useGameStore.setState(useGameStore.getInitialState(), true);
  useGameStore.setState({ addNotification: vi.fn(), playerPosition: AT_LAIR, isCaptureMode: false, getMobGroundLevel: null, nightCount: 5 });
};
const notices = () => useGameStore.getState().addNotification.mock.calls.map(([k]) => k);
const encounter = (h) => ({ active: h.bossActive, health: h.bossHealth, defeated: h.bossDefeated, tier: h.bossTier });
const storeEncounter = () => encounter(useGameStore.getState());

/** A save at the lair at level 9 holding `bossState`, and `game` / `progression` over the initial state's. */
function save(bossState, { game = {}, progression = {}, questState } = {}) {
  const s = buildSaveData(useGameStore.getInitialState(), { position: AT_LAIR });
  s.game_state = { ...s.game_state, ...game, bossState };
  s.progression = { ...s.progression, level: 9, nightCount: 5, ...progression };
  if (questState !== undefined) s.questState = questState;
  return s;
}
const loadInPlace = (data) => act(() => {
  useGameStore.getState().loadWorldData(data);
  useGameStore.setState({ playerPosition: AT_LAIR, addNotification: useGameStore.getState().addNotification || vi.fn() });
});

/** Mount the dragon hook on a fresh world, wake the fight at the lair and wound it to `hp`. */
function mountAndFight(hp) {
  const hook = renderHook(() => useBossSystem(9));
  poll();
  expect(hook.result.current.bossActive, 'SETUP: the arrival poll did not wake the fight on the fresh world').toBe(true);
  act(() => useGameStore.getState().damageBoss(MAX0 - hp));
  expect(hook.result.current.bossHealth, 'SETUP: the wound did not land').toBe(hp);
  return hook;
}

describe('the dragon hook reads the store: a load into the mounted game is the fight it loads', () => {
  let grantXP;
  beforeEach(() => { vi.useFakeTimers(); arm(); grantXP = GameMethods.grantXP; GameMethods.grantXP = vi.fn(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); GameMethods.grantXP = grantXP; });

  it('a fight at 600, then a won world loads: slain in the hook and the store, the lair quiet, the save slain', () => {
    const hook = mountAndFight(600);
    loadInPlace(save({ health: 0, active: false, defeated: true, tier: 1, killNight: 4 }, { game: { gameWon: true } }));
    const slain = { active: false, health: 0, defeated: true, tier: 1 };
    expect(encounter(hook.result.current), 'the hook kept the fight it had before the load').toEqual(slain);
    expect(storeEncounter(), 'the store lost the loaded encounter').toEqual(slain);
    poll();
    expect(hook.result.current.bossActive, `the loaded world's slain dragon woke: ${JSON.stringify(notices())}`).toBe(false);
    const written = buildSaveData(useGameStore.getState(), { position: AT_LAIR }).game_state.bossState;
    expect(written, 'the next save does not hold the loaded world\'s dragon').toEqual({ health: 0, active: false, defeated: true, tier: 1, killNight: 4 });
  });

  it('a fight at 600, then a world mid-fight at 210 loads: the hook fights at 210, quietly, and hits land on it', () => {
    const hook = mountAndFight(600);
    useGameStore.getState().addNotification.mockClear();
    loadInPlace(save({ health: 210, active: true, defeated: false, tier: 0, killNight: 0 }));
    expect(encounter(hook.result.current)).toEqual({ active: true, health: 210, defeated: false, tier: 0 });
    expect(hook.result.current.bossPhase, 'the phase is not the loaded health\'s').toBe(2);
    poll();
    expect(notices(), 'the load or the resumed wake announced something: a phase or the entrance').toEqual([]);
    act(() => useGameStore.getState().damageBoss(10));
    expect(hook.result.current.bossHealth, 'a hit after the load did not land on the loaded fight').toBe(200);
    expect(useGameStore.getState().bossHealth).toBe(200);
  });

  it('the dragon slain, then a world mid-fight loads: that dragon can be slain too (the kill latch is the world\'s)', () => {
    const hook = mountAndFight(100);
    act(() => useGameStore.getState().damageBoss(100));
    expect(useGameStore.getState().bossDefeated, 'SETUP: the first kill did not land').toBe(true);
    loadInPlace(save({ health: 50, active: true, defeated: false, tier: 0, killNight: 0 }));
    expect(hook.result.current.bossActive, 'the loaded fight is not on').toBe(true);
    act(() => useGameStore.getState().damageBoss(50));
    expect(storeEncounter(), 'the loaded world\'s dragon could not be killed').toEqual({ active: false, health: 0, defeated: true, tier: 1 });
    expect(GameMethods.grantXP, 'the second kill paid nothing').toHaveBeenCalledTimes(2);
  });

  it('a fight at 600, then New World: a fresh dragon, and it wakes at the lair at full health with its entrance', () => {
    const hook = mountAndFight(600);
    useGameStore.getState().addNotification.mockClear();
    act(() => { useGameStore.getState().startNewWorld(null); useGameStore.setState({ playerPosition: AT_LAIR }); });
    expect(encounter(hook.result.current), 'the hook kept the old world\'s fight').toEqual({ active: false, health: MAX0, defeated: false, tier: 0 });
    poll();
    expect(hook.result.current.bossActive, 'the new world\'s dragon never woke: the arrival latch kept the old fight').toBe(true);
    expect(hook.result.current.bossHealth).toBe(MAX0);
    expect(notices(), 'the new world\'s first fight woke without its entrance').toContain('notice.bossAwakens');
  });
});

describe('the quest hook re-seeds on every load, a null quest log to the new world\'s defaults', () => {
  beforeEach(() => { arm(); });
  afterEach(() => { cleanup(); });

  it('a log with progress, then a save with no log (a new world\'s) loads: the hook is at the defaults', () => {
    const hook = renderHook(() => useQuestSystem());
    const firstTier = QUEST_LIST.filter((q) => q.tier === 1).slice(0, 3).map((q) => q.id);
    loadInPlace(save({ health: MAX0, active: false, defeated: false, tier: 0, killNight: 0 }, {
      questState: {
        quests: [{ ...QUEST_LIST.find((q) => q.id === 'pilgrim'), progress: 0, completed: false, claimed: false }],
        completedQuestIds: ['first_blood', 'zombie_slayer'],
        stats: { kills: 12, kills_by_type: { zombie: 12 }, spells: 3, blocks_placed: 0, blocks_broken: 9, chests: 1, distance: 0, deaths: 0, level: 9 },
        unlockedAchievements: ['first_step', 'first_kill'],
      },
    }));
    // PRESENCE: the re-seed ran for a log that exists.
    expect(hook.result.current.stats.kills, 'SETUP: the first load did not reach the hook').toBe(12);
    loadInPlace(save({ health: MAX0, active: false, defeated: false, tier: 0, killNight: 0 }, { questState: null }));
    const r = hook.result.current;
    expect(r.quests.map((q) => q.id), 'the old world\'s quests survived a load with no log').toEqual(firstTier);
    expect(r.quests.every((q) => q.progress === 0 && !q.completed), 'old progress survived').toBe(true);
    expect(useGameStore.getState().questState?.completedQuestIds ?? [], 'old claims survived in the mirror').toEqual([]);
    expect(r.stats.kills, 'old counters survived').toBe(0);
    expect([...r.unlockedAchievements], 'old achievements survived').toEqual(['first_step']);
  });

  it('a log with progress, then a save from before the log (no questState key) loads: the hook is at the defaults too', () => {
    const hook = renderHook(() => useQuestSystem());
    const firstTier = QUEST_LIST.filter((q) => q.tier === 1).slice(0, 3).map((q) => q.id);
    loadInPlace(save({ health: MAX0, active: false, defeated: false, tier: 0, killNight: 0 }, {
      questState: {
        quests: [{ ...QUEST_LIST.find((q) => q.id === 'pilgrim'), progress: 0, completed: false, claimed: false }],
        completedQuestIds: ['first_blood'],
        stats: { kills: 12, kills_by_type: {}, spells: 0, blocks_placed: 0, blocks_broken: 0, chests: 0, distance: 0, deaths: 0, level: 9 },
        unlockedAchievements: ['first_step', 'first_kill'],
      },
    }));
    expect(hook.result.current.stats.kills, 'SETUP: the first load did not reach the hook').toBe(12);
    const old = save({ health: MAX0, active: false, defeated: false, tier: 0, killNight: 0 });
    delete old.questState;
    expect(Object.prototype.hasOwnProperty.call(old, 'questState'), 'SETUP: the save still has the key').toBe(false);
    loadInPlace(old);
    const r = hook.result.current;
    expect(r.stats.kills, 'the old world\'s counters survived a save with no log').toBe(0);
    expect(r.quests.map((q) => q.id), 'the old world\'s quests survived').toEqual(firstTier);
    expect(useGameStore.getState().questState?.completedQuestIds ?? [], 'old claims survived in the mirror').toEqual([]);
    expect([...r.unlockedAchievements], 'old achievements survived').toEqual(['first_step']);
  });
});
