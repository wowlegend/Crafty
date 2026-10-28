// @vitest-environment jsdom
import { describe, it, expect, vi, afterAll } from 'vitest';

// A roster tuning mistake must never blank the app. The stance derives its caps from the roster when its module
// loads (game/combatStance.js deriveStanceCaps), and that module is on App's import chain (App.jsx imports it directly
// and through GameScene -> Components), so a throw there boots the game to a blank page. A husk-shaped pursuer at speed 1.0
// pursues at 1.5 m/s, a retreat cap of 0.5, under RETREAT_FLOOR: the stance must load, hold the retreat at the floor
// and name the mob. tests/gates/stance-roster-gates.test.js is what refuses such a roster before it ships.
//
// The store is imported FIRST: combatStance.js imports worldClock.js, which imports the store, so importing the stance
// first would load the store inside the stance's own import and hide a store that needs the stance to load.
vi.mock('../../src/game/mobTypes.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, MOB_TYPES: { ...real.MOB_TYPES, crawler: { ...real.MOB_TYPES.zombie, speed: 1.0 } } };
});

// The AI system constructs its worker when App's tree is imported; jsdom has no Worker.
vi.stubGlobal('Worker', class { postMessage() {} addEventListener() {} removeEventListener() {} terminate() {} });
const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
afterAll(() => { consoleError.mockRestore(); vi.unstubAllGlobals(); });

describe('a roster that breaks the stance\'s floor', () => {
  it('still loads the store, the stance and App, and the stance walks at the clamped caps', async () => {
    const { useGameStore } = await import('../../src/store/useGameStore.jsx');
    expect(typeof useGameStore.getState().loadWorldData, 'the store did not load').toBe('function');

    const stance = await import('../../src/game/combatStance.js');
    expect(stance.STANCE_ROSTER_VIOLATION, 'SETUP: the mocked roster did not break RETREAT_FLOOR').toMatch(/crawler pursues at 1\.5\) is under RETREAT_FLOOR/);
    expect(stance.STANCE_CAPS.slowest, 'SETUP: the caps were not read from the mocked roster').toBe('crawler');
    expect(stance.STANCE_CAPS.retreat, 'the retreat cap was not held at the floor').toBe(stance.RETREAT_FLOOR);
    const logged = consoleError.mock.calls.filter(([m]) => /RETREAT_FLOOR/.test(String(m)));
    expect(logged.length, 'the violation was not logged exactly once').toBe(1);

    // The controller's own call: a full backpedal at full stance weight, a 1 s frame so the ramp reaches its target.
    const v = stance.stanceWalk({ x: 14, z: 0, moving: true }, { w: 1, awayX: 1, awayZ: 0, gap: 0 }, { moveMult: 1 }, 1, { x: 0, z: 0 }, 1);
    expect(v.x, 'the stance walked at a cap other than the clamped one').toBeCloseTo(stance.RETREAT_FLOOR, 12);

    const app = await import('../../src/App.jsx');
    expect(typeof app.default, 'App did not load').toBe('function');
  });
});
