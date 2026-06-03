import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';

// Bug-fix gate: `setGameTime` must flip `isDay` on a half-cycle BOUNDARY CROSSING,
// not only on an exact `gameTime % 600 === 0` landing. A save resumed at a
// non-aligned `gameTime` (e.g. 437) stepping by a fixed amount (4) never hits the
// exact multiple, so under the OLD exact-landing logic night never arrives. This
// test is RED against that logic and GREEN once the crossing-fix lands.
describe('useGameStore.setGameTime — half-cycle crossing flip (non-aligned start)', () => {
  beforeEach(() => {
    useGameStore.getState().setGameTime(0);
    useGameStore.getState().setIsDay(true);
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
