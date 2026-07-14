// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSpellUpgrades } from '../../src/world/spellUpgrades';
import { useGameStore } from '../../src/store/useGameStore';

// B2e — SPELL MASTERY IS DEAD AFTER LOADING A SAVE. (18-domain review, CRITICAL.)
//
// The hook kept its OWN React copy of spellLevels and hydrated it from the store exactly ONCE, on mount.
// It mounts at App boot (App.jsx:181) — when the store's spellLevels is still the `{}` default. So the
// hydration adopts nothing, the one-shot latch closes forever, and the hook is stuck at all-1s.
//
// `loadWorldData` then restores spellLevels into the STORE. Nothing tells the hook. The result:
//   - the Progression panel reads the STORE and proudly displays "MAX RANK"
//   - every spell you cast reads the HOOK's getSpellStats and fires at Level 1
//   - and the moment you click Upgrade on anything, the hook's push effect writes its all-1s map back
//     over your restored levels — and the autosave persists that to disk. Your mastery is gone.
//
// THE FIX IS TO DELETE THE SECOND SOURCE OF TRUTH. spellLevels is persisted state; the STORE owns it.
// The hook derives from the store and writes through it. There is nothing to hydrate, so there is no
// one-shot latch to get stuck, and no local copy to clobber the loaded one.
//
// MUTATION-PROOF: reintroduce a local useState copy (or re-add the one-shot hydratedRef) and
// "a save loaded AFTER mount" goes RED.

const freshStore = () => useGameStore.setState({ spellLevels: {}, level: 10 });

describe('B2e spell mastery survives a load', () => {
  beforeEach(freshStore);

  it('a fresh game casts everything at Level 1', () => {
    const { result } = renderHook(() => useSpellUpgrades());
    expect(result.current.getSpellStats('fireball').damage).toBe(50);   // Fireball I
    expect(result.current.getSpellStats('lightning').damage).toBe(75);  // Lightning I
  });

  it('THE BUG: a save loaded AFTER mount must actually change what you cast', () => {
    // Production mount order: the hook mounts at boot (store still {}), THEN the player clicks Load.
    const { result } = renderHook(() => useSpellUpgrades());
    expect(result.current.getSpellStats('fireball').damage).toBe(50);

    act(() => {
      useGameStore.setState({ spellLevels: { fireball: 3, iceball: 2, lightning: 3, arcane: 2 } });
    });

    // Before the fix these all still read Level 1 — the panel said MAX RANK while you threw Fireball I.
    expect(result.current.getSpellStats('fireball').damage).toBe(120);   // Fireball III
    expect(result.current.getSpellStats('iceball').damage).toBe(65);     // Iceball II
    expect(result.current.getSpellStats('lightning').damage).toBe(160);  // Lightning III
    expect(result.current.getSpellStats('arcane').damage).toBe(90);      // Arcane II
  });

  it('the mana cost tracks the loaded level too — not just the damage', () => {
    const { result } = renderHook(() => useSpellUpgrades());
    act(() => { useGameStore.setState({ spellLevels: { fireball: 3 } }); });
    expect(result.current.getSpellStats('fireball').manaCost).toBe(22);  // III, not I's 15
  });

  it('upgrading ONE spell does not wipe the others back to Level 1', () => {
    // This is the disk-corrupting half: the old push effect wrote the hook's whole all-1s map into the
    // store on the first upgrade, and the autosave then persisted it.
    const { result } = renderHook(() => useSpellUpgrades());
    act(() => {
      useGameStore.setState({ spellLevels: { fireball: 3, iceball: 2, lightning: 3, arcane: 2 } });
    });

    act(() => { result.current.upgradeSpell('arcane'); });

    const levels = useGameStore.getState().spellLevels;
    expect(levels.arcane).toBe(3);      // the one we upgraded
    expect(levels.fireball).toBe(3);    // <- RED before the fix: was 1
    expect(levels.iceball).toBe(2);
    expect(levels.lightning).toBe(3);
  });

  it('an upgrade is written to the STORE, so the autosave can persist it', () => {
    const { result } = renderHook(() => useSpellUpgrades());
    act(() => { result.current.upgradeSpell('fireball'); });
    expect(useGameStore.getState().spellLevels.fireball).toBe(2);
  });

  it('a maxed spell refuses to go past Level 3', () => {
    const { result } = renderHook(() => useSpellUpgrades());
    act(() => { useGameStore.setState({ spellLevels: { fireball: 3 } }); });
    act(() => { result.current.upgradeSpell('fireball'); });
    expect(useGameStore.getState().spellLevels.fireball).toBe(3);
  });

  it('the player-level gate still blocks an upgrade you have not earned', () => {
    useGameStore.setState({ level: 1, spellLevels: {} });
    const { result } = renderHook(() => useSpellUpgrades());
    act(() => { result.current.upgradeSpell('lightning'); });   // needs player level 3
    expect(useGameStore.getState().spellLevels.lightning ?? 1).toBe(1);
  });
});
