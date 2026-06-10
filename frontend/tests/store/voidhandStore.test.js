import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { buildSaveData } from '../../src/game/saveSchema.js';
import { KINETIC_MAX, GRAB_COST } from '../../src/game/kinetic.js';

// S2-B2-M1: the VOIDHAND held state is TRANSIENT + must clear at the death edge (same 1-frame-race class
// the WILDHEART review caught for beastCharging — damagePlayer flips isAlive synchronously, one frame
// ahead of the SM, so it must drop the held phantom atomically or it flashes over the soft-death screen).

beforeEach(() => {
  useGameStore.setState({
    isAlive: true, playerHealth: 50, maxHealth: 100, isPlayerInvincible: null, _spawnTime: 0, lastDamageTime: 0,
    voidhandHeld: false, heldPhantom: null,
  });
});

describe('VOIDHAND held state', () => {
  it('DEATH drops the held phantom atomically (no 1-frame leak over the death screen)', () => {
    useGameStore.getState().setVoidhandHeld(true);
    useGameStore.getState().setHeldPhantom({ color: '#A9966E' });
    expect(useGameStore.getState().voidhandHeld).toBe(true);

    useGameStore.getState().damagePlayer(9999, 'test');

    const after = useGameStore.getState();
    expect(after.isAlive).toBe(false);        // died...
    expect(after.voidhandHeld).toBe(false);   // ...and dropped the held phantom AT the death edge
    expect(after.heldPhantom).toBeNull();
  });

  it('is TRANSIENT — never serialized into a save', () => {
    useGameStore.getState().setVoidhandHeld(true);
    useGameStore.getState().setHeldPhantom({ color: '#A9966E' });
    const json = JSON.stringify(buildSaveData(useGameStore.getState()));
    expect(json).not.toContain('voidhandHeld');
    expect(json).not.toContain('heldPhantom');
  });
});

describe('M4 kinetic economy (store twin of ferocity)', () => {
  it('accrueKinetic clamps to [0, KINETIC_MAX] and rounds', () => {
    const s = useGameStore.getState();
    s.setKineticBanked(0);
    s.accrueKinetic(12.4);
    expect(useGameStore.getState().kineticBanked).toBe(12);
    s.accrueKinetic(1000);
    expect(useGameStore.getState().kineticBanked).toBe(KINETIC_MAX);
    s.accrueKinetic(-1000);
    expect(useGameStore.getState().kineticBanked).toBe(0);
  });
  it('a grab spend debits GRAB_COST', () => {
    const s = useGameStore.getState();
    s.setKineticBanked(60);
    s.accrueKinetic(-GRAB_COST);
    expect(useGameStore.getState().kineticBanked).toBe(60 - GRAB_COST);
  });
  it('kineticBanked IS serialized into the save progression slice (unlike the held flags)', () => {
    useGameStore.getState().setKineticBanked(37);
    const save = buildSaveData(useGameStore.getState(), { x: 0, y: 0, z: 0 });
    expect(save.progression.kineticBanked).toBe(37); // same slice as ferocityBanked (the precedent)
  });
});
