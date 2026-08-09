import { describe, it, expect } from 'vitest';
import { selectHudState, HUD_CALLABLE_KEYS } from '../../src/store/hudState.js';
import { useGameStore } from '../../src/store/useGameStore.jsx';

// THE 2026-08-09 AUDIT'S LARGEST CLUSTER, turned into a gate.
//
// 47 of 108 confirmed findings were dead-on-arrival, and they were not scattered — six of them share ONE
// root cause. `selectHudState` omits keys that mounted components gate on, so whole features cannot render
// or throw the moment a player touches them: ChestInventoryPanel, CreditsScreen (where the game-icons.net
// CC BY 3.0 attribution is supposedly discharged), WorldManager's Create World, the Trading close path,
// and both pointer-lock relocks.
//
// hudState.js's own header warns about exactly this — "keep VALUE and SETTER together; a value without its
// setter is precisely the shape of the bug above" — and `selectedVillager` was selected without
// `setSelectedVillager`. The existing guard, HUD_CALLABLE_KEYS, omitted the same key, so it never examined
// it. A denominator failure guarding a denominator failure.
//
// This gate is BEHAVIOURAL, not a source-grep: it builds the slice from the REAL store and asserts the
// keys resolve. A test that retypes the slice would only prove the copy agrees with itself, which is the
// anti-pattern hudState.js was created to end — and which tests/integration/esc-resume-recovery.test.jsx
// still commits by hand-typing a gameState literal containing showChestInterface.
describe('selectHudState — every key a mounted component gates on must be IN the slice', () => {
  const slice = () => selectHudState(useGameStore.getState());

  // Each row is a feature the audit proved unreachable, with the keys its gate and handlers read.
  // The VALUE alone is not enough: a missing value renders nothing (silent), a missing setter throws at
  // click time (loud, and much later) — both shipped here.
  const CONTRACTS = [
    { feature: 'ChestInventoryPanel (MenuSystem.jsx:100)', keys: ['showChestInterface', 'activeChestCoords', 'setShowChestInterface'] },
    { feature: 'CreditsScreen + the Settings button that opens it (MenuSystem.jsx:187)', keys: ['showCredits', 'setShowCredits'] },
    { feature: "WorldManager 'Create World' (MenuSystem.jsx)", keys: ['startNewWorld'] },
    // LATE-INSTALLED, and the distinction is real rather than a convenience. `requestPointerLock` is not
    // in the store literal at all: GameScene.jsx:98 puts it there with useGameStore.setState() on mount,
    // and nulls it on unmount. So in a fresh store its value is legitimately `undefined` while the KEY
    // must still be selected — otherwise useShallow never propagates it once GameScene installs it, and
    // both call sites (MenuSystem.jsx:183, :205) take their `if (gameState.requestPointerLock)` false
    // branch forever. Presence is the universal requirement; definedness is not.
    { feature: 'pointer-lock relock after WorldManager / Trading close', keys: ['requestPointerLock'], lateInstalled: true },
    { feature: 'TradingInterface close path (MenuSystem.jsx:203)', keys: ['setSelectedVillager'] },
  ];

  it.each(CONTRACTS)('$feature — its keys are present in the slice', ({ keys, lateInstalled }) => {
    const s = slice();
    for (const k of keys) {
      expect(s, `selectHudState omits "${k}" — the component reading gameState.${k} is dead`).toHaveProperty(k);
      if (!lateInstalled) {
        expect(s[k], `gameState.${k} is undefined in the slice`).toBeDefined();
      }
    }
  });

  it('every SETTER in the slice is callable against the live store', () => {
    // The check that would have caught setSelectedBlock the day it went missing, extended to the whole
    // slice instead of a hand-maintained list. A value silently reads undefined; a missing handler only
    // explodes when a player touches it, which is why these survived.
    const s = slice();
    const setters = Object.keys(s).filter((k) => /^(set|add|remove|load|start|request|toggle)[A-Z]/.test(k));
    expect(setters.length, 'no setters found — the detector, not the slice, is broken').toBeGreaterThan(10);
    // ONE declared exception, named rather than pattern-excluded so it cannot quietly grow. GameScene
    // installs requestPointerLock via setState on mount, so a fresh store has the key with no value.
    // Both call sites guard with `if (gameState.requestPointerLock)`, so undefined is a supported state
    // here — unlike every other entry, where undefined means a click throws.
    const LATE_INSTALLED = ['requestPointerLock'];
    expect(LATE_INSTALLED.length, 'the exception list is growing — each entry is an unchecked setter').toBeLessThanOrEqual(1);
    for (const k of setters.filter((k) => !LATE_INSTALLED.includes(k))) {
      expect(typeof s[k], `gameState.${k} is not a function — calling it throws at click time`).toBe('function');
    }
  });

  it('HUD_CALLABLE_KEYS covers every setter the slice exposes — no silent gaps', () => {
    // The old list was hand-maintained and omitted setSelectedVillager, so the guard skipped the very key
    // that threw. Deriving the expectation from the slice makes the list unable to fall behind it.
    const s = slice();
    const setters = Object.keys(s).filter((k) => /^(set|add|remove|load|start|request|toggle)[A-Z]/.test(k));
    // Same named exception as above: a conditionally-called key must be SELECTED but must not be in
    // HUD_CALLABLE_KEYS, whose contract is "must resolve to a function". Adding it there reddened the
    // pre-existing hud-hotbar gate, which was right to complain.
    const missing = setters.filter((k) => !HUD_CALLABLE_KEYS.includes(k) && k !== 'requestPointerLock');
    expect(missing, `HUD_CALLABLE_KEYS is missing ${missing.join(', ')} — those keys go unchecked`).toEqual([]);
  });

  it('every HUD_CALLABLE_KEYS entry actually EXISTS in the slice', () => {
    // The converse, so the list cannot drift the other way into naming keys nobody ships.
    const s = slice();
    const orphans = HUD_CALLABLE_KEYS.filter((k) => !(k in s));
    expect(orphans, `HUD_CALLABLE_KEYS names ${orphans.join(', ')}, absent from the slice`).toEqual([]);
  });

  it('reports its DENOMINATOR — the slice is not silently empty', () => {
    // A selector returning {} would pass every "is present" loop that iterates an empty list. Seven
    // instruments in this repo have shipped a clean report over input they never examined.
    const s = slice();
    expect(Object.keys(s).length).toBeGreaterThan(30);
  });
});
