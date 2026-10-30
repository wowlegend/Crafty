// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
vi.mock('../../src/input/touchDevice', async (orig) => ({ ...(await orig()), isTouchDevice: () => false, isTouchUIMode: () => false }));
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { useShallow } from 'zustand/react/shallow';
import { useInputManager } from '../../src/InputManager.jsx';
import { MenuSystem } from '../../src/MenuSystem.jsx';
import { SoundProvider } from '../../src/SoundManager.jsx';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { selectHudState } from '../../src/store/hudState.js';
import { useActiveInput } from '../../src/input/useActiveInput';
import { setActive } from '../../src/input/inputState.js';
import { PANEL_FLAGS, isAnyPanelOpen } from '../../src/ui/panelState.js';

// A KEY AIMED AT A TEXT FIELD IS TEXT, A KEY MID-COMPOSITION IS THE IME'S, TAB IN A DIALOG IS THE DIALOG'S, AND A HELD KEY
// TOGGLES ONCE (AUDIT:softlocks:world-manager-keys-stolen; the July review's panel-key repeat strobe).
//
// InputManager listens for keydown on the window in the capture phase, ahead of every field, so it saw the keys typed into
// World Manager's name field as game keys: "Hobbit Hole" became "it " and opened Build, Controls and the Journal (b, h, j),
// Tab from the field opened Character, and Esc there did not even close World Manager. Tab inside any dialog switched to
// Character instead of reaching the dialog's own focus trap (ui/primitives/Modal.jsx), and a held panel key strobed its
// panel open and shut at the key-repeat rate.
//
// The subject is the real useInputManager under the real MenuSystem and its real panels, over the live store; World
// Manager's create dialog is opened by its own button. A typed key is dispatched on the field (it bubbles through the
// window's capture listener first, as in a browser); jsdom inserts no text, so "typed" here means the game neither took
// the key (opened a panel) nor cancelled it (preventDefault would stop the browser inserting the character).

const QUEST_STUB = { achievements: [], unlockedAchievements: [], stats: {}, quests: [] };
let im = null;
function Harness() {
  const gameState = useGameStore(useShallow(selectHudState));
  im = useInputManager(gameState, { isAlive: true });
  const isPointerLocked = useActiveInput();
  return (
    <SoundProvider>
      <MenuSystem gameState={gameState} showAchievements={im.showAchievements} setShowAchievements={im.setShowAchievements}
        showSpellUpgrades={im.showSpellUpgrades} setShowSpellUpgrades={im.setShowSpellUpgrades} isPointerLocked={isPointerLocked}
        setIsPointerLocked={setActive} showStats={im.showStats} setShowStats={im.setShowStats} questSystem={QUEST_STUB} />
    </SoundProvider>
  );
}
const openPanels = () => {
  const s = useGameStore.getState();
  const f = { ...s, showAchievements: im?.showAchievements ?? s.showAchievements, showSpellUpgrades: im?.showSpellUpgrades ?? s.showSpellUpgrades };
  return PANEL_FLAGS.filter((k) => f[k]);
};
const tick = (ms = 30) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const codeFor = (ch) => (ch === 'Tab' ? 'Tab' : /^[a-z]$/.test(ch) ? `Key${ch.toUpperCase()}` : /^[0-9]$/.test(ch) ? `Digit${ch}` : ch === ' ' ? 'Space' : ch);
/** One keydown on `target` (it reaches the window's capture listener first); whether it was cancelled. */
function keydown(target, ch, init = {}) {
  const ev = new KeyboardEvent('keydown', { key: ch, code: codeFor(ch), bubbles: true, cancelable: true, ...init });
  act(() => { target.dispatchEvent(ev); });
  return ev.defaultPrevented;
}

beforeAll(async () => { await import('../../src/ui/panels/panelBundle.js'); });
beforeEach(() => {
  document.exitPointerLock = vi.fn();
  setActive(false);
  useGameStore.setState({ ...Object.fromEntries(PANEL_FLAGS.map((k) => [k, false])), gameStarted: true, isAlive: true,
    victoryPending: false, isWebGLContextLost: false, requestPointerLock: vi.fn() });
});
afterEach(() => { cleanup(); setActive(false); delete document.exitPointerLock; });

describe("World Manager's name field", () => {
  it('takes every letter, digit, space and Tab as text, and Esc from it closes World Manager', async () => {
    act(() => { useGameStore.setState({ showWorldManager: true }); });
    render(<Harness />);
    fireEvent.click(await screen.findByTestId('world-create-new'));
    const field = await screen.findByTestId('world-name-field');
    const keys = [...'abcdefghijklmnopqrstuvwxyz0123456789 ', 'Tab'];
    const stolen = [];
    for (const ch of keys) {
      act(() => { field.focus(); });
      const cancelled = keydown(field, ch);
      await tick(5);
      const others = openPanels().filter((f) => f !== 'showWorldManager');
      if (cancelled || others.length || !useGameStore.getState().showWorldManager) {
        stolen.push(`${JSON.stringify(ch)}: cancelled=${cancelled} opened=[${others.join(',')}] worldManager=${useGameStore.getState().showWorldManager}`);
      }
      act(() => { useGameStore.setState(Object.fromEntries(PANEL_FLAGS.filter((f) => f !== 'showWorldManager').map((f) => [f, false]))); });
      if (!useGameStore.getState().showWorldManager) act(() => { useGameStore.setState({ showWorldManager: true }); });
    }
    console.log(`[key-focus] ${keys.length} keys typed into the field, ${stolen.length} taken by the game`);
    expect(keys.length, 'the denominator: 26 letters, 10 digits, the space and Tab').toBe(38);
    expect(stolen, 'keys the game took from the text field').toEqual([]);

    act(() => { field.focus(); });
    keydown(field, 'Escape', { code: 'Escape' });
    expect(useGameStore.getState().showWorldManager, 'Esc typed in the field did not close World Manager').toBe(false);
  });
});

describe('a key the IME is composing', () => {
  it('opens nothing; the same key outside a composition opens its panel (the presence)', () => {
    render(<Harness />);
    act(() => { setActive(true); });
    // Each composition signal alone: isComposing, and the legacy keyCode 229 some engines send for the key that ends one.
    const composing = [];
    for (const init of [{ isComposing: true }, { keyCode: 229 }]) {
      keydown(document.body, 'b', init);
      composing.push(...openPanels().map((f) => `${JSON.stringify(init)} -> ${f}`));
      act(() => { useGameStore.setState(Object.fromEntries(PANEL_FLAGS.map((k) => [k, false]))); setActive(true); });
    }
    keydown(document.body, 'b');
    const plain = openPanels();
    expect(plain, 'PRESENCE: B in play did not open Build, so nothing above was measured').toEqual(['showBuildingTools']);
    expect(composing, 'a key mid-composition opened a panel').toEqual([]);
  });
});

describe('Tab inside a dialog', () => {
  it('reaches the dialog\'s own focus trap in Settings, and still closes Character, whose key it is', async () => {
    act(() => { useGameStore.setState({ showSettings: true }); });
    render(<Harness />);
    const dialog = await screen.findByRole('dialog', { name: 'Settings' });
    const items = Array.from(dialog.querySelectorAll('button:not([disabled]),input:not([disabled])'));
    expect(items.length, 'SETUP: Settings has nothing focusable').toBeGreaterThan(2);
    act(() => { items[items.length - 1].focus(); });
    keydown(items[items.length - 1], 'Tab');
    await tick();
    expect(openPanels(), 'Tab in Settings switched to another panel').toEqual(['showSettings']);
    expect(document.activeElement, 'Tab on the last control did not wrap to the first (the trap never ran)').toBe(items[0]);

    act(() => { useGameStore.setState({ showSettings: false, showInventory: true }); });
    await tick();
    keydown(document.activeElement || document.body, 'Tab');
    expect(isAnyPanelOpen(useGameStore.getState()), 'Tab no longer closes Character').toBe(false);
  });
});

describe('a held panel key', () => {
  it('toggles its panel once: the auto-repeat leaves it as the first press did, and the next press toggles again', () => {
    render(<Harness />);
    const rows = [];
    for (const [ch, flag] of [['b', 'showBuildingTools'], ['h', 'showControls'], ['j', 'showQuestLog'], ['Tab', 'showInventory']]) {
      act(() => { useGameStore.setState(Object.fromEntries(PANEL_FLAGS.map((k) => [k, false]))); setActive(true); });
      keydown(document.body, ch);
      const first = openPanels();
      // One auto-repeat, then three: an even count would toggle back and hide a strobe.
      keydown(document.body, ch, { repeat: true });
      const held = openPanels();
      for (let i = 0; i < 3; i++) keydown(document.body, ch, { repeat: true });
      const heldLong = openPanels();
      keydown(document.body, ch);
      const again = openPanels();
      rows.push({ ch, first, held, heldLong, again, flag });
    }
    expect(rows.length, 'the denominator: B, H, J and Tab').toBe(4);
    const presence = rows.filter((r) => r.first.join() !== r.flag || r.again.length !== 0);
    expect(presence, 'PRESENCE: a press did not open its panel, or the next press did not close it').toEqual([]);
    const strobed = rows.filter((r) => r.held.join() !== r.flag || r.heldLong.join() !== r.flag);
    expect(strobed, 'a held key toggled its panel on its auto-repeat').toEqual([]);
  });
});
