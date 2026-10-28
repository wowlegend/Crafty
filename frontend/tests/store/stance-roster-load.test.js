// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

// The stance derives its caps from the roster when its module loads, and refuses a roster whose slowest pursuer would
// make the backpedal a crawl (game/combatStance.js deriveStanceCaps). That refusal must stay the stance's: the store
// is what the menus, the saves and every panel read, so a roster mistake that took the store with it would boot the
// game to a blank page. A husk-shaped pursuer at speed 1.0 pursues at 1.5 m/s, a retreat cap of 0.5, under the floor.
vi.mock('../../src/game/mobTypes.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, MOB_TYPES: { ...real.MOB_TYPES, crawler: { ...real.MOB_TYPES.zombie, speed: 1.0 } } };
});

describe('a roster the stance refuses', () => {
  it('fails the stance module and leaves the store loadable', async () => {
    await expect(import('../../src/game/combatStance.js'), 'SETUP: the mocked roster did not break RETREAT_FLOOR').rejects.toThrow(/RETREAT_FLOOR/);
    const { useGameStore } = await import('../../src/store/useGameStore.jsx');
    expect(typeof useGameStore.getState().loadWorldData, 'the store did not load').toBe('function');
  });
});
