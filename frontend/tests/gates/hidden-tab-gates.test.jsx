// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup, fireEvent, screen } from '@testing-library/react';

/**
 * A HIDDEN TAB KEEPS NO CLOCK AND WRITES NOTHING (L2 review round 2, static F1). On touch nothing pauses a page that is
 * switched away from (game/worldClock.js isPlayPaused: no pointer lock to lose), so a hidden tab's day clock kept
 * ticking, every tick changed gameTime, and every change scheduled an autosave: the hidden tab wrote its world every few
 * seconds. With two tabs on one world (a second tab and Continue), each of those writes was newer than the save the
 * visible tab had read, so the visible tab's next save was refused and the conflict panel took its world (DECISIONS
 * 2026-10-30 item 221), after every Continue. Now the day clock does not advance while the page is hidden, and a change
 * made while it is hidden is saved when it is shown again, not before.
 *
 * The page is the real entry (startGame.jsx): the real App with its real day clock (game/useDayNightClock.js) and real
 * autosave (game/autosave.js), on the touch path (input/touchDevice.js stood in to report a touch screen, so Continue
 * raises the input gate as it does on an iPad). The page is hidden and shown as a browser does: visibilityState, then
 * the visibilitychange event.
 * BLIND SPOT: a real browser's timer throttling in a hidden tab (here the hidden page's timers run at full rate, the
 * harder case), and bfcache.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, receipts in the commit:
 *   H1 the day clock ignores the page's visibility                            -> RED expected
 *   H2 a change while hidden schedules a save                                -> RED expected
 *   H3 a change held while hidden is not saved when the page is shown         -> RED expected
 *   H4 the hide no longer flushes a pending save                             -> RED expected
 *   H0 identity (a comment edit)                                             -> must SURVIVE
 */

vi.mock('../../src/GameScene', () => ({ GameScene: () => { globalThis.__worldRan?.(); return null; } }));
vi.mock('../../src/HUD', () => ({ HUD: () => null }));
vi.mock('../../src/ui/TouchControls', () => ({ default: () => null }));
vi.mock('../../src/ui/DebugOverlay', () => ({ DebugOverlay: () => null }));
vi.mock('../../src/devtest/PerfProbeRunner', () => ({ PerfProbeRunner: () => null }));
vi.mock('../../src/devtest/devBridge.js', () => ({ installDevBridge: () => {} }));
vi.mock('../../src/render/TitleDiorama.jsx', () => ({ TitleDiorama: () => null }));
vi.mock('../../src/render/dragonLoader.js', () => ({ preloadDragon: () => {}, shouldPreloadAtMount: () => false }));
vi.mock('../../src/SoundManager', () => ({
  SoundProvider: ({ children }) => children,
  useSounds: () => ({ musicEnabled: false, playBackgroundMusic: () => {}, resumeAudio: () => {} }),
  useGameSounds: () => ({ playAttack: () => {}, playSwing: () => {}, playHit: () => {}, playDefeat: () => {} }),
}));
vi.mock('../../src/game/pageReload.js', () => ({ reloadPage: () => {} }));
vi.mock('../../src/input/touchDevice', async (importOriginal) => ({ ...(await importOriginal()), isTouchDevice: () => true }));

const AUTOSAVE_MS = 5000; // App.jsx's delay
const WORLD = 'local_hidden';
const advance = (ms) => act(() => { vi.advanceTimersByTime(ms); });

let visibility = 'visible';
const setVisibility = (v) => act(() => { visibility = v; document.dispatchEvent(new Event('visibilitychange')); });
let writes = 0; // writes of a world blob, counted at the storage

async function playWorld() {
  const saves = await import('../../src/game/worldSaves.js');
  const { buildSaveData } = await import('../../src/game/saveSchema.js');
  const { useGameStore: seedStore } = await import('../../src/store/useGameStore');
  saves.writeWorld(WORLD, { name: 'Hidden', created_at: '2026-10-01T00:00:00Z', is_owner: true, saved_at: '2026-10-30T12:00:00Z' },
    buildSaveData({ ...seedStore.getInitialState(), coins: 10 }, { position: { x: 0.5, y: 40, z: 0.5 } }));
  vi.resetModules();
  const { useGameStore } = await import('../../src/store/useGameStore');
  const { startGame } = await import('../../src/startGame.jsx');
  const boot = await import('../../src/game/worldBoot.js');
  const { getInput, setActive } = await import('../../src/input/inputState');
  globalThis.__worldRan = () => boot.settleBoot(sessionStorage, useGameStore.getState()._bootAttempt);
  await act(async () => { startGame({ render: (el) => render(el) }); });
  await act(async () => { await Promise.resolve(); });
  const S = () => useGameStore.getState();
  expect(S()._sessionWorldId, 'SETUP: the visit did not load the world').toBe(WORLD);
  fireEvent.click(screen.getByTestId('title-continue'));
  act(() => { useGameStore.setState({ isSpawnChunkLoaded: true }); }); // the world is built: the day clock may run
  advance(200);
  expect({ started: S().gameStarted, active: getInput().active }, 'SETUP: Continue did not start play on the touch path').toEqual({ started: true, active: true });
  return { S, setActive: (on) => act(() => { setActive(on); }) };
}
const disk = () => JSON.parse(localStorage.getItem(`crafty_world_save_${WORLD}`));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2026-10-31T12:00:00Z'));
  localStorage.clear();
  sessionStorage.clear();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  writes = 0;
  const real = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (k, v) {
    if (String(k).startsWith('crafty_world_save_')) writes++;
    return real.call(this, k, v);
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete document.visibilityState;
  vi.useRealTimers();
});

describe('a hidden page holds its day clock and its saves', () => {
  it('visible: the clock runs and the autosave writes; hidden a minute: neither; shown: the held change saved, then the clock again', async () => {
    const { S, setActive } = await playWorld();
    // PRESENCE: while the page is shown the clock moves and its change is saved, so the instrument can see both.
    const t0 = S().gameTime;
    writes = 0;
    advance(AUTOSAVE_MS + 1200);
    expect({ clock: S().gameTime > t0, wrote: writes > 0 }, 'SETUP: a shown page in play did not tick or did not save').toEqual({ clock: true, wrote: true });

    setVisibility('hidden'); // the flush on hide writes what is pending, once
    const hiddenAt = S().gameTime;
    writes = 0;
    advance(30000);
    act(() => { S().addCoins(3); }); // a change while hidden, as any timer that pays the player makes
    advance(30000);
    expect(S().gameTime, 'the day clock ran on in a hidden page').toBe(hiddenAt);
    expect(writes, 'a hidden page wrote its world (each write is newer than the save a visible tab read)').toBe(0);

    // Shown under the touch Pause (the input gate down, so the clock stays held): the held change alone must be saved.
    setActive(false);
    setVisibility('visible');
    advance(AUTOSAVE_MS + 1200);
    expect(S().gameTime, 'SETUP: the clock ran under the Pause, so the save below could be its').toBe(hiddenAt);
    expect(disk().progression.coins, 'the change made while hidden was not saved once the page was shown').toBe(13);
    setActive(true);
    advance(2200);
    expect(S().gameTime > hiddenAt, 'the day clock did not run again once the page was shown and play resumed').toBe(true);
  }, 30000);

  it('a save pending when the page is hidden is written at the hide, and that is the last write while hidden', async () => {
    const { S } = await playWorld();
    advance(AUTOSAVE_MS + 1200);
    act(() => { S().addCoins(5); });
    writes = 0;
    setVisibility('hidden');
    expect({ writes, coins: disk().progression.coins }, 'the hide did not write the pending save').toEqual({ writes: 1, coins: 15 });
    advance(60000);
    expect(writes, 'the hidden page wrote after the hide').toBe(1);
  }, 30000);
});
