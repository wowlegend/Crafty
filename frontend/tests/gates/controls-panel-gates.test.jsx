// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';

// THE CONTROLS ARE A PANEL H OPENS, GENERATED FROM KEY_MAP, AND A FIRST-TIME PLAYER IS SHOWN THEM (the HUD lane,
// DECISIONS 2026-10-29 item 96; closes STATUS C1/c, QUEUE Q26/c, OPEN_ITEMS OI-31/c). A fresh profile sees the controls
// card at rest until it presses H or has played 30 s with the card on screen; then the card folds to the one-line
// "H Controls" hint, on a keyboard only, until H opens the panel once. Driven through the real InputManager key
// handler, the real store, the real localStorage flags and the card's own timer (fake clock).
//
// NOT CHECKED HERE: HUD.jsx's mounting of the card off touch (no jsdom harness for the HUD; the e2e
// tests/e2e/panels.spec.js boots a fresh profile in a browser and reloads it).
vi.mock('../../src/input/touchDevice', () => ({ isTouchUIMode: vi.fn(() => false), isTouchDevice: vi.fn(() => false) }));
import { KEY_MAP, KEY_GROUPS } from '../../src/game/keyMap.js';
import { STRINGS } from '../../src/i18n/strings.js';
import { ControlsPanel, ControlsCardUntilSeen, CARD_ON_SCREEN_MS } from '../../src/ui/CombatInstructions.jsx';
import { isTouchUIMode } from '../../src/input/touchDevice';
import { GameUI } from '../../src/ui/GameHud.jsx';
import { useInputManager } from '../../src/InputManager.jsx';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { setActive } from '../../src/input/inputState.js';
import { readControlsSeen, readControlsCardDone } from '../../src/ui/controlsSeen.js';

const HUD_STATE = {
  selectedBlock: null, inventory: { blocks: {} },
  setSelectedBlock: () => {}, setShowSettings: () => {}, setShowInventory: () => {}, setShowForge: () => {},
  setShowMagic: () => {}, setShowBuildingTools: () => {},
};
/** What a new session reads on boot (the store seeds both flags from storage when it is created). */
const newSession = () => useGameStore.setState({
  controlsSeen: readControlsSeen(), controlsCardDone: readControlsCardDone(), controlsCardMs: 0, showControls: false,
});
const screenNow = () => ({ card: !!screen.queryByTestId('controls-card'), hint: !!screen.queryByTestId('controls-hint') });
/** The HUD at rest: the card and the hotbar, which draws the hint. */
const hud = () => render(<><ControlsCardUntilSeen /><GameUI gameState={HUD_STATE} level={1} xpProgress={0} /></>);
const firstRun = () => { hud(); return screenNow(); };
const play = (ms) => act(() => { vi.advanceTimersByTime(ms); });

beforeEach(() => {
  localStorage.clear();
  isTouchUIMode.mockReturnValue(false);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  document.exitPointerLock = vi.fn(); document.body.requestPointerLock = vi.fn();
});
afterEach(() => { cleanup(); vi.useRealTimers(); setActive(false); useGameStore.setState({ locale: 'en', showControls: false }); });

describe('the controls panel', () => {
  it('lists every key a player is taught, in every group, each with its label through t()', () => {
    render(<ControlsPanel onClose={() => {}} />);
    const taught = KEY_MAP.filter((r) => !r.panelHide);
    expect(taught.length, 'SETUP: KEY_MAP teaches nothing').toBeGreaterThan(15);
    expect(document.querySelectorAll('[data-controls-group]').length).toBe(KEY_GROUPS.length);
    for (const r of taught) {
      const row = [...document.querySelectorAll('[data-controls-key]')].find((el) => el.getAttribute('data-controls-key') === r.key);
      expect(row, `${r.key} is missing from the controls panel`).toBeTruthy();
      expect(row.textContent).toContain(STRINGS.en[r.labelKey]);
    }
    expect(document.querySelectorAll('[data-controls-key]').length).toBe(taught.length);
  });

  it('reads in Chinese with zh-CN selected', () => {
    act(() => useGameStore.setState({ locale: 'zh-CN' }));
    render(<ControlsPanel onClose={() => {}} />);
    expect(document.querySelector('[data-controls-key="J"]').textContent).toContain(STRINGS['zh-CN']['controls.journal']);
  });
});

describe('a first-time player finds the controls', () => {
  it('a fresh profile sees the card, not yet the hint; after one H press a new session shows neither', () => {
    newSession();
    expect(firstRun(), 'a fresh profile is not shown the controls card').toEqual({ card: true, hint: false });
    cleanup();
    setActive(true);
    renderHook(() => useInputManager({}, {}));
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH', bubbles: true })); });
    expect(useGameStore.getState().showControls, 'H did not open the controls panel').toBe(true);
    cleanup();
    newSession();
    expect(firstRun(), 'the card or the hint came back after the panel was opened').toEqual({ card: false, hint: false });
  });

  it('after 30 s of play with the card on screen it folds to the hint, which a new session keeps, and H clears', () => {
    newSession();
    hud();
    play(CARD_ON_SCREEN_MS - 1000);
    expect(screenNow(), 'the card folded early').toEqual({ card: true, hint: false });
    play(1000);
    expect(screenNow(), 'the card did not fold to the hint after its time on screen').toEqual({ card: false, hint: true });
    cleanup();
    newSession();
    expect(firstRun(), 'a new session showed the card again, or lost the hint').toEqual({ card: false, hint: true });
    act(() => useGameStore.getState().markControlsSeen());
    expect(screenNow(), 'the hint stayed after the panel was opened').toEqual({ card: false, hint: false });
  });

  it('only time with the card on screen counts: a pause does not run its clock', () => {
    newSession();
    const first = hud();
    play(20000);
    first.unmount(); // the HUD (and the card with it) is hidden: paused, in a panel
    play(60000);
    expect(useGameStore.getState().controlsCardDone, 'the card\'s time ran while it was off screen').toBe(false);
    hud();
    play(9000);
    expect(screenNow(), 'the card folded before 30 s on screen').toEqual({ card: true, hint: false });
    play(1000);
    expect(screenNow(), 'the card did not fold at 30 s on screen in total').toEqual({ card: false, hint: true });
  });

  it('the hint is a keyboard player\'s: on touch the hotbar draws none', () => {
    useGameStore.setState({ controlsSeen: false, controlsCardDone: true });
    isTouchUIMode.mockReturnValue(true);
    render(<GameUI gameState={HUD_STATE} level={1} xpProgress={0} />);
    expect(screen.queryByTestId('controls-hint'), 'the H hint shows on touch, where there is no H').toBeNull();
    cleanup();
    isTouchUIMode.mockReturnValue(false);
    render(<GameUI gameState={HUD_STATE} level={1} xpProgress={0} />);
    expect(screen.queryByTestId('controls-hint'), 'SETUP: the hint does not show on desktop either').not.toBeNull();
  });
});
