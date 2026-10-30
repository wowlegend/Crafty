// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act, within, waitFor } from '@testing-library/react';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { getInput } from '../../src/input/inputState.js';
import { ASPECT_VERBS } from '../../src/input/aspectWheel.js';

// SHOW STATS ON TOUCH LEAVES THE ACTION BUTTON AND THE ROAR WORKING.
//
// Show Stats (F3) draws a frame-time readout inside the canvas; it is not a panel (ui/panelState.js says why). App passed
// it to TouchControls as an open panel anyway, and TouchControls refuses every action and roar press while a panel is
// open: on an iPad or iPhone, Settings > Show Stats > Close left a readout up and every attack, mine and heavy doing
// nothing, with no message, until the toggle was found again or the page reloaded.
//
// The real App on a touch device, with only the two 3D scenes stubbed (the game scene records the showStats prop it is
// handed, which is what mounts the readout). Everything else is real: the touch entry, the HUD's Settings gear, the lazy Settings panel,
// its Show Stats toggle and Close, App's wiring into TouchControls, and TouchControls' action button and roar sector.
// Not covered: a real finger (the gear tap is tests/e2e/touch-controls.spec.js).

const seen = { showStats: undefined };
vi.mock('../../src/GameScene', () => ({ GameScene: (p) => { seen.showStats = p.showStats; return null; } }));
// The title's 3D diorama is a lazy R3F canvas, which throws in jsdom (no ResizeObserver) when its chunk lands.
vi.mock('../../src/render/TitleDiorama', () => ({ TitleDiorama: () => null }));
vi.mock('../../src/input/touchDevice', async (orig) => ({ ...(await orig()), isTouchDevice: () => true, isTouchUIMode: () => true }));

const ROAR = ASPECT_VERBS.find((a) => a.verb === 'roar');
const presses = [];

async function setShowStats(on) {
  fireEvent.click(screen.getByTestId('hud-settings'));
  const row = await screen.findByText('Show Stats (F3)');
  const toggle = within(row.parentElement).getByRole('button');
  if ((seen.showStats === true) !== on) fireEvent.click(toggle);
  const closes = screen.getAllByRole('button', { name: 'Close' });
  fireEvent.click(closes[closes.length - 1]);
  await waitFor(() => expect(useGameStore.getState().showSettings).toBe(false));
  await waitFor(() => expect(seen.showStats, `SETUP: the readout did not turn ${on ? 'on' : 'off'}`).toBe(on));
}

/** One finger press and lift on the action button: how many presses reached the game. */
function pressAction(id) {
  const n = presses.length;
  const btn = screen.getByTestId('touch-action');
  fireEvent.pointerDown(btn, { pointerId: id, pointerType: 'touch' });
  fireEvent.pointerUp(btn, { pointerId: id, pointerType: 'touch' });
  return presses.length - n;
}

/** Open the Aspect ring, press the roar sector: whether the roar intent rose. */
function pressRoar(id) {
  fireEvent.pointerUp(screen.getByTestId('touch-aspects'));
  const sector = screen.getByTestId('touch-aspect-roar');
  fireEvent.pointerDown(sector, { pointerId: id, pointerType: 'touch' });
  const raised = getInput().roar;
  fireEvent.pointerUp(sector, { pointerId: id, pointerType: 'touch' });
  if (screen.queryByTestId('touch-aspect-roar')) fireEvent.pointerUp(screen.getByTestId('touch-aspects'));
  return raised;
}

describe('Show Stats on touch, through the real App', () => {
  it('with the readout on, every action press reaches the game and the roar rises', async () => {
    Element.prototype.setPointerCapture = function () {};
    window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    window.HTMLMediaElement.prototype.pause = function () {};
    const App = (await import('../../src/App.jsx')).default;
    useGameStore.setState({ unlockedTalents: { [ROAR.talent]: 1 } });
    render(<App />);
    act(() => { useGameStore.setState({ isSpawnChunkLoaded: true }); });
    fireEvent.pointerUp(await screen.findByTestId('touch-tap-to-play'));
    await screen.findByTestId('touch-action');
    await screen.findByTestId('hud-settings');
    useGameStore.setState({
      pressPrimary: (b, src) => { presses.push([b, src]); return 'attack'; },
      releasePrimary: () => {},
    });

    // PRESENCE: with the readout off, the instrument sees a press and a roar.
    expect(seen.showStats, 'SETUP: the readout started on').toBe(false);
    expect(pressAction(3), 'SETUP: the action button pressed nothing with the readout off').toBe(1);
    expect(pressRoar(4), 'SETUP: the roar did not rise with the readout off').toBe(true);

    await setShowStats(true);
    const withStats = [pressAction(5), pressAction(6), pressAction(7)];
    expect(withStats, 'Show Stats disabled the action button: presses reaching the game').toEqual([1, 1, 1]);
    expect(pressRoar(8), 'Show Stats disabled the roar').toBe(true);

    await setShowStats(false);
    expect(pressAction(9)).toBe(1);
    expect(presses.length, 'presses reaching the game, all told').toBe(5);
  }, 60000);
});
