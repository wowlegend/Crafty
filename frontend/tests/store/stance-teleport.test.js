// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { stanceFrame, getStance, resetStance } from '../../src/game/combatStance.js';

// A SAVE LOAD LEAVES THE FIGHT BEHIND. loadWorldData teleports the live body to the save's position through
// game/stanceState.js teleportPlayer, which resets the stance: kept, the walk at the loaded site would be clamped
// against the old fight's threat for up to 2.6 s with no mob near. This drives the REAL store action with a fake body
// (it records what it was asked to do), and reads the stance before any frame, so stanceFrame's own teleport check
// cannot stand in for the store's reset. The void-fall guard is the helper's other caller (Components.jsx); that call
// site is not driven here.

afterEach(() => {
  resetStance();
  useGameStore.setState({ playerRigidBodyRef: null });
});

describe('loadWorldData and the combat stance', () => {
  it('a load mid-fight teleports the body and resets the stance', () => {
    resetStance();
    const husk = { id: 'lt1', isMob: true, type: 'zombie', passive: false, isAggro: true, health: 50, position: { x: -3, y: 51.7, z: 0 } };
    for (let t = 0; t <= 400; t += 16) stanceFrame([husk], { x: 0, y: 50.5, z: 0 }, 1 / 60, t);
    expect([getStance().engaged, getStance().w], 'SETUP: the stance did not engage before the load').toEqual([true, 1]);
    const moved = [];
    useGameStore.setState({ playerRigidBodyRef: { current: { setTranslation: (p) => moved.push(p), setLinvel: () => {} } } });
    useGameStore.getState().loadWorldData({ player_data: { position: { x: 40, y: 70, z: -25 } } });
    expect(moved, 'the load did not teleport the body').toEqual([{ x: 40, y: 70, z: -25 }]);
    expect([getStance().engaged, getStance().w, getStance().threatId], 'a save load kept the old fight\'s stance').toEqual([false, 0, null]);
  });
});
