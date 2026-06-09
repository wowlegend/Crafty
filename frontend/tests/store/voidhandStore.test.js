import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { buildSaveData } from '../../src/game/saveSchema.js';

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
