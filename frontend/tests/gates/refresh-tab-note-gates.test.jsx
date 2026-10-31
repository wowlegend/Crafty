// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, act, cleanup, fireEvent, screen } from '@testing-library/react';

/**
 * A REFRESH CONTINUES THE WORLD THE TAB WAS PLAYING (lane L8 round 2, the command session's ruling on the dynamic
 * review's F3). Item 334 made a plain visit pass over a world nobody named and nothing was earned in for an older world
 * that holds something, and a refresh is a plain visit: so F5 in a New World played for a few minutes, nothing earned
 * yet, dropped the player back into their old world. Now the page leaves itself a note as it goes (pagehide; the boot
 * note a world switch leaves, naming the tab's own world), and the boot honours a note before any rule of the plain
 * visit: the noted world is loaded, and the boot's prune keeps it. The note is not left where the next load must be a
 * plain visit or the switch's: a switch's note is already there; the tab deleted its world; the tab has no world in play
 * (it loaded nothing and never started); the world it loaded never ran a frame (the boot's hold, boot-guard-gates); or
 * the page is kept for the back-forward cache, where it may be shown again alive, with no boot. A tab with no note (a
 * new tab) keeps item 334's rule.
 *
 * Each page load is the real entry (startGame.jsx) after vi.resetModules(), jsdom's localStorage and sessionStorage kept
 * as a tab's are: the real boot, App's real autosave install and its pagehide, the real title and World Manager. The
 * page goes as a browser takes it on a refresh: beforeunload, then pagehide (PageTransitionEvent, `persisted` false),
 * or pagehide alone, as a browser that does not fire beforeunload does; the reload itself is recorded.
 * BLIND SPOT: a real browser's event order and its bfcache; a prune by ANOTHER tab of the world this tab plays (that tab
 * cannot read this tab's note: REVIEW:l8:delete-in-another-tab-writes-back).
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, receipts in the commit:
 *   T1 App's autosave install leaves no note as the page goes                -> RED expected
 *   T2 the boot's prune does not keep the world the note names               -> RED expected
 *   T3 the page going writes over a switch's note                            -> RED expected
 *   T4 pagehide leaves the note before the pending save lands                -> RED expected
 *   T5 a tab whose world was deleted leaves a note                          -> RED expected
 *   T6 a world that never ran a frame is noted (the hold skipped)            -> RED expected
 *   T7 a title that loaded nothing and never started leaves a fresh note     -> RED expected
 *   T7b plausible-wrong: only a started page leaves a note (F5 twice, from the title) -> RED expected
 *   T8 a page kept for the back-forward cache leaves a note                  -> RED expected
 *   T0 identity (a comment edit)                                             -> must SURVIVE
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
vi.mock('../../src/game/pageReload.js', () => ({ reloadPage: () => { globalThis.__reloads += 1; } }));

const AUTOSAVE_MS = 5000; // App.jsx's delay
const REAL = 'local_real';
const advance = (ms) => act(() => { vi.advanceTimersByTime(ms); });
const note = () => JSON.parse(sessionStorage.getItem('crafty.boot') || 'null');
let clock = 0;
const tick = () => { clock += 60000; vi.setSystemTime(new Date(clock)); };

/** A world on disk, written by an earlier page or another tab: the autosave's placeholder name, a new world's state plus `state`. */
async function put(id, state = {}) {
  tick();
  const saves = await import('../../src/game/worldSaves.js');
  const { buildSaveData } = await import('../../src/game/saveSchema.js');
  const { useGameStore } = await import('../../src/store/useGameStore');
  saves.writeWorld(id, { name: `Save_${new Date(clock).toLocaleString()}`, created_at: new Date(clock).toISOString(), is_owner: true },
    buildSaveData({ ...useGameStore.getInitialState(), ...state }, { position: { x: 0.5, y: 40, z: 0.5 } }));
}

/** One load of the tab: the modules fresh, the storage kept, the real entry. `runs`: the world runs a frame. */
async function pageLoad({ runs = true } = {}) {
  tick();
  vi.resetModules();
  const { useGameStore } = await import('../../src/store/useGameStore');
  const { startGame } = await import('../../src/startGame.jsx');
  const boot = await import('../../src/game/worldBoot.js');
  const saves = await import('../../src/game/worldSaves.js');
  globalThis.__worldRan = runs ? () => boot.settleBoot(sessionStorage, useGameStore.getState()._bootAttempt) : null;
  await act(async () => { startGame({ render: (el) => render(el) }); });
  await act(async () => { await Promise.resolve(); });
  const S = () => useGameStore.getState();
  const listed = (id) => saves.listWorlds().some((w) => w.id === id);
  const empty = (id) => saves.emptyPlaceholder(saves.listWorlds().find((w) => w.id === id), saves.readWorld(id));
  return { S, listed, empty };
}

const pagehide = (persisted) => (typeof PageTransitionEvent === 'function'
  ? new PageTransitionEvent('pagehide', { persisted })
  : Object.assign(new Event('pagehide'), { persisted }));

/** The page goes, as a refresh takes it: beforeunload unless `beforeunload` is false, then pagehide. */
function leave({ beforeunload = true, persisted = false } = {}) {
  act(() => {
    if (beforeunload) window.dispatchEvent(new Event('beforeunload'));
    window.dispatchEvent(pagehide(persisted));
  });
  cleanup();
}

/** The earned world continued, then the title's New World taken, its reload made: the next load is the fresh world. */
async function newWorldFromTitle() {
  await put(REAL, { coins: 50 });
  let p = await pageLoad();
  expect(p.S().continueWorld?.id, 'SETUP: the plain visit did not continue the earned world').toBe(REAL);
  fireEvent.click(screen.getByTestId('title-new-world'));
  expect({ reloads: globalThis.__reloads, note: note() }, 'SETUP: New World did not switch').toEqual({ reloads: 1, note: { fresh: true } });
  leave(); // the switch's reload: this page goes
  expect(note(), 'the page going wrote over the switch\'s note').toEqual({ fresh: true });
  p = await pageLoad();
  expect({ id: p.S()._sessionWorldId, coins: p.S().coins }, 'SETUP: New World did not start a fresh world').toEqual({ id: null, coins: 0 });
  fireEvent.click(screen.getByTestId('title-start'));
  expect(p.S().gameStarted, 'SETUP: Start did not start play').toBe(true);
  return p;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  clock = Date.parse('2026-10-31T12:00:00Z');
  vi.setSystemTime(new Date(clock));
  localStorage.clear();
  sessionStorage.clear();
  globalThis.__reloads = 0;
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('a refresh continues the world the tab was playing', () => {
  it('a New World played a moment, nothing earned: F5 continues it, past the boot\'s prune; a new tab keeps item 334', async () => {
    let p = await newWorldFromTitle();
    act(() => { p.S().setGameTime((t) => t + 1); }); // a moment of play: a save, nothing earned
    advance(AUTOSAVE_MS + 200);
    const minted = p.S()._sessionWorldId;
    expect(!!minted && p.empty(minted), 'SETUP: the new world is not an empty placeholder on disk').toBe(true);
    for (let i = 0; i < 4; i++) await put(`local_other_tab_${i}`); // four newer empty worlds, from other tabs
    leave();
    expect(note(), 'the refresh left no note naming the world the tab was playing').toEqual({ world: minted });
    p = await pageLoad();
    // PRESENCE: the boot's prune ran over this disk (the oldest of the four newer empty worlds is one past the three kept).
    expect(p.listed('local_other_tab_0'), 'SETUP: the boot pruned nothing').toBe(false);
    expect({ id: p.S()._sessionWorldId, title: p.S().continueWorld?.id, kept: p.listed(minted) },
      'the refresh did not continue the empty New World it was playing, or pruned it').toEqual({ id: minted, title: minted, kept: true });
    leave(); // F5 again, from the title of the world the last refresh continued: the tab still holds that world
    p = await pageLoad();
    expect(p.S()._sessionWorldId, 'a second refresh, from the title, left the world the tab holds').toBe(minted);
    leave();
    sessionStorage.clear(); // a new tab: its sessionStorage starts empty
    p = await pageLoad();
    expect(p.S()._sessionWorldId, 'a plain visit with no note no longer passes over an empty world for the earned one').toBe(REAL);
  }, 30000);

  it('a browser that fires only pagehide: the change pending is saved first, and the note names the slot that save made', async () => {
    let p = await newWorldFromTitle();
    act(() => { p.S().setGameTime((t) => t + 1); }); // pending: nothing has saved this world yet
    expect(p.S()._sessionWorldId, 'SETUP: the world owned a slot before the page went').toBeNull();
    leave({ beforeunload: false });
    p = await pageLoad();
    const id = p.S()._sessionWorldId;
    expect({ newSlot: !!id && id !== REAL, empty: !!id && p.empty(id) }, 'the refresh did not continue the slot its pagehide save made')
      .toEqual({ newSlot: true, empty: true });
  }, 30000);

  it('the world in play deleted in the World Manager: the page leaves no note, so the reload is a plain visit', async () => {
    await put('local_other', { coins: 50 });
    await put('local_played', { coins: 100 });
    let p = await pageLoad();
    expect(p.S()._sessionWorldId, 'SETUP: the visit did not continue the newest world').toBe('local_played');
    fireEvent.click(screen.getByTestId('title-continue'));
    const { WorldManager } = await import('../../src/WorldManager.jsx');
    render(<WorldManager onClose={() => {}} />);
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByTestId('world-delete-local_played'));
    expect(globalThis.__reloads, 'SETUP: the delete of the world in play did not reload').toBe(1);
    leave();
    expect(note(), 'a tab whose world was deleted left a note').toBeNull();
    p = await pageLoad();
    expect(p.S()._sessionWorldId, 'the reload after the delete was not a plain visit to the world left').toBe('local_other');
  }, 30000);

  it('a world that never ran a frame: no note, so the next load holds it on the title (the boot\'s hold)', async () => {
    await put(REAL, { coins: 50 });
    let p = await pageLoad({ runs: false });
    expect(p.S()._sessionWorldId, 'SETUP: the boot did not load the world').toBe(REAL);
    leave();
    expect(note(), 'a world that never ran was noted').toBeNull();
    p = await pageLoad();
    expect(p.S().bootHeld, 'the next load opened the world whose last load never ran').toMatchObject({ id: REAL, reason: 'stopped' });
  }, 30000);

  it('a title that loaded nothing and never started: no note, so the next load continues what another tab saved since', async () => {
    let p = await pageLoad();
    expect(p.S().continueWorld, 'SETUP: an empty disk loaded a world').toBeNull();
    await put('local_later', { coins: 9 }); // another tab's world
    leave();
    expect(note(), 'a page with no world in play left a note').toBeNull();
    p = await pageLoad();
    expect(p.S()._sessionWorldId, 'the next load did not continue the world another tab saved').toBe('local_later');
  }, 30000);

  it('a page kept for the back-forward cache leaves no note: it may be shown again, alive, with no boot', async () => {
    await put(REAL, { coins: 50 });
    const p = await pageLoad();
    fireEvent.click(screen.getByTestId('title-continue'));
    expect(p.S()._sessionWorldId, 'SETUP: Continue did not play the world').toBe(REAL);
    leave({ persisted: true });
    expect(note(), 'a page kept for the back-forward cache left a note').toBeNull();
  }, 30000);
});
