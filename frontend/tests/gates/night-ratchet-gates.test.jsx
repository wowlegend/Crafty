// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSurvivalMode } from '../../src/world/survivalSystem';
import { useGameStore } from '../../src/store/useGameStore';
import { buildSaveData } from '../../src/game/saveSchema';

// B2f — RESUMING A NIGHT SAVE SILENTLY ADDED A NIGHT TO THE SIEGE, AND IT RATCHETED EVERY RELOAD.
// (18-domain review, CRITICAL. NOT closed by B2b — B2b fixed gameTime persistence + isDay derivation,
//  which is exactly what flips isDay true->false on a night load and TRIPPED this hook.)
//
// The survival hook watched a reactive isDay edge and called incrementNight() on every day->night edge.
// But isDay is derived from gameTime and is ALSO written DIRECTLY (not via a clock tick) by loadWorldData
// (isDayAtUnit) and setTimeOfDay. The hook could not tell a genuine half-cycle crossing from a LOAD: play
// in day, click Load on a night save -> loadWorldData sets isDay=false -> the hook fired incrementNight()
// -> the saved nightCount (3) became 4. The autosave persisted 4; the next resume made it 5, then 6...
//
// FIX: the siege night-count advances as a consequence of the CLOCK CROSSING — the ONE canonical writer
// (setGameTime, via the pure crossedIntoNight) — never off a reactive isDay edge. A load sets isDay
// directly (no crossing), so it can no longer advance the siege. The hook stops mutating persisted state.
//
// MUTATION-PROOF: re-add `useGameStore.getState().incrementNight()` to the hook's nightfall branch (restore
// the double-writer — incrementNight is gone, so use a raw setState bump) -> "THE BUG" + "THE RATCHET" go
// RED. Or delete the crossedIntoNight bump from setGameTime -> "the CLOCK is the single writer" + "the
// siege STILL advances" go RED.

const POS = { position: { x: 0, y: 18, z: 0 } };

const freshDaySession = () =>
  useGameStore.setState({ nightCount: 0, lastRewardedNight: 0, gameTime: 0, isDay: true });

// A save authored at NIGHT: gameTime 700 -> isDayAtUnit(700) === false, on night 3.
const buildNightSave = () => {
  useGameStore.setState({ nightCount: 3, lastRewardedNight: 3, gameTime: 700, isDay: false });
  return buildSaveData(useGameStore.getState(), POS);
};

describe('B2f night-ratchet — the siege advances only on a real clock crossing, never on a load', () => {
  beforeEach(freshDaySession);

  it('the CLOCK is the single writer: advancing gameTime across day->night bumps nightCount once', () => {
    useGameStore.setState({ gameTime: 550, isDay: true, nightCount: 0 });

    act(() => { useGameStore.getState().setGameTime((t) => t + 100); }); // 550 -> 650, crosses INTO night

    expect(useGameStore.getState().isDay).toBe(false);
    expect(useGameStore.getState().gameTime).toBe(650);
    expect(useGameStore.getState().nightCount).toBe(1);

    // ...and a crossing back INTO day does NOT advance the siege (dawn is not a siege night).
    useGameStore.setState({ gameTime: 1150, isDay: false, nightCount: 1 });
    act(() => { useGameStore.getState().setGameTime((t) => t + 100); }); // 1150 -> 1250, crosses INTO day
    expect(useGameStore.getState().isDay).toBe(true);
    expect(useGameStore.getState().nightCount).toBe(1);
  });

  it('THE BUG: resuming a NIGHT save must not add a phantom night', () => {
    const save = buildNightSave();
    freshDaySession(); // production mount order: the game is in DAY when the player clicks Load

    const { rerender } = renderHook(({ d }) => useSurvivalMode(d), { initialProps: { d: true } });

    act(() => { useGameStore.getState().loadWorldData(save); });
    rerender({ d: useGameStore.getState().isDay }); // App re-renders the hook with the loaded isDay (false)

    expect(useGameStore.getState().isDay).toBe(false);  // it IS a night save
    expect(useGameStore.getState().nightCount).toBe(3); // RED before the fix: was 4 (phantom +1)
  });

  it('THE RATCHET: repeated resume -> autosave -> resume never compounds the siege', () => {
    let save = buildNightSave();

    for (let i = 0; i < 3; i++) {
      freshDaySession();
      const { rerender, unmount } = renderHook(({ d }) => useSurvivalMode(d), { initialProps: { d: true } });
      act(() => { useGameStore.getState().loadWorldData(save); });
      rerender({ d: useGameStore.getState().isDay });
      unmount();
      save = buildSaveData(useGameStore.getState(), POS); // the autosave writes back whatever nightCount is now
    }

    expect(useGameStore.getState().nightCount).toBe(3); // RED before the fix: 6 after three resumes
  });

  it('the siege STILL advances on a genuine nightfall through the real hook path (no over-correction)', () => {
    // Green before AND after the fix — guards against "fixing" the ratchet by deleting the increment.
    useGameStore.setState({ gameTime: 550, isDay: true, nightCount: 0 });
    const { rerender } = renderHook(({ d }) => useSurvivalMode(d), { initialProps: { d: true } });

    act(() => { useGameStore.getState().setGameTime((t) => t + 100); }); // real clock crossing into night
    rerender({ d: useGameStore.getState().isDay });

    expect(useGameStore.getState().isDay).toBe(false);
    expect(useGameStore.getState().nightCount).toBe(1); // the first siege begins
  });
});
