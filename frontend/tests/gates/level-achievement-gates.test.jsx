// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useQuestSystem } from '../../src/QuestSystem';
import { useSimpleExperience } from '../../src/SimpleExperienceSystem';
import { useGameStore } from '../../src/store/useGameStore';

// B6c — 2 of the 12 achievements were DEAD ON ARRIVAL.
//
// 'Rising Star' (reach level 5) and 'Shining Star' (reach level 10) both key off `stats.level`, and
// `stats.level` is written by exactly one function: `updateLevel` in QuestSystem.jsx. That function was
// returned from the hook and published NOWHERE — every sibling event (onSpellCast, onBlockPlace,
// onChestOpen, onNightSurvived...) is put on the store for its emitter to call, and this one was simply
// left off the list. Nothing ever called it, so `stats.level` never moved off 1 and neither achievement
// could unlock no matter how far a player levelled.
//
// The gate drives the REAL hook and asserts the REAL unlock set, so it fails if the wire is removed at
// either end — the publish in QuestSystem or the call in SimpleExperienceSystem.

const mount = () => renderHook(() => useQuestSystem());

describe('B6c — the level achievements can actually unlock', () => {
  beforeEach(() => {
    useGameStore.setState({ questState: null, onLevelChanged: null });
  });

  it('publishes onLevelChanged to the store, like every other quest event', () => {
    mount();
    expect(typeof useGameStore.getState().onLevelChanged).toBe('function');
  });

  it('unlocks Rising Star when the player reaches level 5', () => {
    const { result } = mount();
    expect(result.current.unlockedAchievements).not.toContain('level5');
    act(() => useGameStore.getState().onLevelChanged(5));
    expect(result.current.unlockedAchievements).toContain('level5');
  });

  it('does NOT unlock it below the target — the threshold is real', () => {
    // The canary: an unlock-everything bug would satisfy the test above.
    const { result } = mount();
    act(() => useGameStore.getState().onLevelChanged(4));
    expect(result.current.unlockedAchievements).not.toContain('level5');
    expect(result.current.unlockedAchievements).not.toContain('level10');
  });

  it('unlocks BOTH when the player reaches level 10', () => {
    const { result } = mount();
    act(() => useGameStore.getState().onLevelChanged(10));
    expect(result.current.unlockedAchievements).toContain('level5');
    expect(result.current.unlockedAchievements).toContain('level10');
  });

  it('unlocks retroactively for a save loaded at a high level', () => {
    // A returning player at level 7 must not have to level up again to earn Rising Star. This is why the
    // notify sits outside the increase-only VFX branch in SimpleExperienceSystem.
    const { result } = mount();
    act(() => useGameStore.getState().onLevelChanged(7));
    expect(result.current.unlockedAchievements).toContain('level5');
    expect(result.current.unlockedAchievements).not.toContain('level10');
  });

  it('leaves the other achievements alone — levelling is not a master key', () => {
    const { result } = mount();
    act(() => useGameStore.getState().onLevelChanged(10));
    for (const id of ['first_kill', 'wizard', 'centurion', 'miner_ach', 'builder_ach']) {
      expect(result.current.unlockedAchievements, `${id} should still be locked`).not.toContain(id);
    }
  });

  it('the catalogue really does contain both level achievements — otherwise this suite is vacuous', () => {
    const { result } = mount();
    const ids = result.current.achievements.map((a) => a.id);
    expect(ids).toContain('level5');
    expect(ids).toContain('level10');
    expect(result.current.achievements.length).toBeGreaterThan(10);
  });
});

describe('B6c — the EMITTER end of the wire', () => {
  // The suite above proves the receiver. This proves the thing that was actually missing: that something
  // CALLS it. A source-grep for `onLevelChanged?.(level)` was the first draft and gate-shape would have
  // rejected it; mounting the real XP hook and moving the store's level is both stronger and no harder.
  it('the XP system notifies the quest system when the level changes', () => {
    const seen = [];
    useGameStore.setState({ level: 1, onLevelChanged: (l) => seen.push(l) });
    renderHook(() => useSimpleExperience());
    act(() => useGameStore.setState({ level: 5 }));
    expect(seen).toContain(5);
  });

  it('reports the level even when it did not increase — a load can move it either way', () => {
    const seen = [];
    useGameStore.setState({ level: 9, onLevelChanged: (l) => seen.push(l) });
    renderHook(() => useSimpleExperience());
    act(() => useGameStore.setState({ level: 3 }));
    expect(seen).toContain(3);
  });

  it('does not throw when the quest system has not mounted yet', () => {
    // First tick of a cold start: the XP hook can run before QuestSystem publishes the callback.
    useGameStore.setState({ level: 1, onLevelChanged: null });
    expect(() => {
      renderHook(() => useSimpleExperience());
      act(() => useGameStore.setState({ level: 2 }));
    }).not.toThrow();
  });
});
