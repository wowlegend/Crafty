import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';

// TOGGLING MACOS REDUCE MOTION ON AND OFF SET YOUR JUICE DIAL TO 100%.
//
// The OS listener called setJuiceIntensity(motionIntensity(matches, 1)) -- a LITERAL 1 -- and the change
// listener is unconditional, so it fires on OFF as well as ON. A player who chose 40% and toggled the OS
// preference on and then off ended at 100%, PERSISTED, with no way to recover the 40% but to re-drag the
// slider.
//
// The obvious fix is worse than the bug: passing the live juiceIntensity back in would latch at 0
// forever, because the ON transition had already destroyed that very field. There was no slot to restore
// FROM, which is why this needed a second field rather than a different argument.
const S = () => useGameStore.getState();

describe('reduced motion restores the player choice, not a hardcoded 1', () => {
  beforeEach(() => useGameStore.setState({ juiceIntensity: 1, juiceIntensityChoice: 1 }));

  it('an ON then OFF cycle returns the dial to what the player chose', () => {
    S().setJuiceIntensity(0.4);
    S().applyReducedMotion(true);
    expect(S().juiceIntensity, 'reduced motion did not silence the juice').toBe(0);
    S().applyReducedMotion(false);
    expect(S().juiceIntensity, 'the OS toggle overwrote the player choice').toBeCloseTo(0.4, 10);
  });

  it('survives repeated cycles — the failure was cumulative, not one-shot', () => {
    S().setJuiceIntensity(0.25);
    for (let i = 0; i < 5; i++) { S().applyReducedMotion(true); S().applyReducedMotion(false); }
    expect(S().juiceIntensity).toBeCloseTo(0.25, 10);
  });

  it('a choice made WHILE reduced motion is on is remembered for when it goes off', () => {
    S().applyReducedMotion(true);
    S().setJuiceIntensity(0.6); // the player drags the slider anyway
    S().applyReducedMotion(false);
    expect(S().juiceIntensity).toBeCloseTo(0.6, 10);
  });

  it('the player choice is what persists, not the OS-forced value', () => {
    // Persisting the effective value would write an OS-forced 0 into the player's own setting, and they
    // would find their dial at zero next session with the OS preference long since turned off.
    S().setJuiceIntensity(0.4);
    S().applyReducedMotion(true);
    expect(S().juiceIntensityChoice, 'the OS preference overwrote the persisted choice').toBeCloseTo(0.4, 10);
  });

  it('a choice of 0 is a real choice, not a missing one', () => {
    S().setJuiceIntensity(0);
    S().applyReducedMotion(true);
    S().applyReducedMotion(false);
    expect(S().juiceIntensity, 'a deliberate 0 was restored to 1').toBe(0);
  });

  it('clamps whatever it is handed', () => {
    S().setJuiceIntensity(5);
    expect(S().juiceIntensityChoice).toBe(1);
    S().setJuiceIntensity(-2);
    expect(S().juiceIntensityChoice).toBe(0);
  });
});
