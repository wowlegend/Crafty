// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import { useBossSystem } from '../../src/world/bossSystem';
import { useGameStore } from '../../src/store/useGameStore';
import { blightHeartSite } from '../../src/world/blightHeart';
import { ENTRANCE } from '../../src/game/bossEntrance';

// E-ter/E4 — the dragon's ARRIVAL is the climax of the run and fired a text notification and nothing else,
// while the KILL fires eight isolated effects including hitstop and a bloom spike.
//
// Drives the REAL hook to the REAL spawn condition (level 5 + standing at the lair) and reads the store,
// because the pure beat passing proves only that a list is well-formed, not that the spawn path runs it.

const lair = blightHeartSite();
const atLair = { x: lair.x, y: 40, z: lair.z };

const arm = (over = {}) => {
  useGameStore.setState({
    playerPosition: atLair, gameWon: false, isCaptureMode: false,
    hitstopUntil: 0, screenShake: 0, bloomSpikeUntil: 0,
    bossHealth: 700, bossActive: false, bossDefeated: false,
    unlockedTalents: {}, getMobGroundLevel: null,
    ...over,
  });
};

/** Mount at level 9 and let the 1500ms arrival poll fire once. */
const spawn = () => {
  const r = renderHook(() => useBossSystem(9));
  act(() => { vi.advanceTimersByTime(1600); });
  return r;
};

describe('E4 — arriving at the lair lands a beat, not just a toast', () => {
  beforeEach(() => { vi.useFakeTimers(); arm(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('still announces the dragon — the message is the load-bearing effect', () => {
    const { result } = spawn();
    expect(result.current.bossNotification).toMatch(/Shadow Dragon awakens/);
  });

  it('FREEZES on arrival — the entrance had no hitstop at all', () => {
    const before = useGameStore.getState().hitstopUntil;
    spawn();
    expect(useGameStore.getState().hitstopUntil).toBeGreaterThan(before);
  });

  it('SHAKES the screen', () => {
    spawn();
    expect(useGameStore.getState().screenShake).toBeCloseTo(ENTRANCE.shake, 5);
  });

  it('SPIKES the bloom as the lair wakes', () => {
    const before = useGameStore.getState().bloomSpikeUntil;
    spawn();
    expect(useGameStore.getState().bloomSpikeUntil).toBeGreaterThan(before);
  });

  it('snaps the danger mood — this part ALREADY worked and must not regress', () => {
    // The registry listed "no mood snap" among the gaps; bossSystem's A5 bridge has driven dangerLevel off
    // bossActive all along. Asserted so the correction stays true rather than being re-broken.
    spawn();
    expect(useGameStore.getState().dangerLevel).toBe(2);
  });

  it('clears the shake shortly after, so the world does not judder forever', () => {
    spawn();
    act(() => { vi.advanceTimersByTime(ENTRANCE.shakeClearMs + 50); });
    expect(useGameStore.getState().screenShake).toBe(0);
  });
});

describe('E4 — the beat is suppressed where it would do harm', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('fires NOTHING physical in capture mode — the visual gate has a boss state', () => {
    // A bloom spike or shake at spawn would make those frames non-deterministic. Same guard the A5
    // dangerLevel bridge already uses.
    arm({ isCaptureMode: true });
    const { result } = spawn();
    expect(useGameStore.getState().hitstopUntil).toBe(0);
    expect(useGameStore.getState().screenShake).toBe(0);
    expect(useGameStore.getState().bloomSpikeUntil).toBe(0);
    // ...but the player is still told what happened.
    expect(result.current.bossNotification).toMatch(/Shadow Dragon awakens/);
  });

  it('does not fire at all while the player is far from the lair', () => {
    arm({ playerPosition: { x: lair.x + 500, y: 40, z: lair.z + 500 } });
    const { result } = spawn();
    expect(result.current.bossNotification).toBeNull();
    expect(useGameStore.getState().hitstopUntil).toBe(0);
  });

  it('does not fire in a game that has already been won', () => {
    arm({ gameWon: true });
    spawn();
    expect(useGameStore.getState().hitstopUntil).toBe(0);
  });
});
