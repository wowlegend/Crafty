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
// keydown handler in jsdom and asserts the full chain: a panel key -> its panel opens + cursor released -> the
// menu gate reports HIDDEN. The invariant for the whole class: a keypress that opens a panel must never
// leave the title/pause menu visible. Since the HUD lane the keys are Tab (Character: gear, spells, talents),
// J (Journal: quests, feats), B (Build) and H (controls); the Aspect tree is Character's Talents tab.

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
    showInventory: false, showForge: false, showMagic: false, showBuildingTools: false,
    showSettings: false, showChestInterface: false, showTradingInterface: false,
    showWorldManager: false, showCredits: false, selectedBlock: undefined,
  });
});
afterEach(() => { cleanup(); setActive(false); vi.restoreAllMocks(); }); // unmount the hook so its keydown listener can't leak into the next test (handler stopImmediatePropagation would swallow the event)

describe('keyboard -> panel -> menu interaction (jsdom)', () => {
  it('Tab opens Character on its gear tab, releases the cursor, and the title menu stays HIDDEN (the bug)', () => {
    renderHook(() => useInputManager({}, {}));
    expect(useGameStore.getState().showInventory).toBe(false);

    pressKey('Tab');

    // (a) the keypress opened the panel + released the cursor so the UI is clickable
    expect(useGameStore.getState().showInventory).toBe(true);
    expect(document.exitPointerLock).toHaveBeenCalled();

    // (b) given the resulting state (panel open + pointer now unlocked), the menu gate is HIDDEN.
    expect(shouldShowTitleMenu({ isPointerLocked: false, ...useGameStore.getState() })).toBe(false);
  });

  it('Tab again closes Character from ANY of its tabs, the Aspect tree (Talents) included', () => {
    const { result } = renderHook(() => useInputManager({}, {}));
    act(() => result.current.setShowSpellUpgrades(true));
    pressKey('Tab');
    expect(result.current.showSpellUpgrades, 'Tab left the Talents tab open').toBe(false);
    expect(useGameStore.getState().showInventory, 'Tab on an open group opened its first tab instead of closing').toBe(false);
  });

  it('J opens the Journal on Quests and closes it; H opens the controls panel and marks it seen; B toggles Build', () => {
    useGameStore.setState({ showQuestLog: false, showControls: false, controlsSeen: false });
    renderHook(() => useInputManager({}, {}));
    pressKey('KeyJ');
    expect(useGameStore.getState().showQuestLog).toBe(true);
    pressKey('KeyJ');
    expect(useGameStore.getState().showQuestLog).toBe(false);
    pressKey('KeyH');
    expect(useGameStore.getState().showControls).toBe(true);
    expect(useGameStore.getState().controlsSeen, 'opening the controls panel did not mark it seen').toBe(true);
    pressKey('KeyB');
    expect(useGameStore.getState().showBuildingTools).toBe(true);
    expect(useGameStore.getState().showControls, 'B left the controls panel open under Build').toBe(false);
  });

  it('E, M, U, L and Q open nothing any more', () => {
    const { result } = renderHook(() => useInputManager({}, {}));
    for (const c of ['KeyE', 'KeyM', 'KeyU', 'KeyL', 'KeyQ']) pressKey(c);
    const s = useGameStore.getState();
    expect([s.showInventory, s.showMagic, s.showQuestLog, result.current.showSpellUpgrades]).toEqual([false, false, false, false]);
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
  it('F3 shows the readout; Digit2 selects a spell, J opens the Journal, the wheel scrolls the hotbar', () => {
    useGameStore.setState({ activeSpell: 'fireball', selectedBlock: 'grass', showQuestLog: false });
    const { result } = renderHook(() => useInputManager({}, {}));
    // The F3 handler matches event.key (pressKey sets only event.code).
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F3', code: 'F3', bubbles: true })); });
    expect(result.current.showStats, 'SETUP: F3 did not turn the readout on — the stats case was not exercised').toBe(true);
    pressKey('Digit2');
    expect(useGameStore.getState().activeSpell, 'a spell key did nothing with the readout up').toBe('iceball');
    pressKey('KeyJ');
    expect(useGameStore.getState().showQuestLog, 'J opened nothing with the readout up').toBe(true);
    pressKey('KeyJ');
    const before = useGameStore.getState().selectedBlock;
    act(() => { window.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 })); });
    expect(useGameStore.getState().selectedBlock, 'the wheel did not scroll the hotbar with the readout up').not.toBe(before);
  });
});
