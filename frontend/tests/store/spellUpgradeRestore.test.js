// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSpellUpgrades, SPELL_UPGRADES } from '../../src/world/spellUpgrades.js';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { SPELL_TYPES } from '../../src/game/spells.js';
import { SPELL_MANA_COSTS } from '../../src/GameSystems';

// #51 S3 (restore-fix): the useSpellUpgrades hook inited local spellLevels to all-1s and pushed that to the
// store on mount, CLOBBERING a loaded save's restored levels back to L1. The fix hydrates local state FROM
// the store once on mount (adopt a non-empty restored map; store default {} keeps the all-1s default).
beforeEach(() => { useGameStore.setState({ spellLevels: {} }); });

describe('#51 S3 restore-fix (hydrate spellLevels from store, no clobber)', () => {
  it('adopts a restored non-empty spellLevels on mount', () => {
    useGameStore.setState({ spellLevels: { fireball: 3, lightning: 2 } });
    const { result } = renderHook(() => useSpellUpgrades());
    expect(result.current.getSpellStats('fireball').damage).toBe(120); // L3
    expect(result.current.getSpellStats('lightning').damage).toBe(110); // L2
  });

  it('a store default of {} keeps the all-1s default (L1)', () => {
    useGameStore.setState({ spellLevels: {} });
    const { result } = renderHook(() => useSpellUpgrades());
    expect(result.current.getSpellStats('fireball').damage).toBe(50); // L1
  });

  it('the push effect re-mirrors the hydrated levels to the store (locks the clobber regression)', () => {
    useGameStore.setState({ spellLevels: { fireball: 3 } });
    renderHook(() => useSpellUpgrades());
    expect(useGameStore.getState().spellLevels.fireball).toBe(3);
  });

  it('a partial restored map merges over the all-1s default', () => {
    useGameStore.setState({ spellLevels: { fireball: 2 } });
    const { result } = renderHook(() => useSpellUpgrades());
    expect(result.current.getSpellStats('fireball').damage).toBe(80); // L2
    expect(result.current.getSpellStats('iceball').damage).toBe(40);  // L1 default (not in the restored map)
  });
});

// Regression-lock for the S1 cast-wire's balance-safety: the upgrade table's L1 stats MUST equal the static
// base the cast falls back to, or the visual/damage gates would silently drift when getSpellStats wires in.
describe('#51 L1 balance invariant (upgrade L1 == static base)', () => {
  it('each spell L1 damage == SPELL_TYPES base and L1 manaCost == SPELL_MANA_COSTS', () => {
    for (const t of ['fireball', 'iceball', 'lightning', 'arcane']) {
      expect(SPELL_UPGRADES[t].levels[0].damage).toBe(SPELL_TYPES[t].damage);
      expect(SPELL_UPGRADES[t].levels[0].manaCost).toBe(SPELL_MANA_COSTS[t]);
    }
  });
});
