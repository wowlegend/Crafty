import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { buildSaveData } from '../../src/game/saveSchema.js';

// S2-B1-M1 T2: the single-writer beast-form authority + the NO-PERMANENT-BEAST invariant.
// The store owns the form STATE (Rapier-free, so this is unit-testable); Components.jsx does the
// collider swap. Every exit path (death / load / manual) must return to human, and the form must
// NEVER serialize (so a reload can't ever load mid-beast).

beforeEach(() => {
  // Reset the guards damagePlayer checks so the death-edge test can land deterministically.
  useGameStore.setState({ isAlive: true, playerHealth: 50, maxHealth: 100, isPlayerInvincible: null, _spawnTime: 0, lastDamageTime: 0 });
  useGameStore.getState().exitBeastForm();
});

describe('beast-form authority (single writer)', () => {
  it('enter sets active + form; the getter mirrors the value (cannot diverge)', () => {
    const s = useGameStore.getState();
    s.enterBeastForm('fire');
    const after = useGameStore.getState();
    expect(after.beastFormActive).toBe(true);
    expect(after.activeBeastForm).toBe('fire');
    expect(after.isBeastFormActive()).toBe(true);
  });

  it('exit clears active + form', () => {
    useGameStore.getState().enterBeastForm('ice');
    useGameStore.getState().exitBeastForm();
    const after = useGameStore.getState();
    expect(after.beastFormActive).toBe(false);
    expect(after.activeBeastForm).toBeNull();
    expect(after.isBeastFormActive()).toBe(false);
  });

  it('rejects an unknown element', () => {
    useGameStore.getState().enterBeastForm('mythic');
    expect(useGameStore.getState().isBeastFormActive()).toBe(false);
    expect(useGameStore.getState().activeBeastForm).toBeNull();
  });

  it('cannot enter while dead', () => {
    useGameStore.setState({ isAlive: false });
    useGameStore.getState().enterBeastForm('fire');
    expect(useGameStore.getState().isBeastFormActive()).toBe(false);
  });

  it('does not double-transform (a 2nd enter while active is a no-op — keeps the first form)', () => {
    useGameStore.getState().enterBeastForm('fire');
    useGameStore.getState().enterBeastForm('ice');
    expect(useGameStore.getState().activeBeastForm).toBe('fire');
  });

  it('setBeastFormActive is the sole writer (enter/exit route through it)', () => {
    useGameStore.getState().setBeastFormActive(true, 'lightning');
    expect(useGameStore.getState().activeBeastForm).toBe('lightning');
    useGameStore.getState().setBeastFormActive(false);
    expect(useGameStore.getState().activeBeastForm).toBeNull();
    expect(useGameStore.getState().beastFormActive).toBe(false);
  });
});

describe('no-permanent-beast invariant', () => {
  it('DEATH drops the form at the death edge (before respawn) — Marcus-floor + no-permanent-beast', () => {
    useGameStore.getState().enterBeastForm('fire');
    expect(useGameStore.getState().isBeastFormActive()).toBe(true);
    useGameStore.getState().damagePlayer(9999, 'test');
    const after = useGameStore.getState();
    expect(after.isAlive).toBe(false);              // died...
    expect(after.isBeastFormActive()).toBe(false);  // ...and reverted to human AT the death edge
    expect(after.activeBeastForm).toBeNull();
  });

  it('a same-session LOAD while transformed returns to human', () => {
    // build a valid save from the current (human) state, then transform, then load it
    const save = buildSaveData(useGameStore.getState());
    useGameStore.getState().enterBeastForm('ice');
    expect(useGameStore.getState().isBeastFormActive()).toBe(true);
    useGameStore.getState().loadWorldData(save);
    expect(useGameStore.getState().isBeastFormActive()).toBe(false);
    expect(useGameStore.getState().activeBeastForm).toBeNull();
  });

  it('the form state is TRANSIENT — never serialized into a save', () => {
    useGameStore.getState().enterBeastForm('arcane');
    const save = buildSaveData(useGameStore.getState());
    const json = JSON.stringify(save);
    expect(json).not.toContain('beastFormActive');
    expect(json).not.toContain('activeBeastForm');
  });
});
