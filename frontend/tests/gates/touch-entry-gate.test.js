// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useGameStore } from '../../src/store/useGameStore.jsx';

// TOUCH COLD-START (2026-06-14): TAPPING "START ADVENTURE" DID NOTHING, AND THE PLAYER WAS STUCK.
//
// iPad and iPhone have no Pointer Lock. The title menu hides only when the active gate is open, and on
// desktop that gate is opened by the browser's pointerlockchange event — so on a real device the tap
// requested a lock that does not exist, no event ever came back, and the title screen never went away.
// A confirmed production bug, found by scripts/visual/touch-probe.mjs and not by anything committed.
//
// The gate that locked the fix was four source regexes over MenuSystem.jsx, and the last one counted
// occurrences of an exact 96-character line INCLUDING its whitespace:
//
//   /else if \(document\.body\.requestPointerLock\) document\.body\.requestPointerLock\(\)\.catch\(...\);/g
//
// A prettier run, a line wrap, or renaming `e` to `err` breaks it — while the actual defect it exists to
// stop (the touch bridge not firing) is invisible to all four, because every one of them asserts that
// text is present rather than that a tap does anything. MenuSystem renders in jsdom; the sibling
// esc-resume-recovery suite already drives it. So tap the button.
vi.mock('../../src/input/touchDevice', () => ({ isTouchDevice: vi.fn(() => false), isTouchUIMode: vi.fn(() => false) }));
const { isTouchDevice } = await import('../../src/input/touchDevice');
const { MenuSystem } = await import('../../src/MenuSystem.jsx');

const NOOP = () => {};
const QUEST_STUB = { achievements: [], unlockedAchievements: [], stats: {}, quests: [] };

const PANELS_CLOSED = {
  showInventory: false, showCrafting: false, showMagic: false, showBuildingTools: false,
  showSettings: false, showChestInterface: false, showTradingInterface: false,
  showWorldManager: false, showCredits: false, showQuestLog: false,
};

/**
 * The cold-start state: never played, pointer not locked, so the title screen is up.
 *
 * `...overrides` is spread FIRST and `gameState` merged after. The reverse order — which is what this
 * helper was first written with, copying the sibling harness — silently replaces the whole `gameState`
 * object with the caller's partial, so `titleProps({ gameState: { gameStarted: true } })` produced a
 * gameState of exactly `{gameStarted: true}` and the `requestPointerLock` spy vanished. Same trap
 * `artifact-currency.mjs` documents in its own `surfaces()`: a trailing spread reads like a default and
 * behaves like an override.
 */
function titleProps(overrides = {}) {
  return {
    showAchievements: false, setShowAchievements: NOOP,
    showSpellUpgrades: false, setShowSpellUpgrades: NOOP,
    showStats: false, setShowStats: NOOP,
    isPointerLocked: false, setIsPointerLocked: vi.fn(),
    questSystem: QUEST_STUB,
    ...overrides,
    gameState: { ...PANELS_CLOSED, gameStarted: false, isAlive: true, requestPointerLock: vi.fn(), ...overrides.gameState },
  };
}

beforeEach(() => {
  isTouchDevice.mockReturnValue(false);
  document.body.requestPointerLock = vi.fn(() => Promise.resolve());
  useGameStore.setState({ ...PANELS_CLOSED, gameStarted: false, isAlive: true });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const startButton = () => screen.getByRole('button', { name: /start adventure/i });

describe('the title screen offers a way in at all', () => {
  it('renders Start Adventure on a cold start — the presence case for everything below', () => {
    render(createElement(MenuSystem, titleProps()));
    expect(startButton(), 'no Start Adventure button — every assertion below would be vacuous').toBeTruthy();
  });
});

describe('ON TOUCH: the tap opens the active gate directly', () => {
  it('tapping Start Adventure sets the active gate itself, because no pointerlockchange will ever arrive', () => {
    // THE REGRESSION. Without this line the tap requests a lock the device does not have, nothing
    // answers, and the title screen stays up forever.
    isTouchDevice.mockReturnValue(true);
    const props = titleProps();
    render(createElement(MenuSystem, props));

    fireEvent.click(startButton());
    expect(props.setIsPointerLocked, 'the touch bridge did not fire — this is the stuck-on-title prod bug').toHaveBeenCalledWith(true);
  });

  it('and latches gameStarted, since touch gets no pointerlockchange to latch it later', () => {
    isTouchDevice.mockReturnValue(true);
    render(createElement(MenuSystem, titleProps()));
    fireEvent.click(startButton());
    expect(useGameStore.getState().gameStarted, 'the run never started — save/resume and the HUD both key off this').toBe(true);
  });
});

describe('ON DESKTOP: the lock request is still what opens the gate', () => {
  it('requests pointer lock through the canvas-owning store method', () => {
    // The other direction, so the touch bridge cannot be implemented by simply setting the gate for
    // everyone — which would make desktop's pointer-lock authority a second, competing writer.
    const props = titleProps();
    render(createElement(MenuSystem, props));

    fireEvent.click(startButton());
    expect(props.gameState.requestPointerLock, 'desktop never asked for pointer lock').toHaveBeenCalledTimes(1);
    expect(props.setIsPointerLocked,
      'desktop set the active gate directly, bypassing pointerlockchange — two writers for one piece of state').not.toHaveBeenCalled();
  });

  it('falls back to a body lock only when the store has no lock method yet', () => {
    const props = titleProps({ gameState: { requestPointerLock: undefined } });
    render(createElement(MenuSystem, props));
    fireEvent.click(startButton());
    expect(document.body.requestPointerLock, 'there is no fallback at all before the canvas mounts').toHaveBeenCalledTimes(1);
  });

  it('a REFUSED fallback lock does not throw out of the click handler', () => {
    // `.catch(...)` on the fallback, asserted by running it rather than by matching its 96 characters.
    // An unhandled rejection here would take out the click that is the player's only way into the game.
    document.body.requestPointerLock = vi.fn(() => Promise.reject(new Error('refused')));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const props = titleProps({ gameState: { requestPointerLock: undefined } });
    render(createElement(MenuSystem, props));
    expect(() => fireEvent.click(startButton())).not.toThrow();
    warn.mockRestore();
  });
});

describe('every entry surface goes through the SAME helper', () => {
  it('the resume overlay enters play exactly as the title button does', () => {
    // What the old occurrence-counting regex was reaching for: there were nine copy-pasted lock blocks,
    // and the fix collapsed them into one `enterPlay`. Counting lines of text proves that only until
    // someone reformats. Driving two different surfaces and observing the same effects proves it in a
    // way no whitespace can disturb — and would catch a tenth surface added with its own raw copy.
    isTouchDevice.mockReturnValue(true);
    const props = titleProps({ gameState: { gameStarted: true } });
    useGameStore.setState({ gameStarted: true });
    render(createElement(MenuSystem, props));

    fireEvent.click(screen.getByTestId('resume-button'));
    expect(props.gameState.requestPointerLock, 'the resume surface does not request the lock').toHaveBeenCalledTimes(1);
    expect(props.setIsPointerLocked, 'the resume surface skips the touch bridge — touch players cannot un-pause').toHaveBeenCalledWith(true);
    expect(useGameStore.getState().gameStarted).toBe(true);
  });
});
