// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore';
import { bootWorld, saveWorldInPlay, writeBootNote } from '../../src/game/worldBoot.js';
import * as worldSaves from '../../src/game/worldSaves.js';
import { buildSaveData } from '../../src/game/saveSchema.js';

/**
 * EMPTY WORLDS DO NOT PILE UP (AUDIT:lane:L8-save-slot-lifecycle; the orphan half of
 * AUDIT:persistence:returning-player-never-resumed). Until lane L2 every visit minted a Save_<time> slot holding a fresh
 * world, and nothing deleted one: players' disks hold those orphans now, and every New World still mints one. Each
 * costs storage, and at the origin's quota every save stops. Now a browser keeps at most KEEP_EMPTY_SLOTS (3) worlds
 * that nobody named (the Save_<time> placeholder) and nothing was earned in, the newest; the boot and every new slot
 * delete the rest, and a save that fails for room deletes every such world but its own and tries once more. A world
 * with anything earned in it, or a name the player chose, is never deleted.
 *
 * The real store, the real boot (game/worldBoot.js, its note in jsdom's sessionStorage as a switch leaves it) and the
 * real worldSaves over jsdom's localStorage. A "session" is a page load: the store back to its initial state, then
 * the boot. The quota case stands a byte budget in for the browser's quota, at Storage.prototype.setItem.
 * BLIND SPOT: what "earned" misses (an item picked up with no XP, no coin and no block mined), and a real quota.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, receipts in the commit:
 *   P1 a new slot prunes nothing                                         -> RED expected
 *   P2 the boot prunes nothing                                           -> RED expected (the orphans on disk)
 *   P3 plausible-wrong: progress is not read (every placeholder is empty) -> RED expected
 *   P4 plausible-wrong: a named world counts as a placeholder            -> RED expected
 *   P5 plausible-wrong: the oldest empties are kept, not the newest      -> RED expected
 *   P6 a failed write is not retried after the prune                      -> RED expected (the quota case)
 *   P8 the saves are deleted when the index write is refused              -> RED expected
 *   P0 identity (a comment edit)                                         -> must SURVIVE
 */

const S = () => useGameStore.getState();
let clock = Date.parse('2026-10-31T09:00:00Z');
const tick = (min = 1) => { clock += min * 60000; vi.setSystemTime(new Date(clock)); };

/** One page load: the initial store, the boot (with `note` left by a switch, or none), Start, a little play, the save. */
function session(note, play = () => {}) {
  tick();
  useGameStore.setState(useGameStore.getInitialState(), true);
  if (note) writeBootNote(sessionStorage, note);
  bootWorld({ store: useGameStore, session: sessionStorage, saves: worldSaves });
  useGameStore.setState({ gameStarted: true, gameTime: S().gameTime + 6 });
  play();
  saveWorldInPlay(S);
  sessionStorage.removeItem('crafty.bootAttempt'); // the world ran (systems/BootSettle.jsx)
  return S()._sessionWorldId;
}
const slots = () => worldSaves.listWorlds();
const coinsOf = (id) => worldSaves.readWorld(id)?.progression?.coins;

/** A world on disk as an earlier build left it: a placeholder name unless `name`, the initial state plus `state`. */
function onDisk(id, { name = `Save_${new Date(clock).toLocaleString()}`, state = {} } = {}) {
  tick();
  worldSaves.writeWorld(id, { name, created_at: new Date(clock).toISOString(), is_owner: true },
    buildSaveData({ ...useGameStore.getInitialState(), ...state }, { position: { x: 0, y: 40, z: 0 } }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  clock = Date.parse('2026-10-31T09:00:00Z');
  vi.setSystemTime(new Date(clock));
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('a browser keeps at most KEEP_EMPTY_SLOTS empty placeholder worlds', () => {
  it('50 sessions, each a New World played a moment: at most 3 slots, the newest; the one with coins, the named one and the real one stay', async () => {
    onDisk('local_real', { state: { level: 15, totalXP: 9000, coins: 3150 } }); // the player's world, never renamed
    onDisk('local_named', { name: 'Skyhold Keep' }); // made in the World Manager, not played yet
    const made = [];
    for (let i = 0; i < 50; i++) {
      made.push(session({ fresh: true }, i === 9 ? () => S().addCoins(7) : undefined));
    }
    // PRESENCE: every session minted its own slot, so a slot count can only be held by deletion.
    expect(new Set(made).size, 'SETUP: the sessions did not each mint a slot').toBe(50);
    const ids = slots().map((w) => w.id);
    const empties = made.filter((id, i) => i !== 9);
    const keptEmpties = empties.filter((id) => ids.includes(id));
    expect(keptEmpties.length, `${keptEmpties.length} empty worlds are kept, of ${empties.length} sessions`).toBeLessThanOrEqual(3);
    expect(keptEmpties, 'the empty worlds kept are not the newest').toEqual(empties.slice(-3));
    expect(ids.includes(made[9]) && coinsOf(made[9]), 'a world with coins earned in it was deleted').toBe(7);
    expect(ids.filter((id) => id === 'local_real' || id === 'local_named').sort(), 'the real world or the named one was deleted').toEqual(['local_named', 'local_real']);
    expect(ids.length, 'slots on disk').toBe(3 + 3);
    for (const id of empties.slice(0, -3)) {
      expect(localStorage.getItem(`crafty_world_save_${id}`), `the deleted world ${id} left its save behind`).toBeNull();
    }
    expect(worldSaves.KEEP_EMPTY_SLOTS, 'the bound this gate reads').toBe(3);
  });

  it('the orphans an earlier build left: the next visit keeps the newest three and the real world, and continues the real world', async () => {
    onDisk('local_real', { state: { level: 15, totalXP: 9000, coins: 3150 } });
    for (let i = 0; i < 40; i++) onDisk(`local_orphan_${i}`);
    expect(slots().length, 'SETUP: the disk does not hold the orphans').toBe(41);
    session(null);
    const ids = slots().map((w) => w.id);
    expect(ids.filter((id) => id.startsWith('local_orphan_')), 'the orphans kept').toEqual(['local_orphan_39', 'local_orphan_38', 'local_orphan_37']);
    expect(ids.includes('local_real'), 'the real world was deleted').toBe(true);
    // An empty placeholder world newer than the real one (a pre-L2 visit's fresh Start, abandoned) is not what a
    // returning player came back to: Continue names the newest world with something earned in it.
    expect(S()._sessionWorldId, 'the visit continued an empty orphan over the world the player earned').toBe('local_real');
    expect(S().level, 'SETUP: the real world did not load').toBe(15);
  });

  it('the plain visit continues the newest world with something earned, a named world, or the newest empty one when every world is empty', async () => {
    onDisk('local_old', { state: { coins: 5 } });
    onDisk('local_named', { name: 'Skyhold Keep' }); // made in the World Manager, nothing played yet: still a choice
    onDisk('local_empty');
    session(null);
    expect(S()._sessionWorldId, 'a named world newer than the earned one was passed over').toBe('local_named');
    localStorage.clear();
    onDisk('local_a');
    onDisk('local_b');
    session(null);
    expect(S()._sessionWorldId, 'with every world empty, the visit did not continue the newest').toBe('local_b');
  });

  it('a prune whose index write is refused deletes no save, so the index never names a world it lost', () => {
    for (let i = 0; i < 5; i++) onDisk(`local_orphan_${i}`);
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (k, v) {
      if (k === 'crafty_world_saves') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      return real.call(this, k, v);
    });
    expect(worldSaves.pruneEmptySlots(null), 'a prune whose index write failed reported worlds deleted').toEqual([]);
    const listed = slots().map((w) => w.id);
    expect(listed.length, 'SETUP: the index lost its entries').toBe(5);
    expect(listed.filter((id) => !localStorage.getItem(`crafty_world_save_${id}`)), 'the index names worlds whose saves were deleted').toEqual([]);
  });

  it('a save that fails for room deletes every other empty placeholder world and lands; nothing is said', async () => {
    onDisk('local_real', { state: { level: 15, totalXP: 9000, coins: 3150 } });
    for (let i = 0; i < 4; i++) onDisk(`local_orphan_${i}`);
    session({ world: 'local_real' });
    const used = () => Object.keys(localStorage).reduce((n, k) => n + k.length + localStorage.getItem(k).length, 0);
    const budget = used() + 200; // room for the session's own small writes, not for a bigger save
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (k, v) {
      const prior = localStorage.getItem(k);
      if (used() - (prior ? k.length + prior.length : 0) + k.length + String(v).length > budget) {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      }
      return real.call(this, k, v);
    });
    const notices = [];
    useGameStore.setState({ addNotification: (...a) => notices.push(a) });
    // A bigger world: the save outgrows the room left.
    useGameStore.setState({ worldBlocks: new Map(Array.from({ length: 40 }, (_, i) => [`${i}_40_0`, 1])), coins: 3200 });
    expect(S().saveActiveWorld({ x: 0, y: 40, z: 0 }), 'the save did not land, with empty worlds there to delete').toBe(true);
    expect(coinsOf('local_real'), 'the real world\'s save is not on disk').toBe(3200);
    expect(slots().map((w) => w.id), 'the empty worlds were not all deleted to make room').toEqual(['local_real']);
    expect(notices.filter(([k]) => k === 'save.failed'), 'a save that landed on its retry raised the failure notice').toEqual([]);
  });
});
