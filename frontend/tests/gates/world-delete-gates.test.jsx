// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, act, cleanup, fireEvent, screen } from '@testing-library/react';

/**
 * A WORLD DELETED WHILE IT IS PLAYED STAYS DELETED (the July review's delete-current-world-resurrects, :1185; lane L8).
 * The World Manager is reachable mid-game (Esc, Settings, Manage Worlds) and from the title, where the boot has already
 * loaded the world Continue names. Deleting that world removed its slot, and the tab kept playing it and kept owning
 * the slot's id: the next autosave, or the flush when the tab was hidden or closed, wrote the whole world back, under a
 * new Save_<time> name and a new creation date. Now deleting the world the tab plays ends the tab's claim to it (the
 * store saves nothing more), and the page reloads as a plain visit, which continues the newest world left or offers
 * Start Adventure.
 *
 * The page is the real entry (startGame.jsx) with the real autosave; the World Manager is the real one, rendered beside
 * it as the panel mounts it; the reload is recorded with the note it leaves, and the unload it causes is the flush a
 * browser runs (beforeunload).
 * BLIND SPOT: a delete of the world in play from another tab (that tab's next save writes it back, as before).
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, receipts in the commit:
 *   W1 the delete of the world in play keeps the tab's claim                -> RED expected
 *   W2 the store saves a world whose slot was deleted                       -> RED expected
 *   W3 the delete of the world in play does not reload                      -> RED expected
 *   W4 plausible-wrong: deleting any world ends the claim (the control)      -> RED expected
 *   W0 identity (a comment edit)                                             -> must SURVIVE
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
vi.mock('../../src/game/pageReload.js', () => ({ reloadPage: () => { globalThis.__reloads.push(sessionStorage.getItem('crafty.boot')); } }));

const AUTOSAVE_MS = 5000; // App.jsx's delay
const PLAYED = 'local_played';
const OTHER = 'local_other';
const advance = (ms) => act(() => { vi.advanceTimersByTime(ms); });
const index = () => JSON.parse(localStorage.getItem('crafty_world_saves') || '[]');
const coinsOn = (id) => JSON.parse(localStorage.getItem(`crafty_world_save_${id}`) || 'null')?.progression?.coins;

async function playPlayed() {
  const saves = await import('../../src/game/worldSaves.js');
  const { buildSaveData } = await import('../../src/game/saveSchema.js');
  const { useGameStore: seedStore } = await import('../../src/store/useGameStore');
  const put = (id, name, coins) => saves.writeWorld(id, { name, created_at: '2026-10-01T00:00:00Z', is_owner: true, saved_at: '2026-10-30T12:00:00Z' },
    buildSaveData({ ...seedStore.getInitialState(), coins }, { position: { x: 0.5, y: 40, z: 0.5 } }));
  put(OTHER, 'Other Vale', 50);
  put(PLAYED, 'Played Keep', 100); // written last: the plain visit continues it
  vi.resetModules();
  const { useGameStore } = await import('../../src/store/useGameStore');
  const { startGame } = await import('../../src/startGame.jsx');
  const boot = await import('../../src/game/worldBoot.js');
  const { WorldManager } = await import('../../src/WorldManager.jsx');
  globalThis.__worldRan = () => boot.settleBoot(sessionStorage, useGameStore.getState()._bootAttempt);
  await act(async () => { startGame({ render: (el) => render(el) }); });
  await act(async () => { await Promise.resolve(); });
  const S = () => useGameStore.getState();
  expect(S()._sessionWorldId, 'SETUP: the visit did not continue the world').toBe(PLAYED);
  fireEvent.click(screen.getByTestId('title-continue'));
  act(() => { S().addCoins(5); });
  advance(AUTOSAVE_MS + 200);
  // PRESENCE: the world in play saves into its slot, so its absence after the delete is the delete holding.
  expect(coinsOn(PLAYED), 'SETUP: the world in play did not save').toBe(105);
  render(<WorldManager onClose={() => {}} />);
  await act(async () => { await Promise.resolve(); });
  return { S };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2026-10-31T12:00:00Z'));
  localStorage.clear();
  sessionStorage.clear();
  globalThis.__reloads = [];
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('deleting the world in play', () => {
  it('a change pending, the world deleted: the page reloads as a plain visit and nothing writes the world back', async () => {
    const { S } = await playPlayed();
    act(() => { S().addCoins(1); }); // a save pending: the autosave or the unload flush would write it
    fireEvent.click(screen.getByTestId(`world-delete-${PLAYED}`));
    act(() => { window.dispatchEvent(new Event('beforeunload')); }); // the reload's unload: the autosave flushes
    advance(AUTOSAVE_MS * 3);
    expect(index().map((w) => w.id), 'the deleted world came back, or another world went').toEqual([OTHER]);
    expect(localStorage.getItem(`crafty_world_save_${PLAYED}`), 'the deleted world\'s save was written back').toBeNull();
    expect(globalThis.__reloads, 'the page did not reload as a plain visit after its world was deleted').toEqual([null]);
  }, 30000);

  it('control: deleting another world leaves the world in play saving into its own slot, with no reload', async () => {
    const { S } = await playPlayed();
    fireEvent.click(screen.getByTestId(`world-delete-${OTHER}`));
    act(() => { S().addCoins(1); });
    advance(AUTOSAVE_MS + 200);
    expect({ reloads: globalThis.__reloads, ids: index().map((w) => w.id), coins: coinsOn(PLAYED) },
      'deleting another world disturbed the world in play').toEqual({ reloads: [], ids: [PLAYED], coins: 106 });
  }, 30000);
});
