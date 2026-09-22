// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

/**
 * The day/night clock's three contracts, DRIVEN rather than grepped.
 *
 * CONVERTED 2026-09-22, selected by `gate-census.mjs` which scored this file 0/5. Every assertion was a
 * bare `src.includes('isCaptureMode')` / `includes('getInput')` / `includes('setInterval')` — and the file
 * said so itself: "a bare mention in a comment is allowed so the contract can be documented". So all three
 * were satisfiable by the very comment block describing them. Delete the whole hook body, leave the
 * docblock, and the old gate stayed green.
 *
 * WHAT IS DRIVEN NOW, and why each form is the honest one:
 *
 *   GAME-LOOP ISOLATION is proved by ADVANCING TIMERS and observing a tick. That is stronger than any
 *   grep for `setInterval`, because a useFrame implementation cannot respond to `vi.advanceTimersByTime`
 *   at all — the property is demonstrated by the mechanism rather than asserted about the text.
 *
 *   THE PAUSE GATES are proved by flipping each input and observing that the tick stops. The pure
 *   decision (`shouldAdvanceClock`) is exhaustively unit-tested elsewhere; what was never executed is that
 *   the HOOK reads those gates LIVE each tick rather than capturing them at mount — the producer/consumer
 *   split again, with the producer untested.
 *
 *   CLEANUP is proved by unmounting and advancing time: a leaked interval keeps ticking forever, which on
 *   a hook that writes to the store every second is a real leak and invisible to a source scan.
 *
 * Mutation-Proof: 5 mutations, denominator asserted (6/6 cases collected on every run).
 *   M1 drop the `!isCaptureMode()` gate     -> capture case RED (baselines would stop being byte-stable)
 *   M2 drop the `getInput().active` gate    -> pause case RED (time would run in menus)
 *   M3 read `active` once at mount AND USE that value -> live-read case RED (the stale-capture defect a
 *      grep for `getInput` can never see, since the token is still present). First attempt at this
 *      mutation captured the value and never used it — a no-op that SURVIVED, and the survivor was my
 *      mutation being wrong rather than the gate being weak. A mutation has to change BEHAVIOUR; adding
 *      an unused binding changes only the text.
 *   M4 return undefined instead of clearInterval -> cleanup case RED (a leaked 1Hz store writer)
 *   M5 interval 1000 -> 60000                -> cadence case RED
 * useDayNightClock.js restored from a cp backup and diffed byte-identical after each.
 *
 * BLIND SPOT, stated (R7): this drives the hook in isolation with the store, input and capture flag
 * mocked. It does not prove the hook is MOUNTED by the app — that is one call site, and `runtime-reach`
 * is the instrument that would notice it going unreached.
 */
const setGameTime = vi.fn();
let active = true;
let capture = false;

vi.mock('../../src/store/useGameStore', () => ({
  useGameStore: { getState: () => ({ setGameTime }) },
}));
vi.mock('../../src/input/inputState', () => ({ getInput: () => ({ active }) }));
vi.mock('../../src/devtest/captureMode', () => ({ isCaptureMode: () => capture }));

const { useDayNightClock } = await import('../../src/game/useDayNightClock.js');

const Host = ({ isWorldBuilt = true, isAlive = true }) => {
  useDayNightClock({ isWorldBuilt, isAlive });
  return null;
};

beforeEach(() => { vi.useFakeTimers(); setGameTime.mockClear(); active = true; capture = false; });
afterEach(() => { vi.useRealTimers(); });

describe('day/night clock — pause, determinism and loop isolation, driven', () => {
  it('advances on a TIMER — which is what Game-Loop-Isolation means here', () => {
    // A useFrame implementation cannot respond to advanceTimersByTime at all, so a tick here IS the proof.
    const { unmount } = render(<Host />);
    expect(setGameTime).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(setGameTime).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('ticks once per second, not faster', () => {
    const { unmount } = render(<Host />);
    vi.advanceTimersByTime(3000);
    expect(setGameTime).toHaveBeenCalledTimes(3); // cadence, not merely "it ticked"
    unmount();
  });

  it('PAUSES in capture mode — the determinism contract the visual oracle depends on', () => {
    const live = render(<Host />);
    vi.advanceTimersByTime(1000);
    expect(setGameTime).toHaveBeenCalledTimes(1); // presence first: the harness can see a tick
    live.unmount();

    setGameTime.mockClear();
    capture = true;
    const { unmount } = render(<Host />);
    vi.advanceTimersByTime(5000);
    expect(setGameTime).not.toHaveBeenCalled();
    unmount();
  });

  it('PAUSES when input is not active — time stops in menus and at click-to-play', () => {
    active = false;
    const { unmount } = render(<Host />);
    vi.advanceTimersByTime(5000);
    expect(setGameTime).not.toHaveBeenCalled();
    unmount();
  });

  it('reads the gates LIVE each tick, not once at mount', () => {
    // The defect a grep for `getInput` cannot see: the token stays present either way. Flip the gate
    // AFTER mount and the next tick must respect it.
    const { unmount } = render(<Host />);
    vi.advanceTimersByTime(1000);
    expect(setGameTime).toHaveBeenCalledTimes(1);
    active = false;
    vi.advanceTimersByTime(5000);
    expect(setGameTime).toHaveBeenCalledTimes(1); // no further ticks
    active = true;
    vi.advanceTimersByTime(1000);
    expect(setGameTime).toHaveBeenCalledTimes(2); // and it resumes
    unmount();
  });

  it('clears its interval on unmount — a leaked 1Hz store writer is invisible to a source scan', () => {
    const { unmount } = render(<Host />);
    vi.advanceTimersByTime(1000);
    expect(setGameTime).toHaveBeenCalledTimes(1);
    unmount();
    vi.advanceTimersByTime(10000);
    expect(setGameTime).toHaveBeenCalledTimes(1);
  });
});
