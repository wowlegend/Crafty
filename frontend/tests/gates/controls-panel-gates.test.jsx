// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';

// THE CONTROLS ARE A PANEL H OPENS, GENERATED FROM KEY_MAP, AND A FIRST-TIME PLAYER IS SHOWN THEM (the HUD lane,
// DECISIONS 2026-10-29 item 96; closes STATUS C1/c, QUEUE Q26/c, OPEN_ITEMS OI-31/c). The sheet it replaces faded after
// 8 seconds, so a returning player had nothing to find the keys by. Driven through the real InputManager key handler,
// the real store and the real localStorage flag.
//
// NOT CHECKED HERE: the HUD's own wiring of the card and hint (HUD.jsx has no jsdom harness; the e2e
// tests/e2e/panels.spec.js boots a fresh profile in a browser and reloads it).
vi.mock('../../src/input/touchDevice', () => ({ isTouchUIMode: vi.fn(() => false), isTouchDevice: vi.fn(() => false) }));
import { KEY_MAP, KEY_GROUPS } from '../../src/game/keyMap.js';
import { STRINGS } from '../../src/i18n/strings.js';
import { ControlsPanel, ControlsCardUntilSeen } from '../../src/ui/CombatInstructions.jsx';
import { GameUI } from '../../src/ui/GameHud.jsx';
import { useInputManager } from '../../src/InputManager.jsx';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { setActive } from '../../src/input/inputState.js';
import { readControlsSeen } from '../../src/ui/controlsSeen.js';

const HUD_STATE = {
  selectedBlock: null, inventory: { blocks: {} },
  setSelectedBlock: () => {}, setShowSettings: () => {}, setShowInventory: () => {}, setShowForge: () => {},
  setShowMagic: () => {}, setShowBuildingTools: () => {},
};
/** What a new session reads on boot (the store seeds controlsSeen from storage when it is created). */
const newSession = () => useGameStore.setState({ controlsSeen: readControlsSeen(), showControls: false });
const firstRun = () => {
  render(<><ControlsCardUntilSeen /><GameUI gameState={HUD_STATE} level={1} xpProgress={0} controlsHint={!useGameStore.getState().controlsSeen} /></>);
  return { card: !!screen.queryByTestId('controls-card'), hint: !!screen.queryByTestId('controls-hint') };
};

beforeEach(() => { localStorage.clear(); document.exitPointerLock = vi.fn(); document.body.requestPointerLock = vi.fn(); });
afterEach(() => { cleanup(); setActive(false); useGameStore.setState({ locale: 'en', showControls: false }); });

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
  it('a fresh profile shows the card and the hint; after one H press a new session shows neither', () => {
    newSession();
    expect(firstRun(), 'a fresh profile is not shown the controls').toEqual({ card: true, hint: true });
    cleanup();
    setActive(true);
    renderHook(() => useInputManager({}, {}));
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH', bubbles: true })); });
    expect(useGameStore.getState().showControls, 'H did not open the controls panel').toBe(true);
    cleanup();
    newSession();
    expect(firstRun(), 'the card or the hint came back after the panel was opened').toEqual({ card: false, hint: false });
  });

  it('a session that has not opened the panel keeps both, however often it is started', () => {
    newSession();
    cleanup();
    newSession();
    expect(firstRun()).toEqual({ card: true, hint: true });
  });
});
