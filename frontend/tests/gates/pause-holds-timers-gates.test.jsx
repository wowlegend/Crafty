// @vitest-environment jsdom
//
// EVERY GAMEPLAY TIMER HOLDS WHILE THE WORLD IS HELD.
//
// The frame-driven world stops through worldDelta (game/worldClock.js), but a good part of the game advances on
// setInterval ticks and wall-clock throttles that no frame scale reaches: the spawner, the dragon's arrival poll, the
// quest chests and the shrine quest, mana regeneration. Each one now asks the world clock before it acts. This drives
// each through its real hook or component against the real store and input gate, the way a player pauses: play is
// running, then the input gate goes dead after mount (ESC, a panel, the touch Pause all land there). Each case first
// shows the timer working while play runs, so "nothing happened while paused" cannot be a timer that never armed,
// and then shows it working again on resume, so the hold cannot be a timer the pause tore down.
//
// It also holds the hunger interval's deletion: nothing drains hunger over a session long enough to have starved the
// player before (100 hunger at 0.1 per 5 s ran out after 83.3 minutes).
//
// Mutation-Proof: in commit trailers, not here (DECISIONS 2026-10-28 15c).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, render, cleanup, act } from '@testing-library/react';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { setActive } from '../../src/input/inputState.js';
import { exitCaptureMode } from '../../src/devtest/captureMode.js';
import { tickWorldClock } from '../../src/game/worldClock.js';
import { nearestLandmark } from '../../src/world/shrines.js';
import { blightHeartSite } from '../../src/world/blightHeart.js';
import { BOSS_BASE_LEVEL, bossTierStats } from '../../src/game/bossTier.js';
import { ecs, mobsQuery } from '../../src/ecs/world.js';

const frameLoops = vi.hoisted(() => []);
vi.mock('@react-three/fiber', () => ({
  useFrame: (cb) => { frameLoops.push(cb); },
  useThree: () => ({ camera: { position: { x: 0, y: 60, z: 0 } } }),
}));

const play = () => { useGameStore.setState({ gameStarted: true, isAlive: true }); setActive(true); };
const pause = () => setActive(false);
const advance = (ms) => act(() => { vi.advanceTimersByTime(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  exitCaptureMode();
  useGameStore.setState({ hitstopUntil: 0, hitstopStart: 0, hitstopFrozenTotal: 0, addNotification: () => {} });
  play();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setActive(false);
  useGameStore.setState({ gameStarted: false });
});

describe('the quest chests and the shrine quest', () => {
  // The nearest shrine to the origin, read from the live landmark hash rather than retyped.
  const shrine = nearestLandmark(0, 0);
  beforeEach(() => useGameStore.setState({ getMobGroundLevel: () => 64, shrineReached: false }));

  it('the periodic chest spawner adds none while paused, and adds again on resume', async () => {
    useGameStore.setState({ playerPosition: { x: shrine.worldX + 200, y: 60, z: shrine.worldZ + 200 } });
    const { useTreasureChests } = await import('../../src/QuestSystem.jsx');
    const { result } = renderHook(() => useTreasureChests());
    const start = result.current.chests.length;
    advance(31000);
    const running = result.current.chests.length;
    expect(running, 'the spawner never ran in play — nothing below is meaningful').toBeGreaterThan(start);
    pause();
    advance(91000);
    expect(result.current.chests.length, 'chests spawned while the game was paused').toBe(running);
    play();
    advance(31000);
    expect(result.current.chests.length, 'the spawner did not run again after the resume').toBeGreaterThan(running);
  });

  it('the shrine reward chest waits for the resume', async () => {
    useGameStore.setState({ playerPosition: { x: shrine.worldX, y: 60, z: shrine.worldZ } });
    const { useTreasureChests } = await import('../../src/QuestSystem.jsx');
    const { result } = renderHook(() => useTreasureChests());
    pause();
    advance(9100);
    const shrineChests = () => result.current.chests.filter((c) => c.shrine).length;
    expect(shrineChests(), 'the shrine chest spawned while the game was paused').toBe(0);
    play();
    advance(3100);
    expect(shrineChests(), 'the shrine chest never spawned after the resume').toBe(1);
  });

  it('reaching a shrine does not count while paused, and counts on resume', async () => {
    useGameStore.setState({ playerPosition: { x: shrine.worldX, y: 60, z: shrine.worldZ } });
    const { useQuestSystem } = await import('../../src/QuestSystem.jsx');
    renderHook(() => useQuestSystem());
    pause();
    advance(9100);
    expect(useGameStore.getState().shrineReached, 'the shrine counted as reached while the game was paused').toBe(false);
    play();
    advance(3100);
    expect(useGameStore.getState().shrineReached, 'the shrine never counted after the resume').toBe(true);
  });
});

describe('the spawner', () => {
  beforeEach(() => {
    frameLoops.length = 0;
    ecs.clear?.();
    useGameStore.setState({ isDay: true, nightCount: 0, getMobFloor: null, getMobGroundLevel: () => 64 });
  });
  const mobs = () => [...mobsQuery].length;

  it('the opening spawn waits for the resume', async () => {
    useGameStore.setState({ getGeneratedChunks: () => new Set(['0_0']), isSpawnChunkLoaded: true });
    const { SpawnerSystem } = await import('../../src/systems/SpawnerSystem.jsx');
    render(<SpawnerSystem />);
    pause();
    advance(2000);
    expect(mobs(), 'mobs spawned while the game was paused').toBe(0);
    play();
    advance(600);
    expect(mobs(), 'the opening spawn never came after the resume').toBeGreaterThan(0);
  });

  it('the per-frame spawner adds none on a frozen frame, and adds on the next live one', async () => {
    // isSpawnChunkLoaded false keeps the opening spawn out, so only the per-frame spawner can add a mob.
    const ring = ['2_0', '0_2', '-3_0', '0_-3', '2_2', '-3_-3'];
    useGameStore.setState({ getGeneratedChunks: () => new Set(ring), isSpawnChunkLoaded: false });
    const { SpawnerSystem } = await import('../../src/systems/SpawnerSystem.jsx');
    render(<SpawnerSystem />);
    expect(frameLoops.length, 'SpawnerSystem registered no frame loop').toBeGreaterThan(0);
    const loop = frameLoops[frameLoops.length - 1];
    const frame = () => { advance(1100); tickWorldClock(); loop(); };
    pause();
    frame();
    frame();
    expect(mobs(), 'the per-frame spawner added mobs on a frozen frame').toBe(0);
    play();
    frame();
    expect(mobs(), 'the per-frame spawner added nothing after the resume').toBeGreaterThan(0);
  });
});

describe('the dragon', () => {
  it('standing at the lair while paused does not wake it; the resume does', async () => {
    const lair = blightHeartSite();
    useGameStore.setState({
      playerPosition: { x: lair.x, y: 40, z: lair.z }, gameWon: false, isCaptureMode: false, getMobGroundLevel: null,
      bossHealth: bossTierStats(0).health, bossActive: false, bossDefeated: false, bossTier: 0, bossKillNight: 0,
    });
    const { useBossSystem } = await import('../../src/world/bossSystem.js');
    renderHook(() => useBossSystem(BOSS_BASE_LEVEL));
    pause();
    advance(4600);
    expect(useGameStore.getState().bossActive, 'the dragon woke while the game was paused').toBe(false);
    play();
    advance(1600);
    expect(useGameStore.getState().bossActive, 'the dragon never woke after the resume').toBe(true);
  });
});

describe('the player stats provider', () => {
  const Host = async () => {
    const { GameSystemsProvider } = await import('../../src/GameSystems.jsx');
    render(<GameSystemsProvider><div /></GameSystemsProvider>);
  };

  it('mana regenerates in play, holds while paused, and regenerates again on resume', async () => {
    useGameStore.setState({ mana: 0, maxMana: 100 });
    await Host();
    advance(1000);
    expect(useGameStore.getState().mana, 'mana never regenerated in play').toBe(10);
    pause();
    advance(5000);
    expect(useGameStore.getState().mana, 'mana regenerated while the game was paused').toBe(10);
    play();
    advance(1000);
    expect(useGameStore.getState().mana, 'mana did not regenerate after the resume').toBe(20);
  });

  it('84 minutes of play drain no hunger and cost no health', async () => {
    useGameStore.setState({ hunger: 100, playerHealth: 100, maxHealth: 100, mana: 100, maxMana: 100, lastDamageTime: 0, damageLockouts: {} });
    await Host();
    advance(84 * 60 * 1000);
    const s = useGameStore.getState();
    expect({ hunger: s.hunger, health: s.playerHealth }, 'a timer drained hunger and starved the player').toEqual({ hunger: 100, health: 100 });
  });
});
