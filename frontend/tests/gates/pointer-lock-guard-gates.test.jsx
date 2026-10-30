// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useEffect } from 'react';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../../src/ui/ErrorBoundary.jsx';
import { useInputManager } from '../../src/InputManager.jsx';
import { GameSystemsProvider, useGameSystems } from '../../src/GameSystems.jsx';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { installAutosave } from '../../src/game/autosave.js';
import { setActive, getInput } from '../../src/input/inputState.js';
import { isAnyPanelOpen } from '../../src/ui/panelState.js';

// A DEATH, OR A PANEL KEY, ON A BROWSER WITH NO POINTER LOCK API.
//
// iOS and iPadOS WebKit define no Pointer Lock API (MDN browser-compat-data: Document.exitPointerLock,
// Document.pointerLockElement and Element.requestPointerLock are safari_ios version_added false). A bare
// document.exitPointerLock() there throws a TypeError. Thrown from InputManager's death effect, React hands it to the
// root error boundary: every death on an iPhone or iPad showed "Something went wrong / Reload" instead of YOU DIED, and
// the autosave pending at that moment never fired. Thrown from the keydown listener (an iPad with a keyboard: Tab, J, H,
// B), it surfaced as an uncaught error after the panel opened.
//
// jsdom has no Pointer Lock API either, so a bare document here IS the iOS case (asserted below as a precondition). The
// desktop cases stand a lock in: pointerLockElement reads the body until exitPointerLock is called.
//
// The subject is the real store's damage path, the real GameSystemsProvider, the real useInputManager, the real
// ErrorBoundary and the real autosave, and in the last case the real App on a touch device with only the two 3D scenes
// stubbed. What it does not cover: a browser's own pointer lock, which CI's e2e covers as far as Chromium can
// (tests/e2e/death-pointer-lock.spec.js), and a real iPhone or iPad (Kevin's device run, DECISIONS item 161).

vi.mock('../../src/GameScene', () => ({ GameScene: () => null }));
// The title's 3D diorama is a lazy R3F canvas, which throws in jsdom (no ResizeObserver) when its chunk lands: a crash page
// that is not the subject, at a moment that races the death.
vi.mock('../../src/render/TitleDiorama', () => ({ TitleDiorama: () => null }));
vi.mock('../../src/input/touchDevice', async (orig) => ({ ...(await orig()), isTouchDevice: () => true, isTouchUIMode: () => true }));

const initial = useGameStore.getState();
let saves = 0;
let errors = [];
const onWindowError = (e) => { errors.push(e.message || String(e.error)); e.preventDefault(); };

afterEach(() => {
  cleanup();
  delete document.exitPointerLock;
  delete document.pointerLockElement;
  window.removeEventListener('error', onWindowError);
  useGameStore.setState(initial, true);
  setActive(false);
  saves = 0;
  errors = [];
});

/** What the crash page says broke, for a failure message. */
const crashText = () => (screen.queryByTestId('error-boundary')?.textContent || '').slice(0, 240);

/** The iOS document: no Pointer Lock API at all. A SETUP failure if jsdom ever grows one. */
function noPointerLockApi() {
  const api = { exit: 'exitPointerLock' in document, element: 'pointerLockElement' in document, request: 'requestPointerLock' in document.body };
  if (api.exit || api.element || api.request) throw new Error(`SETUP: this document has a Pointer Lock API: ${JSON.stringify(api)}`);
}

/** A desktop document holding a lock. Returns the stand-in: lock() takes it again, exits counts each release. */
function heldLock() {
  const lock = { held: document.body, exits: 0 };
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => lock.held });
  document.exitPointerLock = () => { lock.exits += 1; lock.held = null; };
  lock.relock = () => { lock.held = document.body; };
  return lock;
}

function GameLike() {
  const gameSystems = useGameSystems();
  useInputManager({}, gameSystems);
  return <div data-testid="game-alive">game alive={String(gameSystems.isAlive)}</div>;
}
function AutosaveLike() {
  useEffect(() => installAutosave(useGameStore, { save: () => { saves += 1; }, delayMs: 60 }), []);
  return null;
}
const game = () => (
  <ErrorBoundary>
    <GameSystemsProvider>
      <AutosaveLike />
      <GameLike />
    </GameSystemsProvider>
  </ErrorBoundary>
);

/** Progress a persisted key, then die before the autosave delay elapses. */
async function dieAfterProgress() {
  render(game());
  expect(screen.queryByTestId('game-alive'), 'SETUP: the game did not render').not.toBeNull();
  await act(async () => { useGameStore.setState({ coins: (useGameStore.getState().coins || 0) + 50, _spawnTime: 0 }); });
  await act(async () => { useGameStore.getState().damagePlayer(100000, 'gate-mob'); });
  await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
  expect(useGameStore.getState().isAlive, 'SETUP: the lethal hit did not kill, so nothing below was asked').toBe(false);
  return { crash: screen.queryByTestId('error-boundary'), game: screen.queryByTestId('game-alive') };
}

describe('a death', () => {
  it('on a browser with no Pointer Lock API keeps the game on screen, and the pending autosave still fires', async () => {
    noPointerLockApi();
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await dieAfterProgress();
    quiet.mockRestore();
    expect(r.crash, `the death took the app to the crash page: ${crashText()}`).toBeNull();
    expect(r.game, 'the game is no longer rendered').not.toBeNull();
    expect(saves, 'the autosave pending at the death never fired').toBeGreaterThanOrEqual(1);
  });

  it('while the pointer is locked releases it exactly once, and the autosave fires as before', async () => {
    const lock = heldLock();
    const r = await dieAfterProgress();
    expect(r.crash).toBeNull();
    expect(lock.exits, 'the death did not release the held pointer, so a desktop player cannot click Respawn').toBe(1);
    expect(lock.held).toBeNull();
    expect(saves).toBeGreaterThanOrEqual(1);
  });
});

const PANEL_KEYS = ['Tab', 'KeyJ', 'KeyH', 'KeyB'];
const closeAll = () => {
  const s = useGameStore.getState();
  s.setShowInventory(false); s.setShowQuestLog(false); s.setShowControls(false); s.setShowBuildingTools(false);
  s.setShowMagic(false); s.setShowForge(false); s.setShowSettings(false);
};

/** Each panel key from a clean state; returns how many opened a panel, and runs `before` ahead of each key. */
async function pressPanelKeys(before = () => {}) {
  window.addEventListener('error', onWindowError);
  render(<ErrorBoundary><GameSystemsProvider><GameLike /></GameSystemsProvider></ErrorBoundary>);
  let opened = 0;
  for (const code of PANEL_KEYS) {
    await act(async () => { closeAll(); setActive(true); before(); });
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true })); });
    if (isAnyPanelOpen(useGameStore.getState())) opened += 1;
  }
  return opened;
}

describe('a panel key (an iPad keyboard, or a desktop)', () => {
  it('with no Pointer Lock API, Tab, J, H and B each open their panel and throw nothing', async () => {
    noPointerLockApi();
    const opened = await pressPanelKeys();
    expect(opened, 'not every panel key opened its panel').toBe(PANEL_KEYS.length);
    expect(errors, 'a panel key threw on a browser with no Pointer Lock API').toEqual([]);
    expect(screen.queryByTestId('error-boundary')).toBeNull();
  });

  it('with a held lock, each panel key that opens a panel releases it', async () => {
    const lock = heldLock();
    let released = 0;
    const opened = await pressPanelKeys(() => { if (lock.held === null) released += 1; lock.relock(); });
    if (lock.held === null) released += 1;
    expect(opened).toBe(PANEL_KEYS.length);
    expect(released, 'a panel opened with the pointer still locked, so its controls cannot be clicked').toBe(PANEL_KEYS.length);
    expect(errors).toEqual([]);
  });
});

describe('the real App on a touch device with no Pointer Lock API', () => {
  it('shows YOU DIED at a death, not the crash page', async () => {
    noPointerLockApi();
    Element.prototype.setPointerCapture = function () {};
    window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    window.HTMLMediaElement.prototype.pause = function () {};
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const App = (await import('../../src/App.jsx')).default;
    render(<ErrorBoundary><App /></ErrorBoundary>);
    act(() => { useGameStore.setState({ isSpawnChunkLoaded: true }); });
    const tap = await screen.findByTestId('touch-tap-to-play');
    fireEvent.pointerUp(tap);
    expect(getInput().active, 'SETUP: the touch entry did not open the input gate').toBe(true);
    await act(async () => { useGameStore.setState({ _spawnTime: 0 }); useGameStore.getState().damagePlayer(100000, 'gate-mob'); });
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    quiet.mockRestore();
    expect(useGameStore.getState().isAlive, 'SETUP: the lethal hit did not kill').toBe(false);
    expect(screen.queryByTestId('error-boundary'), `a death on iOS showed the crash page: ${crashText()}`).toBeNull();
    expect(screen.queryByTestId('death-screen'), 'the death screen did not show').not.toBeNull();
  }, 60000);
});
