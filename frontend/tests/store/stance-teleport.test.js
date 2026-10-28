// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { stanceFrame, getStance, resetStance } from '../../src/game/combatStance.js';

// A SAVE LOAD LEAVES THE FIGHT BEHIND (round-1 review f, combat-stance). loadWorldData teleports the live body to the
// save's position; it used to keep the stance, so the walk at the loaded site was clamped against the old fight's
// threat for up to 2.6 s with no mob near. It now teleports through game/combatStance.js teleportPlayer, which resets
// the stance. This drives the REAL store action with a fake body (it records what it was asked to do).
// The void-fall guard is the helper's other caller (Components.jsx); that call site is not driven here.
//
// Mutation-Proof: scripts/dev/mutate.sh on src/store/useGameStore.jsx, 1 test, each against a green baseline:
//   T1 the load teleports with rb.current.setTranslation directly again (the stance kept) -> RED
//   T0 identity (a comment edit) -> SURVIVED
//   T2s src/game/combatStance.js: teleportPlayer keeps the stance -> RED (here, and in src/game/combatStance.test.js,
//   which also kills T3, the body never stopped).

afterEach(() => {
  resetStance();
  useGameStore.setState({ playerRigidBodyRef: null });
});

describe('loadWorldData and the combat stance', () => {
  it('a load mid-fight teleports the body and resets the stance', () => {
    resetStance();
    const husk = { id: 'lt1', isMob: true, type: 'zombie', passive: false, isAggro: true, health: 50, position: { x: -3, y: 51.7, z: 0 } };
    for (let t = 0; t <= 400; t += 16) stanceFrame([husk], { x: 0, y: 50.5, z: 0 }, { position: { x: 0, y: 51.7, z: 0 } }, t, 1 / 60);
    expect([getStance().engaged, getStance().w], 'SETUP: the stance did not engage before the load').toEqual([true, 1]);
    const moved = [];
    useGameStore.setState({ playerRigidBodyRef: { current: { setTranslation: (p) => moved.push(p), setLinvel: () => {} } } });
    useGameStore.getState().loadWorldData({ player_data: { position: { x: 40, y: 70, z: -25 } } });
    expect(moved, 'the load did not teleport the body').toEqual([{ x: 40, y: 70, z: -25 }]);
    expect([getStance().engaged, getStance().w, getStance().threatId], 'a save load kept the old fight\'s stance').toEqual([false, 0, null]);
  });
});
