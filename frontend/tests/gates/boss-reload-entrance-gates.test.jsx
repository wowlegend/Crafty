// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import { useBossSystem } from '../../src/world/bossSystem';
import { useGameStore } from '../../src/store/useGameStore';
import { blightHeartSite } from '../../src/world/blightHeart';
import { bossTierStats } from '../../src/game/bossTier.js';

/**
 * A RELOAD MID-FIGHT RESUMES THE FIGHT WITHOUT ITS ENTRANCE (REVIEW:w3b:reload-replays-entrance; DECISIONS 2026-10-30
 * item 202). Every world switch is now a reload (game/worldBoot.js), and the hook's record that a fight had been entered
 * lived in memory only: a player at the lair after a reload, a Load or a context-loss resume woke the fight at its saved
 * HP with the whole entrance beat again (the notice, the 220 ms freeze, the shake, the bloom).
 *
 * The store is loaded first and the hook mounted after it, which is the production order (startGame.jsx). The real hook
 * runs to its real arrival poll at the lair. Presence first: a fight never begun still gets its entrance.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh on src/game/bossPersistence.js and src/world/bossSystem.js, receipts in the
 * commit:
 *   E1 the hook's resumeQuietly seeded false again                          -> RED expected
 *   E2 plausible-wrong: only an ACTIVE fight counts as entered               -> RED expected (the suspended one)
 *   E3 plausible-wrong: a health at the tier's maximum counts as entered     -> RED expected (the fresh fight)
 *   E4 a slain dragon counts as entered (bossDefeated not read; the L2 review's M8) -> RED expected (the return)
 *   E0 identity (a comment edit)                                             -> must SURVIVE
 */

const lair = blightHeartSite();
const ENTRANCE_KEY = 'notice.bossAwakens';

const arm = (over) => {
  useGameStore.setState({
    playerPosition: { x: lair.x, y: 40, z: lair.z }, gameWon: false, isCaptureMode: false, gameStarted: false,
    hitstopUntil: 0, bossTier: 0, bossKillNight: 0, nightCount: 0, getMobGroundLevel: null, addNotification: vi.fn(),
    ...over,
  });
};
const keys = () => useGameStore.getState().addNotification.mock.calls.map(([k]) => k);

/** Mount the hook on the loaded store at level 9 and let the 1500 ms arrival poll fire. */
const arrive = () => {
  const r = renderHook(() => useBossSystem(9));
  act(() => { vi.advanceTimersByTime(1600); });
  return r;
};

describe('a fight the save shows entered wakes without the entrance', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  const MAX = bossTierStats(0).health;
  const cases = [
    { label: 'a fight never begun (presence)', state: { bossActive: false, bossHealth: MAX, bossDefeated: false }, entrance: true },
    { label: 'a fight on at its save (active, 210 HP)', state: { bossActive: true, bossHealth: 210, bossDefeated: false }, entrance: false },
    { label: 'a suspended fight (not active, 330 HP: the chunk gave up)', state: { bossActive: false, bossHealth: 330, bossDefeated: false }, entrance: false },
  ];
  for (const c of cases) {
    it(`${c.label}: ${c.entrance ? 'the entrance plays' : 'no notice, no freeze'}, and the fight is on`, () => {
      arm(c.state);
      const r = arrive();
      expect(r.result.current.bossActive, 'the dragon did not wake at the lair').toBe(true);
      expect(r.result.current.bossHealth, 'the wake changed the saved health').toBe(c.state.bossHealth);
      expect(keys().includes(ENTRANCE_KEY), `notices ${JSON.stringify(keys())}`).toBe(c.entrance);
      expect(useGameStore.getState().hitstopUntil > 0, 'the freeze').toBe(c.entrance);
    });
  }
});

describe('a slain dragon\'s return keeps its entrance (item 202: only a fight entered and not won is quiet)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('a won world loaded before the hook, its tier-1 return due: the return wakes with the notice and the freeze', () => {
    arm({ gameWon: true, bossTier: 1, bossDefeated: true, bossHealth: 0, bossActive: false, bossKillNight: 3, nightCount: 6 });
    const r = arrive();
    // PRESENCE: the return is due and announced, so its wake is the subject, not a dragon that never came.
    expect(keys(), 'the return was never announced (not due?)').toContain('notice.bossReturns');
    expect(r.result.current.bossActive, 'the return did not wake at the lair').toBe(true);
    expect(keys().includes(ENTRANCE_KEY), `the due return woke without its entrance: ${JSON.stringify(keys())}`).toBe(true);
    expect(useGameStore.getState().hitstopUntil > 0, 'the return woke without the entrance freeze').toBe(true);
  });
});
