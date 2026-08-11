// @vitest-environment jsdom
//
// ONE ACHIEVEMENT, TWO FANFARES.
//
// `checkAchievements` runs INSIDE a setStats updater and read `unlockedAchievements` from the render
// closure. React 19 batches, and multi-kill-in-one-task is ordinary play: a melee cleave iterates
// checkMobsInMeleeCone, chain lightning iterates its hops, an element zone applies across mobsQuery, and
// emitMobKill fans out synchronously. So N updaters run before any re-render, every one of them sees the
// SAME pre-update Set, and `first_kill` fires on updater 1 and again on updater 2 -- two toasts and two
// playFanfare calls for one achievement, and the same at the 25 and 100 thresholds.
//
// setUnlockedAchievements is functional, so the SET stayed correct. What doubled was everything the player
// perceives, which is why nothing downstream noticed.
//
// This drives the REAL hook and the REAL kill bus. A test that called checkAchievements twice by hand
// would prove nothing: the defect is specifically about two calls inside ONE batch.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useQuestSystem } from '../../src/QuestSystem.jsx';
import { emitMobKill } from '../../src/game/mobKillBus.js';
import { useGameStore } from '../../src/store/useGameStore.jsx';

describe('achievements unlock exactly once per batch', () => {
  beforeEach(() => {
    // The hook MIRRORS its state into the store, and the store is a module singleton -- so without this a
    // later case starts with the earlier case's achievements already unlocked and silently checks nothing.
    useGameStore.setState({ questState: null });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  /** Kill `n` mobs inside ONE synchronous task — a cleave, a chain arc, a zone tick. */
  const killBatch = (n) => act(() => {
    for (let i = 0; i < n; i++) emitMobKill('zombie', [0, 0, 0], 'player');
  });

  /** ACHIEVEMENT toasts only. A first draft counted playFanfare calls and was measuring the wrong thing:
   *  one kill legitimately fires two fanfares, the Warrior achievement AND the First Blood quest
   *  completion. Counting them together made a correct build look broken and would have made a broken one
   *  look correct at any other N. */
  const unlockToasts = (result) => (result.current.notifications || []).filter((n) => n.type === 'achievement');

  it('a cleave that kills two mobs announces Warrior ONCE', () => {
    const { result } = renderHook(() => useQuestSystem());
    expect(result.current, 'the hook did not mount, so this test proves nothing').toBeTruthy();
    killBatch(2);
    const unlocks = unlockToasts(result);
    expect(unlocks.length, `the same achievement announced itself ${unlocks.length} times in one batch`).toBe(1);
    expect(unlocks[0].text).toMatch(/Warrior/);
  });

  it('and it announces at all — the presence control for the assertion above', () => {
    const { result } = renderHook(() => useQuestSystem());
    killBatch(1);
    expect(unlockToasts(result).length, 'no achievement unlocked at all').toBe(1);
  });

  it('a five-mob zone tick still announces once, not five times', () => {
    const { result } = renderHook(() => useQuestSystem());
    killBatch(5);
    expect(unlockToasts(result).length).toBe(1);
  });

  it('crossing TWO thresholds in one batch announces both, once each', () => {
    // 25 kills crosses Warrior and Serial Slayer. The guard must dedupe per achievement, not latch the
    // whole system shut after the first unlock of a batch.
    const { result } = renderHook(() => useQuestSystem());
    killBatch(25);
    const unlocks = unlockToasts(result);
    expect(unlocks.length, 'two distinct thresholds should announce twice').toBe(2);
    expect(new Set(unlocks.map((u) => u.text)).size, 'the same achievement was announced twice').toBe(2);
  });

  it('the stats keep counting correctly across a batch — the fix must not lose kills', () => {
    const { result } = renderHook(() => useQuestSystem());
    killBatch(4);
    expect(result.current.stats.kills, 'a batch of four kills did not all land').toBe(4);
  });
});
