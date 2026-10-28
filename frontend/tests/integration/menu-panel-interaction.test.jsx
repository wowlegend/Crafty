// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useInputManager } from '../../src/InputManager.jsx';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { setActive } from '../../src/input/inputState.js';
import { shouldShowTitleMenu } from '../../src/ui/panelState.js';

// INTERACTION guard for the 2026-06-07 bug class: pressing U opened the Aspect tree, but the title MENU
// popped OVER it (the menu gate had an incomplete panel list). Pure-logic tests can't catch this — it only
// shows up when a real keypress opens a panel + releases the cursor. This drives the REAL InputManager
// keydown handler in jsdom and asserts the full chain: U -> Aspect panel opens + cursor released -> the
// menu gate reports HIDDEN. The invariant for the whole class: a keypress that opens a panel must never
// leave the title/pause menu visible.

const QUEST_STUB = { achievements: [], unlockedAchievements: [], stats: {}, quests: [] };

function pressKey(code) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  });
}

beforeEach(() => {
  document.exitPointerLock = vi.fn();
  document.body.requestPointerLock = vi.fn();
  setActive(true); // input live / pointer-locked, i.e. actively playing
  useGameStore.setState({
    showInventory: false, showCrafting: false, showMagic: false, showBuildingTools: false,
    showSettings: false, showChestInterface: false, showTradingInterface: false,
    showWorldManager: false, showCredits: false, selectedBlock: undefined,
  });
});
afterEach(() => { cleanup(); setActive(false); vi.restoreAllMocks(); }); // unmount the hook so its keydown listener can't leak into the next test (handler stopImmediatePropagation would swallow the event)

describe('keyboard -> panel -> menu interaction (jsdom)', () => {
  it('U opens the Aspect tree, releases the cursor, and the title menu stays HIDDEN (the bug)', () => {
    const { result } = renderHook(() => useInputManager({}, {}, QUEST_STUB));
    expect(result.current.showSpellUpgrades).toBe(false);

    pressKey('KeyU');

    // (a) the keypress opened the Aspect panel + released the cursor so the UI is clickable
    expect(result.current.showSpellUpgrades).toBe(true);
    expect(document.exitPointerLock).toHaveBeenCalled();

    // (b) given the resulting state (panel open + pointer now unlocked), the menu gate is HIDDEN.
    // Before the fix this returned true -> the main menu rendered over the Aspect tree.
    expect(shouldShowTitleMenu({
      isPointerLocked: false,
      showSpellUpgrades: result.current.showSpellUpgrades,
    })).toBe(false);
  });

  it('U again toggles the Aspect tree closed', () => {
    const { result } = renderHook(() => useInputManager({}, {}, QUEST_STUB));
    pressKey('KeyU');
    expect(result.current.showSpellUpgrades).toBe(true);
    pressKey('KeyU');
    expect(result.current.showSpellUpgrades).toBe(false);
  });

  it('control: with no panel open and the pointer unlocked, the title menu DOES show', () => {
    // the legitimate title / click-to-play state must still render
    expect(shouldShowTitleMenu({ isPointerLocked: false })).toBe(true);
  });
});

/**
 * SHOW STATS (F3) IS A READOUT, NOT A PANEL (2026-10-27). While it sat in PANEL_FLAGS the key gate treated it as an open
 * panel, so with the readout up the spell keys, the quest claim and the hotbar wheel did nothing — and ESC stranded the
 * player (ui/panelState.js header). This drives the REAL InputManager handlers: F3 on, then each verb must still act.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh on src/InputManager.jsx, one batch, receipts in the commit:
 *   I1 the key gate counts the readout as a panel again (`... || showStats`)    -> RED expected (spell + claim)
 *   I2 the wheel gate counts the readout as a panel again (`... || showStats`)  -> RED expected (hotbar)
 *   I0 identity (a comment edit)                                              -> must SURVIVE
 */
describe('with Show Stats on, gameplay keys still act', () => {
  it('F3 shows the readout; Digit2 selects a spell, Q claims a finished quest, the wheel scrolls the hotbar', () => {
    const claimQuest = vi.fn();
    const quests = { ...QUEST_STUB, quests: [{ id: 'q1', progress: 5, target: 5, claimed: false }], claimQuest };
    useGameStore.setState({ activeSpell: 'fireball', selectedBlock: 'grass' });
    const { result } = renderHook(() => useInputManager({}, {}, quests));
    // The F3 handler matches event.key (pressKey sets only event.code).
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F3', code: 'F3', bubbles: true })); });
    expect(result.current.showStats, 'SETUP: F3 did not turn the readout on — the stats case was not exercised').toBe(true);
    pressKey('Digit2');
    expect(useGameStore.getState().activeSpell, 'a spell key did nothing with the readout up').toBe('iceball');
    pressKey('KeyQ');
    expect(claimQuest, 'Q claimed nothing with the readout up').toHaveBeenCalledWith('q1');
    const before = useGameStore.getState().selectedBlock;
    act(() => { window.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 })); });
    expect(useGameStore.getState().selectedBlock, 'the wheel did not scroll the hotbar with the readout up').not.toBe(before);
  });
});
