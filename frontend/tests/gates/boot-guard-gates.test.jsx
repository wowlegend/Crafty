// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore';
import { bootWorld } from '../../src/game/worldBoot.js';
import { writeWorld, listWorlds, readWorld } from '../../src/game/worldSaves.js';
import { buildSaveData } from '../../src/game/saveSchema.js';

/**
 * A SAVE THE BOOT LOADS CANNOT TRAP THE PLAYER (L2 review round 1, static F1 and F5, dynamic C3/C4). Every visit now
 * loads the newest save before the first render (game/worldBoot.js), so a save that loads but breaks the world comes
 * back on every reload of the tab: the crash screen's Reload is a plain visit, and the plain visit picks the same save.
 *
 * Block edits: a save is read from localStorage and may hold anything. `world_data.blocks: [[5, 3]]` loaded cleanly and
 * threw when Terrain published its worker (store loadModificationsMessage splits each key), at mount, outside the
 * boot's guard. Run against the real store and the real boot.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, receipts in the commits:
 *   G1 the load keeps every block entry (no filter)                         -> RED expected
 *   G2 plausible-wrong: a two-part key counts as a cell                       -> RED expected
 *   G3 plausible-wrong: any string key is a cell                              -> RED expected
 *   G0 identity (a comment edit)                                              -> must SURVIVE
 */

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  useGameStore.setState(useGameStore.getInitialState(), true);
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
