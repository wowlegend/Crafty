// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { getInput } from '../../src/input/inputState.js';

// ON TOUCH, A TAP ON A CONTROL REACHES THE CONTROL, WHILE THE WORLD STILL TAKES A TAP ON THE WORLD.
//
// TouchControls listens for every touch on the window while play is live, and cancels the touchstart and touchend of any
// touch that does not land on a surface that owns its own touches (input/touchOwnership.js). A cancelled touch fires no
// click, in Safari on iOS (the hotbar was dead on an iPad this way) and in Chromium (CI's touch e2e). So every plain button
// over the live game was dead to a finger: the HUD's Settings gear (touch's only way to Settings and Manage Worlds),
// Respawn on the death screen (play stays live on touch at a death, so the player is held there), Keep exploring on the
// victory screen, and the context-loss panel, which is the way back when iOS drops the WebGL context.
//
// The real App on a touch device, with only the two 3D scenes stubbed. Each control gets a one-finger touchstart and
// touchend dispatched on it, as p15d of the 2026-10-30 audit did; the reading is whether the game cancelled them. jsdom
// synthesizes no click, so this does not show a click arriving: the e2e taps (tests/e2e/touch-controls.spec.js, the gear;
// tests/e2e/death-pointer-lock.spec.js, Respawn) do that in Chromium. The control case is a touch on the world, which the
// router must still own and cancel.

vi.mock('../../src/GameScene', () => ({ GameScene: () => null }));
vi.mock('../../src/render/TitleDiorama', () => ({ TitleDiorama: () => null }));
vi.mock('../../src/input/touchDevice', async (orig) => ({ ...(await orig()), isTouchDevice: () => true, isTouchUIMode: () => true }));

/** A one-finger tap's touchstart and touchend, dispatched ON `el` (they bubble to the window listeners). */
function tap(el) {
  const touch = { identifier: 7, target: el, clientX: 400, clientY: 300, pageX: 400, pageY: 300 };
  const mk = (type) => {
    const ev = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'changedTouches', { value: [touch] });
    Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : [touch] });
    return ev;
  };
  const start = mk('touchstart');
  el.dispatchEvent(start);
  const end = mk('touchend');
  el.dispatchEvent(end);
  return start.defaultPrevented || end.defaultPrevented;
}

describe('touch on the controls over the live game, through the real App', () => {
  it('the gear, Respawn, Keep exploring and the context-loss panel keep their touches; the world does not', async () => {
    Element.prototype.setPointerCapture = function () {};
    window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    window.HTMLMediaElement.prototype.pause = function () {};
    const App = (await import('../../src/App.jsx')).default;
    render(<App />);
    act(() => { useGameStore.setState({ isSpawnChunkLoaded: true }); });
    fireEvent.pointerUp(await screen.findByTestId('touch-tap-to-play'));
    const world = document.createElement('canvas');
    document.body.appendChild(world);

    const cancelled = {};
    const live = () => getInput().active;
    expect(live(), 'SETUP: the touch entry did not open the input gate').toBe(true);
    // PRESENCE: the router is live and owns a touch on the world.
    expect(tap(world), 'a touch on the world was not taken by the move/look router: the instrument cannot see a cancel').toBe(true);

    const gear = await screen.findByTestId('hud-settings');
    cancelled.gear = tap(gear.querySelector('svg') || gear);

    await act(async () => { useGameStore.setState({ victoryPending: true }); });
    const keep = await screen.findByRole('button', { name: /keep exploring/i });
    cancelled.keepExploring = tap(keep);
    await act(async () => { useGameStore.setState({ victoryPending: false }); });

    await act(async () => { useGameStore.setState({ isWebGLContextLost: true }); });
    const lostPanel = await screen.findByTestId('context-loss-panel');
    cancelled.contextLossPanel = tap(lostPanel.querySelector('p') || lostPanel);
    await act(async () => { useGameStore.setState({ isWebGLContextLost: false }); });

    await act(async () => { useGameStore.setState({ _spawnTime: 0 }); useGameStore.getState().damagePlayer(100000, 'gate-mob'); });
    expect(useGameStore.getState().isAlive, 'SETUP: the lethal hit did not kill').toBe(false);
    expect(live(), 'SETUP: play went dead at the death, so the router would not route the Respawn touch at all').toBe(true);
    cancelled.respawn = tap(await screen.findByTestId('death-respawn'));

    expect(Object.keys(cancelled).length, 'controls checked').toBe(4);
    expect(cancelled, 'controls whose touch the game cancelled, so a finger cannot press them').toEqual({
      gear: false, keepExploring: false, contextLossPanel: false, respawn: false,
    });
    expect(tap(world), 'after the controls, a touch on the world is still the router\'s').toBe(true);
    world.remove();
  }, 60000);
});
