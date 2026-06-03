import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { buildSaveData } from '../../src/game/saveSchema.js';

// Bug-fix gate: `setGameTime` must flip `isDay` on a half-cycle BOUNDARY CROSSING,
// not only on an exact `gameTime % 600 === 0` landing. A save resumed at a
// non-aligned `gameTime` (e.g. 437) stepping by a fixed amount (4) never hits the
// exact multiple, so under the OLD exact-landing logic night never arrives. This
// test is RED against that logic and GREEN once the crossing-fix lands.
describe('useGameStore.setGameTime — half-cycle crossing flip (non-aligned start)', () => {
  beforeEach(() => {
    // Reset DIRECTLY (bypass setGameTime's crossing side-effect, which would flip isDay
    // when a prior test left gameTime in an odd half-cycle bucket) so the reset is
    // order-independent and cannot leak state between tests.
    useGameStore.setState({ gameTime: 0, isDay: true });
  });

  it('flips isDay exactly when a +4 step first crosses 600 from a non-aligned start (437), not before', () => {
    const { setGameTime } = useGameStore.getState();
    setGameTime(437);
    expect(useGameStore.getState().isDay).toBe(true);

    // Step by 4 toward the boundary. 437 + 4k lands on 597 (<600) then 601 (>=600).
    let flippedAt = null;
    let t = 437;
    while (t < 620) {
      setGameTime((prev) => prev + 4);
      t += 4;
      if (useGameStore.getState().isDay === false && flippedAt === null) {
        flippedAt = t;
      }
    }

    // The flip must occur exactly once, at the first step landing >= 600 (601),
    // and the final phase must be night.
    expect(flippedAt).toBe(601);
    expect(useGameStore.getState().isDay).toBe(false);
  });

  it('flips on a multi-step jump that skips the exact multiple (580 -> 640)', () => {
    const { setGameTime } = useGameStore.getState();
    setGameTime(580);
    expect(useGameStore.getState().isDay).toBe(true);
    setGameTime(640);
    expect(useGameStore.getState().isDay).toBe(false);
  });

  it('does NOT flip when a step stays within the same half (100 -> 200)', () => {
    const { setGameTime } = useGameStore.getState();
    setGameTime(100);
    const before = useGameStore.getState().isDay;
    setGameTime(200);
    expect(useGameStore.getState().isDay).toBe(before);
  });

  it('still flips on the aligned integer ticker landing (behavior parity at exact 600)', () => {
    const { setGameTime } = useGameStore.getState();
    setGameTime(596);
    expect(useGameStore.getState().isDay).toBe(true);
    setGameTime(600);
    expect(useGameStore.getState().isDay).toBe(false);
  });
});

// On load, isDay is DERIVED from the restored gameTime (isDayAtUnit) so a resumed save
// is always phase-consistent — the clock is authoritative; a stale saved isDay (e.g.
// left by a manual Settings toggle) is reconciled rather than restored inconsistently.
describe('useGameStore.loadWorldData — isDay reconciled to the restored gameTime', () => {
  beforeEach(() => {
    useGameStore.setState({ gameTime: 0, isDay: true });
  });

  it('derives isDay=night when the restored gameTime is in a night half (700), overriding a stale isDay=true', () => {
    const save = buildSaveData(useGameStore.getState(), { position: [0, 0, 0] });
    save.game_state = { ...save.game_state, gameTime: 700, isDay: true };
    useGameStore.getState().loadWorldData(save);
    expect(useGameStore.getState().gameTime).toBe(700);
    expect(useGameStore.getState().isDay).toBe(false); // isDayAtUnit(700) = night
  });

  it('derives isDay=day when the restored gameTime is in a day half (300), overriding a stale isDay=false', () => {
    const save = buildSaveData(useGameStore.getState(), { position: [0, 0, 0] });
    save.game_state = { ...save.game_state, gameTime: 300, isDay: false };
    useGameStore.getState().loadWorldData(save);
    expect(useGameStore.getState().isDay).toBe(true); // isDayAtUnit(300) = day
  });
});
