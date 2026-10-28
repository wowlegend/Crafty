import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from './_fixtures.js';
import { bootDev, startPlay } from './_boot.js';

// THE CUT, IN THE BOOTED GAME (W2-F brief; DECISIONS 2026-10-28 W1-H items 4-7 and 10). One case per landed step.
//
// tests/store/preCutSave.test.js proves the pass-through against the store in jsdom. This proves it through the real
// browser's localStorage and the real save path: the frozen pre-cut world blob (tests/fixtures/pre-cut-save.json, see
// that test's header for how it was written) is loaded the way the World Manager's Load button loads it
// (MenuSystem.jsx -> loadWorldData), saved by the autosave's own action, and read back from localStorage.
//
// WHAT THIS DOES NOT CHECK: the Load button's click (the World Manager UI), or a reload of the page between the save
// and the read.
//
// Mutation-Proof: see the commit trailer (the tombstone dropped on save, run against tests/store/preCutSave.test.js).

const HERE = dirname(fileURLToPath(import.meta.url));
const PRE_CUT = JSON.parse(readFileSync(resolve(HERE, '../fixtures/pre-cut-save.json'), 'utf8'));

test.describe('the Cut', () => {
  test.setTimeout(180000);

  test('a pre-cut save loads, keeps its level, and writes back the keys this build does not know', async ({ page }) => {
    await bootDev(page);
    await startPlay(page);
    const r = await page.evaluate((save) => {
      const g = () => window.useGameStore.getState();
      save.progression.futureField = { nested: [1, 2], word: 'kept' };
      save.game_state.futureFlag = 'kept';
      g().loadWorldData(save);
      const loaded = { level: g().level, maxHealth: g().maxHealth };
      g().saveActiveWorld({ x: 3, y: 21, z: 6 });
      const id = localStorage.getItem('crafty_active_world');
      const raw = id ? localStorage.getItem('crafty_world_save_' + id) : null;
      const blob = raw ? JSON.parse(raw) : null;
      return { loaded, id, wroteOwnSlot: id === save.id, blob };
    }, structuredClone(PRE_CUT));

    expect(r.blob, 'SETUP: saveActiveWorld wrote no localStorage world blob').not.toBeNull();
    expect(r.wroteOwnSlot, `the autosave wrote slot ${r.id}, not the loaded world's ${PRE_CUT.id}`).toBe(true);
    expect(r.loaded.level, 'the pre-cut save lost its level on load').toBe(5);
    expect(Number.isFinite(r.loaded.maxHealth) && r.loaded.maxHealth > 0, `maxHealth ${r.loaded.maxHealth}`).toBe(true);
    expect(r.blob.progression.level, 'the saved level is not the loaded one').toBe(5);
    expect(r.blob.progression.futureField, 'an unknown progression key did not survive load and save').toEqual({ nested: [1, 2], word: 'kept' });
    expect(r.blob.game_state.futureFlag, 'an unknown game_state key did not survive load and save').toBe('kept');
  });
});
