import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SRC, strip, sourceFiles } from './_srcWalk.js';

const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

/**
 * Save consolidation gates — one writer for the save payload, and an autosave that actually fires.
 *
 * REWRITTEN 2026-09-22, selected by `gate-census.mjs` at 0/5.
 *
 * ONE CASE WAS DELETED RATHER THAN CONVERTED, and that is the more useful half of this change. It read
 * `saveSchema.js` as text and asserted `src.includes(f)` for seven bare tokens — 'progression', 'level',
 * 'attributes', 'equipment', 'talentPoints', 'unlockedTalents', 'chests'. Every one of those words
 * appears in that file's own explanatory comments, so the case would have passed with the entire
 * progression slice removed from the payload. It was also REDUNDANT: `src/game/saveSchema.test.js`
 * already builds a save from a fixture carrying real progression and chests and asserts the whole slice
 * comes back out by deep equality. A serialization claim belongs to something that serializes, and that
 * something already existed. Duplicating it here in a weaker form added a second place to maintain and
 * no coverage. (Same disposition the quest-persistence gate reached for the same case, for the same
 * reason.)
 *
 * What remains are cross-file WIRING invariants that cannot be reached without booting the app. Those stay as
 * source assertions, anchored to the call FORM on comment-stripped source and asserted UNIQUE.
 *
 * What triggers the autosave and its flush on tab-hide and unload are driven through the real store in
 * `autosave-trigger-gates.test.js`; the payload's correctness is `saveSchema.test.js`'s. Not checked anywhere: that
 * the write reaches disk.
 *
 * Mutation-Proof: 3 mutations, recorded on the commit. Denominator asserted on the src walk.
 */
describe('save consolidation gates', () => {
  const files = sourceFiles();

  it('the src walk reached the codebase', () => {
    expect(files.length).toBeGreaterThan(300);
  });

  it('the dead axios saveGame/loadGame are gone from the store', () => {
    const s = strip(read('store/useGameStore.jsx'));
    expect(/saveGame:\s*async/.test(s)).toBe(false);
    expect(/loadGame:\s*async/.test(s)).toBe(false);
  });

  it('buildSaveData is the ONLY builder of a save payload in src/', () => {
    // The consolidation itself, as a property rather than a spot-check of WorldManager. A second
    // hand-rolled payload literal appearing anywhere reds here; the old version could only see the one
    // file it named.
    const INLINE = /world_data:\s*\{\s*blocks:\s*Array\.from/;
    const rogue = files.filter((f) => INLINE.test(strip(readFileSync(f, 'utf8'))))
      .map((f) => f.slice(SRC.length + 1));
    expect(rogue, 'a save payload is being built outside buildSaveData').toEqual([]);
    expect(/buildSaveData/.test(strip(read('WorldManager.jsx')))).toBe(true);
    expect(/setActiveWorldId/.test(strip(read('WorldManager.jsx')))).toBe(true);
  });
});

describe('autosave wiring', () => {
  const app = strip(readFileSync(resolve(SRC, 'App.jsx'), 'utf8'));

  it('App installs the autosave on the game store, once', () => {
    // The one seam autosave-trigger-gates cannot reach: that the app installs it. What it triggers on, and the flush
    // on tab-hide and unload, are driven there through the real store.
    expect((app.match(/\binstallAutosave\(useGameStore,/g) || []).length, 'App does not install the autosave, or installs it twice').toBe(1);
  });
});
