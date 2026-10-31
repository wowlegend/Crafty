// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore';
import { bootWorld } from '../../src/game/worldBoot.js';
import * as worldSaves from '../../src/game/worldSaves.js';
import { buildSaveData } from '../../src/game/saveSchema.js';

/**
 * A LOAD CLAIMS A SLOT ONLY BY ITS ID, AND ONLY ONCE IT HAS LOADED (the deep audit's two REFUTED findings, kept as lane
 * L8's hardening). loadWorldData claimed the save's slot for the tab before its reducer ran, and only when the payload
 * carried an id:
 *   - ultra-state-saves-input-1: a payload with no id left the tab owning the slot it loaded BEFORE, so the next save
 *     wrote the new world over the old one. No writer has ever written a blob without its id, and the boot hands the
 *     slot's id it read (game/worldBoot.js), so no player path reaches it; an in-place load would.
 *   - ultra-state-saves-input-2: a save that threw in the reducer (a hand-edited chests blob that is no list, or not
 *     pairs) had already claimed its slot, so the next save wrote the world in memory over it. The boot resets a store
 *     whose load threw (DECISIONS 2026-10-30 item 219); an in-place load did not.
 * Now the claim comes after the reducer, a load with no id leaves the tab owning no slot (its next save mints one), and
 * a chests blob that is no list of pairs loads as the chests it holds that are pairs, as block edits already do
 * (saveSchema.js liveBlocks, liveChests).
 *
 * The real store and worldSaves over jsdom's localStorage; in-place loads are the store's loadWorldData, as a caller
 * that loads into a running game would make them; the boot case is the real bootWorld.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, receipts in the commit:
 *   L1 a load with no id keeps the claim it had                             -> RED expected
 *   L2 the claim comes before the reducer again                              -> RED expected
 *   L3 chests that are no list throw again                                   -> RED expected
 *   L4 plausible-wrong: an entry that is no pair is kept                     -> RED expected
 *   L0 identity (a comment edit)                                             -> must SURVIVE
 */

const S = () => useGameStore.getState();
const A = 'local_alpha';
const B = 'local_bravo';
const put = (id, state, extra = {}) => {
  const data = { ...buildSaveData({ ...useGameStore.getInitialState(), ...state }, { position: { x: 0, y: 40, z: 0 } }), ...extra };
  worldSaves.writeWorld(id, { name: id, created_at: '2026-10-01T00:00:00Z', is_owner: true, saved_at: '2026-10-30T12:00:00Z' }, data);
};
const levelOn = (id) => worldSaves.readWorld(id)?.progression?.level;
const save = () => S().saveActiveWorld({ x: 0, y: 40, z: 0 });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-31T12:00:00Z'));
  localStorage.clear();
  sessionStorage.clear();
  useGameStore.setState(useGameStore.getInitialState(), true);
  useGameStore.setState({ gameStarted: true });
});
afterEach(() => { vi.useRealTimers(); });

describe('a load claims its slot by its id, after it has loaded', () => {
  it('a payload with no id: the next save mints a slot and leaves the world loaded before untouched', () => {
    put(A, { level: 15, coins: 3150 });
    S().loadWorldData({ ...worldSaves.readWorld(A), id: A });
    expect(S()._sessionWorldId, 'SETUP: loading A did not claim it').toBe(A);
    const { id: _id, ...noId } = buildSaveData({ ...useGameStore.getInitialState(), level: 3 }, { position: { x: 0, y: 40, z: 0 } });
    S().loadWorldData(noId);
    expect(S().level, 'SETUP: the payload did not load').toBe(3);
    vi.setSystemTime(new Date('2026-10-31T12:05:00Z'));
    save();
    expect(levelOn(A), 'the save of a payload with no id wrote over the world loaded before it').toBe(15);
    expect(worldSaves.listWorlds().filter((w) => w.id !== A).map((w) => levelOn(w.id)), 'the payload was not saved in a slot of its own').toEqual([3]);
  });

  it('a save that throws as it loads claims nothing: the tab keeps the slot it had, and the next save goes there', () => {
    put(A, { level: 15, coins: 3150 });
    put(B, { level: 20, coins: 2000 });
    S().loadWorldData({ ...worldSaves.readWorld(A), id: A });
    const corrupt = { ...worldSaves.readWorld(B), id: B };
    corrupt.progression = { ...corrupt.progression, get level() { throw new Error('a field that throws when read'); } };
    expect(() => S().loadWorldData(corrupt), 'SETUP: the corrupt save did not throw').toThrow();
    expect(S()._sessionWorldId, 'a save that threw as it loaded claimed its slot').toBe(A);
    vi.setSystemTime(new Date('2026-10-31T12:05:00Z'));
    save();
    expect([levelOn(A), levelOn(B)], 'the save after a failed load wrote over the slot that failed').toEqual([15, 20]);
  });
});

describe('chests that are no list of pairs load as the pairs they hold', () => {
  it('in place: chests as an object load as none; a list with stray entries loads its one real chest', () => {
    put(A, { level: 4 }, { chests: {} });
    S().loadWorldData({ ...worldSaves.readWorld(A), id: A });
    expect({ level: S().level, chests: S().chests.size, slot: S()._sessionWorldId }, 'a chests object threw or loaded something').toEqual({ level: 4, chests: 0, slot: A });
    put(B, { level: 6 }, { chests: [1, 'x', ['5_40_5', { inventory: { stone: 2 } }], [null], ['6_40_6', { inventory: {} }, 'extra']] });
    S().loadWorldData({ ...worldSaves.readWorld(B), id: B });
    expect([...S().chests.keys()], 'the real chest did not load, or a stray entry did').toEqual(['5_40_5']);
  });

  it('at boot: a save whose chests are an object is opened, not held as unreadable', () => {
    put(A, { level: 9, coins: 70 }, { chests: { '5_40_5': { inventory: { stone: 1 } } } });
    useGameStore.setState(useGameStore.getInitialState(), true);
    bootWorld({ store: useGameStore, session: sessionStorage, saves: worldSaves });
    expect({ held: S().bootHeld, slot: S()._sessionWorldId, level: S().level }, 'the save was held, or not loaded').toEqual({ held: null, slot: A, level: 9 });
  });
});
