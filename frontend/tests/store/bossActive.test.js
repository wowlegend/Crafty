import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';

// bossActive is written with the rest of the encounter, by setBossEncounter (world/bossSystem.js writes the fight
// through it, keeping no copy) and by a load: the setBossActive setter and the isBossActive() reader that mirrored it
// had no caller left once the store owned the encounter, and were deleted (DECISIONS 2026-10-31 item 291).
describe('store bossActive', () => {
  const write = (active) => {
    const s = useGameStore.getState();
    s.setBossEncounter({ health: s.bossHealth, active, defeated: s.bossDefeated });
  };
  beforeEach(() => write(false));

  it('defaults to a boolean false (not undefined)', () => {
    // Fresh store state must expose a real boolean, since SoundManager gates
    // boss music on `state.bossActive` truthiness.
    //
    // READ THE DECLARED INITIAL STATE, NOT THE ONE beforeEach JUST SET: reading back the test's own write would pass
    // with a declared default of `undefined`, the value the test name exists to rule out.
    expect(useGameStore.getInitialState().bossActive).toBe(false);
  });

  it('the encounter write flips the stored value to true and back', () => {
    write(true);
    expect(useGameStore.getState().bossActive).toBe(true);
    write(false);
    expect(useGameStore.getState().bossActive).toBe(false);
  });

  it('coerces truthy/falsy inputs to a real boolean', () => {
    write(1);
    expect(useGameStore.getState().bossActive).toBe(true);
    write(0);
    expect(useGameStore.getState().bossActive).toBe(false);
  });
});
