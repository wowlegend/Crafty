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
 * Mutation-Proof: via scripts/dev/mutate.sh, receipts in the commits:
 *   G1 the load keeps every block entry (no filter)                           -> RED expected
 *   G2 plausible-wrong: a two-part key counts as a cell                       -> RED expected
 *   G3 plausible-wrong: any string key is a cell                              -> RED expected
 *   T1 a throwing load is not reset (M16a: the page keeps its slot claim)     -> RED expected
 *   T2 a throwing load rethrows (M16b: a blank page)                          -> RED expected
 *   T3 the failed load's seed is kept                                         -> RED expected
 *   T4 the failed load's notices are replayed                                 -> RED expected
 *   T5 the title does not say the world could not be opened                   -> RED expected
 *   G0 identity (a comment edit)                                              -> must SURVIVE
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

const AUTOSAVE_MS = 5000; // App.jsx's delay
const advance = (ms) => act(() => { vi.advanceTimersByTime(ms); });

/** One page load of the tab: the modules fresh, the storage kept, the real entry. `threw` is what startGame threw. */
async function pageLoad() {
  vi.resetModules();
  const { useGameStore: store } = await import('../../src/store/useGameStore');
  const { startGame } = await import('../../src/startGame.jsx');
  const saves = await import('../../src/game/worldSaves.js');
  const climate = await import('../../src/world/climate.js');
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
