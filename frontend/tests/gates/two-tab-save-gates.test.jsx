// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, act, cleanup, fireEvent, screen } from '@testing-library/react';
import { STRINGS } from '../../src/i18n/strings.js';

/**
 * TWO TABS ON ONE WORLD: THE STALE TAB DOES NOT WRITE OVER THE NEWER SAVE (AUDIT:persistence:two-tabs-clobber-world;
 * L2 review round 1, static F2 and dynamic F1). Every plain visit now loads the newest world and claims its slot, so a
 * second tab plus Continue is enough for two tabs to own one slot: play an hour in tab A, open tab B, Continue, play 30
 * minutes, go back to A and play 6 s, and A's older state silently overwrote B's 30 minutes (the dynamic review's r6:
 * tab B's +1000 coins lost). Now each tab knows the slot's saved_at as it last read or wrote it, and a save that finds
 * the disk's newer refuses, sets the store's slotConflict, and the page shows the conflict panel with Reload.
 *
 * Each "tab" is its own module graph (vi.resetModules(): a fresh store, a fresh _sessionWorldId) over jsdom's one
 * localStorage, booted as a plain visit through the real boot and saved through the real save (game/worldBoot.js
 * bootWorld, saveWorldInPlay). The clock is faked and moved between writes, so no two writes share a millisecond.
 * The stale tab is also told the moment the other tab writes (a `storage` event), not only at its own next save.
 * BLIND SPOT: real browsers' tab discard and bfcache; a write from another tab landing between this tab's read of the
 * index and its write (the same task, a few microseconds).
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, receipts in the commit:
 *   C1 the save never compares the disk's saved_at                              -> RED expected
 *   C2 plausible-wrong: the tab's known saved_at is not moved by its own write  -> RED expected (its second save refused)
 *   C3 plausible-wrong: the claim takes no saved_at (a tab knows none)          -> RED expected
 *   C4 the refusal sets no slotConflict                                         -> RED expected
 *   C5 App does not mount the conflict panel                                    -> RED expected
 *   C6 the panel's Reload leaves no note naming the world                       -> RED expected
 *   C7 the manual Save writes its own name and dates again                      -> RED expected
 *   C8 the conflict panel is not a covering surface (input stays live)          -> RED expected (input-live-gates)
 *   C10 the autosave does not listen for another tab's write (lane L8)          -> RED expected
 *   C11 plausible-wrong: any storage event raises the conflict                  -> RED expected
 *   C0 identity (a comment edit)                                                -> must SURVIVE
 */

vi.mock('../../src/GameScene', () => ({ GameScene: () => null }));
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

const WORLD = 'local_skyhold';
let clock = Date.parse('2026-10-30T12:00:00Z');
const tick = (min = 1) => { clock += min * 60000; vi.setSystemTime(new Date(clock)); };

/** A tab: its own modules over the shared storage, booted as a plain visit and started. */
async function openTab() {
  vi.resetModules();
  const { useGameStore } = await import('../../src/store/useGameStore');
  const boot = await import('../../src/game/worldBoot.js');
  const saves = await import('../../src/game/worldSaves.js');
  boot.bootWorld({ store: useGameStore, session: null, saves: { listWorlds: saves.listWorlds, readWorld: saves.readWorld } });
  useGameStore.setState({ gameStarted: true });
  const S = () => useGameStore.getState();
  return { store: useGameStore, S, save: () => { boot.saveWorldInPlay(S); return S().slotConflict ?? null; } };
}
const diskCoins = () => JSON.parse(localStorage.getItem(`crafty_world_save_${WORLD}`)).progression.coins;
const seed = async () => {
  const saves = await import('../../src/game/worldSaves.js');
  const { buildSaveData } = await import('../../src/game/saveSchema.js');
  const { useGameStore } = await import('../../src/store/useGameStore');
  saves.writeWorld(WORLD, { name: 'Skyhold Keep', created_at: '2026-10-01T09:00:00.000Z', is_public: true, is_owner: true, saved_at: new Date(clock).toISOString() },
    buildSaveData({ ...useGameStore.getInitialState(), coins: 100 }, { position: { x: 0, y: 40, z: 0 } }));
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  clock = Date.parse('2026-10-30T12:00:00Z');
  vi.setSystemTime(new Date(clock));
  localStorage.clear();
  sessionStorage.clear();
  globalThis.__reloads = [];
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('two tabs on one world: the tab that saved last keeps it', () => {
  it('A plays and saves; B opens (Continue), plays and saves; A plays 6 s: A\'s save is refused and A is told', async () => {
    await seed();
    const A = await openTab();
    expect(A.S()._sessionWorldId, 'SETUP: tab A did not claim the world').toBe(WORLD);
    tick(); act(() => { A.S().addCoins(5); });
    expect(A.save(), 'tab A, alone on the world, was refused').toBeNull();
    // PRESENCE: the tab's own writes land, the second as the first.
    expect(diskCoins(), 'tab A\'s first save did not land').toBe(105);
    tick(); act(() => { A.S().addCoins(5); });
    expect(A.save(), 'tab A\'s second save, over its own first, was refused').toBeNull();
    expect(diskCoins(), 'tab A\'s second save did not land').toBe(110);

    tick(); const B = await openTab();
    expect({ slot: B.S()._sessionWorldId, coins: B.S().coins }, 'SETUP: tab B did not continue the world as A left it').toEqual({ slot: WORLD, coins: 110 });
    tick(30); act(() => { B.S().addCoins(1000); });
    expect(B.save(), 'tab B, which read the newest save, was refused').toBeNull();
    expect(diskCoins(), 'tab B\'s save did not land').toBe(1110);

    tick(); act(() => { A.S().addCoins(1); });
    const conflict = A.save();
    expect(diskCoins(), 'tab A\'s stale save wrote over tab B\'s 30 minutes').toBe(1110);
    expect(conflict, 'tab A was not told the world was saved in another tab').toEqual({ id: WORLD });
    tick(); A.save();
    expect(diskCoins(), 'tab A\'s next save (the flush on hide, a switch) wrote over tab B\'s').toBe(1110);

    tick(); act(() => { B.S().addCoins(2); });
    expect(B.save(), 'tab B, still the newest writer, was refused').toBeNull();
    expect(diskCoins(), 'tab B\'s next save did not land').toBe(1112);
  });

  it('a save from before saved_at: the first tab to save it in play wins, and the other is refused', async () => {
    await seed();
    const index = JSON.parse(localStorage.getItem('crafty_world_saves'));
    delete index[0].saved_at; // a save written before the field: the index holds no time for it
    localStorage.setItem('crafty_world_saves', JSON.stringify(index));
    const A = await openTab();
    tick(); const B = await openTab();
    tick(); act(() => { B.S().addCoins(1000); });
    expect(B.save(), 'tab B, the first to save the old world, was refused').toBeNull();
    expect(diskCoins(), 'tab B\'s save did not land').toBe(1100);
    tick(); act(() => { A.S().addCoins(5); });
    expect(A.save(), 'tab A, which read the world before any time was written, was not told').toEqual({ id: WORLD });
    expect(diskCoins(), 'tab A wrote over tab B\'s save').toBe(1100);
  });
});

describe('the stale tab is told when the other tab writes, not at its own next save', () => {
  // A browser delivers a `storage` event to every OTHER page of the origin when one writes localStorage (jsdom has one
  // page, so the event is dispatched as the browser would deliver it to tab A). Each tab installs the real autosave.
  it('B saves the world: A, which has not saved since, shows the conflict at once; a write that is not the slot\'s tells it nothing', async () => {
    await seed();
    const A = await openTab();
    const { installAutosave } = await import('../../src/game/autosave.js');
    const uninstallA = installAutosave(A.store, { save: () => {} });
    const deliver = (key) => act(() => { window.dispatchEvent(new StorageEvent('storage', { key })); });
    tick(); act(() => { A.S().addCoins(5); });
    expect(A.save(), 'SETUP: tab A, alone on the world, was refused').toBeNull();
    // PRESENCE of the listener's quiet case: an event while A is the last writer, and one for another key, raise nothing.
    deliver('crafty_world_saves');
    deliver('crafty_settings');
    expect(A.S().slotConflict, 'a write that was A\'s own, or not the save\'s, raised the conflict').toBeNull();

    tick(); const B = await openTab();
    const uninstallB = installAutosave(B.store, { save: () => {} });
    tick(30); act(() => { B.S().addCoins(1000); });
    expect(B.save(), 'SETUP: tab B, which read the newest save, was refused').toBeNull();
    deliver('crafty_world_saves');
    expect(A.S().slotConflict, 'tab A was not told when tab B saved the world').toEqual({ id: WORLD });
    expect(B.S().slotConflict, 'tab B, the newest writer, was told of a conflict').toBeNull();
    expect(diskCoins(), 'SETUP: B\'s save is not on disk').toBe(1105);
    uninstallA(); uninstallB();
  });
});

describe('the stale tab is told, and its way back is a reload into the newer save', () => {
  it('App shows the conflict panel; Reload leaves a note naming the world', async () => {
    await seed();
    vi.resetModules();
    const { useGameStore } = await import('../../src/store/useGameStore');
    const { startGame } = await import('../../src/startGame.jsx');
    await act(async () => { startGame({ render: (el) => render(el) }); });
    await act(async () => { await Promise.resolve(); });
    expect(useGameStore.getState()._sessionWorldId, 'SETUP: the page did not load the world').toBe(WORLD);
    expect(screen.queryByTestId('slot-conflict-panel'), 'the panel showed with no conflict').toBeNull();
    act(() => { useGameStore.setState({ slotConflict: { id: WORLD } }); });
    const panel = screen.queryByTestId('slot-conflict-panel');
    expect(panel && panel.textContent, 'the page does not tell the player').toContain(STRINGS.en['save.otherTab']);
    expect(STRINGS['zh-CN']['save.otherTab'], 'no zh-CN copy').toBeTruthy();
    fireEvent.click(screen.getByTestId('slot-conflict-reload'));
    expect(globalThis.__reloads.map((n) => JSON.parse(n || 'null')), 'Reload did not reload into the world').toEqual([{ world: WORLD }]);
  }, 30000);
});

describe('the World Manager\'s Save is the same save', () => {
  it('it keeps the world\'s name, creation date and visibility, and a stale tab\'s is refused and says so', async () => {
    await seed();
    const A = await openTab();
    const { WorldManager } = await import('../../src/WorldManager.jsx');
    tick(); act(() => { A.S().addCoins(7); });
    render(<WorldManager onClose={() => {}} />);
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByText('Save Current World'));
    const entry = () => JSON.parse(localStorage.getItem('crafty_world_saves')).find((w) => w.id === WORLD);
    expect(diskCoins(), 'the manual Save did not land').toBe(107);
    expect({ name: entry().name, created_at: entry().created_at, is_public: entry().is_public },
      'the manual Save renamed the world or reset its dates').toEqual({ name: 'Skyhold Keep', created_at: '2026-10-01T09:00:00.000Z', is_public: true });

    // Another tab saves the world; this tab's manual Save must not write over it.
    tick();
    const saves = await import('../../src/game/worldSaves.js');
    const other = JSON.parse(localStorage.getItem(`crafty_world_save_${WORLD}`));
    other.progression.coins = 5000;
    saves.writeWorld(WORLD, { ...entry(), saved_at: new Date(clock).toISOString() }, other);
    tick(); act(() => { A.S().addCoins(1); });
    fireEvent.click(screen.getByText('Save Current World'));
    expect(diskCoins(), 'the stale tab\'s manual Save wrote over the other tab\'s').toBe(5000);
    expect(screen.queryByText(STRINGS.en['save.otherTab']), 'the World Manager does not say why it did not save').not.toBeNull();
  }, 30000);
});
