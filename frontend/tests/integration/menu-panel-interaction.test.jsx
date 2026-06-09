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
