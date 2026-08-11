// @vitest-environment jsdom
//
// THE INITIAL CHEST RESPAWNS FOREVER — an unbounded loot and XP farm.
//
// `useTreasureChests`'s initial-chest effect is `useEffect(..., [chests.length])` with a body guarded by
// `chests.length === 0`. That reads as "spawn one chest at the start", and it is not: it is a reactive
// INVARIANT saying "there shall always be at least one chest", re-evaluated on every transition to zero.
//
// The board reaches zero routinely and by design — opening a chest schedules its removal ~5s later. So the
// loop is: open the only chest, take the loot and XP, wait five seconds, and a fresh chest spawns at a
// random angle 15 units away. Repeat indefinitely, without moving, without fighting anything.
//
// This is a BEHAVIOURAL gate: it renders the real hook against the real store and counts the chests that
// actually appear. The distinction matters here more than usual — the source line `chests.length === 0`
// looks like a guard AGAINST respawning, so any source-grep gate would read it as proof of the opposite.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useTreasureChests } from '../../src/QuestSystem.jsx';
import { useGameStore } from '../../src/store/useGameStore.jsx';

describe('the initial chest spawns ONCE per session, not once per empty board', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGameStore.setState({
      playerPosition: { x: 0, y: 60, z: 0 },
      getMobGroundLevel: () => 64,
      addNotification: () => {},
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('spawns exactly one chest on mount — the positive control', () => {
    // DENOMINATOR / CONTROL first. Every assertion below is about a chest count NOT growing, and
    // "it did not grow" is indistinguishable from "the hook never span anything up" unless this passes.
    const { result } = renderHook(() => useTreasureChests());
    expect(result.current.chests.length).toBe(1);
  });

  it('does NOT respawn after the player OPENS the only chest — the farm', () => {
    // Driven through the REAL sequence a player performs — openChest, then the hook's own 5s removal
    // timeout — rather than by poking state. The hook deliberately does not expose setChests, and using
    // the authentic path is what makes this a test of the feature instead of a test of a setter.
    const { result } = renderHook(() => useTreasureChests());
    const first = result.current.chests[0];
    expect(first, 'no chest to open — the control failed, so nothing below means anything').toBeDefined();

    act(() => { result.current.openChest(first.id); });
    act(() => { vi.advanceTimersByTime(5001); }); // the removal timeout fires; board -> 0

    expect(
      result.current.chests.length,
      'a chest respawned after the opened one was removed — open, loot, wait 5s, repeat, forever'
    ).toBe(0);
  });

  it('stays empty across THREE open-and-wait cycles, not merely the first', () => {
    // A fix that suppressed only the second spawn would pass the test above. If the board refills, this
    // loop keeps finding a chest to open and the count never settles at zero.
    const { result } = renderHook(() => useTreasureChests());
    for (let i = 0; i < 3; i++) {
      const c = result.current.chests[0];
      if (!c) break; // already empty and staying empty — the correct behaviour
      act(() => { result.current.openChest(c.id); });
      act(() => { vi.advanceTimersByTime(5001); });
    }
    expect(result.current.chests.length, 'the board refilled itself across repeated cycles').toBe(0);
  });

  it('does not respawn merely because time passes on an empty board', () => {
    const { result } = renderHook(() => useTreasureChests());
    const c = result.current.chests[0];
    act(() => { result.current.openChest(c.id); });
    act(() => { vi.advanceTimersByTime(5001); });
    act(() => { vi.advanceTimersByTime(20000); });
    expect(result.current.chests.length).toBe(0);
  });
});
