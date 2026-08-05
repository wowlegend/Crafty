// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, renderHook, act, cleanup, screen, fireEvent } from '@testing-library/react';
import { useInputManager } from '../../src/InputManager.jsx';
import { MenuSystem } from '../../src/MenuSystem.jsx';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { setActive, getInput } from '../../src/input/inputState.js';
import { shouldShowResumeOverlay, shouldShowTitleMenu, isAnyPanelOpen } from '../../src/ui/panelState.js';

// KEVIN, 2026-08-05: "whenever I press ESC to bring up the menus, and then press ESC to quit it, I'm
// unable to navigate / move — the character remains frozen, and dies from a mob hitting."
//
// The mechanism, verified against MDN (Element.requestPointerLock, accessed 2026-08-05): ESC is the
// browser's DEFAULT UNLOCK GESTURE, and "calling requestPointerLock() immediately after releasing the
// pointer lock via the default unlock gesture ... will fail, EVEN IF a transient activation is
// available." So the relock every panel's onClose performs (KEVIN-FIX C4) is not racy on this path —
// it is GUARANTEED to be refused, and no retry or timer can beat it; only a fresh click can.
//
// On refusal the player was left holding: no panel, active=false (Components.jsx:861 gates ALL
// movement on it) and no title menu (suppressed once gameStarted) — no surface and no input, while
// mobs, which gate on none of it, kept swinging.
//
// These tests drive the REAL InputManager keydown handler with a REFUSING requestPointerLock, which is
// the half of the flow the existing esc-pause-probe.mjs steps over: at its line 54 it substitutes
// document.exitPointerLock() for the native ESC — the one path MDN says does NOT trigger the refusal.

const QUEST_STUB = { achievements: [], unlockedAchievements: [], stats: {}, quests: [] };
const NOOP = () => {};

/** A requestPointerLock that REFUSES, exactly as the browser does right after the player's own ESC. */
function refusingLock() {
  return vi.fn(() => {
    // the browser signals refusal by firing pointerlockerror and leaving pointerLockElement null
    document.dispatchEvent(new Event('pointerlockerror'));
  });
}

function pressKey(code) {
  act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true })); });
}

/** The store slice MenuSystem reads, plus the panel flags. */
function menuProps(overrides = {}) {
  const gameState = {
    showInventory: false, showCrafting: false, showMagic: false, showBuildingTools: false,
    showSettings: false, showChestInterface: false, showTradingInterface: false,
    showWorldManager: false, showCredits: false, showQuestLog: false,
    gameStarted: true, isAlive: true,
    requestPointerLock: refusingLock(),
    ...overrides.gameState,
  };
  return {
    gameState,
    showAchievements: false, setShowAchievements: NOOP,
    showSpellUpgrades: false, setShowSpellUpgrades: NOOP,
    showStats: false, setShowStats: NOOP,
    isPointerLocked: false, setIsPointerLocked: NOOP,
    questSystem: QUEST_STUB,
    ...overrides,
  };
}

beforeEach(() => {
  document.exitPointerLock = vi.fn();
  document.body.requestPointerLock = vi.fn();
  useGameStore.setState({
    showInventory: false, showCrafting: false, showMagic: false, showBuildingTools: false,
    showSettings: false, showChestInterface: false, showTradingInterface: false,
    showWorldManager: false, showCredits: false, showQuestLog: false,
    gameStarted: true, isAlive: true,
  });
});
afterEach(() => { cleanup(); setActive(false); vi.restoreAllMocks(); });

describe('ESC -> pause -> ESC with a REFUSED relock (Kevin 2026-08-05)', () => {
  it('the second ESC closes the pause menu and the relock is REFUSED — the exact stranding state', () => {
    // state after the first ESC: the browser unlocked us and App opened the pause panel
    setActive(false);
    const requestPointerLock = refusingLock();
    useGameStore.setState({ showSettings: true, requestPointerLock });

    renderHook(() => useInputManager({}, {}, QUEST_STUB));

    pressKey('Escape'); // the SECOND ESC — "press esc to quit it"

    const s = useGameStore.getState();
    expect(s.showSettings).toBe(false);          // the panel closed optimistically...
    expect(requestPointerLock).toHaveBeenCalled(); // ...and the relock was attempted...
    expect(document.pointerLockElement).toBeFalsy(); // ...and REFUSED.

    // This is the state Kevin was left in. Input is dead:
    expect(getInput().active).toBe(false);
    // and before the fix NOTHING offered a way out of it:
    expect(isAnyPanelOpen({ ...s })).toBe(false);
    expect(shouldShowTitleMenu({ isPointerLocked: false, ...s })).toBe(false);
    // the fix — a surface derived from the state itself:
    expect(shouldShowResumeOverlay({ isPointerLocked: false, ...s })).toBe(true);
  });
});

describe('the resume overlay actually RENDERS and actually recovers', () => {
  it('renders over the stranded state and offers a labelled way back', () => {
    render(<MenuSystem {...menuProps()} />);
    const overlay = screen.getByTestId('resume-overlay');
    expect(overlay).toBeTruthy();
    expect(overlay.getAttribute('role')).toBe('dialog');
    // the copy must come from i18n, not a hardcoded string (both locales are gated elsewhere)
    expect(overlay.textContent).toContain('Paused');
    expect(screen.getByTestId('resume-button')).toBeTruthy();
  });

  it('CLICKING it re-requests pointer lock — the fresh user gesture the browser demands', () => {
    const props = menuProps();
    render(<MenuSystem {...props} />);
    fireEvent.click(screen.getByTestId('resume-button'));
    // the click bubbles to the overlay handler -> enterPlay() -> requestPointerLock, exactly once
    expect(props.gameState.requestPointerLock).toHaveBeenCalledTimes(1);
  });

  it('does NOT render while input is live — it is a recovery surface, not a HUD element', () => {
    render(<MenuSystem {...menuProps({ isPointerLocked: true })} />);
    expect(screen.queryByTestId('resume-overlay')).toBeNull();
  });

  it('does NOT render while a panel is already offering a way back', () => {
    render(<MenuSystem {...menuProps({ gameState: { showSettings: true } })} />);
    expect(screen.queryByTestId('resume-overlay')).toBeNull();
  });

  it('does NOT render while dead — the DeathScreen owns that moment', () => {
    render(<MenuSystem {...menuProps({ gameState: { isAlive: false } })} />);
    expect(screen.queryByTestId('resume-overlay')).toBeNull();
  });
});
