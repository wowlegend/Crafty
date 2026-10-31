// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
vi.mock('../../src/input/touchDevice', async (orig) => ({ ...(await orig()), isTouchDevice: () => false, isTouchUIMode: () => false }));
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { useShallow } from 'zustand/react/shallow';
import { useInputManager } from '../../src/InputManager.jsx';
import { MenuSystem } from '../../src/MenuSystem.jsx';
import { HUD } from '../../src/HUD.jsx';
import { SoundProvider } from '../../src/SoundManager.jsx';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { selectHudState } from '../../src/store/hudState.js';
import { useActiveInput } from '../../src/input/useActiveInput';
import { setActive } from '../../src/input/inputState.js';
import { PANEL_FLAGS } from '../../src/ui/panelState.js';

// EVERY WAY BACK THE PLAYER CLICKS OR PRESSES ASKS FOR THE POINTER ONCE THE SURFACE IS GONE (lane L5).
//
// requestGameLock refuses while any surface is up (input/pointerLock.js): under a lock every click goes to the canvas, so
// a lock taken with a panel drawn leaves it unclickable. So a way back that hands it state read before its own close
// write is refused, and nothing says so: the panel closes, the pointer stays free, and the player lands on PAUSED and
// needs a second click. The ways back, each driven as the player drives it, over the live store:
//   - each PANEL_FLAG's own close control (its accessible name, "Close" or the World Manager's "×"), under the real
//     MenuSystem fed App's slice (store/hudState.js) and the real useInputManager;
//   - Esc over each PANEL_FLAG (useInputManager's keydown);
//   - Keep exploring on VICTORY and Respawn on the death screen, under the real HUD.
// The store's requester stands in for GameScene's (it targets the canvas in the game) and counts the requests that reach
// it, so a refused request reads 0. Each case also shows its surface up before the press and gone after it.
// Not covered here: whether the browser grants the request (a click is a fresh gesture; Esc in a panel, with the pointer
// already free, is not the browser's unlock gesture), which the e2e suite and a person see.

const QUEST_STUB = { achievements: [], unlockedAchievements: [], stats: {}, quests: [], notifications: [] };
function Menu() {
  const gameState = useGameStore(useShallow(selectHudState));
  const im = useInputManager(gameState, { isAlive: true });
  const isPointerLocked = useActiveInput();
  return (
    <SoundProvider>
      <MenuSystem gameState={gameState} showAchievements={im.showAchievements} setShowAchievements={im.setShowAchievements}
        showSpellUpgrades={im.showSpellUpgrades} setShowSpellUpgrades={im.setShowSpellUpgrades} isPointerLocked={isPointerLocked}
        setIsPointerLocked={setActive} showStats={im.showStats} setShowStats={im.setShowStats} questSystem={QUEST_STUB} />
    </SoundProvider>
  );
}
function Hud({ isAlive }) {
  const gameState = useGameStore(useShallow(selectHudState));
  const gameSystems = { isAlive, respawn: useGameStore.getState().respawn, damageFlash: false, screenShake: 0 };
  return (
    <SoundProvider>
      <HUD isPointerLocked={false} isWorldBuilt gameState={gameState} gameSystems={gameSystems} experienceSystem={{}}
        questSystem={QUEST_STUB} treasureChests={{ chests: [], openedChestIds: new Set() }} bossSystem={{}} />
    </SoundProvider>
  );
}

const closed = Object.fromEntries(PANEL_FLAGS.map((k) => [k, false]));
let asks;
beforeAll(async () => {
  await import('../../src/ui/panels/panelBundle.js');
  // jsdom implements no media playback (play() returns undefined); the HUD's MusicPlayer calls play().catch().
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  window.HTMLMediaElement.prototype.pause = () => {};
});
beforeEach(() => {
  document.exitPointerLock = vi.fn();
  setActive(false);
  asks = vi.fn();
  useGameStore.setState({ ...closed, gameStarted: true, isAlive: true, victoryPending: false, isWebGLContextLost: false,
    requestPointerLock: asks, selectedVillager: { id: 'gate-v', npcName: 'Gate' }, activeChestCoords: '1_2_3' });
});
afterEach(() => { cleanup(); setActive(false); delete document.exitPointerLock; });

const open = (flag) => act(() => { useGameStore.setState({ ...closed, [flag]: true }); });

describe('a panel closed by the player asks for the pointer once it is gone', () => {
  it('each PANEL_FLAG, by its own close control', async () => {
    const rows = [];
    for (const flag of PANEL_FLAGS) {
      open(flag);
      render(<Menu />);
      const controls = await screen.findAllByRole('button', { name: /^(close|×)$/i }, { timeout: 4000 }).catch(() => []);
      asks.mockClear();
      if (controls.length) act(() => { fireEvent.click(controls[0]); });
      rows.push({ flag, controls: controls.length, closed: !useGameStore.getState()[flag], asks: asks.mock.calls.length });
      cleanup();
    }
    console.log(`[close-relock] ${rows.length} panels by their close control: ${JSON.stringify(rows.map((r) => [r.flag, r.asks]))}`);
    expect(rows.length, 'the denominator: every PANEL_FLAG').toBe(13);
    expect(rows.filter((r) => !r.controls || !r.closed).map((r) => r.flag), 'SETUP: no close control found, or it did not close its panel').toEqual([]);
    expect(rows.filter((r) => r.asks !== 1).map((r) => `${r.flag}: ${r.asks} requests`), 'closed by its own control, the pointer was not asked for once').toEqual([]);
  });

  it('each PANEL_FLAG, by Esc', () => {
    const rows = [];
    for (const flag of PANEL_FLAGS) {
      open(flag);
      render(<Menu />);
      asks.mockClear();
      act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true, cancelable: true })); });
      rows.push({ flag, closed: !useGameStore.getState()[flag], asks: asks.mock.calls.length });
      cleanup();
    }
    expect(rows.length, 'the denominator: every PANEL_FLAG').toBe(13);
    expect(rows.filter((r) => !r.closed).map((r) => r.flag), 'SETUP: Esc did not close the panel').toEqual([]);
    expect(rows.filter((r) => r.asks !== 1).map((r) => `${r.flag}: ${r.asks} requests`), 'closed by Esc, the pointer was not asked for once').toEqual([]);
  });
});

describe('the HUD\'s ways back ask for the pointer once their screen is gone', () => {
  it('Keep exploring on VICTORY', () => {
    act(() => { useGameStore.setState({ victoryPending: true }); });
    render(<Hud isAlive />);
    const button = screen.getByTestId('victory-keep-exploring');
    asks.mockClear();
    act(() => { fireEvent.click(button); });
    expect({ victoryPending: useGameStore.getState().victoryPending, asks: asks.mock.calls.length },
      'after Keep exploring: VICTORY gone (the presence) and the pointer asked for once').toEqual({ victoryPending: false, asks: 1 });
  });

  it('Respawn on the death screen', () => {
    act(() => { useGameStore.setState({ isAlive: false }); });
    render(<Hud isAlive={false} />);
    const button = screen.getByTestId('death-respawn');
    asks.mockClear();
    act(() => { fireEvent.click(button); });
    expect({ isAlive: useGameStore.getState().isAlive, asks: asks.mock.calls.length },
      'after Respawn: alive again (the presence) and the pointer asked for once').toEqual({ isAlive: true, asks: 1 });
  });
});
