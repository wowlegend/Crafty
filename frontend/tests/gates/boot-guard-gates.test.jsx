// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { create } from 'zustand';
import { render, act, cleanup, fireEvent, screen } from '@testing-library/react';
import { useGameStore } from '../../src/store/useGameStore';
import { bootWorld } from '../../src/game/worldBoot.js';
import { writeWorld, listWorlds, readWorld } from '../../src/game/worldSaves.js';
import { buildSaveData } from '../../src/game/saveSchema.js';
import { DEFAULT_WORLD_SEED } from '../../src/world/worldSeed.js';
import { STRINGS } from '../../src/i18n/strings.js';
import { BootSettle } from '../../src/systems/BootSettle.jsx';

/**
 * A SAVE THE BOOT LOADS CANNOT TRAP THE PLAYER (L2 review round 1: static F1 and F5, dynamic C3 and C4). Every visit now
 * loads the newest save before the first render (game/worldBoot.js), so a save that loads but breaks the world comes
 * back on every reload of the tab: the crash screen's Reload is a plain visit, and the plain visit picks the same save.
 *
 * Block edits: a save is read from localStorage and may hold anything. `world_data.blocks: [[5, 3]]` loaded cleanly and
 * threw when Terrain published its worker (store loadModificationsMessage splits each key), at mount, outside the
 * boot's guard. Run against the real store and the real boot.
 *
 * A save that throws while it loads: the page must render, keep nothing of it (its slot claim, its seed, its notices),
 * say on the title that it could not be opened, and play a new world beside the broken slot. Each "page load" is the real
 * entry (startGame.jsx) after vi.resetModules(), jsdom's storage kept as a tab's is; the 3D scene, the HUD and the title's
 * vista are stood in for, as in tests/gates/returning-player-gates.test.jsx.
 *
 * A save that loads and then breaks the world as it mounts (the crash-loop breaker): the boot leaves an attempt at the
 * world in sessionStorage before the first render, and the world's first frame takes it back (systems/BootSettle.jsx).
 * The stood-in world throws at mount for the world the test names, into the real ErrorBoundary; the crash screen's
 * Reload is a plain visit, which the test runs as the next page load. That visit must hold the world on the title and
 * say why, a refresh must hold it again, Open it anyway must load it, and a world that ran must be continued.
 * BLIND SPOT: that BootSettle is mounted in the real GameScene and its frame comes is the e2e's
 * (tests/e2e/continue.spec.js: the reload's attempt is left, then taken back); that its effect arms it only after the
 * mount's effects is by reading.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, receipts in the commits:
 *   G1 the load keeps every block entry (no filter)                           -> RED expected
 *   G2 plausible-wrong: a two-part key counts as a cell                       -> RED expected
 *   G3 plausible-wrong: any string key is a cell                              -> RED expected
 *   T1 a throwing load is not reset (M16a: the page keeps its slot claim)     -> RED expected
 *   T2 a throwing load rethrows (M16b: a blank page)                          -> RED expected
 *   T3 the failed load's seed is kept                                         -> RED expected
 *   T4 the failed load's notices are replayed                                 -> RED expected
 *   T5 the title does not say the world could not be opened                   -> RED expected
 *   B1 the plain visit never checks the attempt (the reload loop)             -> RED expected
 *   B2 the boot leaves no attempt                                              -> RED expected
 *   B3 plausible-wrong: a page takes back any attempt, not its own            -> RED expected
 *   B4 plausible-wrong: a note is held too (Open it anyway does nothing)      -> RED expected
 *   B5 the world's frame never takes the attempt back                         -> RED expected
 *   B6 the held title offers no way to open the world                         -> RED expected
 *   B7 plausible-wrong: the held line says the save did not load              -> RED expected
 *   G0 identity (a comment edit)                                              -> must SURVIVE
 */

// The 3D world, stood in: it breaks as it mounts when it holds the world `__crashWorld` names (the throw reaches the real
// ErrorBoundary, as R3F's Canvas rethrows a scene error to its parent, @react-three/fiber 9.5 Canvas), and otherwise it
// runs, which takes back the boot's attempt as the real world's first frame does (systems/BootSettle.jsx).
vi.mock('../../src/GameScene', () => ({
  GameScene: () => {
    const s = globalThis.__pageStore?.getState();
    if (s && globalThis.__crashWorld && s._sessionWorldId === globalThis.__crashWorld) throw new Error('the world broke as it mounted');
    globalThis.__worldRan?.();
    return null;
  },
}));
// The frame loop, stood in for BootSettle alone: useFrame keeps the callback for the test to call as a frame. Nothing
// else this file renders asks for a frame (the 3D scene is stood in above).
vi.mock('@react-three/fiber', async (importOriginal) => ({ ...(await importOriginal()), useFrame: (cb) => { globalThis.__frame = cb; } }));
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
const advance = (ms) => act(() => { vi.advanceTimersByTime(ms); });

/** One page load of the tab: the modules fresh, the storage kept, the real entry. `threw` is what startGame threw. */
async function pageLoad() {
  vi.resetModules();
  const { useGameStore: store } = await import('../../src/store/useGameStore');
  const { startGame } = await import('../../src/startGame.jsx');
  const saves = await import('../../src/game/worldSaves.js');
  const climate = await import('../../src/world/climate.js');
  const boot = await import('../../src/game/worldBoot.js');
  globalThis.__pageStore = store;
  globalThis.__worldRan = () => boot.settleBoot(sessionStorage, store.getState()._bootAttempt);
  let threw = null;
  try {
    await act(async () => { startGame({ render: (el) => render(el) }); });
  } catch (e) { threw = String(e && e.message); }
  await act(async () => { await Promise.resolve(); });
  return {
    S: () => store.getState(), saves, climate, threw,
    unload: () => { act(() => { window.dispatchEvent(new Event('beforeunload')); }); cleanup(); },
  };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  globalThis.__reloads = [];
  globalThis.__crashWorld = null;
  useGameStore.setState(useGameStore.getInitialState(), true);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Write a save holding `blocks` as its block edits, and boot it as a plain visit. */
const bootWith = (blocks) => {
  const save = buildSaveData(useGameStore.getInitialState(), { position: { x: 0, y: 40, z: 0 } });
  save.world_data.blocks = blocks;
  writeWorld('local_odd', { name: 'Odd', created_at: '2026-10-01T00:00:00Z', is_owner: true }, save);
  return bootWorld({ store: useGameStore, session: null, saves: { listWorlds, readWorld } });
};
const publish = () => {
  const posted = [];
  useGameStore.getState().setTerrainWorker({ postMessage: (m) => posted.push(m) });
  return posted.map((m) => [m.type, m.payload.modifications.length]);
};

describe('a save\'s block edits are read as cells or dropped', () => {
  it('keys a Map takes but no cell is (a number, a word, two parts): dropped, and the world\'s publish of its worker does not throw', () => {
    expect(bootWith([[5, 3], ['1_40_2', 3], ['a_b_c', 3], ['4_41', 3], [null, 1], ['-3_40_-7', 5], ['7_40_7']]),
      'the boot did not load the save').toEqual({ kind: 'world', id: 'local_odd' });
    let sent = null;
    expect(() => { sent = publish(); }, 'Terrain\'s publish threw on the loaded edits: the mount crash, on every reload').not.toThrow();
    // PRESENCE: the edits that are cells are kept and sent, so a load that dropped every edit cannot pass.
    expect(sent, 'the edits the worker was sent').toEqual([['load_modifications', 2]]);
    expect([...useGameStore.getState().worldBlocks.keys()].sort(), 'the cells kept').toEqual(['-3_40_-7', '1_40_2']);
  });

  it('entries a Map refuses (no pair, a bare word) and a list that is no list: the save still loads, with its cells', () => {
    expect(bootWith([null, 'x', ['1_40_2', 3], 7]), 'a save with odd entries did not load').toEqual({ kind: 'world', id: 'local_odd' });
    expect([...useGameStore.getState().worldBlocks.keys()], 'the cell kept').toEqual(['1_40_2']);
    expect(publish(), 'the edits the worker was sent').toEqual([['load_modifications', 1]]);
    expect(bootWith(5), 'a save whose edits are a number did not load').toEqual({ kind: 'world', id: 'local_odd' });
    expect(useGameStore.getState().worldBlocks.size, 'edits from a number').toBe(0);
  });
});

describe('a save that throws while it loads leaves no part of itself in the page', () => {
  it('the title renders and says the world could not be opened; the page keeps nothing of it; a new world saves beside it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(new Date('2026-10-30T12:00:00Z'));
    const bad = buildSaveData({ ...useGameStore.getInitialState(), coins: 77, worldSeed: 777 }, { position: { x: 0, y: 40, z: 0 } });
    bad.chests = 5; // the load's reducer builds a Map of the chests: it throws there, after the slot is claimed and the seed set
    writeWorld('local_bad', { name: 'Broken Keep', created_at: '2026-10-02T00:00:00Z', is_owner: true }, bad);
    const badRaw = localStorage.getItem('crafty_world_save_local_bad');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const p = await pageLoad();
    expect(p.threw, 'the boot threw before the first render: a blank page').toBeNull();
    expect(screen.queryByTestId('title-start'), 'no title to start from').not.toBeNull();
    expect(screen.queryByTestId('title-continue'), 'the title offers Continue of a world that did not load').toBeNull();
    const held = screen.queryByTestId('title-held');
    expect(held && held.textContent, 'the title does not say the world could not be opened')
      .toBe(STRINGS.en['menu.heldUnreadable'].replace('{name}', 'Broken Keep'));
    expect({ coins: p.S().coins, slot: p.S()._sessionWorldId }, 'the page kept part of the broken load').toEqual({ coins: 0, slot: null });
    expect(p.climate.getClimateSeed(), 'the page samples the climate of the broken save\'s seed').toBe(DEFAULT_WORLD_SEED);

    fireEvent.click(screen.getByTestId('title-start'));
    act(() => { p.S().addCoins(3); });
    advance(AUTOSAVE_MS + 200);
    expect(localStorage.getItem('crafty_world_save_local_bad'), 'the new world was saved over the broken slot').toBe(badRaw);
    const worlds = p.saves.listWorlds();
    expect(worlds.length, 'the new world was not saved beside the broken slot').toBe(2);
    expect(p.saves.readWorld(worlds.find((w) => w.id !== 'local_bad').id).progression.coins, 'the new world\'s save').toBe(3);
    p.unload();
  }, 30000);

  it('the notices a failed load raised are dropped; a load that succeeds keeps its own for the quest system', () => {
    const make = (fails) => {
      const store = create(() => ({
        addNotification: null, _bootNotices: [], continueWorld: null, bootHeld: null, level: 3,
        loadWorldData() {
          store.getState().addNotification('notice.fromTheLoad', 'reward');
          if (fails) throw new Error('a save this build cannot read');
        },
      }));
      return store;
    };
    const saves = { listWorlds: () => [{ id: 'local_x', name: 'X', is_owner: true }], readWorld: () => ({ name: 'X' }) };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const good = make(false);
    expect(bootWorld({ store: good, session: null, saves }).kind, 'SETUP: the good load').toBe('world');
    // PRESENCE: the instrument sees a held notice.
    expect(good.getState()._bootNotices, 'a good load lost its notice').toEqual([['notice.fromTheLoad', 'reward']]);
    const bad = make(true);
    expect(bootWorld({ store: bad, session: null, saves }).kind, 'SETUP: the failed load').toBe('none');
    expect(bad.getState()._bootNotices, 'the failed load\'s notices would be replayed into the new world').toEqual([]);
  });
});

describe('a world that breaks as it mounts does not trap the tab in a reload loop', () => {
  const ATTEMPT = 'crafty.bootAttempt';
  const seedWorld = (id, name, coins) => writeWorld(id, { name, created_at: '2026-10-01T00:00:00Z', is_owner: true, saved_at: '2026-10-29T12:00:00Z' },
    buildSaveData({ ...useGameStore.getInitialState(), coins }, { position: { x: 0, y: 40, z: 0 } }));
  const heldLine = (name) => STRINGS.en['menu.heldStopped']?.replace('{name}', name);
  const at = () => ({
    crash: !!screen.queryByTestId('error-boundary'),
    title: !!screen.queryByTestId('title-start') || !!screen.queryByTestId('title-continue'),
    continue: !!screen.queryByTestId('title-continue'),
    held: screen.queryByTestId('title-held')?.textContent ?? null,
  });

  it('the crash screen\'s reload holds the world on the title and says why; a refresh still holds it; Open it anyway loads it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(new Date('2026-10-30T12:00:00Z'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    seedWorld('local_keep', 'Skyhold Keep', 40);
    globalThis.__crashWorld = 'local_keep';

    // Page 1, a plain visit: the boot loads the newest world, and the world breaks as it mounts.
    let p = await pageLoad();
    expect(p.S()._sessionWorldId, 'SETUP: the boot did not load the newest world').toBe('local_keep');
    expect(at().crash, 'SETUP: the stood-in world did not break as it mounted').toBe(true);
    expect(JSON.parse(sessionStorage.getItem(ATTEMPT) || 'null'), 'the boot left no attempt before the world mounted').toEqual({ world: 'local_keep' });
    p.unload();

    // Page 2: the crash screen's Reload, a plain visit with no note. The save still breaks the world.
    p = await pageLoad();
    expect(at(), 'the reload booted the same world into the same crash, or left the title').toEqual({
      crash: false, title: true, continue: false, held: heldLine('Skyhold Keep'),
    });
    expect({ slot: p.S()._sessionWorldId, coins: p.S().coins }, 'the held world was loaded anyway').toEqual({ slot: null, coins: 0 });
    p.unload();

    // Page 3: a refresh of that title holds it again (the held page leaves the attempt it found).
    p = await pageLoad();
    expect(at(), 'a refresh of the held title loaded the world into the crash again').toEqual({
      crash: false, title: true, continue: false, held: heldLine('Skyhold Keep'),
    });
    const retry = screen.queryByTestId('title-held-retry');
    expect(retry, 'the held title offers no way to open the world anyway').not.toBeNull();
    fireEvent.click(retry);
    expect(globalThis.__reloads.map((n) => JSON.parse(n || 'null')), 'Open it anyway did not reload with a note naming the world')
      .toEqual([{ world: 'local_keep' }]);
    p.unload();

    // Page 4: the note asks for the world, so it loads (and breaks again: this is what the player chose).
    p = await pageLoad();
    expect(p.S()._sessionWorldId, 'a note naming the held world did not load it').toBe('local_keep');
    expect(at().crash, 'the world the note asked for did not mount').toBe(true);
    p.unload();
  }, 60000);

  it('a world that ran is continued on the next visit: its attempt was taken back', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(new Date('2026-10-30T12:00:00Z'));
    seedWorld('local_fine', 'Fine Vale', 12);
    let p = await pageLoad();
    expect({ slot: p.S()._sessionWorldId, crash: at().crash }, 'SETUP: the world did not load and run').toEqual({ slot: 'local_fine', crash: false });
    expect(sessionStorage.getItem(ATTEMPT), 'the world ran and its attempt was not taken back').toBeNull();
    p.unload();
    p = await pageLoad();
    expect(at(), 'a world that ran was held on the next visit').toEqual({ crash: false, title: true, continue: true, held: null });
    expect(p.S().coins, 'the next visit did not continue the world').toBe(12);
    p.unload();
  }, 30000);
});

describe('the world\'s first frame takes back the boot\'s attempt (systems/BootSettle.jsx)', () => {
  const ATTEMPT = 'crafty.bootAttempt';
  it('its own attempt, on the first frame after it mounted; another world\'s attempt is left', () => {
    sessionStorage.setItem(ATTEMPT, JSON.stringify({ world: 'local_a' }));
    useGameStore.setState({ _bootAttempt: 'local_a' });
    globalThis.__frame = null;
    render(<BootSettle />);
    expect(typeof globalThis.__frame, 'BootSettle asks for no frame').toBe('function');
    // PRESENCE: mounted, and no frame drawn yet: the attempt is still there for the instrument to see go.
    expect(JSON.parse(sessionStorage.getItem(ATTEMPT) || 'null'), 'the attempt went before any frame').toEqual({ world: 'local_a' });
    act(() => { globalThis.__frame(); });
    expect(sessionStorage.getItem(ATTEMPT), 'the world ran a frame and its attempt was not taken back').toBeNull();
    cleanup();

    sessionStorage.setItem(ATTEMPT, JSON.stringify({ world: 'local_b' }));
    render(<BootSettle />);
    act(() => { globalThis.__frame(); });
    expect(JSON.parse(sessionStorage.getItem(ATTEMPT) || 'null'), 'a page took back another world\'s attempt').toEqual({ world: 'local_b' });
  });
});
