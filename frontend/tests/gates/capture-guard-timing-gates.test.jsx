// @vitest-environment jsdom
//
// A CAPTURE GUARD EVALUATED AT SETUP TIME IS ALWAYS FALSE.
//
// The harness calls `enterCapture` AFTER the app has booted and the test bridge reports ready. So any
// `if (isCaptureMode()) return;` written as the first statement of a `useEffect` with `[]` deps runs
// exactly once, at mount, when the flag is still false — and the interval it was meant to suppress then
// runs unguarded for the entire capture session. The guard reads as protection and is a no-op.
//
// AGENTS.md already carries the shape of this rule ("the check must live INSIDE the callback, since the
// flag flips after mount"), and the 2026-08-09 audit still found several sites violating it. So this is a
// behavioural gate over the CLASS: mount with capture off, flip it on the way the harness does, run the
// timers, and assert the guarded work stops.
//
// It also covers the INVERSE mistake, which is subtler and worse. SpawnerSystem implemented its guard as
// `clearInterval(...)` — a teardown, not a skip. That interval is the sole caller of the one-shot hub-NPC
// bootstrap and its effect deps are `[]`, so nothing ever remounts it: entering capture once destroyed
// the spawner for the rest of the session, in normal gameplay too if capture were ever toggled.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import { enterCaptureMode, exitCaptureMode } from '../../src/devtest/captureMode.js';
import { isCaptureMode as capturedFlag } from '../../src/devtest/captureMode.js';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { HALF_CYCLE_UNITS } from '../../src/game/dayNight.js';
import { isDuskApproaching } from '../../src/game/dayPhase.js';
import { ecs, mobsQuery } from '../../src/ecs/world.js';

// Derived from the live seam rather than retyped: a hardcoded constant here would keep passing after
// someone re-tuned the dusk lead fraction, and the test would silently stop entering the window at all.
const DUSK_TIME = (() => {
  for (let f = 0.99; f > 0.5; f -= 0.005) {
    const t = HALF_CYCLE_UNITS * f;
    if (isDuskApproaching(t, true)) return t;
  }
  throw new Error('no dusk time found — the seam changed and this gate can no longer enter the window');
})();

describe('DuskWarning — the guard must be inside the interval, not at setup', () => {
  let warns;
  beforeEach(() => {
    vi.useFakeTimers();
    warns = [];
    exitCaptureMode();
    useGameStore.setState({ gameTime: DUSK_TIME, isDay: true, addNotification: (m, k) => warns.push([m, k]) });
  });
  afterEach(() => {
    cleanup();
    exitCaptureMode();
    vi.useRealTimers();
  });

  it('POSITIVE CONTROL — with capture off it does warn', async () => {
    // Without this, every "did not warn" below is indistinguishable from a component that never armed,
    // never mounted, or whose dusk window this test failed to enter.
    const { default: DuskWarning } = await import('../../src/ui/DuskWarning.jsx');
    const { render } = await import('@testing-library/react');
    render(<DuskWarning />);
    act(() => { vi.advanceTimersByTime(1100); });
    expect(warns.length, 'the control never fired — nothing below is meaningful').toBe(1);
  });

  it('stops warning once capture is entered AFTER mount — the real sequence', async () => {
    const { default: DuskWarning } = await import('../../src/ui/DuskWarning.jsx');
    const { render } = await import('@testing-library/react');
    render(<DuskWarning />);
    // The harness flips the flag here: after boot, after mount. A setup-time guard has already run.
    act(() => { enterCaptureMode(); });
    act(() => { vi.advanceTimersByTime(3100); });
    expect(
      warns.length,
      'a dusk notification fired during capture — the guard ran at setup, when the flag was still false'
    ).toBe(0);
  });
});

describe('the quest chest spawner — same setup-time guard, same failure', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    exitCaptureMode();
    useGameStore.setState({
      playerPosition: { x: 0, y: 60, z: 0 },
      getMobGroundLevel: () => 64,
      addNotification: () => {},
    });
  });
  afterEach(() => {
    cleanup();
    exitCaptureMode();
    vi.useRealTimers();
  });

  it('POSITIVE CONTROL — with capture off the periodic spawner adds chests', async () => {
    const { useTreasureChests } = await import('../../src/QuestSystem.jsx');
    const { result } = renderHook(() => useTreasureChests());
    const initial = result.current.chests.length;
    act(() => { vi.advanceTimersByTime(31000); });
    expect(result.current.chests.length, 'the spawner never ran — the control is dead').toBeGreaterThan(initial);
  });

  it('adds no chests once capture is entered after mount', async () => {
    const { useTreasureChests } = await import('../../src/QuestSystem.jsx');
    const { result } = renderHook(() => useTreasureChests());
    const atCapture = result.current.chests.length;
    act(() => { enterCaptureMode(); });
    act(() => { vi.advanceTimersByTime(91000); }); // three full spawner periods
    expect(
      result.current.chests.length,
      'chests spawned during capture — the guard ran at setup and the interval ran unguarded'
    ).toBe(atCapture);
  });
});

vi.mock('@react-three/fiber', () => ({
  useFrame: () => {},
  useThree: () => ({ camera: { position: { x: 0, y: 60, z: 0 } } }),
}));

describe('SpawnerSystem — a capture guard must SKIP a tick, never tear the interval down', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    exitCaptureMode();
    ecs.clear?.();
    useGameStore.setState({
      getMobGroundLevel: () => 64,
      getGeneratedChunks: () => new Set(['0_0']),
      isSpawnChunkLoaded: true,
    });
  });
  afterEach(() => {
    cleanup();
    exitCaptureMode();
    vi.useRealTimers();
  });

  const mobCount = () => [...mobsQuery].length;

  it('POSITIVE CONTROL — with capture off the bootstrap spawns', async () => {
    const { SpawnerSystem } = await import('../../src/systems/SpawnerSystem.jsx');
    const { render } = await import('@testing-library/react');
    render(<SpawnerSystem />);
    act(() => { vi.advanceTimersByTime(600); });
    expect(mobCount(), 'nothing spawned — the control is dead and the assertions below mean nothing').toBeGreaterThan(0);
  });

  it('entering capture must not DESTROY the spawner — it resumes afterwards', async () => {
    // The inverse mistake, and the more damaging one. Implemented as clearInterval, entering capture
    // permanently kills the interval that is the sole caller of the one-shot hub-NPC bootstrap. Effect
    // deps are [] so nothing ever remounts it: the NPCs never arrive for the rest of the session.
    const { SpawnerSystem } = await import('../../src/systems/SpawnerSystem.jsx');
    const { render } = await import('@testing-library/react');
    enterCaptureMode();
    render(<SpawnerSystem />);
    act(() => { vi.advanceTimersByTime(2000); }); // four ticks, all suppressed
    expect(mobCount(), 'spawned during capture').toBe(0);

    exitCaptureMode();
    act(() => { vi.advanceTimersByTime(600); });
    expect(
      mobCount(),
      'the spawner did not resume after capture — the guard tore the interval down instead of skipping a tick'
    ).toBeGreaterThan(0);
  });
});

// settingsPersist — the SAME setup-time-guard class, in the file whose own header claims the opposite.
//
// `initSettingsPersistence` checks `isCapture()` once, at boot, and returns a no-op if it is true. But the
// harness enters capture AFTER boot, so that check can only ever answer "we are not in capture" — the one
// answer it never needed. The subscriber it installs then persists every dial change for the whole capture
// session, while the file's header states "under the visual harness this is a no-op so baselines stay
// deterministic". The claim was false in exactly the situation it was written about.
//
// This became more load-bearing on 2026-08-11: the call was moved out of the DEV-only effect onto the
// production boot path, so it now runs everywhere rather than only in DEV builds.
describe('settingsPersist — the capture check must be inside the subscriber', () => {
  const fakeStorage = () => {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
      get size() { return m.size; },
    };
  };

  beforeEach(() => { exitCaptureMode(); });
  afterEach(() => { exitCaptureMode(); });

  it('POSITIVE CONTROL — outside capture, a dial change IS persisted', async () => {
    const { initSettingsPersistence } = await import('../../src/game/settingsPersist.js');
    const storage = fakeStorage();
    const unsub = initSettingsPersistence(useGameStore, () => false, storage);
    act(() => { useGameStore.getState().setSfxVolume(0.33); });
    expect(storage.size, 'nothing was written outside capture — the control is dead').toBeGreaterThan(0);
    unsub();
  });

  it('writes NOTHING once capture is entered after boot', async () => {
    const { initSettingsPersistence } = await import('../../src/game/settingsPersist.js');
    const storage = fakeStorage();
    // Boot outside capture, exactly as the app does.
    const unsub = initSettingsPersistence(useGameStore, () => require_isCapture(), storage);
    act(() => { enterCaptureMode(); });
    act(() => { useGameStore.getState().setSfxVolume(0.77); });
    expect(
      storage.size,
      'the visual harness wrote to storage during capture — the header claims it cannot'
    ).toBe(0);
    unsub();
  });

  it('does not advance its baseline while suppressed, so a post-capture change still persists', async () => {
    // Asserts the property that matters: suppression must not LATCH. A guard that stopped writes during
    // capture and never resumed would pass the test above and silently break persistence for the rest of
    // the session. (This test was originally justified as proving the check must sit BEFORE the
    // sameSettings comparison — a mutation moving it after stayed green, and no failing sequence could be
    // constructed, so that claim was withdrawn rather than dressed up with a stronger-looking assertion.)
    const { initSettingsPersistence } = await import('../../src/game/settingsPersist.js');
    const storage = fakeStorage();
    const unsub = initSettingsPersistence(useGameStore, () => require_isCapture(), storage);
    act(() => { enterCaptureMode(); });
    act(() => { useGameStore.getState().setSfxVolume(0.61); });
    expect(storage.size).toBe(0);
    act(() => { exitCaptureMode(); });
    act(() => { useGameStore.getState().setSfxVolume(0.62); });
    expect(storage.size, 'the baseline advanced under capture, so later changes look like no change').toBeGreaterThan(0);
    unsub();
  });
});

// Reads the live capture flag, so the injected predicate matches what the app passes (isCaptureMode itself).
function require_isCapture() {
  return capturedFlag();
}
